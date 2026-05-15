package com.chaoscraft.wablaster.util

import android.content.Context
import android.net.Uri
import com.chaoscraft.wablaster.db.AppDatabase
import com.chaoscraft.wablaster.db.entities.SendLog
import kotlinx.coroutines.runBlocking
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class LogExporter(private val context: Context) {

    fun exportToCsv(campaignId: Long): Uri? {
        val db = AppDatabase.getInstance(context)
        val logs = runBlocking {
            db.sendLogDao().getRecentByCampaign(campaignId, Int.MAX_VALUE)
        }

        if (logs.isEmpty()) return null

        val content = buildCsv(logs)
        return writeToCache(content, campaignId)
    }

    private fun buildCsv(logs: List<SendLog>): String {
        val sb = StringBuilder()
        sb.appendLine("Phone,Name,Status,Timestamp")
        val formatter = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
        for (log in logs) {
            val time = formatter.format(Date(log.timestamp))
            sb.appendLine("${log.contactPhone},${log.contactName},${log.status},$time")
        }
        return sb.toString()
    }

    private fun writeToCache(content: String, campaignId: Long): Uri {
        val file = java.io.File(context.cacheDir, "export_campaign_${campaignId}.csv")
        file.writeText(content)
        return androidx.core.content.FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )
    }
}
