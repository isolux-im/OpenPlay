package expo.modules.openplaymedia

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.media.MediaMetadataRetriever
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.MediaStore
import expo.modules.kotlin.exception.CodedException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference
import javax.net.ssl.SSLException

/** Erreur typée d'analyse ou de transfert (code ERR_LINK_…, traduit en message côté application). */
internal class LinkException(code: String, message: String) : CodedException(code, message, null)

/**
 * Télécharger par lien : analyse et transfert de fichiers directs (https), sans contournement d'aucune
 * restriction. Chaque requête et chaque redirection est vérifiée (protection SSRF) ; le fichier reste « en
 * attente » dans MediaStore (invisible) jusqu'à la vérification de sa taille et de son type réel, puis il est
 * publié dans Music/ ou Movies/ et apparaît dans OpenPlay. Un fichier incomplet ou d'un autre type est supprimé.
 */
internal class LinkDownloader(private val context: Context, private val scope: CoroutineScope) {
  private companion object {
    const val MAX_REDIRECTS = 5
    const val MAX_BYTES = 8L * 1024 * 1024 * 1024
    /** Marge laissée libre sur le téléphone au-delà de la taille du fichier. */
    const val SPACE_MARGIN = 64L * 1024 * 1024
    const val HEAD_BYTES = 64
    const val META_TIMEOUT_MS = 8_000L
  }

  class State(@Volatile var bytesTotal: Long) {
    @Volatile var status: String = "running"
    @Volatile var bytesDone: Long = 0
    @Volatile var bytesPerSec: Long = 0
    @Volatile var mediaId: String? = null
    @Volatile var mediaUri: String? = null
    @Volatile var error: String? = null
    @Volatile var httpStatus: Int? = null

    fun toMap(): Map<String, Any?> = mapOf(
      "status" to status,
      "bytesDone" to bytesDone.toDouble(),
      "bytesTotal" to bytesTotal.toDouble(),
      "bytesPerSec" to bytesPerSec.toDouble(),
      "mediaId" to mediaId,
      "mediaUri" to mediaUri,
      "error" to error,
      "httpStatus" to httpStatus,
    )
  }

  private class Opened(val connection: HttpURLConnection, val status: Int, val url: URL, val redirects: Int)

  private val tasks = ConcurrentHashMap<String, State>()
  private val jobs = ConcurrentHashMap<String, Job>()
  private val connections = ConcurrentHashMap<String, HttpURLConnection>()

  // --- Sécurité réseau ---

  /** https seulement, port standard, pas d'identifiants, et aucune adresse résolue interne ou réservée. */
  private fun checkUrl(url: URL) {
    if (url.protocol != "https") throw LinkException("ERR_LINK_SCHEME", "https requis")
    if (url.userInfo != null) throw LinkException("ERR_LINK_UNSAFE", "Identifiants dans le lien")
    if (url.port != -1 && url.port != 443) throw LinkException("ERR_LINK_UNSAFE", "Port non standard")
    val host = url.host?.takeIf { it.isNotBlank() } ?: throw LinkException("ERR_LINK_UNSAFE", "Hôte absent")
    val addresses = try {
      InetAddress.getAllByName(host)
    } catch (e: UnknownHostException) {
      throw LinkException("ERR_LINK_DNS", "Hôte introuvable")
    }
    if (addresses.isEmpty() || addresses.any { isInternal(it) }) throw LinkException("ERR_LINK_UNSAFE", "Adresse interne")
  }

  private fun isInternal(a: InetAddress): Boolean {
    if (a.isAnyLocalAddress || a.isLoopbackAddress || a.isLinkLocalAddress || a.isSiteLocalAddress || a.isMulticastAddress) return true
    val b = a.address
    if (a is Inet4Address) {
      val x = b[0].toInt() and 0xff
      val y = b[1].toInt() and 0xff
      return x == 0 || (x == 100 && y in 64..127) || (x == 192 && y == 0) || (x == 198 && (y == 18 || y == 19)) || x >= 224
    }
    if (a is Inet6Address) return (b[0].toInt() and 0xfe) == 0xfc // adresses locales uniques fc00::/7
    return false
  }

  private fun networkError(e: Throwable): LinkException = when (e) {
    is LinkException -> e
    is UnknownHostException -> LinkException("ERR_LINK_DNS", "Hôte introuvable")
    is SSLException -> LinkException("ERR_LINK_TLS", "Certificat refusé")
    is SocketTimeoutException -> LinkException("ERR_LINK_TIMEOUT", "Délai dépassé")
    else -> LinkException("ERR_LINK_NETWORK", e.javaClass.simpleName)
  }

  /** Ouvre la connexion en suivant soi-même les redirections, chacune vérifiée. */
  private fun open(start: String, range: String?, taskId: String? = null): Opened {
    var current = try {
      URL(start)
    } catch (e: Exception) {
      throw LinkException("ERR_LINK_UNSAFE", "Lien invalide")
    }
    var redirects = 0
    while (true) {
      checkUrl(current)
      val c = (current.openConnection() as HttpURLConnection).apply {
        instanceFollowRedirects = false
        connectTimeout = 15_000
        readTimeout = 20_000
        useCaches = false
        setRequestProperty("User-Agent", "OpenPlay/2 (Android)")
        setRequestProperty("Accept-Encoding", "identity")
        if (range != null) setRequestProperty("Range", range)
      }
      if (taskId != null) connections[taskId] = c
      val status = try {
        c.responseCode
      } catch (e: Exception) {
        c.disconnect()
        throw networkError(e)
      }
      if (status in 300..399 && status != 304) {
        val location = c.getHeaderField("Location")
        c.disconnect()
        if (location.isNullOrBlank()) throw LinkException("ERR_LINK_REDIRECTS", "Redirection sans destination")
        redirects += 1
        if (redirects > MAX_REDIRECTS) throw LinkException("ERR_LINK_REDIRECTS", "Trop de redirections")
        current = try {
          URL(current, location)
        } catch (e: Exception) {
          throw LinkException("ERR_LINK_UNSAFE", "Redirection invalide")
        }
        continue
      }
      return Opened(c, status, current, redirects)
    }
  }

  // --- Analyse ---

  /** Type réel d'après les premiers octets (signatures de fichiers), jamais d'après l'extension. */
  fun sniff(b: ByteArray, n: Int): String {
    fun ascii(from: Int, len: Int) = if (n >= from + len) String(b, from, len, Charsets.ISO_8859_1) else ""
    if (ascii(0, 3) == "ID3") return "mp3"
    if (n >= 2 && (b[0].toInt() and 0xff) == 0xff && (b[1].toInt() and 0xe0) == 0xe0) {
      // Même mot de synchronisation : couche « 00 » = AAC (ADTS), sinon MPEG audio (MP3).
      return if ((b[1].toInt() and 0x06) == 0) "aac" else "mp3"
    }
    if (ascii(4, 4) == "ftyp") {
      val brand = ascii(8, 4)
      return when {
        brand.startsWith("M4A") || brand.startsWith("M4B") -> "m4a"
        brand == "qt  " -> "mov"
        else -> "mp4"
      }
    }
    if (n >= 4 && b[0] == 0x1A.toByte() && b[1] == 0x45.toByte() && b[2] == 0xDF.toByte() && b[3] == 0xA3.toByte()) return "webm"
    if (ascii(0, 4) == "OggS") return "ogg"
    if (ascii(0, 4) == "fLaC") return "flac"
    if (ascii(0, 4) == "RIFF" && ascii(8, 4) == "WAVE") return "wav"
    val text = String(b, 0, n, Charsets.ISO_8859_1).trimStart().lowercase()
    if (text.startsWith("<!doctype") || text.startsWith("<html") || text.startsWith("<?xml") || text.startsWith("<head") || text.startsWith("{") || text.startsWith("<")) return "html"
    return "unknown"
  }

  private fun readUpTo(input: InputStream, into: ByteArray): Int {
    var n = 0
    while (n < into.size) {
      val r = input.read(into, n, into.size - n)
      if (r < 0) break
      n += r
    }
    return n
  }

  private fun fileNameFrom(disposition: String?): String? {
    if (disposition == null) return null
    Regex("filename\\*\\s*=\\s*UTF-8''([^;]+)", RegexOption.IGNORE_CASE).find(disposition)?.let { return Uri.decode(it.groupValues[1]).trim('"', ' ') }
    Regex("filename\\s*=\\s*\"?([^\";]+)\"?", RegexOption.IGNORE_CASE).find(disposition)?.let { return it.groupValues[1].trim() }
    return null
  }

  /** Métadonnées lues dans le fichier distant (durée, dimensions, titre), bornées dans le temps ; sinon null. */
  private fun readMeta(url: String): Map<String, String?>? {
    val result = AtomicReference<Map<String, String?>?>(null)
    val worker = Thread {
      val retriever = MediaMetadataRetriever()
      try {
        retriever.setDataSource(url, HashMap())
        fun key(k: Int) = retriever.extractMetadata(k)
        result.set(mapOf(
          "durationMs" to key(MediaMetadataRetriever.METADATA_KEY_DURATION),
          "width" to key(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH),
          "height" to key(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT),
          "hasVideo" to key(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO),
          "title" to key(MediaMetadataRetriever.METADATA_KEY_TITLE),
          "artist" to key(MediaMetadataRetriever.METADATA_KEY_ARTIST),
        ))
      } catch (e: Exception) {
        // Métadonnées inaccessibles : acceptées comme inconnues.
      } finally {
        try {
          retriever.release()
        } catch (e: Exception) {
          // déjà libéré
        }
      }
    }
    worker.isDaemon = true
    worker.start()
    worker.join(META_TIMEOUT_MS)
    return result.get()
  }

  fun probe(url: String): Map<String, Any?> {
    val opened = open(url, "bytes=0-${HEAD_BYTES - 1}")
    val c = opened.connection
    try {
      val status = opened.status
      var size = -1L
      if (status == 206) {
        size = c.getHeaderField("Content-Range")?.substringAfter('/', "")?.trim()?.toLongOrNull() ?: -1L
      } else if (status == 200) {
        size = c.contentLengthLong
      }
      val head = ByteArray(HEAD_BYTES)
      var n = 0
      if (status in 200..299) {
        try {
          c.inputStream.use { n = readUpTo(it, head) }
        } catch (e: Exception) {
          throw networkError(e)
        }
      }
      var sniffed = if (status in 200..299) sniff(head, n) else "unknown"
      val name = fileNameFrom(c.getHeaderField("Content-Disposition"))
        ?: opened.url.path.substringAfterLast('/').takeIf { it.isNotBlank() }?.let { Uri.decode(it) }
      val meta = if (sniffed in setOf("mp3", "mp4", "m4a", "mov")) readMeta(opened.url.toString()) else null
      // Un MP4 sans piste vidéo est un fichier audio.
      if (sniffed == "mp4" && meta?.get("hasVideo") == "no") sniffed = "m4a"
      return mapOf(
        "finalUrl" to opened.url.toString(),
        "status" to status,
        "contentType" to c.contentType,
        "size" to size.toDouble(),
        "fileName" to name,
        "sniff" to sniffed,
        "redirects" to opened.redirects,
        "durationMs" to meta?.get("durationMs")?.toDoubleOrNull(),
        "width" to meta?.get("width")?.toDoubleOrNull(),
        "height" to meta?.get("height")?.toDoubleOrNull(),
        "title" to meta?.get("title")?.takeIf { it.isNotBlank() },
        "artist" to meta?.get("artist")?.takeIf { it.isNotBlank() },
      )
    } finally {
      c.disconnect()
    }
  }

  // --- Stockage ---

  private fun collection(kind: String): Uri =
    if (kind == "video") MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    else MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)

  fun exists(kind: String, relativePath: String, displayName: String): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
    val selection = "${MediaStore.MediaColumns.RELATIVE_PATH} = ? AND ${MediaStore.MediaColumns.DISPLAY_NAME} = ? COLLATE NOCASE"
    context.contentResolver.query(collection(kind), arrayOf(MediaStore.MediaColumns._ID), selection, arrayOf(relativePath.trim('/') + "/", displayName), null)?.use { return it.count > 0 }
    return false
  }

  // --- Transfert ---

  fun start(taskId: String, url: String, kind: String, relativePath: String, displayName: String, mimeType: String, expect: String, expectedSize: Long) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) throw LinkException("ERR_UNSUPPORTED", "Android 10 requis")
    if (tasks[taskId]?.status == "running") return
    val state = State(expectedSize)
    tasks[taskId] = state
    jobs[taskId] = scope.launch(Dispatchers.IO) { transfer(taskId, state, url, kind, relativePath, displayName, mimeType, expect, expectedSize) }
  }

  fun states(ids: List<String>): Map<String, Any?> = ids.mapNotNull { id -> tasks[id]?.let { id to it.toMap() } }.toMap()

  fun cancel(taskId: String) {
    val state = tasks[taskId] ?: return
    if (state.status != "running") return
    state.status = "cancelled"
    jobs[taskId]?.cancel()
    // Débloque une lecture réseau en cours.
    connections[taskId]?.disconnect()
  }

  private suspend fun transfer(taskId: String, state: State, url: String, kind: String, relativePath: String, displayName: String, mimeType: String, expect: String, expectedSize: Long) {
    val resolver = context.contentResolver
    var target: Uri? = null
    var connection: HttpURLConnection? = null
    try {
      val opened = open(url, null, taskId)
      connection = opened.connection
      val announced = opened.connection.contentLengthLong
      if (opened.status !in 200..299) {
        state.httpStatus = opened.status
        throw LinkException("ERR_LINK_HTTP", "HTTP ${opened.status}")
      }
      val total = if (announced > 0) announced else expectedSize
      if (total > MAX_BYTES) throw LinkException("ERR_LINK_TOO_LARGE", "Fichier trop volumineux")
      state.bytesTotal = total
      @Suppress("DEPRECATION")
      val free = StatFs(Environment.getExternalStorageDirectory().path).availableBytes
      if (total > 0 && total + SPACE_MARGIN > free) throw LinkException("ERR_LINK_SPACE", "Espace insuffisant")

      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
        put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
        put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath.trim('/') + "/")
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
      val dest = resolver.insert(collection(kind), values) ?: throw LinkException("ERR_LINK_STORAGE", "Insertion MediaStore refusée")
      target = dest
      val http = opened.connection

      val head = ByteArray(HEAD_BYTES)
      var headLen = 0
      var checked = false
      var done = 0L
      var tickAt = System.nanoTime()
      var tickBytes = 0L
      try {
        http.inputStream.use { input ->
          (resolver.openOutputStream(dest) ?: throw LinkException("ERR_LINK_STORAGE", "Écriture impossible")).use { output ->
            val buffer = ByteArray(128 * 1024)
            while (true) {
              currentCoroutineContext().ensureActive()
              val n = input.read(buffer)
              if (n < 0) break
              if (headLen < HEAD_BYTES) {
                val k = minOf(n, HEAD_BYTES - headLen)
                System.arraycopy(buffer, 0, head, headLen, k)
                headLen += k
              }
              // Type réel vérifié dès les premiers octets : une page web ou un autre format n'est pas enregistré.
              if (!checked && headLen >= 16) {
                if (sniff(head, headLen) != expect) throw LinkException("ERR_LINK_TYPE", "Type réel différent")
                checked = true
              }
              output.write(buffer, 0, n)
              done += n
              if (done > MAX_BYTES) throw LinkException("ERR_LINK_TOO_LARGE", "Fichier trop volumineux")
              state.bytesDone = done
              val now = System.nanoTime()
              if (now - tickAt >= 1_000_000_000L) {
                state.bytesPerSec = ((done - tickBytes) * 1_000_000_000L) / (now - tickAt)
                tickAt = now
                tickBytes = done
              }
            }
          }
        }
      } catch (e: LinkException) {
        throw e
      } catch (e: CancellationException) {
        throw e
      } catch (e: Exception) {
        if (state.status == "cancelled") throw CancellationException("annulé")
        throw networkError(e)
      }
      if (done == 0L || (total > 0 && done != total)) throw LinkException("ERR_LINK_INCOMPLETE", "Fichier incomplet")
      if (!checked && sniff(head, headLen) != expect) throw LinkException("ERR_LINK_TYPE", "Type réel différent")

      // Vérifié : publication, puis analyse des métadonnées par Android (durée, dimensions).
      resolver.update(dest, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
      requestScan(dest)
      state.mediaId = ContentUris.parseId(dest).toString()
      state.mediaUri = dest.toString()
      state.bytesTotal = done
      state.bytesPerSec = 0
      state.status = "done"
    } catch (e: CancellationException) {
      state.status = "cancelled"
    } catch (e: LinkException) {
      fail(state, e)
    } catch (e: Exception) {
      fail(state, e)
    } finally {
      state.bytesPerSec = 0
      connection?.disconnect()
      connections.remove(taskId)
      jobs.remove(taskId)
      // Fichier jamais publié (échec, annulation) : supprimé, rien n'apparaît dans la bibliothèque.
      if (state.status != "done" && target != null) {
        try {
          resolver.delete(target, null, null)
        } catch (e: Exception) {
          // Entrée « en attente » : Android la supprime de lui-même après quelques jours.
        }
      }
    }
  }

  private fun fail(state: State, e: Throwable) {
    // Annulé pendant une requête : rien à signaler.
    if (state.status == "cancelled") return
    state.error = networkError(e).code
    state.status = "failed"
  }

  private fun requestScan(uri: Uri) {
    try {
      context.contentResolver.query(uri, arrayOf(MediaStore.MediaColumns.DATA), null, null, null)?.use { c ->
        if (c.moveToFirst()) {
          val path = c.getString(0)
          if (path != null) MediaScannerConnection.scanFile(context, arrayOf(path), null, null)
        }
      }
    } catch (e: Exception) {
      // L'indexation d'Android suivra de toute façon la publication du fichier.
    }
  }
}
