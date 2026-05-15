package com.chaoscraft.wablaster.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.vector.ImageVector
import com.chaoscraft.wablaster.R

/**
 * App navigation model — defines top-level tabs for V2.
 * Replaces the old 3-tab model with a 5-tab broker-focused layout.
 */
sealed class NavTab(
    val route: String,
    val label: String,
    val icon: ImageVector,
    val selectedIcon: ImageVector = icon
) {
    data object Brokers : NavTab("brokers", "Brokers", Icons.Default.People, Icons.Default.PeopleAlt)
    data object Listings : NavTab("listings", "Listings", Icons.Default.HomeWork, Icons.Default.HomeWork)
    data object Campaigns : NavTab("campaigns", "Campaigns", Icons.Default.Campaign, Icons.Default.Campaign)
    data object Dashboard : NavTab("dashboard", "Dashboard", Icons.Default.Dashboard, Icons.Default.Dashboard)
    data object Settings : NavTab("settings", "Settings", Icons.Default.Settings, Icons.Default.Settings)

    companion object {
        val allTabs = listOf(Brokers, Listings, Campaigns, Dashboard, Settings)
    }
}
