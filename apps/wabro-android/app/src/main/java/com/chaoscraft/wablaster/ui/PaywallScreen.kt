package com.chaoscraft.wablaster.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material.icons.filled.BatteryStd
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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
import com.chaoscraft.wablaster.util.PaymentManager

@Composable
fun PaywallScreen(
    paymentManager: PaymentManager,
    onUnlocked: () -> Unit
) {
    val trialDays = paymentManager.trialDaysRemaining()
    val isTrialActive = paymentManager.isTrialActive()
    var loading by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDeep)
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(48.dp))

        Box(
            modifier = Modifier
                .background(Brand.copy(alpha = 0.1f), RoundedCornerShape(24.dp))
                .border(1.dp, Brand.copy(alpha = 0.2f), RoundedCornerShape(24.dp))
                .padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Default.Security, contentDescription = null, tint = Brand, modifier = Modifier.size(40.dp))
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text("ACCESS GATEWAY", fontSize = 32.sp, fontWeight = FontWeight.Bold, color = TextMain, letterSpacing = (-0.5).sp)
        Text("Select your operational license", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(top = 8.dp))

        Spacer(modifier = Modifier.height(48.dp))

        if (isTrialActive) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Brand, RoundedCornerShape(40.dp))
                    .padding(40.dp)
            ) {
                Column {
                    Text("TRIAL EVALUATOR ACTIVE", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Color.Black, letterSpacing = (-0.5).sp)
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Decryption period:", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.Black.copy(alpha = 0.7f), letterSpacing = 2.sp)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("$trialDays Cycles remaining", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.Black)
                    }
                    Spacer(modifier = Modifier.height(40.dp))
                    Button(
                        onClick = onUnlocked,
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color.Black)
                    ) {
                        Text("ENTER OPERATIONAL MODE", fontWeight = FontWeight.Bold, color = Brand, fontSize = 12.sp, letterSpacing = 2.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Brand)
                    }
                }
            }
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(BgCard, RoundedCornerShape(40.dp))
                    .border(1.dp, Brand.copy(alpha = 0.3f), RoundedCornerShape(40.dp))
                    .padding(40.dp)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("TRIAL CONCLUDED", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = TextMain, letterSpacing = (-0.5).sp, textAlign = TextAlign.Center)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Secure indefinite operational authority for a one-time protocol fee.", fontSize = 10.sp, fontWeight = FontWeight.Medium, color = TextMuted, letterSpacing = 2.sp, textAlign = TextAlign.Center)

                    Spacer(modifier = Modifier.height(40.dp))

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(BgDeep, RoundedCornerShape(24.dp))
                            .border(1.dp, BorderDim, RoundedCornerShape(24.dp))
                            .padding(32.dp)
                    ) {
                        Column {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("INDEFINITE ACCESS", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp)
                                Text("\u20B9499", fontSize = 36.sp, fontWeight = FontWeight.Bold, color = Brand, letterSpacing = (-0.5).sp)
                            }
                            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Brand, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Text("CORE ENGINE UNLOCK", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = TextMain, letterSpacing = 2.sp)
                                }
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Brand, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Text("GENAI SYNCHRONIZER", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = TextMain, letterSpacing = 2.sp)
                                }
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Brand, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Text("UNLIMITED BROADCASTS", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = TextMain, letterSpacing = 2.sp)
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(40.dp))

                    Button(
                        onClick = {
                            loading = true
                            paymentManager.unlock()
                            loading = false
                            onUnlocked()
                        },
                        enabled = !loading,
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Brand)
                    ) {
                        if (loading) {
                            CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                        } else {
                            Icon(Icons.Default.CreditCard, contentDescription = null, tint = Color.Black, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("AUTHORIZE INDEFINITE PROTOCOL", fontWeight = FontWeight.Bold, color = Color.Black, fontSize = 12.sp, letterSpacing = 2.sp)
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
                .padding(40.dp)
        ) {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("SYSTEM PERMISSIONS", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextMain)
                    Text("Re-Sync all", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Brand, letterSpacing = 2.sp)
                }

                PermissionRow(icon = { Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Brand, modifier = Modifier.size(24.dp)) }, title = "DELIVERY NODE", subtitle = "Active - Always encrypted", status = "OPERATIONAL", statusColor = Brand)
                Spacer(modifier = Modifier.height(24.dp))
                PermissionRow(icon = { Icon(Icons.Default.BatteryStd, contentDescription = null, tint = TextMuted, modifier = Modifier.size(24.dp)) }, title = "RESOURCE MANAGEMENT", subtitle = "Automated optimization", status = "INTERNAL", statusColor = TextMuted)
                Spacer(modifier = Modifier.height(24.dp))
                PermissionRow(icon = { Icon(Icons.Default.Notifications, contentDescription = null, tint = TextMuted, modifier = Modifier.size(24.dp)) }, title = "TELEMETRY UPDATES", subtitle = "Queue notification sync", status = "REQUEST", statusColor = Brand)
            }
        }

        Spacer(modifier = Modifier.height(48.dp))
    }
}

@Composable
private fun PermissionRow(
    icon: @Composable () -> Unit,
    title: String,
    subtitle: String,
    status: String,
    statusColor: Color
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .background(BgSurface, RoundedCornerShape(16.dp))
                .border(1.dp, BorderDim, RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center
        ) {
            icon()
        }
        Spacer(modifier = Modifier.width(16.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TextMain)
            Text(subtitle, fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp)
        }
        Text(
            status,
            color = statusColor,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 2.sp,
            modifier = Modifier
                .background(statusColor.copy(alpha = 0.1f), RoundedCornerShape(8.dp))
                .border(1.dp, statusColor.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
                .padding(horizontal = 12.dp, vertical = 4.dp)
        )
    }
}
