package com.chaoscraft.wablaster.db.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "listings")
data class Listing(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val projectName: String = "",
    val address: String = "",
    val city: String = "",
    val locality: String = "",
    val pincode: String = "",
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val propertyType: String = "FLAT", // FLAT, HOUSE, SHOP, OFFICE, PLOT, VILLA
    val subType: String = "RESALE", // RESALE, NEW_LAUNCH, PRE_LAUNCH
    val price: Double = 0.0,
    val bhk: Int = 0,
    val areaSqft: Int = 0,
    val possessionDate: String = "",
    val reraNumber: String = "",
    val reraState: String = "",
    val status: String = "COMING_SOON", // COMING_SOON, LAUNCHED, SOLD_OUT, COMPLETED
    val amenities: String = "",
    val description: String = "",
    val brochureUrl: String = "",
    val floorPlanUrl: String = "",
    val images: String = "", // comma-separated URLs
    val commissionRate: Double = 0.0,
    val createdAt: Long = System.currentTimeMillis()
)