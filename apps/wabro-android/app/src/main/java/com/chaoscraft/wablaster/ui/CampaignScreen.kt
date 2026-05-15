package com.chaoscraft.wablaster.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.chaoscraft.wablaster.db.entities.Broker
import com.chaoscraft.wablaster.util.AiConfig
import com.chaoscraft.wablaster.util.PaymentManager
import com.chaoscraft.wablaster.util.SenderConfig

@Composable
fun CampaignScreen(
    viewModel: CampaignViewModel = hiltViewModel(),
    senderConfig: SenderConfig,
    aiConfig: AiConfig,
    paymentManager: PaymentManager,
    onNavigateToDashboard: (Long) -> Unit
) {
    val campaignName by viewModel.campaignName.collectAsState()
    val messageTemplate by viewModel.messageTemplate.collectAsState()
    val importedContacts by viewModel.importedContacts.collectAsState()
    val runningCampaign by viewModel.runningCampaign.collectAsState()
    val brokers by viewModel.brokers.collectAsState(initial = emptyList())
    val listings by viewModel.listings.collectAsState(initial = emptyList())
    val selectedListingId by viewModel.selectedListingId.collectAsState()
    var selectedBrokerIds by remember { mutableStateOf(setOf<Long>()) }
    var showListingMenu by remember { mutableStateOf(false) }
    var navigateOnStart by remember { mutableStateOf(false) }
    val selectedListing = listings.firstOrNull { it.id == selectedListingId }

    LaunchedEffect(runningCampaign?.id, navigateOnStart) {
        if (navigateOnStart && runningCampaign != null) {
            navigateOnStart = false
            onNavigateToDashboard(runningCampaign!!.id)
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Campaigns", style = MaterialTheme.typography.titleLarge)
        OutlinedTextField(
            value = campaignName,
            onValueChange = { viewModel.campaignName.value = it },
            label = { Text("Campaign name") },
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = messageTemplate,
            onValueChange = { viewModel.messageTemplate.value = it },
            label = { Text("Message template") },
            modifier = Modifier.fillMaxWidth()
        )
        if (listings.isEmpty()) {
            Text(
                "Add at least one listing before starting a campaign.",
                style = MaterialTheme.typography.bodySmall
            )
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Selected listing", style = MaterialTheme.typography.titleMedium)
                Button(onClick = { showListingMenu = true }) {
                    Text(selectedListing?.name ?: "Choose Listing")
                }
                DropdownMenu(expanded = showListingMenu, onDismissRequest = { showListingMenu = false }) {
                    listings.forEach { listing ->
                        DropdownMenuItem(
                            text = { Text("${listing.name} • ${listing.city}") },
                            onClick = {
                                viewModel.setSelectedListing(listing.id)
                                if (messageTemplate.isBlank()) {
                                    viewModel.messageTemplate.value = buildString {
                                        appendLine("Property: ${listing.name}")
                                        if (listing.projectName.isNotBlank()) appendLine("Project: ${listing.projectName}")
                                        if (listing.city.isNotBlank()) appendLine("City: ${listing.city}")
                                        if (listing.locality.isNotBlank()) appendLine("Locality: ${listing.locality}")
                                        if (listing.price > 0) appendLine("Price: Rs ${listing.price.toLong()}")
                                    }.trim()
                                }
                                showListingMenu = false
                            }
                        )
                    }
                }
            }
        }
        if (brokers.isEmpty()) {
            Text(
                "No brokers available yet. Add brokers from the Brokers tab.",
                style = MaterialTheme.typography.bodySmall
            )
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Select brokers", style = MaterialTheme.typography.titleMedium)
                LazyColumn(modifier = Modifier.fillMaxWidth()) {
                    items(items = brokers.take(20), key = { broker: Broker -> broker.id }) { broker ->
                        Row {
                            Checkbox(
                                checked = selectedBrokerIds.contains(broker.id),
                                onCheckedChange = { checked ->
                                    selectedBrokerIds = if (checked) {
                                        selectedBrokerIds + broker.id
                                    } else {
                                        selectedBrokerIds - broker.id
                                    }
                                    viewModel.setImportedContacts(
                                        brokers.filter { it.id in selectedBrokerIds }.map {
                                            com.chaoscraft.wablaster.db.entities.Contact(
                                                phone = it.whatsappNumber.ifBlank { it.phone },
                                                name = it.name,
                                                locality = it.locality
                                            )
                                        }
                                    )
                                }
                            )
                            Spacer(Modifier.width(8.dp))
                            Column {
                                Text(broker.name)
                                Text(broker.whatsappNumber.ifBlank { broker.phone }, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        }
        Text("Imported contacts: ${importedContacts.size}")
        if (runningCampaign != null) {
            Button(onClick = { onNavigateToDashboard(runningCampaign!!.id) }) {
                Text("Open Running Campaign")
            }
        } else {
            Button(
                onClick = {
                    if (
                        campaignName.isNotBlank() &&
                        messageTemplate.isNotBlank() &&
                        selectedListingId != null &&
                        importedContacts.isNotEmpty()
                    ) {
                        navigateOnStart = true
                        viewModel.createAndStartCampaign()
                    }
                },
                enabled = campaignName.isNotBlank() &&
                    messageTemplate.isNotBlank() &&
                    selectedListingId != null &&
                    importedContacts.isNotEmpty()
            ) {
                Text("Start Campaign")
            }
        }
    }
}
