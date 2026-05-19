package com.chaoscraft.wablaster.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.ui.graphics.vector.ImageVector

enum class NavTab(
    val route: String,
    val label: String,
    val icon: ImageVector
) {
    Home("home", "Home", Icons.Default.Home),
    Brokers("brokers", "Brokers", Icons.Default.People),
    Listings("listings", "Listings", Icons.Default.List),
    Campaigns("campaigns", "Campaigns", Icons.Default.Campaign),
    Dashboard("dashboard", "Dashboard", Icons.Default.Assessment),
    Settings("settings", "Settings", Icons.Default.Settings);

    companion object {
        val tabs = entries.toList()
    }
}
