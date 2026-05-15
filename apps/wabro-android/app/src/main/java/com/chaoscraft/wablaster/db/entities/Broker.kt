package com.chaoscraft.wablaster.db.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "brokers")
data class Broker(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val phone: String,
    val whatsappNumber: String = "",
    val city: String = "",
    val locality: String = "",
    val pincode: String = "",
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val specialization: String = "", // RESALE, NEW_LAUNCH, COMMERCIAL, PLOT
    val languages: String = "", // comma-separated: HINDI,ENGLISH
    val commissionRate: Double = 0.0,
    val performanceScore: Double = 0.0,
    val tags: String = "", // comma-separated
    val notes: String = "",
    val isActive: Boolean = true,
    val createdAt: Long = System.currentTimeMillis()
)