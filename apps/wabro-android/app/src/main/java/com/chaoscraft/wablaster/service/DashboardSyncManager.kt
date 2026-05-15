package com.chaoscraft.wablaster.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.chaoscraft.wablaster.R
import com.chaoscraft.wablaster.V2MainActivity
import com.chaoscraft.wablaster.util.PendingCampaign
import com.chaoscraft.wablaster.util.WaBroApiClient
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.*
import java.util.*
import javax.inject.Inject

@AndroidEntryPoint
class DashboardSyncManager : Service() {
    companion object {
        private const val TAG = "DashboardSyncManager"
        private const val CHANNEL_ID = "WaBroSyncChannel"
        private const val NOTIFICATION_ID = 1002

        private const val POLLING_INTERVAL_MS = 30_000L

        fun start(context: Context) {
            val intent = Intent(context, DashboardSyncManager::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
        
        fun stop(context: Context) {
            val intent = Intent(context, DashboardSyncManager::class.java)
            context.stopService(intent)
        }
    }
    
    @Inject
    lateinit var waBroApiClient: WaBroApiClient
    
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var pollingJob: Job? = null
    
    private val deviceId: String by lazy {
        // Use the device ID from the app's shared preferences or generate one
        // For now, we'll generate a random UUID
        UUID.randomUUID().toString()
    }
    
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Starting DashboardSyncManager")
        startPolling()
        return START_STICKY
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        super.onDestroy()
        stopPolling()
        scope.cancel()
    }

    private fun startPolling() {
        if (pollingJob?.isActive == true) {
            return
        }
        pollingJob = scope.launch {
            while (isActive) {
                try {
                    Log.d(TAG, "Polling for campaigns...")
                    pollForCampaigns()
                } catch (e: Exception) {
                    Log.e(TAG, "Error during polling", e)
                }
                delay(POLLING_INTERVAL_MS)
            }
        }
    }
    
    private fun stopPolling() {
        pollingJob?.cancel()
        pollingJob = null
    }
    
    private suspend fun pollForCampaigns() {
        // Register device if not already registered
        registerDeviceIfNotExists()
        
        // Get pending campaigns
        val result = waBroApiClient.getPendingCampaigns(deviceId)
        if (result.isSuccess) {
            val campaigns = result.getOrNull() ?: emptyList()
            Log.d(TAG, "Received ${campaigns.size} pending campaigns")
            
            // Process each campaign
            for (campaign in campaigns) {
                processCampaign(campaign)
            }
        } else {
            Log.e(TAG, "Failed to fetch campaigns: ${result.exceptionOrNull()?.message}")
        }
    }
    
    private suspend fun registerDeviceIfNotExists() {
        // In a real implementation, we'd check if device is already registered
        // For now, we'll register on every startup to simplify
        val result = waBroApiClient.registerDevice(
            deviceId = deviceId,
            model = android.os.Build.MODEL,
            androidVersion = android.os.Build.VERSION.RELEASE,
            appVersion = "1.0.0" // Should come from app version
        )
        
        if (result.isFailure) {
            Log.e(TAG, "Failed to register device: ${result.exceptionOrNull()?.message}")
        } else {
            Log.d(TAG, "Device registered successfully")
        }
    }
    
    private suspend fun processCampaign(campaign: PendingCampaign) {
        // In a real implementation, this would trigger the actual campaign execution
        // via the AccessibilityService or a separate worker
        Log.d(TAG, "Processing campaign: ${campaign.name}")
        
        // For now, just log that we received it
        // Real implementation would:
        // 1. Queue the campaign for execution
        // 2. Update campaign status via syncCampaignProgress
        // 3. Handle contact processing
        // 4. Upload logs via syncSendLogs
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "WaBro Sync Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background sync for WaBro campaigns"
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val openIntent = Intent(this, V2MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = android.app.PendingIntent.getActivity(
            this,
            0,
            openIntent,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("WaBro Sync")
            .setContentText("Monitoring for campaigns...")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }
}
