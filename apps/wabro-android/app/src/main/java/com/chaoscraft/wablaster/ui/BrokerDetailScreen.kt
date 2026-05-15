package com.chaoscraft.wablaster.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.chaoscraft.wablaster.db.entities.Broker
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun BrokerDetailScreen(
    brokerId: Long,
    viewModel: BrokerViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit,
    onEdit: (Broker) -> Unit
) {
    var broker by remember { mutableStateOf<Broker?>(null) }
    LaunchedEffect(brokerId) { broker = viewModel.getBrokerById(brokerId) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(broker?.name ?: "Broker") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = null)
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (broker == null) {
                Text("Broker details are unavailable.")
            } else {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(broker!!.name, style = MaterialTheme.typography.titleLarge)
                        Text(broker!!.phone)
                        if (broker!!.city.isNotBlank()) Text("City: ${broker!!.city}")
                        if (broker!!.locality.isNotBlank()) Text("Locality: ${broker!!.locality}")
                        Spacer(Modifier.height(8.dp))
                        androidx.compose.material3.Button(onClick = { onEdit(broker!!) }) {
                            Text("Edit Broker")
                        }
                    }
                }
            }
        }
    }
}
