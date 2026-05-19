package com.chaoscraft.wablaster.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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

private data class QuickAction(
    val name: String,
    val icon: ImageVector,
    val tab: NavTab,
    val beta: Boolean = false
)

private data class Feature(
    val name: String,
    val icon: ImageVector
)

private val quickActions = listOf(
    QuickAction("New Campaign", Icons.Default.Send, NavTab.Campaigns),
    QuickAction("Brokers List", Icons.Default.People, NavTab.Brokers),
    QuickAction("Dashboard", Icons.Default.Dashboard, NavTab.Dashboard),
    QuickAction("AI Skills", Icons.Default.Star, NavTab.Settings, beta = true)
)

private val features = listOf(
    Feature("Bulk WhatsApp Messaging", Icons.Default.Smartphone),
    Feature("AI-Powered Assistant", Icons.Default.Bolt),
    Feature("Smart Contact Lists", Icons.Default.People),
    Feature("Campaign Tracking", Icons.Default.Visibility),
    Feature("Direct Delivery", Icons.Default.Send),
    Feature("Smart Notifications", Icons.Default.Notifications)
)

@Composable
fun HomeScreen(
    onNavigateToTab: (NavTab) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDeep)
            .padding(20.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Spacer(modifier = Modifier.height(16.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("WaBro ", fontSize = 36.sp, fontWeight = FontWeight.Bold, color = TextMain, letterSpacing = (-0.5).sp)
            Text("Pro", fontSize = 36.sp, fontWeight = FontWeight.Light, color = Brand, letterSpacing = (-0.5).sp)
        }
        Text("Powered by PropAI \u2022 WhatsApp Broadcast for Brokers", fontSize = 11.sp, color = TextMuted, letterSpacing = 3.sp)

        Spacer(modifier = Modifier.height(48.dp))

        Text("QUICK ACTIONS", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF666666), letterSpacing = 3.sp)
        Spacer(modifier = Modifier.height(24.dp))

        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            for (i in quickActions.indices step 2) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    QuickActionCard(
                        modifier = Modifier.weight(1f),
                        action = quickActions[i],
                        onClick = { onNavigateToTab(quickActions[i].tab) }
                    )
                    if (i + 1 < quickActions.size) {
                        QuickActionCard(
                            modifier = Modifier.weight(1f),
                            action = quickActions[i + 1],
                            onClick = { onNavigateToTab(quickActions[i + 1].tab) }
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(64.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(32.dp)
        ) {
            Column(modifier = Modifier.weight(7f)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Brand.copy(alpha = 0.1f))
                        .padding(32.dp)
                ) {
                    Column {
                        Text("OPTIMIZATION ENGINE", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TextMain)
                        Spacer(modifier = Modifier.height(24.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(32.dp)) {
                            Column {
                                Text("BACKEND DELIVERY", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp)
                                Text("ACTIVE ENGINE 2.4", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Brand)
                            }
                            Column {
                                Text("BATTERY OPTIMIZATION", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp)
                                Text("BYPASSED", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TextMain)
                            }
                            Column {
                                Text("DAILY LIMIT", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp)
                                Text("2,500 MESSAGES", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TextMain)
                            }
                        }
                        Spacer(modifier = Modifier.height(40.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            features.take(3).forEach { feature ->
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(feature.icon, contentDescription = null, tint = Brand, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Text(feature.name, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp)
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            features.drop(3).forEach { feature ->
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(feature.icon, contentDescription = null, tint = Brand, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Text(feature.name, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp)
                                }
                            }
                        }
                    }
                }
            }
            Column(modifier = Modifier.weight(5f)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(BgCard, RoundedCornerShape(24.dp))
                        .border(1.dp, BorderDim, RoundedCornerShape(24.dp))
                        .padding(32.dp)
                ) {
                    Column {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("SYSTEM HEALTH", fontSize = 11.sp, color = TextMuted, letterSpacing = 3.sp)
                            Text("Online", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Brand, letterSpacing = 1.sp, modifier = Modifier.background(Brand.copy(alpha = 0.1f), RoundedCornerShape(8.dp)).padding(horizontal = 8.dp, vertical = 4.dp))
                        }
                        Spacer(modifier = Modifier.height(32.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(BgSurface, RoundedCornerShape(16.dp))
                                    .border(1.dp, BorderDim, RoundedCornerShape(16.dp))
                                    .padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Smartphone, contentDescription = null, tint = Brand, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Text("WHATSAPP LINK", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = TextMain)
                                }
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Brand, modifier = Modifier.size(16.dp))
                            }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(BgSurface, RoundedCornerShape(16.dp))
                                    .border(1.dp, BorderDim, RoundedCornerShape(16.dp))
                                    .padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Bolt, contentDescription = null, tint = Brand, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Text("AI PROCESSOR", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = TextMain)
                                }
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Brand, modifier = Modifier.size(16.dp))
                            }
                        }
                        Spacer(modifier = Modifier.height(32.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(top = 32.dp),
                            horizontalArrangement = Arrangement.SpaceEvenly
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("14", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextMain)
                                Text("HOT LEADS", fontSize = 8.sp, color = TextMuted, letterSpacing = 2.sp, fontWeight = FontWeight.Bold)
                            }
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("\u20B98.2M", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextMain)
                                Text("POTENTIAL VAL", fontSize = 8.sp, color = TextMuted, letterSpacing = 2.sp, fontWeight = FontWeight.Bold)
                            }
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("98.4%", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Brand)
                                Text("DELIV. RATE", fontSize = 8.sp, color = TextMuted, letterSpacing = 2.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(80.dp))
    }
}

@Composable
private fun QuickActionCard(
    modifier: Modifier = Modifier,
    action: QuickAction,
    onClick: () -> Unit
) {
    Box(
        modifier = modifier
            .background(BgCard, RoundedCornerShape(16.dp))
            .border(1.dp, BorderDim, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(24.dp)
    ) {
        Column {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .background(BgSurface, RoundedCornerShape(8.dp))
                    .border(1.dp, BorderBright, RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(action.icon, contentDescription = null, tint = Brand, modifier = Modifier.size(20.dp))
            }
            Spacer(modifier = Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(action.name, fontSize = 16.sp, fontWeight = FontWeight.Medium, color = TextMain)
                if (action.beta) {
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("BETA", fontSize = 9.sp, color = TextMuted, modifier = Modifier.background(BgSurface, RoundedCornerShape(4.dp)).border(1.dp, BorderBright, RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 2.dp))
                }
            }
            Text("Launch specialized tool", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(top = 4.dp))
        }
    }
}
