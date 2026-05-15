package com.chaoscraft.wablaster.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.chaoscraft.wablaster.db.entities.Listing

@Composable
fun ListingManagerScreen(
    viewModel: ListingViewModel = hiltViewModel(),
    onListingClick: (Listing) -> Unit
) {
    val listings by viewModel.filteredListings.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()
    var showAddForm by remember { mutableStateOf(false) }
    var listingName by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Listings", style = MaterialTheme.typography.titleLarge)
            Button(onClick = { showAddForm = !showAddForm }) {
                Text(if (showAddForm) "Close" else "Add Listing")
            }
        }
        OutlinedTextField(
            value = searchQuery,
            onValueChange = viewModel::setSearchQuery,
            label = { Text("Search listings") },
            modifier = Modifier.fillMaxWidth()
        )
        if (showAddForm) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = listingName,
                        onValueChange = { listingName = it },
                        label = { Text("Listing name") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = city,
                        onValueChange = { city = it },
                        label = { Text("City") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(
                        onClick = {
                            if (listingName.isNotBlank()) {
                                viewModel.addOrUpdateListing(Listing(name = listingName, city = city))
                                listingName = ""
                                city = ""
                                showAddForm = false
                            }
                        }
                    ) {
                        Text("Save Listing")
                    }
                }
            }
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(items = listings, key = { listing: Listing -> listing.id }) { listing ->
                Card(modifier = Modifier.fillMaxWidth().clickable { onListingClick(listing) }) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(listing.name, style = MaterialTheme.typography.titleMedium)
                        Text(listing.city)
                    }
                }
            }
        }
    }
}
