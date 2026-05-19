package com.chaoscraft.wablaster.db.entities

import androidx.room.Entity
import androidx.room.Index

@Entity(
    tableName = "broadcast_list_contacts",
    primaryKeys = ["listId", "phone"],
    indices = [Index("listId"), Index("phone")]
)
data class BroadcastListContact(
    val listId: Long,
    val phone: String,
    val name: String,
    val locality: String? = null,
    val budget: String? = null,
    val language: String? = null,
    val addedAt: Long = System.currentTimeMillis()
)
