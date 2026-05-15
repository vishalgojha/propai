package com.chaoscraft.wablaster.db.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "broadcast_lists")
data class BroadcastList(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val contactCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis()
)
