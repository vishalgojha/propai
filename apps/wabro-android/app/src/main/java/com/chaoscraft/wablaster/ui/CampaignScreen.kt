package com.chaoscraft.wablaster.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chaoscraft.wablaster.db.entities.Broker
import com.chaoscraft.wablaster.db.entities.Listing
import com.chaoscraft.wablaster.ui.theme.BgCard
import com.chaoscraft.wablaster.ui.theme.BgDeep
import com.chaoscraft.wablaster.ui.theme.BgSurface
import com.chaoscraft.wablaster.ui.theme.BorderDim
import com.chaoscraft.wablaster.ui.theme.Brand
import com.chaoscraft.wablaster.ui.theme.TextMain
import com.chaoscraft.wablaster.ui.theme.TextMuted

@Composable
fun CampaignScreen(
    viewModel: CampaignViewModel,
    onBack: () -> Unit
) {
    val listings by viewModel.listings.collectAsState(initial = emptyList())
    val brokers by viewModel.brokers.collectAsState(initial = emptyList())
    val campaignName by viewModel.campaignName.collectAsState()
    val messageTemplate by viewModel.messageTemplate.collectAsState()
    val context = LocalContext.current

    var step by remember { mutableIntStateOf(1) }
    var selectedListingId by remember { mutableStateOf<Long?>(null) }
    var isCreating by remember { mutableStateOf(false) }
    var sent by remember { mutableStateOf(false) }
    var isGenerating by remember { mutableStateOf(false) }
    var aiRewrite by remember { mutableStateOf(true) }

    val transmit = { phone: String, msg: String ->
        val asset = listings.find { it.id == selectedListingId }
        val assetInfo = if (asset != null) "\n\nListing: ${asset.name} (${asset.city})" else ""
        val fullMsg = Uri.encode("$msg$assetInfo")
        val uri = Uri.parse("https://wa.me/${phone.replace(Regex("[^0-9]"), "")}?text=$fullMsg")
        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDeep)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
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
                    Text("Broadcaster", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = TextMain)
                    Text("AI-Powered Message Distribution", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp)
                }
                if (!sent) {
                    Row(
                        modifier = Modifier
                            .background(BgSurface, RoundedCornerShape(16.dp))
                            .border(1.dp, BorderDim, RoundedCornerShape(16.dp))
                            .padding(4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        (1..4).forEach { s ->
                            Box(
                                modifier = Modifier
                                    .background(if (step == s) Brand else Color.Transparent, RoundedCornerShape(12.dp))
                                    .padding(horizontal = 16.dp, vertical = 6.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text("$s", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (step == s) Color.Black else TextMuted, letterSpacing = 2.sp)
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(BgCard, RoundedCornerShape(32.dp))
                    .border(1.dp, BorderDim, RoundedCornerShape(32.dp))
                    .padding(40.dp)
            ) {
                if (!sent) {
                    when (step) {
                        1 -> Step1Name(value = campaignName, onValueChange = { viewModel.campaignName.value = it }, onNext = { if (campaignName.isNotBlank()) step = 2 })
                        2 -> Step2Draft(value = messageTemplate, isGenerating = isGenerating, onValueChange = { viewModel.messageTemplate.value = it }, onAiRewrite = { }, onBack = { step = 1 }, onNext = { if (messageTemplate.isNotBlank()) step = 3 })
                        3 -> Step3Asset(listings = listings, selectedId = selectedListingId, onSelect = { selectedListingId = it }, onBack = { step = 2 }, onNext = { if (selectedListingId != null) step = 4 })
                        4 -> Step4Review(name = campaignName, template = messageTemplate, listing = listings.find { it.id == selectedListingId }, aiRewrite = aiRewrite, isCreating = isCreating, onCreate = {
                            isCreating = true
                            selectedListingId?.let { viewModel.setSelectedListing(it) }
                            viewModel.createAndStartCampaign()
                            isCreating = false
                            sent = true
                        }, onBack = { step = 3 })
                    }
                } else {
                    SuccessView(brokers, onTransmit = { phone -> transmit(phone, messageTemplate) }, onNew = {
                        sent = false; step = 1; viewModel.campaignName.value = ""; viewModel.messageTemplate.value = ""; selectedListingId = null
                    })
                }
            }

            if (!sent) {
                Spacer(modifier = Modifier.height(24.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(BgCard, RoundedCornerShape(32.dp))
                        .border(1.dp, BorderDim, RoundedCornerShape(32.dp))
                        .padding(32.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                        Box(
                            modifier = Modifier
                                .size(64.dp)
                                .background(Brand.copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                                .border(1.dp, Brand.copy(alpha = 0.2f), RoundedCornerShape(16.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.AccountBalance, contentDescription = null, tint = Brand, modifier = Modifier.size(32.dp))
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Campaign Intelligence", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextMain)
                            Text("Real-time sentiment analysis ensures your message resonates with active buyers.", fontSize = 12.sp, color = TextMuted, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Step1Name(value: String, onValueChange: (String) -> Unit, onNext: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(modifier = Modifier.size(64.dp).background(Brand.copy(alpha = 0.1f), RoundedCornerShape(16.dp)).border(1.dp, Brand.copy(alpha = 0.2f), RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) {
            Icon(Icons.Default.TextFields, contentDescription = null, tint = Brand, modifier = Modifier.size(32.dp))
        }
        Spacer(modifier = Modifier.height(16.dp))
        Text("Campaign Identity", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextMain)
        Text("Define the purpose of this broadcast", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(top = 8.dp))
        Spacer(modifier = Modifier.height(40.dp))
        OutlinedTextField(value = value, onValueChange = onValueChange, placeholder = { Text("e.g. Malad West Luxury Launch", textAlign = TextAlign.Center, color = TextMuted.copy(alpha = 0.2f)) }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp), textStyle = MaterialTheme.typography.titleLarge.copy(textAlign = TextAlign.Center, fontWeight = FontWeight.Bold, color = TextMain), colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Brand, unfocusedBorderColor = BorderDim, focusedContainerColor = BgDeep, unfocusedContainerColor = BgDeep, focusedTextColor = TextMain, unfocusedTextColor = TextMain, cursorColor = Brand))
        Spacer(modifier = Modifier.height(32.dp))
        Button(onClick = onNext, enabled = value.isNotBlank(), modifier = Modifier.height(56.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = Brand)) {
            Text("CONTINUE", fontWeight = FontWeight.Bold, color = Color.Black, fontSize = 12.sp, letterSpacing = 2.sp)
            Spacer(modifier = Modifier.width(8.dp)); Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Color.Black)
        }
    }
}

@Composable
private fun Step2Draft(value: String, isGenerating: Boolean, onValueChange: (String) -> Unit, onAiRewrite: () -> Unit, onBack: () -> Unit, onNext: () -> Unit) {
    Column {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.size(40.dp).background(Brand.copy(alpha = 0.1f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Bolt, contentDescription = null, tint = Brand, modifier = Modifier.size(20.dp))
                }
                Spacer(modifier = Modifier.width(12.dp)); Text("Draft Message", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TextMain)
            }
            Box(modifier = Modifier.background(Brand.copy(alpha = 0.1f), RoundedCornerShape(12.dp)).border(1.dp, Brand.copy(alpha = 0.2f), RoundedCornerShape(12.dp)).clickable(enabled = value.isNotBlank() && !isGenerating, onClick = onAiRewrite).padding(horizontal = 16.dp, vertical = 8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (isGenerating) CircularProgressIndicator(color = Brand, strokeWidth = 2.dp, modifier = Modifier.size(14.dp))
                    else Icon(Icons.Default.AutoFixHigh, contentDescription = null, tint = Brand, modifier = Modifier.size(14.dp))
                    Text("GenAI Rewrite", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Brand, letterSpacing = 2.sp)
                }
            }
        }
        Spacer(modifier = Modifier.height(24.dp))
        OutlinedTextField(value = value, onValueChange = onValueChange, placeholder = { Text("Type your strategic broadcast message here...", color = TextMuted.copy(alpha = 0.2f), fontSize = 18.sp) }, modifier = Modifier.fillMaxWidth().height(250.dp), shape = RoundedCornerShape(24.dp), textStyle = MaterialTheme.typography.bodyLarge.copy(color = TextMain), colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Brand, unfocusedBorderColor = BorderDim, focusedContainerColor = BgDeep, unfocusedContainerColor = BgDeep, focusedTextColor = TextMain, unfocusedTextColor = TextMain, cursorColor = Brand))
        Spacer(modifier = Modifier.height(24.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Button(onClick = onBack, modifier = Modifier.weight(1f).height(56.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = BgDeep)) { Text("Back", fontWeight = FontWeight.Bold, color = TextMuted, fontSize = 12.sp, letterSpacing = 2.sp) }
            Button(onClick = onNext, enabled = value.isNotBlank(), modifier = Modifier.weight(2f).height(56.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = Brand)) {
                Text("SEAL DRAFT", fontWeight = FontWeight.Bold, color = Color.Black, fontSize = 12.sp, letterSpacing = 2.sp)
                Spacer(modifier = Modifier.width(8.dp)); Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Color.Black)
            }
        }
    }
}

@Composable
private fun Step3Asset(listings: List<Listing>, selectedId: Long?, onSelect: (Long) -> Unit, onBack: () -> Unit, onNext: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(modifier = Modifier.size(64.dp).background(Brand.copy(alpha = 0.1f), RoundedCornerShape(16.dp)).border(1.dp, Brand.copy(alpha = 0.2f), RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) {
            Icon(Icons.Default.AccountBalance, contentDescription = null, tint = Brand, modifier = Modifier.size(32.dp))
        }
        Spacer(modifier = Modifier.height(16.dp))
        Text("Select Asset", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextMain)
        Text("Attach a listing to this campaign", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(top = 8.dp))
        Spacer(modifier = Modifier.height(32.dp))
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            listings.forEach { listing ->
                Box(modifier = Modifier.fillMaxWidth().background(if (selectedId == listing.id) Brand.copy(alpha = 0.05f) else BgDeep, RoundedCornerShape(16.dp)).border(1.dp, if (selectedId == listing.id) Brand else BorderDim, RoundedCornerShape(16.dp)).clickable { onSelect(listing.id) }.padding(20.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column {
                            Text(listing.name, fontWeight = FontWeight.Bold, color = if (selectedId == listing.id) Brand else TextMain, fontSize = 14.sp)
                            if (listing.projectName.isNotBlank()) Text("${listing.projectName} \u2022 ${listing.city}", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(top = 4.dp))
                        }
                        if (selectedId == listing.id) Icon(Icons.Default.Check, contentDescription = null, tint = Brand, modifier = Modifier.size(20.dp))
                    }
                }
            }
            if (listings.isEmpty()) {
                Box(modifier = Modifier.fillMaxWidth().background(BgDeep, RoundedCornerShape(16.dp)).border(1.dp, BorderDim, RoundedCornerShape(16.dp)).padding(vertical = 48.dp), contentAlignment = Alignment.Center) {
                    Text("No listings available. Commit one first.", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp)
                }
            }
        }
        Spacer(modifier = Modifier.height(32.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Button(onClick = onBack, modifier = Modifier.weight(1f).height(56.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = BgDeep)) { Text("Back", fontWeight = FontWeight.Bold, color = TextMuted, fontSize = 12.sp, letterSpacing = 2.sp) }
            Button(onClick = onNext, enabled = selectedId != null, modifier = Modifier.weight(2f).height(56.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = Brand)) {
                Text("FINALIZE", fontWeight = FontWeight.Bold, color = Color.Black, fontSize = 12.sp, letterSpacing = 2.sp)
                Spacer(modifier = Modifier.width(8.dp)); Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Color.Black)
            }
        }
    }
}

@Composable
private fun Step4Review(name: String, template: String, listing: Listing?, aiRewrite: Boolean, isCreating: Boolean, onCreate: () -> Unit, onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(modifier = Modifier.size(64.dp).background(Brand.copy(alpha = 0.1f), RoundedCornerShape(24.dp)).border(1.dp, Brand.copy(alpha = 0.2f), RoundedCornerShape(24.dp)), contentAlignment = Alignment.Center) {
            Icon(Icons.Default.People, contentDescription = null, tint = Brand, modifier = Modifier.size(32.dp))
        }
        Spacer(modifier = Modifier.height(16.dp))
        Text("Pre-Flight Check", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextMain)
        Text("Verify details before global execution", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(top = 8.dp))
        Spacer(modifier = Modifier.height(32.dp))
        Box(modifier = Modifier.fillMaxWidth().background(BgDeep, RoundedCornerShape(24.dp)).border(1.dp, BorderDim, RoundedCornerShape(24.dp)).padding(32.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(32.dp)) {
                    Column {
                        Text("CAMPAIGN", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp)
                        Text(name, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextMain, modifier = Modifier.padding(top = 4.dp))
                    }
                    Column {
                        Text("ASSET", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp)
                        Text(listing?.name ?: "None", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextMain, modifier = Modifier.padding(top = 4.dp))
                    }
                }
                Column {
                    Text("PAYLOAD", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp)
                    Box(modifier = Modifier.fillMaxWidth().background(BgSurface, RoundedCornerShape(16.dp)).padding(24.dp).padding(top = 12.dp)) {
                        Text("\"$template\"", fontSize = 14.sp, color = TextMuted)
                    }
                }
                Row(modifier = Modifier.fillMaxWidth().background(Brand.copy(alpha = 0.05f), RoundedCornerShape(16.dp)).border(1.dp, Brand.copy(alpha = 0.1f), RoundedCornerShape(16.dp)).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(40.dp).background(Brand.copy(alpha = 0.2f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Bolt, contentDescription = null, tint = Brand, modifier = Modifier.size(20.dp))
                    }
                    Spacer(modifier = Modifier.width(16.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("AI OPTIMIZATION", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Brand, letterSpacing = 2.sp)
                        Text("Auto-rotation & anti-spam protocols active", fontSize = 12.sp, color = TextMuted)
                    }
                }
            }
        }
        Spacer(modifier = Modifier.height(32.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Button(onClick = onBack, modifier = Modifier.weight(1f).height(56.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = BgDeep)) { Text("Back", fontWeight = FontWeight.Bold, color = TextMuted, fontSize = 12.sp, letterSpacing = 2.sp) }
            Button(onClick = onCreate, enabled = !isCreating, modifier = Modifier.weight(2f).height(56.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = Brand)) {
                if (isCreating) CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                else {
                    Icon(Icons.Default.Send, contentDescription = null, tint = Color.Black, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("EXECUTE BLAST", fontWeight = FontWeight.Bold, color = Color.Black, fontSize = 12.sp, letterSpacing = 2.sp)
                }
            }
        }
    }
}

@Composable
private fun SuccessView(brokers: List<Broker>, onTransmit: (String) -> Unit, onNew: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(modifier = Modifier.size(80.dp).background(Brand, RoundedCornerShape(40.dp)), contentAlignment = Alignment.Center) {
            Icon(Icons.Default.Check, contentDescription = null, tint = Color.Black, modifier = Modifier.size(40.dp))
        }
        Spacer(modifier = Modifier.height(24.dp))
        Text("Registry Updated", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = TextMain)
        Text("Sign in on Android and start delivery", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(top = 8.dp))
        Spacer(modifier = Modifier.height(32.dp))
        Box(modifier = Modifier.fillMaxWidth().background(BgDeep, RoundedCornerShape(24.dp)).border(1.dp, BorderDim, RoundedCornerShape(24.dp))) {
            Column {
                Row(modifier = Modifier.fillMaxWidth().background(BgSurface.copy(alpha = 0.5f)).padding(horizontal = 32.dp, vertical = 16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("TARGET BROKER NETWORK", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp)
                    Text("${brokers.size} Entities Found", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Brand)
                }
                Column {
                    brokers.forEach { broker ->
                        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column {
                                Text(broker.name, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TextMain)
                                Text(broker.phone, fontSize = 10.sp, color = TextMuted)
                            }
                            Box(modifier = Modifier.background(Brand.copy(alpha = 0.1f), RoundedCornerShape(12.dp)).border(1.dp, Brand.copy(alpha = 0.2f), RoundedCornerShape(12.dp)).clickable { onTransmit(broker.phone) }.padding(horizontal = 16.dp, vertical = 8.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Icon(Icons.Default.Smartphone, contentDescription = null, tint = Brand, modifier = Modifier.size(14.dp))
                                    Text("Transmit", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Brand, letterSpacing = 2.sp)
                                }
                            }
                        }
                    }
                    if (brokers.isEmpty()) {
                        Box(modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) {
                            Text("Zero brokers registered in the network.", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp)
                        }
                    }
                }
            }
        }
        Spacer(modifier = Modifier.height(32.dp))
        Button(onClick = onNew, modifier = Modifier.height(56.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = BgDeep)) {
            Text("ASSEMBLE NEW CAMPAIGN", fontWeight = FontWeight.Bold, color = TextMuted, fontSize = 10.sp, letterSpacing = 2.sp)
        }
    }
}
