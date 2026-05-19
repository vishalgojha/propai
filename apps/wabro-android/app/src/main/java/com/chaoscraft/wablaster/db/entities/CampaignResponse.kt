package com.chaoscraft.wablaster.db.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "campaign_responses")
data class CampaignResponse(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val campaignId: Long = 0,
    val listingId: Long = 0,
    val brokerId: Long = 0,
    val brokerName: String = "",
    val brokerPhone: String = "",
    val responseText: String = "",
    val responseType: String = "UNKNOWN", // INTERESTED, ASKED_PRICE, WANT_VISIT, ASKED_COMMISSION, OBJECTION, GENERAL_QUERY
    val hotLeadScore: Double = 0.0, // 0-100
    val intentLevel: String = "COLD", // HOT, WARM, COLD
    val responseTimeSec: Long = 0,
    val repliedAt: Long = 0,
    val followUpSent: Boolean = false,
    val followUpAt: Long = 0,
    val dealClosed: Boolean = false,
    val dealValue: Double = 0.0,
    val commissionAmount: Double = 0.0,
    val commissionStatus: String = "PENDING", // PENDING, INVOICED, PAID, DISPUTED
    val createdAt: Long = System.currentTimeMillis()
)