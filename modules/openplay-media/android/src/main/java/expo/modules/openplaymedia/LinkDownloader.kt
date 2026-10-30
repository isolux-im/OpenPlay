package expo.modules.openplaymedia

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
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
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import javax.net.ssl.SSLException

/** Erreur typée d'analyse ou de transfert (code ERR_LINK_…, traduit en message côté application). */
internal class LinkException(code: String, message: String) : CodedException(code, message, null)

/**
 * Télécharger par lien : analyse et transfert de fichiers directs (https), sans contournement d'aucune restriction.
 *
 * - Chaque requête et chaque redirection est vérifiée (protection SSRF).
 * - Le fichier partiel reste invisible (MediaStore « en attente » sur Android 10+, dossier privé de l'application
 *   avant) jusqu'à la vérification de sa taille et de son type réel ; il est alors publié dans Music/ ou Movies/.
 * - Pause et reprise par requête partielle HTTP (Range), seulement si le serveur l'accepte, avec contrôle de la
 *   version du fichier (ETag ou date de modification, If-Range) : un fichier modifié repart de zéro.
 * - Les transferts vivent au niveau du processus (pas de l'écran) et un service de premier plan avec notification
 *   les maintient quand OpenPlay passe en arrière-plan ou que son interface est fermée.
 */
internal object LinkDownloads {
  private const val MAX_REDIRECTS = 5
  private const val MAX_BYTES = 8L * 1024 * 1024 * 1024
  /** Marge laissée libre sur le téléphone au-delà de la taille du fichier. */
  private const val SPACE_MARGIN = 64L * 1024 * 1024
  private const val HEAD_BYTES = 64
  private const val META_TIMEOUT_MS = 8_000L

  private lateinit var context: Context
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  fun init(appContext: Context) {
    if (!::context.isInitialized) context = appContext.applicationContext
  }

  /** Demande de transfert ; `resumePart` : reprise d'un fichier partiel existant. */
  class Request(
    val url: String,
    val kind: String,
    val relativePath: String,
    val displayName: String,
    val mimeType: String,
    val expect: String,
    val expectedSize: Long,
    val resumePart: String?,
    val etag: String?,
    val lastModified: String?,
  )

  class Task(val id: String, val request: Request) {
    @Volatile var status: String = "running"
    @Volatile var bytesDone: Long = 0
    @Volatile var bytesTotal: Long = request.expectedSize
    @Volatile var bytesPerSec: Long = 0
    @Volatile var mediaId: String? = null
    @Volatile var mediaUri: String? = null
    @Volatile var error: String? = null
    @Volatile var httpStatus: Int? = null
    /** Fichier partiel (URI content:// ou chemin) conservé pour la reprise. */
    @Volatile var partUri: String? = request.resumePart
    @Volatile var etag: String? = request.etag
    @Volatile var lastModified: String? = request.lastModified
    /** Le serveur accepte les requêtes partielles : pause et reprise possibles. */
    @Volatile var resumable: Boolean = request.resumePart != null
    /** La reprise a été refusée (fichier modifié sur le serveur) : transfert reparti de zéro. */
    @Volatile var restarted: Boolean = false
    @Volatile var pauseRequested: Boolean = false
    @Volatile var job: Job? = null
    @Volatile var connection: HttpURLConnection? = null

    fun toMap(): Map<String, Any?> = mapOf(
      "status" to status,
      "bytesDone" to bytesDone.toDouble(),
      "bytesTotal" to bytesTotal.toDouble(),
      "bytesPerSec" to bytesPerSec.toDouble(),
      "mediaId" to mediaId,
      "mediaUri" to mediaUri,
      "error" to error,
      "httpStatus" to httpStatus,
      "partUri" to partUri,
      "etag" to etag,
      "lastModified" to lastModified,
      "resumable" to resumable,
      "restarted" to restarted,
    )
  }

  private class Opened(val connection: HttpURLConnection, val status: Int, val url: URL, val redirects: Int)

  private val tasks = ConcurrentHashMap<String, Task>()

  fun hasRunning(): Boolean = tasks.values.any { it.status == "running" }

  /** Résumé pour la notification : nombre de transferts, octets reçus et attendus (-1 si inconnus). */
  fun progress(): Triple<Int, Long, Long> {
    val running = tasks.values.filter { it.status == "running" }
    val total = if (running.all { it.bytesTotal > 0 }) running.sumOf { it.bytesTotal } else -1L
    return Triple(running.size, running.sumOf { it.bytesDone }, total)
  }

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
  private fun open(start: String, headers: Map<String, String>, task: Task? = null): Opened {
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
        for ((k, v) in headers) setRequestProperty(k, v)
      }
      task?.connection = c
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
    if (text.startsWith("<") || text.startsWith("{")) return "html"
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
    val opened = open(url, mapOf("Range" to "bytes=0-${HEAD_BYTES - 1}"))
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
        "resumable" to (status == 206 || c.getHeaderField("Accept-Ranges")?.contains("bytes", ignoreCase = true) == true),
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

  private val modern: Boolean
    get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

  private fun collection(kind: String): Uri =
    if (kind == "video") MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    else MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)

  /** Android 9 et avant : dossier public (« Movies/OpenPlay ») ; chemins remontants refusés. */
  @Suppress("DEPRECATION")
  private fun legacyFolder(relativePath: String): File {
    val parts = relativePath.split('/').filter { it.isNotBlank() }
    if (parts.isEmpty() || parts.any { it == "." || it == ".." }) throw LinkException("ERR_LINK_STORAGE", "Dossier invalide")
    return File(Environment.getExternalStorageDirectory(), parts.joinToString("/"))
  }

  fun exists(kind: String, relativePath: String, displayName: String): Boolean {
    if (!modern) return File(legacyFolder(relativePath), displayName).exists()
    val selection = "${MediaStore.MediaColumns.RELATIVE_PATH} = ? AND ${MediaStore.MediaColumns.DISPLAY_NAME} = ? COLLATE NOCASE"
    context.contentResolver.query(collection(kind), arrayOf(MediaStore.MediaColumns._ID), selection, arrayOf(relativePath.trim('/') + "/", displayName), null)?.use { return it.count > 0 }
    return false
  }

  /** Taille actuelle du fichier partiel (-1 s'il n'existe plus). */
  private fun partSize(part: String): Long =
    try {
      if (part.startsWith("content://")) {
        context.contentResolver.openFileDescriptor(Uri.parse(part), "r")?.use { it.statSize } ?: -1L
      } else {
        File(part).let { if (it.exists()) it.length() else -1L }
      }
    } catch (e: Exception) {
      -1L
    }

  private fun readPartHead(part: String, into: ByteArray): Int =
    try {
      val input = if (part.startsWith("content://")) context.contentResolver.openInputStream(Uri.parse(part)) else File(part).inputStream()
      input?.use { readUpTo(it, into) } ?: 0
    } catch (e: Exception) {
      0
    }

  private fun openPart(part: String, append: Boolean): OutputStream =
    if (part.startsWith("content://")) {
      context.contentResolver.openOutputStream(Uri.parse(part), if (append) "wa" else "wt") ?: throw LinkException("ERR_LINK_STORAGE", "Écriture impossible")
    } else {
      FileOutputStream(File(part), append)
    }

  /** Nouveau fichier partiel, invisible des autres applications et de la bibliothèque. */
  private fun createPart(task: Task): String {
    val r = task.request
    if (modern) {
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, r.displayName)
        put(MediaStore.MediaColumns.MIME_TYPE, r.mimeType)
        put(MediaStore.MediaColumns.RELATIVE_PATH, r.relativePath.trim('/') + "/")
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
      return context.contentResolver.insert(collection(r.kind), values)?.toString() ?: throw LinkException("ERR_LINK_STORAGE", "Insertion MediaStore refusée")
    }
    val dir = File(context.getExternalFilesDir(null) ?: context.filesDir, "downloads")
    if (!dir.isDirectory && !dir.mkdirs()) throw LinkException("ERR_LINK_STORAGE", "Dossier temporaire impossible")
    return File(dir, "${task.id}.part").also { it.writeBytes(ByteArray(0)) }.absolutePath
  }

  fun discardPart(part: String?) {
    if (part.isNullOrBlank()) return
    try {
      if (part.startsWith("content://")) context.contentResolver.delete(Uri.parse(part), null, null) else File(part).delete()
    } catch (e: Exception) {
      // Entrée « en attente » : Android la supprime de lui-même après quelques jours.
    }
  }

  // --- Commandes ---

  fun start(taskId: String, request: Request) {
    if (tasks[taskId]?.status == "running") return
    val task = Task(taskId, request)
    tasks[taskId] = task
    task.job = scope.launch { transfer(task) }
    LinkDownloadService.ensureRunning(context)
  }

  fun states(ids: List<String>): Map<String, Any?> = ids.mapNotNull { id -> tasks[id]?.let { id to it.toMap() } }.toMap()

  /** Pause : transfert arrêté, fichier partiel conservé pour la reprise (si le serveur l'accepte). */
  fun pause(taskId: String) {
    val task = tasks[taskId] ?: return
    if (task.status != "running") return
    task.pauseRequested = true
    task.job?.cancel()
    task.connection?.disconnect()
  }

  /** Système (limite de durée du service) : tous les transferts en pause, reprenables au retour dans OpenPlay. */
  fun pauseAll() {
    tasks.keys.forEach { pause(it) }
  }

  fun cancel(taskId: String, partUri: String?) {
    val task = tasks[taskId]
    if (task != null && task.status == "running") {
      task.status = "cancelled"
      task.job?.cancel()
      task.connection?.disconnect()
      return
    }
    if (task != null) task.status = "cancelled"
    discardPart(task?.partUri ?: partUri)
  }

  // --- Transfert ---

  private suspend fun transfer(task: Task) {
    val r = task.request
    var keepPart = false
    try {
      // Fichier partiel : reprise s'il existe encore, sinon nouveau.
      val existing = task.partUri?.takeIf { partSize(it) >= 0 }
      val part = existing ?: createPart(task)
      task.partUri = part
      var offset = if (existing != null) partSize(existing) else 0L
      val headers = mutableMapOf<String, String>()
      if (offset > 0) {
        headers["Range"] = "bytes=$offset-"
        (task.etag ?: task.lastModified)?.let { headers["If-Range"] = it }
      }
      val opened = open(r.url, headers, task)
      val http = opened.connection
      val status = opened.status
      var append = false
      val total: Long
      when {
        offset > 0 && status == 206 -> {
          // Reprise acceptée : le serveur doit reprendre exactement là où le fichier partiel s'arrête.
          val range = http.getHeaderField("Content-Range") ?: ""
          val start = Regex("bytes\\s+(\\d+)-").find(range)?.groupValues?.get(1)?.toLongOrNull()
          if (start != offset) throw LinkException("ERR_LINK_RESUME", "Reprise incohérente")
          total = range.substringAfter('/', "").trim().toLongOrNull() ?: -1L
          append = true
        }
        offset > 0 && status == 416 && task.bytesTotal > 0 && offset == task.bytesTotal -> {
          // Déjà complet : vérification et publication sans nouveau transfert.
          http.disconnect()
          finish(task, part, offset)
          return
        }
        status in 200..299 -> {
          // Premier transfert, ou reprise refusée (fichier modifié sur le serveur) : depuis le début.
          if (offset > 0) task.restarted = true
          offset = 0
          total = http.contentLengthLong.takeIf { it > 0 } ?: r.expectedSize
        }
        else -> {
          task.httpStatus = status
          throw LinkException("ERR_LINK_HTTP", "HTTP $status")
        }
      }
      task.resumable = status == 206 || http.getHeaderField("Accept-Ranges")?.contains("bytes", ignoreCase = true) == true
      http.getHeaderField("ETag")?.takeIf { !it.startsWith("W/") }?.let { task.etag = it }
      http.getHeaderField("Last-Modified")?.let { task.lastModified = it }
      if (total > MAX_BYTES) throw LinkException("ERR_LINK_TOO_LARGE", "Fichier trop volumineux")
      task.bytesTotal = total
      @Suppress("DEPRECATION")
      val free = StatFs(Environment.getExternalStorageDirectory().path).availableBytes
      if (total > 0 && total - offset + SPACE_MARGIN > free) throw LinkException("ERR_LINK_SPACE", "Espace insuffisant")

      val head = ByteArray(HEAD_BYTES)
      var headLen = if (append) readPartHead(part, head) else 0
      var checked = append && headLen >= 16 && sniff(head, headLen) == r.expect
      var done = offset
      task.bytesDone = done
      var tickAt = System.nanoTime()
      var tickBytes = done
      try {
        http.inputStream.use { input ->
          openPart(part, append).use { output ->
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
                if (sniff(head, headLen) != r.expect) throw LinkException("ERR_LINK_TYPE", "Type réel différent")
                checked = true
              }
              output.write(buffer, 0, n)
              done += n
              if (done > MAX_BYTES || (total > 0 && done > total)) throw LinkException("ERR_LINK_TOO_LARGE", "Fichier plus grand qu'annoncé")
              task.bytesDone = done
              val now = System.nanoTime()
              if (now - tickAt >= 1_000_000_000L) {
                task.bytesPerSec = ((done - tickBytes) * 1_000_000_000L) / (now - tickAt)
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
        if (task.status == "cancelled" || task.pauseRequested) throw CancellationException("arrêté")
        throw networkError(e)
      }
      // Connexion fermée trop tôt : reprenable plus tard si le serveur accepte les requêtes partielles.
      if (done == 0L || (total > 0 && done != total)) throw LinkException("ERR_LINK_INCOMPLETE", "Fichier incomplet")
      if (!checked && sniff(head, headLen) != r.expect) throw LinkException("ERR_LINK_TYPE", "Type réel différent")
      task.connection = null
      http.disconnect()
      finish(task, part, done)
    } catch (e: CancellationException) {
      if (task.pauseRequested && task.status != "cancelled") {
        task.status = "paused"
        keepPart = true
      } else {
        task.status = "cancelled"
      }
    } catch (e: Exception) {
      val error = networkError(e)
      if (task.status == "cancelled") {
        // Annulé pendant une requête : rien à signaler.
      } else if (task.pauseRequested) {
        task.status = "paused"
        keepPart = true
      } else {
        task.error = error.code
        task.status = "failed"
        // Coupure réseau ou serveur indisponible : le fichier partiel est gardé pour « Réessayer » (reprise).
        keepPart = task.resumable && task.bytesDone > 0 && error.code in setOf("ERR_LINK_NETWORK", "ERR_LINK_TIMEOUT", "ERR_LINK_DNS", "ERR_LINK_INCOMPLETE", "ERR_LINK_HTTP")
      }
    } finally {
      task.bytesPerSec = 0
      task.connection?.disconnect()
      task.connection = null
      task.job = null
      if (task.status != "done" && !keepPart) {
        discardPart(task.partUri)
        task.partUri = null
      }
    }
  }

  /** Fichier complet et vérifié : publication dans Music/ ou Movies/, puis indexation par Android. */
  private fun finish(task: Task, part: String, size: Long) {
    val r = task.request
    val head = ByteArray(HEAD_BYTES)
    val n = readPartHead(part, head)
    if (sniff(head, n) != r.expect) throw LinkException("ERR_LINK_TYPE", "Type réel différent")
    if (part.startsWith("content://")) {
      val uri = Uri.parse(part)
      context.contentResolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
      requestScan(uri)
      task.mediaId = ContentUris.parseId(uri).toString()
      task.mediaUri = uri.toString()
    } else {
      // Android 9 et avant : déplacement dans le dossier public, nom libre (« (2) »), puis indexation.
      val dir = legacyFolder(r.relativePath)
      if (!dir.isDirectory && !dir.mkdirs()) throw LinkException("ERR_LINK_STORAGE", "Dossier impossible")
      val base = r.displayName.substringBeforeLast('.')
      val ext = r.displayName.substringAfterLast('.', "")
      var target = File(dir, r.displayName)
      var i = 2
      while (target.exists()) {
        target = File(dir, "$base ($i).$ext")
        i += 1
      }
      val source = File(part)
      if (!source.renameTo(target)) {
        source.inputStream().use { input -> FileOutputStream(target).use { input.copyTo(it, 256 * 1024) } }
        source.delete()
      }
      task.partUri = null
      val latch = CountDownLatch(1)
      MediaScannerConnection.scanFile(context, arrayOf(target.absolutePath), arrayOf(r.mimeType)) { _, uri ->
        if (uri != null) {
          task.mediaId = ContentUris.parseId(uri).toString()
          task.mediaUri = uri.toString()
        }
        latch.countDown()
      }
      latch.await(15, TimeUnit.SECONDS)
    }
    task.bytesDone = size
    task.bytesTotal = size
    task.status = "done"
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

  /** Ouvre OpenPlay depuis la notification. */
  fun launchIntent(): Intent? = context.packageManager.getLaunchIntentForPackage(context.packageName)
}
