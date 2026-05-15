package com.chaoscraft.wablaster.db.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "broker_groups")
data class BrokerGroup(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val type: String = "CUSTOM", // CITY, SPECIALIZATION, CUSTOM, PERFORMANCE
    val filterCriteria: String = "{}", // JSON
    val brokerCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis()
)