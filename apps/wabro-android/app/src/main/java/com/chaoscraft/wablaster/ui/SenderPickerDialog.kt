package com.chaoscraft.wablaster.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chaoscraft.wablaster.util.SenderConfig

data class SenderOption(
    val packageName: String,
    val label: String
)

private val senderOptions = listOf(
    SenderOption("com.whatsapp", "WhatsApp"),
    SenderOption("com.whatsapp.w4b", "WhatsApp Business"),
    SenderOption("com.gbwhatsapp", "GB WhatsApp"),
    SenderOption("com.whatsappplus", "WhatsApp Plus")
)

@Composable
fun SenderPickerDialog(
    senderConfig: SenderConfig,
    onDismiss: () -> Unit
) {
    var selected by remember { mutableStateOf(senderConfig.selectedPackage) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Select Sender", fontWeight = FontWeight.Bold)
        },
        text = {
            LazyColumn {
                items(senderOptions) { option ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = selected == option.packageName,
                            onClick = { selected = option.packageName }
                        )
                        Column(modifier = Modifier.padding(start = 12.dp)) {
                            Text(
                                text = option.label,
                                fontWeight = FontWeight.Medium,
                                style = MaterialTheme.typography.bodyLarge
                            )
                            Text(
                                text = option.packageName,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    senderConfig.selectedPackage = selected
                    onDismiss()
                },
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                Text("Select")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
