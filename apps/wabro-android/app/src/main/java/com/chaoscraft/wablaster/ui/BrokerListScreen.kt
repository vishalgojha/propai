package com.chaoscraft.wablaster.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.chaoscraft.wablaster.db.entities.Broker
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add

@Composable
fun BrokerListScreen(
    viewModel: BrokerViewModel = hiltViewModel(),
    onBrokerClick: (Broker) -> Unit,
    onAddBroker: () -> Unit
) {
    val brokers by viewModel.filteredBrokers.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = onAddBroker) {
                Icon(Icons.Default.Add, contentDescription = null)
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = viewModel::setSearchQuery,
                label = { Text("Search brokers") },
                modifier = Modifier.fillMaxWidth()
            )
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(items = brokers, key = { broker: Broker -> broker.id }) { broker ->
                    Card(modifier = Modifier.fillMaxWidth().clickable { onBrokerClick(broker) }) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(broker.name, style = MaterialTheme.typography.titleMedium)
                            Text(broker.phone)
                        }
                    }
                }
            }
        }
    }
}
