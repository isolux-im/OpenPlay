package expo.modules.openplaymedia

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Repérage du générique de début d'une série : empreinte sonore des premières minutes de deux
 * épisodes (énergie de 33 bandes de fréquence, 32 bits par trame, méthode de Haitsma et Kalker),
 * puis recherche du plus long passage commun. Tout est calculé sur l'appareil.
 */
internal object IntroDetector {
  private const val RATE = 11025
  private const val FRAME = 2048
  private const val HOP = 1024
  const val HOP_SEC = HOP.toDouble() / RATE
  private const val BANDS = 33
  private const val MIN_HZ = 300.0
  private const val MAX_HZ = 2000.0

  /** Trame « concordante » : au plus 10 bits différents sur 32 (le hasard en donne 16 en moyenne). */
  private const val MAX_BIT_ERRORS = 10
  /** Trous tolérés dans un passage commun (bruitages, compression différente) : ~2 s. */
  private const val MAX_GAP = 24
  private const val MIN_DENSITY = 0.5
  /** Erreur moyenne maximale sur le passage (16 pour des sons sans rapport). */
  private const val MAX_MEAN_ERRORS = 11.5
  const val MIN_INTRO_SEC = 15.0
  const val MAX_INTRO_SEC = 180.0

  private const val DECODE_TIMEOUT_MS = 90_000L

  /** Empreinte en cache (fichier binaire par vidéo), sinon calculée à partir du son décodé. */
  fun fingerprint(context: Context, uri: Uri, cacheName: String, seed: Int, maxSeconds: Int): IntArray? {
    val dir = File(context.cacheDir, "openplay-fingerprints").apply { mkdirs() }
    val file = File(dir, "$cacheName-$maxSeconds.fp")
    if (file.exists() && file.length() > 4) {
      try {
        DataInputStream(file.inputStream().buffered()).use { input ->
          val n = input.readInt()
          return IntArray(n) { input.readInt() }
        }
      } catch (e: Exception) {
        file.delete()
      }
    }
    val pcm = decodeMono(context, uri, maxSeconds) ?: return null
    val fp = compute(pcm, seed)
    if (fp.isEmpty()) return null
    try {
      val tmp = File(dir, "${file.name}.${Thread.currentThread().id}.tmp")
      DataOutputStream(tmp.outputStream().buffered()).use { out ->
        out.writeInt(fp.size)
        fp.forEach { out.writeInt(it) }
      }
      if (!tmp.renameTo(file)) tmp.delete()
    } catch (e: Exception) {
      // Cache facultatif.
    }
    return fp
  }

  /** Son des `maxSeconds` premières secondes, mono, rééchantillonné à 11 025 Hz. */
  private fun decodeMono(context: Context, uri: Uri, maxSeconds: Int): FloatArray? {
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    try {
      extractor.setDataSource(context, uri, null)
      var track = -1
      var format: MediaFormat? = null
      for (i in 0 until extractor.trackCount) {
        val f = extractor.getTrackFormat(i)
        if (f.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
          track = i
          format = f
          break
        }
      }
      if (track < 0 || format == null) return null
      extractor.selectTrack(track)
      val decoder = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
      codec = decoder
      decoder.configure(format, null, null, 0)
      decoder.start()

      var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceAtLeast(1)
      var encoding = AudioFormat.ENCODING_PCM_16BIT
      val capacity = RATE * maxSeconds
      val out = FloatArray(capacity)
      var outSize = 0
      // Rééchantillonnage par moyenne (suffisant pour une empreinte limitée à 2 kHz).
      var step = sampleRate.toDouble() / RATE
      var pos = 0.0
      var sum = 0.0
      var count = 0
      val limitUs = maxSeconds * 1_000_000L
      val info = MediaCodec.BufferInfo()
      var inputDone = false
      var outputDone = false
      val deadline = System.currentTimeMillis() + DECODE_TIMEOUT_MS

      while (!outputDone && outSize < capacity) {
        if (System.currentTimeMillis() > deadline) return null
        if (!inputDone) {
          val inIndex = decoder.dequeueInputBuffer(10_000)
          if (inIndex >= 0) {
            val buffer = decoder.getInputBuffer(inIndex)!!
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0 || extractor.sampleTime > limitUs) {
              decoder.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              decoder.queueInputBuffer(inIndex, 0, size, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }
        val outIndex = decoder.dequeueOutputBuffer(info, 10_000)
        if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          val f = decoder.outputFormat
          sampleRate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceAtLeast(1)
          if (f.containsKey(MediaFormat.KEY_PCM_ENCODING)) encoding = f.getInteger(MediaFormat.KEY_PCM_ENCODING)
          step = sampleRate.toDouble() / RATE
        } else if (outIndex >= 0) {
          val buffer = decoder.getOutputBuffer(outIndex)!!
          buffer.position(info.offset)
          buffer.limit(info.offset + info.size)
          val data = buffer.slice().order(ByteOrder.LITTLE_ENDIAN)
          val float = encoding == AudioFormat.ENCODING_PCM_FLOAT
          val frames = info.size / ((if (float) 4 else 2) * channels)
          val shorts = if (float) null else data.asShortBuffer()
          val floats = if (float) data.asFloatBuffer() else null
          var i = 0
          while (i < frames && outSize < capacity) {
            var mono = 0.0
            for (c in 0 until channels) {
              mono += if (floats != null) floats.get(i * channels + c).toDouble() else shorts!!.get(i * channels + c) / 32768.0
            }
            sum += mono / channels
            count += 1
            pos += 1.0
            if (pos >= step) {
              out[outSize++] = (sum / count).toFloat()
              pos -= step
              sum = 0.0
              count = 0
            }
            i += 1
          }
          decoder.releaseOutputBuffer(outIndex, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
        }
      }
      return if (outSize >= FRAME) out.copyOf(outSize) else null
    } catch (e: Exception) {
      return null
    } finally {
      try {
        codec?.stop()
      } catch (e: Exception) {
        // Décodeur déjà arrêté.
      }
      codec?.release()
      extractor.release()
    }
  }

  /** 32 bits par trame ; trames silencieuses remplacées par une valeur propre au fichier (jamais concordante). */
  fun compute(pcm: FloatArray, seed: Int): IntArray {
    val frames = (pcm.size - FRAME) / HOP + 1
    if (frames < 2) return IntArray(0)
    val window = DoubleArray(FRAME) { 0.5 - 0.5 * cos(2 * PI * it / (FRAME - 1)) }
    val edges = IntArray(BANDS + 1) {
      val hz = MIN_HZ * Math.exp(ln(MAX_HZ / MIN_HZ) * it / BANDS)
      (hz * FRAME / RATE).toInt()
    }
    val re = DoubleArray(FRAME)
    val im = DoubleArray(FRAME)
    var previous = DoubleArray(BANDS)
    val result = IntArray(frames)
    var silentPrev = true
    for (t in 0 until frames) {
      val offset = t * HOP
      var power = 0.0
      for (i in 0 until FRAME) {
        val v = pcm[offset + i] * window[i]
        re[i] = v
        im[i] = 0.0
        power += v * v
      }
      fft(re, im)
      val energy = DoubleArray(BANDS)
      for (b in 0 until BANDS) {
        var e = 0.0
        for (k in edges[b] until max(edges[b + 1], edges[b] + 1)) e += re[k] * re[k] + im[k] * im[k]
        energy[b] = e
      }
      val silent = power / FRAME < 1e-6
      if (silent || silentPrev) {
        result[t] = (seed * 31 + t) * -0x61c88647
      } else {
        var bits = 0
        for (b in 0 until BANDS - 1) {
          val d = (energy[b] - energy[b + 1]) - (previous[b] - previous[b + 1])
          if (d > 0) bits = bits or (1 shl b)
        }
        result[t] = bits
      }
      previous = energy
      silentPrev = silent
    }
    return result
  }

  /** FFT complexe en place (taille puissance de 2). */
  private fun fft(re: DoubleArray, im: DoubleArray) {
    val n = re.size
    var j = 0
    for (i in 1 until n) {
      var bit = n shr 1
      while (j and bit != 0) {
        j = j xor bit
        bit = bit shr 1
      }
      j = j xor bit
      if (i < j) {
        val tr = re[i]; re[i] = re[j]; re[j] = tr
        val ti = im[i]; im[i] = im[j]; im[j] = ti
      }
    }
    var len = 2
    while (len <= n) {
      val angle = -2 * PI / len
      val wr = cos(angle)
      val wi = sin(angle)
      var i = 0
      while (i < n) {
        var cr = 1.0
        var ci = 0.0
        for (k in 0 until len / 2) {
          val ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
          val ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
          re[i + k + len / 2] = re[i + k] - ar
          im[i + k + len / 2] = im[i + k] - ai
          re[i + k] += ar
          im[i + k] += ai
          val nr = cr * wr - ci * wi
          ci = cr * wi + ci * wr
          cr = nr
        }
        i += len
      }
      len = len shl 1
    }
  }

  data class Match(val startA: Double, val endA: Double, val startB: Double, val endB: Double, val density: Double)

  /** Plus long passage commun aux deux empreintes (entre 15 s et 3 min), ou null. */
  fun common(a: IntArray, b: IntArray): Match? {
    val minFrames = (MIN_INTRO_SEC / HOP_SEC).toInt()
    val maxFrames = (MAX_INTRO_SEC / HOP_SEC).toInt()
    var best: Match? = null
    var bestLen = 0
    val errors = IntArray(max(a.size, b.size))
    // d = décalage : la trame i de A correspond à la trame i - d de B.
    for (d in -(b.size - minFrames)..(a.size - minFrames)) {
      val from = max(0, d)
      val to = min(a.size, b.size + d)
      if (to - from < minFrames) continue
      for (i in from until to) errors[i - from] = Integer.bitCount(a[i] xor b[i - d])
      val n = to - from
      var runStart = -1
      var lastGood = -1
      var k = 0
      while (k <= n) {
        val match = k < n && errors[k] <= MAX_BIT_ERRORS
        if (match) {
          if (runStart < 0) runStart = k
          lastGood = k
        } else if (runStart >= 0 && (k == n || k - lastGood > MAX_GAP)) {
          val m = refine(errors, runStart, lastGood)
          if (m != null) {
            val (s, e, density) = m
            val len = e - s + 1
            if (len in minFrames..maxFrames && len > bestLen) {
              bestLen = len
              best = Match((from + s) * HOP_SEC, (from + e + 1) * HOP_SEC, (from + s - d) * HOP_SEC, (from + e + 1 - d) * HOP_SEC, density)
            }
          }
          runStart = -1
        }
        k += 1
      }
    }
    return best
  }

  /**
   * Bornes resserrées (au moins 4 trames concordantes sur les 8 voisines, pour ne pas déborder sur
   * le contenu de l'épisode), puis contrôle de la densité et du taux d'erreur moyen du passage.
   */
  private fun refine(errors: IntArray, start: Int, end: Int): Triple<Int, Int, Double>? {
    fun goodIn(from: Int, to: Int): Int {
      var g = 0
      for (i in max(from, start)..min(to, end)) if (errors[i] <= MAX_BIT_ERRORS) g += 1
      return g
    }
    var s = start
    var e = end
    while (s < e && goodIn(s, s + 7) < 4) s += 1
    while (e > s && goodIn(e - 7, e) < 4) e -= 1
    val len = e - s + 1
    var good = 0
    var sum = 0L
    for (i in s..e) {
      if (errors[i] <= MAX_BIT_ERRORS) good += 1
      sum += errors[i]
    }
    val density = good.toDouble() / len
    return if (density >= MIN_DENSITY && sum.toDouble() / len <= MAX_MEAN_ERRORS) Triple(s, e, density) else null
  }
}
