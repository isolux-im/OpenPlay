package expo.modules.openplaymedia

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/**
 * Service de premier plan (type « synchronisation de données ») pendant les téléchargements par lien : le processus
 * reste actif quand OpenPlay passe en arrière-plan ou que son interface est fermée. Notification de progression ;
 * le service s'arrête de lui-même quand plus aucun transfert n'est en cours.
 */
class LinkDownloadService : Service() {
  companion object {
    private const val CHANNEL = "openplay.downloads"
    private const val NOTIFICATION_ID = 0x4f50

    /** Démarre le service s'il ne tourne pas ; sans effet (et sans erreur) si Android le refuse. */
    fun ensureRunning(context: Context) {
      val intent = Intent(context, LinkDownloadService::class.java)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
      } catch (e: Exception) {
        // Démarrage refusé (application en arrière-plan) : le transfert continue tant que le processus vit.
      }
    }
  }

  private val handler = Handler(Looper.getMainLooper())

  private val tick = object : Runnable {
    override fun run() {
      if (!LinkDownloads.hasRunning()) {
        stopSelfCompat()
        return
      }
      getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, build())
      handler.postDelayed(this, 1_000)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    createChannel()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      } else {
        startForeground(NOTIFICATION_ID, build())
      }
    } catch (e: Exception) {
      // Premier plan refusé : arrêt du service, le transfert continue tant que le processus vit.
      stopSelf()
      return START_NOT_STICKY
    }
    handler.removeCallbacks(tick)
    handler.postDelayed(tick, 1_000)
    return START_NOT_STICKY
  }

  /** Android 15 : durée maximale atteinte pour ce type de service ; transferts en pause, reprenables ensuite. */
  override fun onTimeout(startId: Int, fgsType: Int) {
    LinkDownloads.pauseAll()
    stopSelfCompat()
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    super.onDestroy()
  }

  private fun stopSelfCompat() {
    handler.removeCallbacks(tick)
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL) != null) return
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Téléchargements", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Progression des téléchargements par lien"
      setShowBadge(false)
    })
  }

  @Suppress("DEPRECATION")
  private fun legacyBuilder(): Notification.Builder = Notification.Builder(this)

  private fun build(): Notification {
    val (count, done, total) = LinkDownloads.progress()
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL) else legacyBuilder()
    val title = if (count > 1) "Téléchargement de $count fichiers" else "Téléchargement en cours"
    val percent = if (total > 0) ((done * 100) / total).toInt().coerceIn(0, 100) else -1
    builder
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle(title)
      .setContentText(if (percent >= 0) "$percent %" else "Taille inconnue")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setProgress(100, percent.coerceAtLeast(0), percent < 0)
    LinkDownloads.launchIntent()?.let {
      builder.setContentIntent(PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    }
    return builder.build()
  }
}
