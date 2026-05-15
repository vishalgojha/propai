package com.chaoscraft.wablaster.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.chaoscraft.wablaster.R
import com.chaoscraft.wablaster.V2MainActivity
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class BroadcastForegroundService : android.app.Service() {

    @Inject
    lateinit var campaignManager: com.chaoscraft.wablaster.campaign.CampaignManager

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "UPDATE") {
            updateNotification(
                sent = intent.getIntExtra("sent", 0),
                failed = intent.getIntExtra("failed", 0),
                total = intent.getIntExtra("total", 0)
            )
            return START_STICKY
        }
        val notification = buildNotification(
            getString(R.string.notification_broadcast_running)
        )
        startForeground(NOTIFICATION_ID, notification)
        return START_STICKY
    }

    fun updateNotification(sent: Int, failed: Int, total: Int) {
        val text = "Sending... $sent/$total sent, $failed failed"
        val notification = buildNotification(text)
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, notification)
    }

    fun updateNotification(text: String) {
        val notification = buildNotification(text)
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, notification)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        releaseWakeLock()
        stopForeground(STOP_FOREGROUND_REMOVE)
    }

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "wablaster:broadcast"
        ).apply {
            acquire()
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "WaBro Broadcast",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows broadcast campaign progress"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): android.app.Notification {
        val openIntent = Intent(this, V2MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stats = campaignManager.stats.value

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("WaBro")
            .setContentText(text)
            .setSubText("Sent: ${stats.sent} | Failed: ${stats.failed} | Total: ${stats.total}")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    companion object {
        const val CHANNEL_ID = "wablaster_broadcast"
        const val NOTIFICATION_ID = 1001
    }
}
