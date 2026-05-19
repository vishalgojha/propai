package com.chaoscraft.wablaster.util

import android.content.Context
import android.os.Build
import android.os.Process
import java.io.File
import java.io.FileWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class CrashLogger(private val context: Context) {

    private val logDir: File
        get() = File(context.filesDir, "crash_logs").also { it.mkdirs() }

    fun log(thread: Thread, throwable: Throwable) {
        try {
            val timestamp = SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.US).format(Date())
            val file = File(logDir, "crash_$timestamp.txt")
            FileWriter(file).use { writer ->
                writer.write("=== CRASH REPORT ===\n")
                writer.write("Time: ${SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())}\n")
                writer.write("Device: ${Build.MANUFACTURER} ${Build.MODEL} (${Build.PRODUCT})\n")
                writer.write("Android: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})\n")
                writer.write("App: ${context.packageName}\n")
                writer.write("Thread: ${thread.name} (${thread.id})\n")
                writer.write("\nException:\n")
                writer.write(throwable.toString())
                writer.write("\n\nStack Trace:\n")
                for (element in throwable.stackTrace) {
                    writer.write("\tat $element\n")
                }
                throwable.cause?.let { cause ->
                    writer.write("\nCaused by:\n")
                    writer.write(cause.toString())
                    writer.write("\n")
                    for (element in cause.stackTrace) {
                        writer.write("\tat $element\n")
                    }
                }
                writer.write("\n=== END ===\n")
            }
            trimOldLogs()
        } catch (_: Exception) {
        }
    }

    private fun trimOldLogs(maxFiles: Int = 20) {
        val files = logDir.listFiles()?.sortedByDescending { it.lastModified() } ?: return
        if (files.size > maxFiles) {
            files.drop(maxFiles).forEach { it.delete() }
        }
    }

    fun getRecentLogs(limit: Int = 5): List<String> {
        return logDir.listFiles()
            ?.sortedByDescending { it.lastModified() }
            ?.take(limit)
            ?.map { it.name } ?: emptyList()
    }

    fun getLogContent(filename: String): String? {
        val file = File(logDir, filename)
        return if (file.exists()) file.readText() else null
    }

    fun deleteAllLogs(): Boolean {
        return logDir.listFiles()?.all { it.delete() } ?: true
    }
}
