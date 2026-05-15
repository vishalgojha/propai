package com.chaoscraft.wablaster.db.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "deals")
data class Deal(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val campaignId: Long = 0,
    val listingId: Long = 0,
    val brokerId: Long = 0,
    val clientName: String = "",
    val clientPhone: String = "",
    val dealValue: Double = 0.0,
    val commissionRate: Double = 0.0,
    val commissionAmount: Double = 0.0,
    val commissionSplit: String = "[]", // JSON: [{brokerId, amount, percent}]
    val commissionStatus: String = "PENDING", // PENDING, INVOICED, PAID, DISPUTED
    val attributionSource: String = "CAMPAIGN", // CAMPAIGN, ORGANIC, REFERRAL, DIRECT
    val stage: String = "INQUIRY", // INQUIRY, SITE_VISIT, NEGOTIATION, DOCUMENT, CLOSED_WON, CLOSED_LOST
    val notes: String = "",
    val closedDate: Long = 0,
    val createdAt: Long = System.currentTimeMillis()
)