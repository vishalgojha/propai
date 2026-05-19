package com.chaoscraft.wablaster.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
fun CampaignDashboardScreen(
    viewModel: CampaignViewModel,
    onBack: () -> Unit
) {
    CampaignDashboard(
        viewModel = viewModel,
        onBack = onBack
    )
}
