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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CurrencyRupee
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Sell
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chaoscraft.wablaster.db.entities.Listing
import com.chaoscraft.wablaster.ui.theme.BgCard
import com.chaoscraft.wablaster.ui.theme.BgDeep
import com.chaoscraft.wablaster.ui.theme.BgSurface
import com.chaoscraft.wablaster.ui.theme.BorderBright
import com.chaoscraft.wablaster.ui.theme.BorderDim
import com.chaoscraft.wablaster.ui.theme.Brand
import com.chaoscraft.wablaster.ui.theme.TextMain
import com.chaoscraft.wablaster.ui.theme.TextMuted
import kotlinx.coroutines.launch

@Composable
fun ListingManagerScreen(
    viewModel: ListingViewModel
) {
    val listings by viewModel.filteredListings.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()
    var showAddDialog by remember { mutableStateOf(false) }

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
                    Text("Properties", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = TextMain)
                    Text("Manage your active property portfolio", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp)
                }
                Box(
                    modifier = Modifier
                        .background(Brand, RoundedCornerShape(12.dp))
                        .clickable { showAddDialog = true }
                        .padding(horizontal = 24.dp, vertical = 12.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Add, contentDescription = null, tint = Color.Black, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("New Listing", fontWeight = FontWeight.Bold, color = Color.Black, fontSize = 12.sp, letterSpacing = 2.sp)
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                listings.chunked(2).forEach { rowListings ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        rowListings.forEach { listing ->
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .background(BgCard, RoundedCornerShape(24.dp))
                                    .border(1.dp, BorderDim, RoundedCornerShape(24.dp))
                                    .padding(32.dp)
                            ) {
                                Column {
                                    Box(
                                        modifier = Modifier.fillMaxWidth(),
                                        contentAlignment = Alignment.TopEnd
                                    ) {
                                        Text(
                                            "active",
                                            fontSize = 9.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Brand,
                                            letterSpacing = 2.sp,
                                            modifier = Modifier
                                                .background(Brand.copy(alpha = 0.1f), RoundedCornerShape(8.dp))
                                                .border(1.dp, Brand.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
                                                .padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                    Box(
                                        modifier = Modifier
                                            .size(48.dp)
                                            .background(BgSurface, RoundedCornerShape(16.dp))
                                            .border(1.dp, BorderBright, RoundedCornerShape(16.dp)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(Icons.Default.AccountBalance, contentDescription = null, tint = Brand, modifier = Modifier.size(22.dp))
                                    }
                                    Spacer(modifier = Modifier.height(32.dp))
                                    Text(listing.name, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TextMain)
                                    Spacer(modifier = Modifier.height(24.dp))
                                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                        if (listing.projectName.isNotBlank()) {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Icon(Icons.Default.Business, contentDescription = null, tint = Brand, modifier = Modifier.size(14.dp))
                                                Spacer(modifier = Modifier.width(12.dp))
                                                Text(listing.projectName, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp)
                                            }
                                        }
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Icon(Icons.Default.LocationOn, contentDescription = null, tint = Brand, modifier = Modifier.size(14.dp))
                                            Spacer(modifier = Modifier.width(12.dp))
                                            Text("${listing.city}${if (listing.locality.isNotBlank()) ", ${listing.locality}" else ""}", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp)
                                        }
                                        if (listing.price > 0) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                modifier = Modifier
                                                    .background(Brand.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                                                    .border(1.dp, Brand.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                                                    .padding(horizontal = 16.dp, vertical = 8.dp)
                                            ) {
                                                Icon(Icons.Default.Sell, contentDescription = null, tint = Brand, modifier = Modifier.size(16.dp))
                                                Spacer(modifier = Modifier.width(8.dp))
                                                Text("\u20B9${listing.price.toLong()}", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Brand)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (listings.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 80.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.AccountBalance, contentDescription = null, tint = TextMuted.copy(alpha = 0.3f), modifier = Modifier.size(80.dp))
                            Spacer(modifier = Modifier.height(24.dp))
                            Text("INVENTORY EMPTY", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TextMain)
                            Text("Add your first property to broadcast", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(top = 8.dp))
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddListingDialog(
            viewModel = viewModel,
            onDismiss = { showAddDialog = false }
        )
    }
}

@Composable
private fun AddListingDialog(
    viewModel: ListingViewModel,
    onDismiss: () -> Unit
) {
    var name by remember { mutableStateOf("") }
    var projectName by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var locality by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var submitting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.8f))
            .clickable(onClick = onDismiss),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .background(BgSurface, RoundedCornerShape(24.dp))
                .border(1.dp, BorderDim, RoundedCornerShape(24.dp))
                .clickable(enabled = false) {}
                .padding(32.dp)
        ) {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    Column {
                        Text("Inventory Entry", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextMain)
                        Text("Register new property details", fontSize = 10.sp, color = TextMuted, letterSpacing = 2.sp)
                    }
                    Box(
                        modifier = Modifier
                            .border(1.dp, BorderDim, RoundedCornerShape(8.dp))
                            .clickable(onClick = onDismiss)
                            .padding(8.dp)
                    ) {
                        Icon(Icons.Default.Close, contentDescription = null, tint = TextMuted, modifier = Modifier.size(20.dp))
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Column {
                        Text("LISTING DESCRIPTOR", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp))
                        OutlinedTextField(
                            value = name,
                            onValueChange = { name = it },
                            placeholder = { Text("e.g. 3BHK Apartment - Malad West", color = TextMuted.copy(alpha = 0.3f), fontSize = 14.sp) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
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
                    }

                    Column {
                        Text("PROJECT NAME", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp))
                        OutlinedTextField(
                            value = projectName,
                            onValueChange = { projectName = it },
                            placeholder = { Text("e.g. Skyline Towers", color = TextMuted.copy(alpha = 0.3f), fontSize = 14.sp) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
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
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("TERRITORY", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp))
                            OutlinedTextField(
                                value = city,
                                onValueChange = { city = it },
                                placeholder = { Text("e.g. Malad", color = TextMuted.copy(alpha = 0.3f), fontSize = 14.sp) },
                                leadingIcon = { Icon(Icons.Default.LocationOn, contentDescription = null, tint = TextMuted) },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
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
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text("QUOTA (EXPECTED)", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp))
                            OutlinedTextField(
                                value = price,
                                onValueChange = { price = it },
                                placeholder = { Text("e.g. 1.2 Cr", color = TextMuted.copy(alpha = 0.3f), fontSize = 14.sp) },
                                leadingIcon = { Icon(Icons.Default.CurrencyRupee, contentDescription = null, tint = TextMuted) },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
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
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Button(
                        onClick = {
                            scope.launch {
                                submitting = true
                                viewModel.addOrUpdateListing(
                                    Listing(
                                        name = name,
                                        projectName = projectName,
                                        city = city,
                                        locality = locality,
                                        price = price.toDoubleOrNull() ?: 0.0
                                    )
                                )
                                submitting = false
                                onDismiss()
                            }
                        },
                        enabled = name.isNotBlank() && projectName.isNotBlank() && city.isNotBlank() && !submitting,
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Brand)
                    ) {
                        if (submitting) {
                            CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                        } else {
                            Text("COMMIT LISTING", fontWeight = FontWeight.Bold, color = Color.Black, fontSize = 12.sp, letterSpacing = 2.sp)
                        }
                    }
                }
            }
        }
    }
}
