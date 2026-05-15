package com.chaoscraft.wablaster.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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

@Composable
fun BrokerEditScreen(
    viewModel: BrokerViewModel = hiltViewModel(),
    brokerId: Long? = null,
    onSave: () -> Unit,
    onCancel: () -> Unit
) {
    var existingBroker by remember { mutableStateOf<Broker?>(null) }
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }

    LaunchedEffect(brokerId) {
        if (brokerId != null && brokerId != 0L) {
            existingBroker = viewModel.getBrokerById(brokerId)
            name = existingBroker?.name.orEmpty()
            phone = existingBroker?.phone.orEmpty()
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(if (brokerId != null && brokerId != 0L) "Edit Broker" else "Add Broker", style = MaterialTheme.typography.titleLarge)
        OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Phone") }, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = {
                    viewModel.addOrUpdateBroker(
                        (existingBroker ?: Broker(name = "", phone = "")).copy(name = name, phone = phone)
                    )
                    onSave()
                }
            ) { Text("Save") }
            Button(onClick = onCancel) { Text("Cancel") }
        }
    }
}
