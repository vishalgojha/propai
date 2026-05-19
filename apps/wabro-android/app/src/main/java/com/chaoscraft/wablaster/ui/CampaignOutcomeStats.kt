package com.chaoscraft.wablaster.ui

data class CampaignOutcomeStats(
    val totalResponses: Int = 0,
    val hotLeads: Int = 0,
    val warmLeads: Int = 0,
    val coldLeads: Int = 0,
    val unfollowedLeads: Int = 0,
    val dealCount: Int = 0,
    val totalDealValue: Double = 0.0,
    val averageLeadScore: Double = 0.0
)
