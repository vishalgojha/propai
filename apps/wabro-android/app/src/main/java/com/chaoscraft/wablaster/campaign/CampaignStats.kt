package com.chaoscraft.wablaster.campaign

data class CampaignStats(
    val campaignId: Long = 0,
    val total: Int = 0,
    val sent: Int = 0,
    val failed: Int = 0,
    val skipped: Int = 0,
    val paused: Int = 0,
    val isRunning: Boolean = false,
    val isPaused: Boolean = false
)
