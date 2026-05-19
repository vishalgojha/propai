package com.chaoscraft.wablaster

import android.app.Application
import com.chaoscraft.wablaster.util.CrashLogger
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
    }

    private fun setupCrashHandler() {
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            crashLogger.log(thread, throwable)
            defaultHandler?.uncaughtException(thread, throwable)
        }
    }

    companion object {
        @Volatile
        private var instance: WAApplication? = null

        fun getInstance(): WAApplication =
            instance ?: throw IllegalStateException("WAApplication not initialized")
    }
}
