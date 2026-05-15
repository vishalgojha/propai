package com.chaoscraft.wablaster.db.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "campaigns")
data class Campaign(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val messageTemplate: String,
    val mediaUri: String? = null,
    val skillsConfigJson: String = "{}",
    val createdAt: Long = System.currentTimeMillis(),
    val status: String = CampaignStatus.DRAFT
)

object CampaignStatus {
    const val DRAFT = "DRAFT"
    const val RUNNING = "RUNNING"
    const val PAUSED = "PAUSED"
    const val DONE = "DONE"
    const val STOPPED = "STOPPED"
}
