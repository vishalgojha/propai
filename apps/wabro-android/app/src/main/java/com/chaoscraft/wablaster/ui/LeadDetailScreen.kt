package com.chaoscraft.wablaster.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.chaoscraft.wablaster.db.entities.CampaignResponse

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun LeadDetailScreen(
    lead: CampaignResponse,
    viewModel: ResponseDashboardViewModel = hiltViewModel(),
    onClose: () -> Unit
) {
    Scaffold(topBar = { TopAppBar(title = { Text("Lead Detail") }) }) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(lead.brokerName.ifEmpty { lead.brokerPhone })
            Text(lead.responseText)
            Text("Intent: ${lead.intentLevel}")
        }
    }
}
