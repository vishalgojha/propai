package com.chaoscraft.wablaster.db.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "send_logs")
data class SendLog(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val campaignId: Long = 0,
    val contactPhone: String,
    val contactName: String,
    val status: String,
    val timestamp: Long = System.currentTimeMillis()
)

object SendStatus {
    const val SENT = "SENT"
    const val FAILED = "FAILED"
    const val SKIPPED = "SKIPPED"
    const val REPLY_PAUSED = "REPLY_PAUSED"
}
