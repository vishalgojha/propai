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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chaoscraft.wablaster.BuildConfig
import com.chaoscraft.wablaster.ui.theme.BgCard
import com.chaoscraft.wablaster.ui.theme.BgDeep
import com.chaoscraft.wablaster.ui.theme.BorderDim
import com.chaoscraft.wablaster.ui.theme.Brand
import com.chaoscraft.wablaster.ui.theme.TextMain
import com.chaoscraft.wablaster.ui.theme.TextMuted
import com.chaoscraft.wablaster.util.AuthManager
import com.chaoscraft.wablaster.util.PaymentManager
import com.chaoscraft.wablaster.util.SenderConfig
import com.chaoscraft.wablaster.util.WaBroApiClient
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun SettingsScreen(
    authManager: AuthManager,
    paymentManager: PaymentManager,
    senderConfig: SenderConfig,
    waBroApiClient: WaBroApiClient,
    onLogout: () -> Unit
) {
    var geminiKey by remember { mutableStateOf("") }
    var isSaving by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    var provisioningToken by remember { mutableStateOf(waBroApiClient.getProvisioningToken()) }
    var deviceApiBaseUrl by remember { mutableStateOf(waBroApiClient.getDeviceApiBaseUrl()) }
    var deviceConfigSaved by remember { mutableStateOf(false) }
    val session = authManager.getSession()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDeep)
            .padding(20.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Spacer(modifier = Modifier.height(8.dp))

        Text("Registry", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = TextMain)
        Text("Configure your core application preferences", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(top = 4.dp))

        Spacer(modifier = Modifier.height(32.dp))

        SettingsSection(
            icon = { Icon(Icons.Default.Key, contentDescription = null, tint = Brand, modifier = Modifier.size(20.dp)) },
            title = "Intelligence Hub"
        ) {
            Text("Register your Gemini API Token to enable advanced GenAI rewrite protocols and automated message optimization.", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp)
            Spacer(modifier = Modifier.height(24.dp))
            Text("SECURE API ACCESS TOKEN", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                OutlinedTextField(
                    value = geminiKey,
                    onValueChange = { geminiKey = it; saved = false },
                    placeholder = { Text("TOKEN_HEX_STRING...", color = TextMuted.copy(alpha = 0.2f)) },
                    singleLine = true,
                    modifier = Modifier.weight(2f),
                    shape = RoundedCornerShape(12.dp),
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = TextMain),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Brand,
                        unfocusedBorderColor = BorderDim,
                        focusedContainerColor = BgDeep,
                        unfocusedContainerColor = BgDeep,
                        focusedTextColor = TextMain,
                        unfocusedTextColor = TextMain,
                        cursorColor = Brand
                    )
                )
                Button(
                    onClick = {
                        isSaving = true
                        saved = true
                        isSaving = false
                    },
                    enabled = geminiKey.isNotBlank() && !isSaving,
                    modifier = Modifier.weight(1f).height(56.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Brand)
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                    } else {
                        Text(if (saved) "COMMITTED" else "COMMIT TOKEN", fontWeight = FontWeight.Bold, color = Color.Black, fontSize = 10.sp, letterSpacing = 2.sp)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        SettingsSection(
            icon = { Icon(Icons.Default.Key, contentDescription = null, tint = Brand, modifier = Modifier.size(20.dp)) },
            title = "Device Provisioning"
        ) {
            Text(
                "Paste the provisioning token generated from PropAI WaBro setup. Android campaign sync now authenticates through /api/wabro/device instead of the old session API.",
                fontSize = 10.sp,
                color = TextMuted,
                letterSpacing = 2.sp
            )
            Spacer(modifier = Modifier.height(24.dp))

            Text("DEVICE API BASE URL", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp))
            OutlinedTextField(
                value = deviceApiBaseUrl,
                onValueChange = { deviceApiBaseUrl = it; deviceConfigSaved = false },
                placeholder = { Text("https://app.propai.live/api/wabro/device/", color = TextMuted.copy(alpha = 0.2f)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = TextMain),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Brand,
                    unfocusedBorderColor = BorderDim,
                    focusedContainerColor = BgDeep,
                    unfocusedContainerColor = BgDeep,
                    focusedTextColor = TextMain,
                    unfocusedTextColor = TextMain,
                    cursorColor = Brand
                )
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text("PROVISIONING TOKEN", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp))
            OutlinedTextField(
                value = provisioningToken,
                onValueChange = { provisioningToken = it; deviceConfigSaved = false },
                placeholder = { Text("wabro_dev_...", color = TextMuted.copy(alpha = 0.2f)) },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = TextMain),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Brand,
                    unfocusedBorderColor = BorderDim,
                    focusedContainerColor = BgDeep,
                    unfocusedContainerColor = BgDeep,
                    focusedTextColor = TextMain,
                    unfocusedTextColor = TextMain,
                    cursorColor = Brand
                )
            )

            Spacer(modifier = Modifier.height(16.dp))

            Button(
                onClick = {
                    waBroApiClient.setDeviceApiBaseUrl(deviceApiBaseUrl)
                    waBroApiClient.setProvisioningToken(provisioningToken)
                    deviceConfigSaved = true
                },
                enabled = provisioningToken.isNotBlank() && deviceApiBaseUrl.isNotBlank(),
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Brand)
            ) {
                Text(
                    if (deviceConfigSaved) "DEVICE READY" else "SAVE DEVICE CONFIG",
                    fontWeight = FontWeight.Bold,
                    color = Color.Black,
                    fontSize = 10.sp,
                    letterSpacing = 2.sp
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        SettingsSection(
            icon = { Icon(Icons.Default.Security, contentDescription = null, tint = Brand, modifier = Modifier.size(20.dp)) },
            title = "Entity Identity"
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(40.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(40.dp)) {
                    Column {
                        Text("SUBJECT NAME", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp)
                        Text(session?.email ?: "Unknown", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextMain, modifier = Modifier.padding(top = 8.dp))
                    }
                    Column {
                        Text("AUTHENTICATED ALIAS", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp)
                        Text(session?.email ?: "Not logged in", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextMain, modifier = Modifier.padding(top = 8.dp))
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(40.dp)) {
                    Column {
                        Text("PROTOCOL STATUS", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp)
                        Box(
                            modifier = Modifier
                                .background(
                                    if (paymentManager.isUnlocked) Brand.copy(alpha = 0.1f)
                                    else Color(0x22F59E0B),
                                    RoundedCornerShape(8.dp)
                                )
                                .border(
                                    1.dp,
                                    if (paymentManager.isUnlocked) Brand.copy(alpha = 0.2f)
                                    else Color(0x33F59E0B),
                                    RoundedCornerShape(8.dp)
                                )
                                .padding(horizontal = 12.dp, vertical = 4.dp)
                                .padding(top = 8.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = if (paymentManager.isUnlocked) Brand else Color(0xFFF59E0B), modifier = Modifier.size(12.dp))
                                Text(
                                    if (paymentManager.isUnlocked) "OPERATIONAL" else "EVALUATION MODE",
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (paymentManager.isUnlocked) Brand else Color(0xFFF59E0B),
                                    letterSpacing = 2.sp
                                )
                            }
                        }
                    }
                    Column {
                        Text("INITIALIZATION DATE", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp)
                        Text(
                            SimpleDateFormat("dd MMM yyyy", Locale.getDefault()).format(Date(paymentManager.installedAt)),
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextMain,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        SettingsSection(
            icon = { Icon(Icons.Default.Notifications, contentDescription = null, tint = Brand, modifier = Modifier.size(20.dp)) },
            title = "Preference Toggles"
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(BgDeep, RoundedCornerShape(16.dp))
                        .border(1.dp, Color(0x0DFFFFFF), RoundedCornerShape(16.dp))
                        .padding(16.dp)
                ) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column {
                            Text("Universal Delivery", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TextMain)
                            Text("Node.js Persistence Sync", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(top = 4.dp))
                        }
                        Box(modifier = Modifier.size(40.dp, 20.dp).background(Brand, RoundedCornerShape(10.dp)).padding(horizontal = 4.dp), contentAlignment = Alignment.CenterEnd) {
                            Box(modifier = Modifier.size(12.dp).background(Color.Black, RoundedCornerShape(6.dp)))
                        }
                    }
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(BgDeep, RoundedCornerShape(16.dp))
                        .border(1.dp, Color(0x0DFFFFFF), RoundedCornerShape(16.dp))
                        .padding(16.dp)
                ) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column {
                            Text("Telemetry Feed", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TextMain.copy(alpha = 0.5f))
                            Text("Live operational reporting", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(top = 4.dp))
                        }
                        Box(modifier = Modifier.size(40.dp, 20.dp).background(Color(0x1AFFFFFF), RoundedCornerShape(10.dp)).padding(horizontal = 4.dp), contentAlignment = Alignment.CenterStart) {
                            Box(modifier = Modifier.size(12.dp).background(Color(0x33FFFFFF), RoundedCornerShape(6.dp)))
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        SettingsSection(
            icon = { Icon(Icons.Default.Info, contentDescription = null, tint = Brand, modifier = Modifier.size(20.dp)) },
            title = "About"
        ) {
            Text("Version: ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TextMain)
            Text("App ID: ${BuildConfig.APPLICATION_ID}", fontSize = 12.sp, color = TextMuted, modifier = Modifier.padding(top = 8.dp))
        }

        Spacer(modifier = Modifier.height(32.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Info, contentDescription = null, tint = TextMuted, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("WaBro CORE v${BuildConfig.VERSION_NAME}", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 4.sp)
            Spacer(modifier = Modifier.width(16.dp))
            Text("PropAI Nexus", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Brand, letterSpacing = 4.sp)
        }

        Spacer(modifier = Modifier.height(32.dp))

        Button(
            onClick = {
                authManager.logout()
                senderConfig.clear()
                onLogout()
            },
            modifier = Modifier.fillMaxWidth().height(56.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444))
        ) {
            Text("SIGN OUT", fontWeight = FontWeight.Bold, color = Color.White, fontSize = 12.sp, letterSpacing = 2.sp)
        }

        Spacer(modifier = Modifier.height(48.dp))
    }
}

@Composable
private fun SettingsSection(
    icon: @Composable () -> Unit,
    title: String,
    content: @Composable () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(BgCard, RoundedCornerShape(32.dp))
            .border(1.dp, BorderDim, RoundedCornerShape(32.dp))
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth().padding(32.dp).padding(bottom = 0.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                icon()
                Text(title, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextMain)
            }
            Box(modifier = Modifier.padding(32.dp).padding(top = 24.dp)) {
                content()
            }
        }
    }
}
