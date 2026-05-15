package com.chaoscraft.wablaster.ui

import android.content.Intent
import android.view.View
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.chaoscraft.wablaster.db.entities.CampaignResponse
import com.chaoscraft.wablaster.db.entities.SendLog
import com.chaoscraft.wablaster.db.entities.CampaignStatus
import com.chaoscraft.wablaster.db.entities.SendStatus
import com.chaoscraft.wablaster.util.LogExporter

@Composable
fun CampaignDashboard(
    campaignId: Long,
    viewModel: CampaignViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit
) {
    val stats by viewModel.dashboardStats.collectAsState()
    val outcomeStats by viewModel.dashboardOutcomeStats.collectAsState()
    val topResponses by viewModel.dashboardTopResponses.collectAsState()
    val recentLogs by viewModel.dashboardLogs.collectAsState()
    val campaign by viewModel.dashboardCampaign.collectAsState()
    val runningCampaign by viewModel.runningCampaign.collectAsState()
    val context = LocalContext.current
    val view = LocalView.current
    LaunchedEffect(campaignId) {
        viewModel.selectDashboardCampaign(campaignId)
    }
    view.keepScreenOn = stats.isRunning
    val exporter = remember { LogExporter(context) }
    var exportMessage by remember { mutableStateOf<String?>(null) }
    val isActiveCampaign = runningCampaign?.id == campaignId

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Header with back
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onNavigateBack) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Back")
            }
            Spacer(Modifier.width(4.dp))
            Column {
                Text(campaign?.name ?: "Dashboard", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                campaign?.status?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.weight(1f))
            if (stats.total > 0) {
                FilledTonalButton(onClick = {
                    val uri = exporter.exportToCsv(campaignId)
                    if (uri != null) {
                        val shareIntent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/csv"
                            putExtra(Intent.EXTRA_STREAM, uri)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        context.startActivity(Intent.createChooser(shareIntent, "Export Logs"))
                    } else { exportMessage = "No logs to export" }
                }) {
                    Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Export")
                }
            }
        }

        // Progress
        val progress = if (stats.total > 0) {
            (stats.sent + stats.failed + stats.skipped + stats.paused).toFloat() / stats.total
        } else 0f

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(20.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Progress", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        "${stats.sent + stats.failed + stats.skipped + stats.paused} / ${stats.total}",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold
                    )
                }
                Spacer(Modifier.height(12.dp))
                LinearProgressIndicator(
                    progress = progress,
                    modifier = Modifier.fillMaxWidth().height(10.dp),
                    color = MaterialTheme.colorScheme.primary,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "${(progress * 100).toInt()}% complete",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // Stats grid
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            StatCard("Sent", stats.sent, Color(0xFF4CAF50), Icons.Default.CheckCircle, Modifier.weight(1f))
            StatCard("Failed", stats.failed, Color(0xFFE53935), Icons.Default.Error, Modifier.weight(1f))
            StatCard("Skipped", stats.skipped, Color(0xFFFF9800), Icons.Default.SkipNext, Modifier.weight(1f))
            StatCard("Paused", stats.paused, Color(0xFF2196F3), Icons.Default.PauseCircle, Modifier.weight(1f))
        }

        Text("Pipeline", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            StatCard("Replies", outcomeStats.totalResponses, Color(0xFF1565C0), Icons.Default.Forum, Modifier.weight(1f))
            StatCard("Hot", outcomeStats.hotLeads, Color(0xFFD84315), Icons.Default.LocalFireDepartment, Modifier.weight(1f))
            StatCard("Warm", outcomeStats.warmLeads, Color(0xFFEF6C00), Icons.Default.Bolt, Modifier.weight(1f))
            StatCard("Deals", outcomeStats.dealCount, Color(0xFF2E7D32), Icons.Default.Handshake, Modifier.weight(1f))
        }

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Outcome Summary", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                SummaryRow("Cold leads", outcomeStats.coldLeads.toString())
                SummaryRow("Pending follow-up", outcomeStats.unfollowedLeads.toString())
                SummaryRow("Average lead score", String.format("%.1f", outcomeStats.averageLeadScore))
                SummaryRow("Deal value", formatCurrency(outcomeStats.totalDealValue))
            }
        }

        Text("Top Responses", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        if (topResponses.isEmpty()) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Box(modifier = Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) {
                    Text("No broker replies captured yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        } else {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    topResponses.forEach { response ->
                        ResponseEntry(response)
                    }
                }
            }
        }

        // Control buttons
        Card(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (isActiveCampaign) {
                    if (stats.isPaused) {
                        Button(
                            onClick = { viewModel.resumeSelectedCampaign() },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Resume")
                        }
                    } else {
                        Button(
                            onClick = { viewModel.pauseCampaign() },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.Pause, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Pause")
                        }
                    }
                    Button(
                        onClick = { viewModel.stopCampaign(); onNavigateBack() },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                    ) {
                        Icon(Icons.Default.Stop, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Stop")
                    }
                } else {
                    OutlinedButton(onClick = onNavigateBack, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Default.ArrowBack, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Back")
                    }
                    if (campaign?.status == CampaignStatus.PAUSED) {
                        Button(
                            onClick = { viewModel.resumeSelectedCampaign() },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Resume")
                        }
                    }
                }
            }
        }

        // Logs
        Text("Recent Logs", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)

        if (recentLogs.isEmpty()) {
            Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                Text("No logs yet", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items(recentLogs) { log -> LogEntry(log) }
            }
        }
    }
}

@Composable
private fun SummaryRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun StatCard(label: String, count: Int, color: Color, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.08f))
    ) {
        Column(
            modifier = Modifier.padding(12.dp).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(24.dp))
            Spacer(Modifier.height(4.dp))
            Text(count.toString(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun formatCurrency(value: Double): String {
    if (value <= 0.0) return "Rs 0"
    return "Rs ${"%,.0f".format(value)}"
}

@Composable
private fun ResponseEntry(response: CampaignResponse) {
    val intentColor = when (response.intentLevel) {
        "HOT" -> Color(0xFFD84315)
        "WARM" -> Color(0xFFEF6C00)
        else -> Color(0xFF546E7A)
    }
    var showDealForm by remember { mutableStateOf(false) }
    var dealValueText by remember { mutableStateOf("") }
    val viewModel: CampaignViewModel = hiltViewModel()

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.Top
        ) {
            Surface(
                color = intentColor.copy(alpha = 0.14f),
                shape = MaterialTheme.shapes.small
            ) {
                Text(
                    response.intentLevel,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    color = intentColor,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    response.brokerName.ifBlank { response.brokerPhone },
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    response.responseText.ifBlank { "No response text captured" },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    "Score ${String.format("%.0f", response.hotLeadScore)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (!response.followUpSent) {
                OutlinedButton(onClick = { viewModel.markDashboardFollowUpSent(response.id) }) {
                    Text("Mark Follow-up")
                }
            }
            if (!response.dealClosed) {
                Button(onClick = { showDealForm = !showDealForm }) {
                    Text(if (showDealForm) "Cancel Deal" else "Close Deal")
                }
            }
        }

        if (showDealForm && !response.dealClosed) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = dealValueText,
                    onValueChange = { dealValueText = it.filter { ch -> ch.isDigit() || ch == '.' } },
                    label = { Text("Deal value") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
                Button(
                    onClick = {
                        val dealValue = dealValueText.toDoubleOrNull()
                        if (dealValue != null && dealValue > 0.0) {
                            viewModel.markDashboardDealClosed(response, dealValue)
                            showDealForm = false
                            dealValueText = ""
                        }
                    }
                ) {
                    Text("Save")
                }
            }
        }
    }
}

@Composable
private fun LogEntry(log: SendLog) {
    val statusColor = when (log.status) {
        SendStatus.SENT -> Color(0xFF4CAF50)
        SendStatus.FAILED -> Color(0xFFE53935)
        SendStatus.SKIPPED -> Color(0xFFFF9800)
        SendStatus.REPLY_PAUSED -> Color(0xFF2196F3)
        else -> Color.Gray
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Person, contentDescription = null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(log.contactName, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                Text(log.contactPhone, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Surface(
                color = statusColor.copy(alpha = 0.12f),
                shape = MaterialTheme.shapes.small
            ) {
                Text(
                    log.status,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    color = statusColor,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}
