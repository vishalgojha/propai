package com.chaoscraft.wablaster

import android.app.Application
import com.chaoscraft.wablaster.util.CrashLogger
import com.chaoscraft.wablaster.util.NodeIdConfig
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class WAApplication : Application() {

    lateinit var crashLogger: CrashLogger
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        crashLogger = CrashLogger(this)
        setupCrashHandler()
        preloadNodeIds()
    }

    private fun setupCrashHandler() {
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            crashLogger.log(thread, throwable)
            defaultHandler?.uncaughtException(thread, throwable)
        }
    }

    private fun preloadNodeIds() {
        try {
            val pm = packageManager
            val pkg = pm.getPackageInfo("com.whatsapp", 0)
            NodeIdConfig.forVersion(pkg.versionName ?: "unknown")
        } catch (_: Exception) {
            try {
                val pm = packageManager
                val pkg = pm.getPackageInfo("com.whatsapp.w4b", 0)
                NodeIdConfig.forVersion(pkg.versionName ?: "unknown")
            } catch (_: Exception) {
            }
        }
    }

    companion object {
        @Volatile
        private var instance: WAApplication? = null

        fun getInstance(): WAApplication =
            instance ?: throw IllegalStateException("WAApplication not initialized")
    }
}
