package com.chaoscraft.wablaster.db.entities

import androidx.room.Entity
import androidx.room.Index

@Entity(
    tableName = "broker_group_cross_ref",
    primaryKeys = ["brokerId", "groupId"],
    indices = [Index("brokerId"), Index("groupId")]
)
data class BrokerGroupCrossRef(
    val brokerId: Long,
    val groupId: Long,
    val addedAt: Long = System.currentTimeMillis()
)
