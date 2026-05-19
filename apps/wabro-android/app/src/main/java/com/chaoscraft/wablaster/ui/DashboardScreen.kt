package com.chaoscraft.wablaster.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chaoscraft.wablaster.ui.theme.BgCard
import com.chaoscraft.wablaster.ui.theme.BgDeep
import com.chaoscraft.wablaster.ui.theme.BgSurface
import com.chaoscraft.wablaster.ui.theme.BorderBright
import com.chaoscraft.wablaster.ui.theme.BorderDim
import com.chaoscraft.wablaster.ui.theme.Brand
import com.chaoscraft.wablaster.ui.theme.TextMain
import com.chaoscraft.wablaster.ui.theme.TextMuted
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun DashboardScreen(
    viewModel: CampaignViewModel
) {
    val savedCampaigns by viewModel.savedCampaigns.collectAsState(emptyList())

    val stats = listOf(
        StatItem("Active Campaigns", "${savedCampaigns.size}", Icons.Default.Send),
        StatItem("Total Brokers", "42", Icons.Default.People),
        StatItem("Response Rate", "12%", Icons.Default.TrendingUp),
        StatItem("Deals Closed", "3", Icons.Default.CheckCircle)
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDeep)
            .padding(20.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Spacer(modifier = Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Control Center", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = TextMain)
                Text("Real-time analytical overview", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp)
            }
            Box(
                modifier = Modifier
                    .background(BgSurface, RoundedCornerShape(12.dp))
                    .border(1.dp, BorderDim, RoundedCornerShape(12.dp))
                    .padding(12.dp)
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, tint = TextMuted, modifier = Modifier.size(18.dp))
            }
        }

        Spacer(modifier = Modifier.height(32.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            stats.chunked(2).forEach { rowStats ->
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    rowStats.forEach { stat ->
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(BgCard, RoundedCornerShape(24.dp))
                                .border(1.dp, BorderDim, RoundedCornerShape(24.dp))
                                .padding(24.dp)
                        ) {
                            Column {
                                Box(
                                    modifier = Modifier
                                        .size(48.dp)
                                        .background(BgSurface, RoundedCornerShape(16.dp))
                                        .border(1.dp, BorderBright, RoundedCornerShape(16.dp)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(stat.icon, contentDescription = null, tint = Brand, modifier = Modifier.size(22.dp))
                                }
                                Spacer(modifier = Modifier.height(24.dp))
                                Text(stat.label, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp)
                                Text(stat.value, fontSize = 28.sp, fontWeight = FontWeight.Bold, color = TextMain)
                                Spacer(modifier = Modifier.height(16.dp))
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Box(modifier = Modifier.size(4.dp).background(Brand, RoundedCornerShape(2.dp)))
                                    Text("Live Sync", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Brand, letterSpacing = 2.sp)
                                }
                            }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(32.dp))

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(BgCard, RoundedCornerShape(40.dp))
                .border(1.dp, BorderDim, RoundedCornerShape(40.dp))
        ) {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(32.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("Transmission Logs", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TextMain)
                        Text("Latest broadcast activities", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(top = 4.dp))
                    }
                    Box(modifier = Modifier.background(BorderDim, RoundedCornerShape(12.dp)).padding(horizontal = 24.dp, vertical = 8.dp)) {
                        Text("Export Logs", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Brand, letterSpacing = 2.sp)
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(BgDeep.copy(alpha = 0.5f))
                        .padding(horizontal = 32.dp, vertical = 20.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("BROADCASTING ID", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.weight(2f))
                    Text("STATUS", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.weight(1f))
                    Text("COMMIT DATE", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.weight(1f))
                    Text("", modifier = Modifier.width(60.dp))
                }

                savedCampaigns.forEach { campaign ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { }
                            .padding(horizontal = 32.dp, vertical = 24.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(campaign.name, fontWeight = FontWeight.Bold, color = TextMain, fontSize = 14.sp, modifier = Modifier.weight(2f))
                        Box(
                            modifier = Modifier
                                .background(Color(0x2210B981), RoundedCornerShape(8.dp))
                                .border(1.dp, Color(0x3310B981), RoundedCornerShape(8.dp))
                                .padding(horizontal = 12.dp, vertical = 4.dp)
                        ) {
                            Text(campaign.status, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF10B981), letterSpacing = 2.sp)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                            Icon(Icons.Default.Schedule, contentDescription = null, tint = Brand.copy(alpha = 0.5f), modifier = Modifier.size(12.dp))
                            Text(SimpleDateFormat("dd MMM yyyy", Locale.getDefault()).format(Date(campaign.createdAt)), fontSize = 11.sp, color = TextMuted)
                        }
                        Text("Details", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp)
                    }
                }

                if (savedCampaigns.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 80.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            Icon(Icons.Default.Send, contentDescription = null, tint = TextMuted.copy(alpha = 0.1f), modifier = Modifier.size(48.dp))
                            Text("No synchronization events recorded.", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp)
                        }
                    }
                }
            }
        }
    }
}

private data class StatItem(
    val label: String,
    val value: String,
    val icon: ImageVector
)
