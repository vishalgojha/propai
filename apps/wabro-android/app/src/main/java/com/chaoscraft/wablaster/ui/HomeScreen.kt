package com.chaoscraft.wablaster.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chaoscraft.wablaster.util.AppValidator

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: CampaignViewModel,
    onNavigateToDashboard: () -> Unit
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    val csvPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri -> uri?.let { viewModel.importCsv(it) } }

    val mediaPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri -> uri?.let { viewModel.mediaUri.value = it } }

    val campaignName by viewModel.campaignName.collectAsState()
    val messageTemplate by viewModel.messageTemplate.collectAsState()
    val importedContacts by viewModel.importedContacts.collectAsState()
    val importErrors by viewModel.importErrors.collectAsState()
    val importTotalRows by viewModel.importTotalRows.collectAsState()
    val skillsConfig by viewModel.skillsConfig.collectAsState()
    val savedCampaigns by viewModel.savedCampaigns.collectAsState()
    val runningCampaign by viewModel.runningCampaign.collectAsState()
    val validator = remember { AppValidator(context) }
    var validationErrors by remember { mutableStateOf<List<String>>(emptyList()) }
    var showValidationDialog by remember { mutableStateOf(false) }
    var showSenderPicker by remember { mutableStateOf(false) }

    if (showValidationDialog) {
        AlertDialog(
            onDismissRequest = { showValidationDialog = false },
            icon = { Icon(Icons.Default.Warning, contentDescription = null) },
            title = { Text("Pre-flight Check Failed") },
            text = {
                Column {
                    validationErrors.forEach { error ->
                        Text(error, color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showValidationDialog = false }) { Text("OK") }
            }
        )
    }

    if (showSenderPicker) {
        SenderPickerDialog(
            currentPackage = viewModel.senderConfig.selectedPackage,
            currentNumber = viewModel.senderConfig.senderNumber,
            currentMultiAccount = viewModel.senderConfig.multiAccount,
            onSave = { pkg, number, multiAccount ->
                viewModel.senderConfig.selectedPackage = pkg
                viewModel.senderConfig.senderNumber = number
                viewModel.senderConfig.multiAccount = multiAccount
            },
            onDismiss = { showSenderPicker = false }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Home", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)

        // Active campaign banner
        runningCampaign?.let { campaign ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Row(
                    modifier = Modifier.padding(16.dp).fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.PlayCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(40.dp))
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Campaign Running", fontWeight = FontWeight.Bold)
                        Text(campaign.name, style = MaterialTheme.typography.bodyMedium)
                        Text("Status: ${campaign.status}", style = MaterialTheme.typography.bodySmall)
                    }
                    Button(onClick = {
                        viewModel.resumeExistingCampaign(campaign)
                        onNavigateToDashboard()
                    }) { Text("Resume") }
                }
            }
        }

        // Campaign section
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Campaign, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("New Campaign", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }

                Divider()

                OutlinedTextField(
                    value = campaignName,
                    onValueChange = { viewModel.campaignName.value = it },
                    label = { Text("Campaign Name") },
                    leadingIcon = { Icon(Icons.Default.Label, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                OutlinedTextField(
                    value = messageTemplate,
                    onValueChange = { viewModel.messageTemplate.value = it },
                    label = { Text("Message") },
                    placeholder = { Text("Type your message here...") },
                    leadingIcon = { Icon(Icons.Default.Message, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 140.dp),
                    maxLines = 8
                )
            }
        }

        // Media section
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.AttachFile, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("Media (Optional)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                Divider()
                OutlinedButton(
                    onClick = { mediaPicker.launch(arrayOf("image/*", "application/pdf")) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(if (viewModel.mediaUri.value != null) Icons.Default.CheckCircle else Icons.Default.AddPhotoAlternate, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(if (viewModel.mediaUri.value != null) "Change Media" else "Attach Media")
                }
                if (viewModel.mediaUri.value != null) {
                    val mediaUri = viewModel.mediaUri.value.toString()
                    Text(
                        text = if (mediaUri.startsWith("http://") || mediaUri.startsWith("https://")) {
                            viewModel.mediaUri.value?.lastPathSegment ?: ""
                        } else {
                            "Local media selected. Backend delivery currently requires a remote file URL."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = if (mediaUri.startsWith("http://") || mediaUri.startsWith("https://")) {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        } else {
                            MaterialTheme.colorScheme.error
                        }
                    )
                }
            }
        }

        // Skills section
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Tune, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("Skills", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                Divider()
                SkillsGrid(skillsConfig) { viewModel.skillsConfig.value = it }
            }
        }

        // Sender section
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.PhoneForwarded, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(8.dp))
                        Text("Sender", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    }
                    FilledTonalButton(onClick = { showSenderPicker = true }) {
                        Text("Change")
                    }
                }
                Divider()
                val pkg = viewModel.senderConfig.selectedPackage
                val number = viewModel.senderConfig.senderNumber
                if (pkg.isNotEmpty()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            if (pkg.contains("w4b")) Icons.Default.Business else Icons.Default.Chat,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(if (pkg.contains("w4b")) "WhatsApp Business" else "WhatsApp", style = MaterialTheme.typography.bodyLarge)
                            if (number.isNotEmpty()) Text(number, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.ErrorOutline, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.width(8.dp))
                        Text("Not configured — tap Change", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }

        // Contacts section
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Contacts, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("Contacts", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                Divider()

                var showContactPicker by remember { mutableStateOf(false) }
                if (showContactPicker) {
                    ContactPickerDialog(
                        onDismiss = { showContactPicker = false },
                        onContactsSelected = { contacts -> viewModel.addContactsFromPhonebook(contacts) }
                    )
                }

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { csvPicker.launch(arrayOf("text/*", "*/*")) },
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Default.UploadFile, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("CSV")
                    }
                    FilledTonalButton(
                        onClick = { showContactPicker = true },
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Default.PersonAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Phone")
                    }
                }

                if (importedContacts.isNotEmpty()) {
                    Divider()
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(8.dp))
                        Text("${importedContacts.size} valid contacts", style = MaterialTheme.typography.bodyMedium)
                        if (importTotalRows > importedContacts.size) {
                            Text(" (from $importTotalRows rows)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }

                if (importErrors.isNotEmpty()) {
                    Column {
                        importErrors.take(3).forEach { error ->
                            Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                        }
                        if (importErrors.size > 3) {
                            Text("...and ${importErrors.size - 3} more", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }

        // Start button
        Button(
            onClick = {
                if (!viewModel.senderConfig.isConfigured) {
                    showSenderPicker = true
                    return@Button
                }
                val result = validator.validateAll()
                if (!result.isValid) {
                    validationErrors = result.errors + result.warnings
                    showValidationDialog = true
                } else if (importedContacts.isNotEmpty() && campaignName.isNotBlank()) {
                    validationErrors = emptyList()
                    viewModel.createAndStartCampaign()
                    onNavigateToDashboard()
                }
            },
            modifier = Modifier.fillMaxWidth().height(56.dp),
            enabled = importedContacts.isNotEmpty() && campaignName.isNotBlank()
        ) {
            Icon(Icons.Default.RocketLaunch, contentDescription = null, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(8.dp))
            Text("Start Broadcast", style = MaterialTheme.typography.titleMedium)
        }

        // Past campaigns
        if (savedCampaigns.isNotEmpty()) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.History, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(8.dp))
                        Text("Past Campaigns", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    }
                    Spacer(Modifier.height(12.dp))
                    savedCampaigns
                        .filter { it.status != "RUNNING" && it.status != "PAUSED" }
                        .take(5)
                        .forEach { campaign ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        when (campaign.status) {
                                            "DONE" -> Icons.Default.CheckCircle
                                            "STOPPED" -> Icons.Default.Cancel
                                            else -> Icons.Default.HourglassEmpty
                                        },
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp),
                                        tint = when (campaign.status) {
                                            "DONE" -> MaterialTheme.colorScheme.primary
                                            "STOPPED" -> MaterialTheme.colorScheme.error
                                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                                        }
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Text(campaign.name, modifier = Modifier.weight(1f))
                                }
                                Text(campaign.status, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                }
            }
        }

        // PropAI cross-sell
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("PropAI", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Text("List properties & get buyer leads", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f))
                }
                FilledTonalButton(onClick = {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://app.propai.live"))
                    context.startActivity(intent)
                }) {
                    Text("Open", color = MaterialTheme.colorScheme.onSecondaryContainer)
                }
            }
        }

        Spacer(Modifier.height(16.dp))
    }
}

private data class SkillItem(val label: String, val enabled: Boolean, val onToggle: (Boolean) -> Unit)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SkillsGrid(config: com.chaoscraft.wablaster.engine.SkillsConfig, onUpdate: (com.chaoscraft.wablaster.engine.SkillsConfig) -> Unit) {
    val basicSkills = remember(config) {
        listOf(
            SkillItem("Spin Text", config.spinEnabled) { onUpdate(config.copy(spinEnabled = it)) },
            SkillItem("Personalize", config.mergeEnabled) { onUpdate(config.copy(mergeEnabled = it)) },
            SkillItem("Translate", config.translateEnabled) { onUpdate(config.copy(translateEnabled = it)) },
            SkillItem("Smart Caption", config.smartCaptionEnabled) { onUpdate(config.copy(smartCaptionEnabled = it)) },
            SkillItem("Reply Guard", config.replyGuardEnabled) { onUpdate(config.copy(replyGuardEnabled = it)) },
            SkillItem("Warmup", config.warmupEnabled) { onUpdate(config.copy(warmupEnabled = it)) }
        )
    }

    val aiSkills = remember(config) {
        listOf(
            SkillItem("AI Rewrite", config.aiRewriteEnabled) { onUpdate(config.copy(aiRewriteEnabled = it)) },
            SkillItem("AI Translate", config.aiTranslateEnabled) { onUpdate(config.copy(aiTranslateEnabled = it)) },
            SkillItem("AI Caption", config.aiCaptionEnabled) { onUpdate(config.copy(aiCaptionEnabled = it)) }
        )
    }

    Text("Basic", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(4.dp))
    SkillsChips(basicSkills)

    Spacer(Modifier.height(12.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Default.AutoAwesome, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(4.dp))
        Text("AI", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
    }
    Spacer(Modifier.height(4.dp))
    SkillsChips(aiSkills)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SkillsChips(skills: List<SkillItem>) {
    Column {
        skills.chunked(2).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                row.forEach { item ->
                    FilterChip(
                        selected = item.enabled,
                        onClick = { item.onToggle(!item.enabled) },
                        label = { Text(item.label, style = MaterialTheme.typography.bodySmall) },
                        leadingIcon = if (item.enabled) ({
                            Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(14.dp))
                        }) else null,
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.2f),
                            selectedLabelColor = MaterialTheme.colorScheme.primary
                        ),
                        modifier = Modifier.weight(1f)
                    )
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}
