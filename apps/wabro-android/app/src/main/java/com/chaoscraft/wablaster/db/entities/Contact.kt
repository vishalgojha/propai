package com.chaoscraft.wablaster.db.entities

import androidx.room.Entity
import androidx.room.Index

@Entity(
    tableName = "contacts",
    primaryKeys = ["phone", "campaignId"],
    indices = [Index("campaignId"), Index("sent")]
)
data class Contact(
    val phone: String,
    val name: String,
    val locality: String? = null,
    val budget: String? = null,
    val language: String? = null,
    val campaignId: Long = 0,
    val sent: Boolean = false
)
