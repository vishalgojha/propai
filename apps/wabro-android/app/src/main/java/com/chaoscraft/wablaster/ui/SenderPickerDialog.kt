package com.chaoscraft.wablaster.ui

import android.content.Context
import android.content.pm.PackageManager
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

data class SenderOption(val label: String, val packageName: String, val icon: String? = null)

@Composable
fun SenderPickerDialog(
    currentPackage: String,
    currentNumber: String,
    currentMultiAccount: Boolean,
    onSave: (pkg: String, number: String, multiAccount: Boolean) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val options = remember {
        buildList {
            add(SenderOption("WhatsApp", "com.whatsapp"))
            if (isPackageInstalled(context, "com.whatsapp.w4b")) {
                add(SenderOption("WhatsApp Business", "com.whatsapp.w4b"))
            }
        }
    }

    var selectedPkg by remember { mutableStateOf(currentPackage.ifEmpty { options.firstOrNull()?.packageName ?: "com.whatsapp" }) }
    var number by remember { mutableStateOf(currentNumber) }
    var multiAccount by remember { mutableStateOf(currentMultiAccount) }
    var showNumberField by remember { mutableStateOf(currentNumber.isNotEmpty()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Select Sender Account", fontWeight = FontWeight.Bold) },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    "Choose which WhatsApp account to send from:",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(12.dp))

                Column(Modifier.selectableGroup()) {
                    options.forEach { option ->
                        val isSelected = selectedPkg == option.packageName
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .selectable(
                                    selected = isSelected,
                                    onClick = { selectedPkg = option.packageName },
                                    role = Role.RadioButton
                                )
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = isSelected,
                                onClick = null
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(option.label, style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(checked = multiAccount, onCheckedChange = { multiAccount = it })
                    Spacer(Modifier.width(4.dp))
                    Text("I use WhatsApp multi-account", style = MaterialTheme.typography.bodyMedium)
                }

                Spacer(Modifier.height(4.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(checked = showNumberField, onCheckedChange = { showNumberField = it })
                    Spacer(Modifier.width(4.dp))
                    Text("Enter my WhatsApp number", style = MaterialTheme.typography.bodyMedium)
                }

                if (showNumberField) {
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = number,
                        onValueChange = { number = it.filter { c -> c.isDigit() || c == '+' } },
                        label = { Text("Your WhatsApp number") },
                        placeholder = { Text("+9198XXXXXXXX") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Text(
                        "Used for reference in dashboard. Include country code.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                onSave(selectedPkg, if (showNumberField) number else "", multiAccount)
                onDismiss()
            }) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

private fun isPackageInstalled(context: Context, pkg: String): Boolean {
    return try {
        context.packageManager.getPackageInfo(pkg, 0)
        true
    } catch (_: PackageManager.NameNotFoundException) {
        false
    }
}
