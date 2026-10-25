package expo.modules.openplaymedia

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Log
import android.util.Size
import androidx.palette.graphics.Palette
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import javax.net.ssl.SSLException

/**
 * Lecture des métadonnées audio depuis MediaStore (titre, artiste, album, genre, dossier),
 * extraction des pochettes vers le cache de l'application (URI file://, utilisable par
 * expo-image et par la notification d'expo-audio) et calcul des couleurs dominantes.
 */
class OpenPlayMediaModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  /** Pochettes décodées en parallèle : borné pour éviter la saturation mémoire sur les grandes bibliothèques. */
  private val artworkPermits = Semaphore(3)

  override fun definition() = ModuleDefinition {
    Name("OpenPlayMedia")

    OnCreate {
      appContext.reactContext?.let { CrashRecorder.install(it.applicationContext) }
    }

    AsyncFunction("queryTracksAsync") Coroutine { minDurationMs: Double ->
      // Filet de sécurité si le contexte n'était pas encore prêt à la création du module.
      CrashRecorder.install(context.applicationContext)
      withContext(Dispatchers.IO) { queryTracks(minDurationMs.toLong()) }
    }

    AsyncFunction("getArtworkAsync") Coroutine { trackId: String, albumId: String, size: Int ->
      artworkPermits.withPermit {
        withContext(Dispatchers.IO) {
          try {
            getArtwork(trackId, albumId, size)
          } catch (e: OutOfMemoryError) {
            // Image intégrée démesurée : pas de pochette plutôt qu'une fermeture de l'application.
            CrashRecorder.append(context, "Pochette ignorée (mémoire insuffisante)", "trackId=$trackId")
            null
          }
        }
      }
    }

    AsyncFunction("readLyricsAsync") Coroutine { path: String ->
      withContext(Dispatchers.IO) { readSiblingLyrics(path) }
    }

    AsyncFunction("getCrashReportsAsync") Coroutine { ->
      withContext(Dispatchers.IO) {
        mapOf("log" to CrashRecorder.read(context), "exits" to exitReasons())
      }
    }

    AsyncFunction("clearCrashReportsAsync") Coroutine { ->
      withContext(Dispatchers.IO) { CrashRecorder.clear(context) }
    }

    Function("recordDiagnostic") { kind: String, details: String ->
      CrashRecorder.append(context, kind, details)
    }

    AsyncFunction("diagnoseNetworkAsync") Coroutine { url: String, timeoutMs: Int ->
      withContext(Dispatchers.IO) { mapOf("network" to networkState(), "probe" to probe(url, timeoutMs)) }
    }

    AsyncFunction("shareAudioAsync") { trackId: String, mimeType: String, title: String ->
      shareAudio(trackId, mimeType, title)
    }.runOnQueue(Queues.MAIN)
  }

  /** Dernières fins anormales du processus enregistrées par Android 11+ (y compris plantages natifs et ANR). */
  private fun exitReasons(): List<Map<String, Any?>> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return emptyList()
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return emptyList()
    val kept = mapOf(
      ApplicationExitInfo.REASON_CRASH to "crash",
      ApplicationExitInfo.REASON_CRASH_NATIVE to "crash-native",
      ApplicationExitInfo.REASON_ANR to "anr",
      ApplicationExitInfo.REASON_LOW_MEMORY to "low-memory",
      ApplicationExitInfo.REASON_INITIALIZATION_FAILURE to "init-failure"
    )
    val clearedAt = CrashRecorder.clearedAt(context)
    return try {
      am.getHistoricalProcessExitReasons(context.packageName, 0, 10).mapNotNull { info ->
        val reason = kept[info.reason] ?: return@mapNotNull null
        if (info.timestamp <= clearedAt) return@mapNotNull null
        mapOf(
          "timestamp" to info.timestamp.toDouble(),
          "reason" to reason,
          "description" to info.description,
          // Seule la trace d'un ANR est du texte (celle d'un plantage natif est un protobuf).
          "trace" to if (info.reason == ApplicationExitInfo.REASON_ANR) readText(info.traceInputStream, 12_000) else null
        )
      }
    } catch (e: Exception) {
      emptyList()
    }
  }

  private fun readText(stream: java.io.InputStream?, max: Int): String? =
    try {
      stream?.use { s ->
        val buffer = ByteArray(max)
        var total = 0
        while (total < max) {
          val n = s.read(buffer, total, max - total)
          if (n <= 0) break
          total += n
        }
        String(buffer, 0, total, Charsets.UTF_8)
      }
    } catch (e: IOException) {
      null
    }

  /** Réseau actif et validation par Android (accès Internet réellement vérifié par le système). */
  private fun networkState(): Map<String, Any?> {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
      ?: return mapOf("connected" to false, "validated" to false, "transport" to "none")
    return try {
      val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        ?: return mapOf("connected" to false, "validated" to false, "transport" to "none")
      val transport = when {
        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "vpn"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
        else -> "other"
      }
      mapOf(
        "connected" to caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET),
        "validated" to caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),
        "transport" to transport
      )
    } catch (e: SecurityException) {
      mapOf("connected" to null, "validated" to null, "transport" to "unknown")
    }
  }

  /** Requête de test vers un service : distingue DNS, TLS, délai dépassé et serveur injoignable. */
  private fun probe(url: String, timeoutMs: Int): Map<String, Any?> {
    val started = System.currentTimeMillis()
    var connection: HttpURLConnection? = null
    fun failure(kind: String, e: Exception) =
      mapOf("ok" to false, "status" to null, "error" to kind, "message" to "${e.javaClass.simpleName}: ${e.message}", "ms" to (System.currentTimeMillis() - started).toDouble())
    return try {
      connection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = timeoutMs
        readTimeout = timeoutMs
        instanceFollowRedirects = false
        setRequestProperty("User-Agent", "OpenPlay (diagnostic réseau)")
      }
      val status = connection.responseCode
      mapOf("ok" to true, "status" to status, "error" to null, "message" to null, "ms" to (System.currentTimeMillis() - started).toDouble())
    } catch (e: UnknownHostException) {
      failure("dns", e)
    } catch (e: SSLException) {
      failure("tls", e)
    } catch (e: SocketTimeoutException) {
      failure("timeout", e)
    } catch (e: ConnectException) {
      failure("unreachable", e)
    } catch (e: IOException) {
      failure("io", e)
    } catch (e: Exception) {
      failure("other", e)
    } finally {
      connection?.disconnect()
    }
  }

  /** Feuille de partage système avec le fichier audio ; la lecture est accordée au destinataire. */
  private fun shareAudio(trackId: String, mimeType: String, title: String) {
    val uri = ContentUris.withAppendedId(audioCollection(), trackId.toLong())
    val send = Intent(Intent.ACTION_SEND).apply {
      type = mimeType.ifBlank { "audio/*" }
      putExtra(Intent.EXTRA_STREAM, uri)
      putExtra(Intent.EXTRA_TITLE, title)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val chooser = Intent.createChooser(send, title)
    val activity = appContext.currentActivity
    if (activity != null) {
      activity.startActivity(chooser)
    } else {
      context.startActivity(chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  private fun audioCollection(): Uri =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
    } else {
      MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
    }

  private fun queryTracks(minDurationMs: Long): List<Map<String, Any?>> {
    val projection = mutableListOf(
      MediaStore.Audio.Media._ID,
      MediaStore.Audio.Media.TITLE,
      MediaStore.Audio.Media.ARTIST,
      MediaStore.Audio.Media.ALBUM,
      MediaStore.Audio.Media.ALBUM_ID,
      MediaStore.Audio.Media.DURATION,
      MediaStore.Audio.Media.TRACK,
      MediaStore.Audio.Media.YEAR,
      MediaStore.Audio.Media.DATE_ADDED,
      MediaStore.Audio.Media.DISPLAY_NAME,
      MediaStore.Audio.Media.MIME_TYPE,
      MediaStore.Audio.Media.SIZE,
      MediaStore.Audio.Media.DATA
    )
    val hasGenreColumn = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    if (hasGenreColumn) projection.add(MediaStore.Audio.Media.GENRE)
    val hasAlbumArtist = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    if (hasAlbumArtist) projection.add(MediaStore.Audio.Media.ALBUM_ARTIST)

    val genres = if (hasGenreColumn) emptyMap() else legacyGenres()
    val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0 AND ${MediaStore.Audio.Media.DURATION} >= ?"
    val result = ArrayList<Map<String, Any?>>()
    context.contentResolver.query(
      audioCollection(),
      projection.toTypedArray(),
      selection,
      arrayOf(minDurationMs.toString()),
      null
    )?.use { c ->
      val iId = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
      val iTitle = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
      val iArtist = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
      val iAlbum = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
      val iAlbumId = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)
      val iDuration = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
      val iTrack = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TRACK)
      val iYear = c.getColumnIndexOrThrow(MediaStore.Audio.Media.YEAR)
      val iAdded = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED)
      val iName = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
      val iMime = c.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE)
      val iSize = c.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
      val iData = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA)
      val iGenre = if (hasGenreColumn) c.getColumnIndex(MediaStore.Audio.Media.GENRE) else -1
      val iAlbumArtist = if (hasAlbumArtist) c.getColumnIndex(MediaStore.Audio.Media.ALBUM_ARTIST) else -1

      while (c.moveToNext()) {
        val id = c.getLong(iId)
        val path = c.getStringOrNull(iData)
        result.add(
          mapOf(
            "id" to id.toString(),
            "uri" to ContentUris.withAppendedId(audioCollection(), id).toString(),
            "title" to c.getStringOrNull(iTitle),
            "artist" to c.getStringOrNull(iArtist),
            "albumArtist" to if (iAlbumArtist >= 0) c.getStringOrNull(iAlbumArtist) else null,
            "album" to c.getStringOrNull(iAlbum),
            "albumId" to c.getLong(iAlbumId).toString(),
            "genre" to if (iGenre >= 0) c.getStringOrNull(iGenre) else genres[id],
            "durationMs" to c.getLong(iDuration).toDouble(),
            "trackNumber" to c.getInt(iTrack),
            "year" to c.getInt(iYear),
            "dateAdded" to c.getLong(iAdded).toDouble(),
            "filename" to c.getStringOrNull(iName),
            "mimeType" to c.getStringOrNull(iMime),
            "size" to c.getLong(iSize).toDouble(),
            "path" to path
          )
        )
      }
    }
    return result
  }

  /** Avant Android 11, le genre n'est pas une colonne de la table audio : on passe par la table des genres. */
  private fun legacyGenres(): Map<Long, String> {
    val out = HashMap<Long, String>()
    try {
      context.contentResolver.query(
        MediaStore.Audio.Genres.EXTERNAL_CONTENT_URI,
        arrayOf(MediaStore.Audio.Genres._ID, MediaStore.Audio.Genres.NAME),
        null, null, null
      )?.use { g ->
        while (g.moveToNext()) {
          val genreId = g.getLong(0)
          val name = g.getStringOrNull(1) ?: continue
          context.contentResolver.query(
            MediaStore.Audio.Genres.Members.getContentUri("external", genreId),
            arrayOf(MediaStore.Audio.Genres.Members.AUDIO_ID),
            null, null, null
          )?.use { members ->
            while (members.moveToNext()) out[members.getLong(0)] = name
          }
        }
      }
    } catch (e: Exception) {
      // Table des genres indisponible : les morceaux resteront sans genre.
    }
    return out
  }

  private fun artworkDir(): File {
    // v2 : les pochettes de la v1 venaient souvent de la vignette système, en basse résolution.
    File(context.cacheDir, "openplay-artwork").takeIf { it.exists() }?.deleteRecursively()
    return File(context.cacheDir, "openplay-artwork-v2").apply { mkdirs() }
  }

  private fun getArtwork(trackId: String, albumId: String, size: Int): Map<String, Any?>? {
    val key = if (albumId.isNotEmpty() && albumId != "0") "album-$albumId" else "track-$trackId"
    val file = File(artworkDir(), "$key-$size.jpg")
    val bitmap: Bitmap = if (file.exists() && file.length() > 0) {
      BitmapFactory.decodeFile(file.absolutePath) ?: return null
    } else {
      val id = trackId.toLongOrNull() ?: return null
      val loaded = loadArtworkBitmap(id, albumId.toLongOrNull() ?: 0L, size)?.let { trimLetterbox(it) } ?: return null
      // Écriture dans un fichier temporaire puis renommage : jamais de fichier à moitié écrit en cache.
      val tmp = File(file.parentFile, "${file.name}.${Thread.currentThread().id}.tmp")
      FileOutputStream(tmp).use { loaded.compress(Bitmap.CompressFormat.JPEG, 94, it) }
      if (!tmp.renameTo(file)) tmp.delete()
      loaded
    }
    val palette = Palette.from(bitmap).maximumColorCount(16).generate()
    val dominant = palette.getDominantColor(0xFF2B2B30.toInt())
    val vibrant = palette.getVibrantColor(palette.getMutedColor(dominant))
    val darkMuted = palette.getDarkMutedColor(palette.getDarkVibrantColor(dominant))
    return mapOf(
      "uri" to Uri.fromFile(file).toString(),
      "dominant" to toHex(dominant),
      "vibrant" to toHex(vibrant),
      "darkMuted" to toHex(darkMuted),
      "width" to bitmap.width,
      "height" to bitmap.height
    )
  }

  /**
   * Retire les bandes noires des vignettes vidéo (image 16:9 dans un cadre 4:3, par exemple).
   * Ne touche jamais une image carrée : une pochette d'album sombre ne doit pas être rognée.
   */
  private fun trimLetterbox(bitmap: Bitmap): Bitmap {
    val w = bitmap.width
    val h = bitmap.height
    if (w < 32 || h < 32 || kotlin.math.abs(w - h) <= maxOf(w, h) / 20) return bitmap
    val row = IntArray(w)
    val col = IntArray(h)
    fun isDark(c: Int) = maxOf((c shr 16) and 0xFF, (c shr 8) and 0xFF, c and 0xFF) < 28
    fun mostlyDark(pixels: IntArray): Boolean {
      var dark = 0
      var count = 0
      var i = 0
      while (i < pixels.size) {
        if (isDark(pixels[i])) dark++
        count++
        i += 4
      }
      return dark * 100 >= count * 97
    }
    fun rowIsBar(y: Int): Boolean {
      bitmap.getPixels(row, 0, w, 0, y, w, 1)
      return mostlyDark(row)
    }
    fun colIsBar(x: Int): Boolean {
      bitmap.getPixels(col, 0, 1, x, 0, 1, h)
      return mostlyDark(col)
    }
    var top = 0
    while (top < h / 3 && rowIsBar(top)) top++
    var bottom = h - 1
    while (bottom > h * 2 / 3 && rowIsBar(bottom)) bottom--
    var left = 0
    while (left < w / 3 && colIsBar(left)) left++
    var right = w - 1
    while (right > w * 2 / 3 && colIsBar(right)) right--
    val newW = right - left + 1
    val newH = bottom - top + 1
    if (newW >= w - 2 && newH >= h - 2) return bitmap
    return Bitmap.createBitmap(bitmap, left, top, newW, newH)
  }

  /**
   * Ordre de préférence : image intégrée au fichier (pleine résolution), pochette d'album
   * indexée (avant Android 10), puis vignette système (souvent réduite) en dernier recours.
   */
  private fun loadArtworkBitmap(trackId: Long, albumId: Long, size: Int): Bitmap? {
    val trackUri = ContentUris.withAppendedId(audioCollection(), trackId)
    embeddedArtwork(trackUri, size)?.let { return it }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && albumId > 0) {
      try {
        val artUri = ContentUris.withAppendedId(Uri.parse("content://media/external/audio/albumart"), albumId)
        context.contentResolver.openInputStream(artUri)?.use { stream ->
          BitmapFactory.decodeStream(stream)?.let { return scale(it, size) }
        }
      } catch (e: Exception) {
        // Pas de pochette d'album indexée.
      }
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      try {
        return context.contentResolver.loadThumbnail(trackUri, Size(size, size), null)
      } catch (e: Exception) {
        // Aucune vignette système.
      }
    }
    return null
  }

  private fun embeddedArtwork(trackUri: Uri, size: Int): Bitmap? {
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(context, trackUri)
      retriever.embeddedPicture?.let { decodeSampled(it, size) }
    } catch (e: Exception) {
      null
    } finally {
      try {
        retriever.release()
      } catch (e: Exception) {
        // Libération best effort.
      }
    }
  }

  /** Décode sans charger en mémoire une image bien plus grande que nécessaire, puis ajuste à `size`. */
  private fun decodeSampled(bytes: ByteArray, size: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (minOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= size) sample *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)?.let { scale(it, size) }
  }

  private fun scale(bitmap: Bitmap, size: Int): Bitmap {
    val largest = maxOf(bitmap.width, bitmap.height)
    if (largest <= size) return bitmap
    val ratio = size.toFloat() / largest
    return Bitmap.createScaledBitmap(bitmap, (bitmap.width * ratio).toInt(), (bitmap.height * ratio).toInt(), true)
  }

  /**
   * Cherche un fichier .lrc portant le même nom que le morceau. Sur Android 13+, l'accès
   * direct aux fichiers non audio du stockage partagé est généralement refusé : renvoie alors null.
   */
  private fun readSiblingLyrics(path: String): String? {
    if (path.isEmpty()) return null
    val base = path.substringBeforeLast('.', path)
    for (candidate in listOf("$base.lrc", "$base.LRC", "$base.txt")) {
      try {
        val f = File(candidate)
        if (f.isFile && f.canRead() && f.length() < 512 * 1024) return f.readText()
      } catch (e: Exception) {
        // Lecture refusée par le stockage limité : on essaie le candidat suivant.
      }
    }
    return null
  }

  private fun toHex(color: Int): String = String.format("#%06X", 0xFFFFFF and color)

  private fun Cursor.getStringOrNull(index: Int): String? =
    if (index < 0 || isNull(index)) null else getString(index)
}

/**
 * Journal de diagnostic local (fichiers privés de l'application) : exceptions Java/Kotlin non
 * interceptées — dont les erreurs JavaScript fatales, relayées par React Native — et incidents notables.
 * Rien n'est envoyé : l'utilisateur peut partager le rapport depuis Paramètres.
 */
object CrashRecorder {
  private const val FILE = "openplay-diagnostics.txt"
  private const val MAX_BYTES = 64 * 1024
  private const val MAX_ENTRY = 12_000
  private const val PREFS = "openplay-diagnostics"
  private const val CLEARED_AT = "clearedAt"
  private const val SEPARATOR = "\n=====\n"

  @Volatile private var installed = false

  fun install(context: Context) {
    if (installed) return
    installed = true
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        append(context, "Plantage (fil « ${thread.name} »)", Log.getStackTraceString(error))
      } catch (ignored: Throwable) {
        // Le journal ne doit jamais empêcher le rapport standard d'Android.
      }
      previous?.uncaughtException(thread, error)
    }
  }

  @Synchronized
  fun append(context: Context, kind: String, details: String) {
    val file = File(context.filesDir, FILE)
    val stamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.ROOT).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
    val entry = "$stamp · $kind · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}) · ${Build.MANUFACTURER} ${Build.MODEL}\n${details.take(MAX_ENTRY)}"
    val previous = if (file.exists()) file.readText() else ""
    var content = if (previous.isEmpty()) entry else previous + SEPARATOR + entry
    // On garde les entrées les plus récentes.
    while (content.length > MAX_BYTES && content.contains(SEPARATOR)) content = content.substringAfter(SEPARATOR)
    file.writeText(content)
  }

  @Synchronized
  fun read(context: Context): String? = File(context.filesDir, FILE).takeIf { it.exists() }?.readText()

  /** Les fins anormales vues par Android ne s'effacent pas : on mémorise la date du dernier effacement. */
  @Synchronized
  fun clear(context: Context) {
    File(context.filesDir, FILE).delete()
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong(CLEARED_AT, System.currentTimeMillis()).apply()
  }

  fun clearedAt(context: Context): Long = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(CLEARED_AT, 0L)
}
