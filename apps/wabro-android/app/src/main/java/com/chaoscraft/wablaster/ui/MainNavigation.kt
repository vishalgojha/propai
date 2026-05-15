package com.chaoscraft.wablaster.ui

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.chaoscraft.wablaster.util.AiConfig
import com.chaoscraft.wablaster.util.AppValidator
import com.chaoscraft.wablaster.util.PaymentManager
import com.chaoscraft.wablaster.util.SenderConfig

@Composable
fun MainNavigation(
    senderConfig: SenderConfig,
    aiConfig: AiConfig,
    paymentManager: PaymentManager,
    brokerViewModel: BrokerViewModel = hiltViewModel(),
    listingViewModel: ListingViewModel = hiltViewModel(),
    campaignViewModel: CampaignViewModel = hiltViewModel()
) {
    val navController = rememberNavController()
    val tabs = NavTab.allTabs
    var currentTab by remember { mutableIntStateOf(0) }
    var lastBackPressTime by remember { mutableStateOf(0L) }
    val context = LocalContext.current

    BackHandler {
        val currentRoute = navController.currentBackStackEntry?.destination?.route
        if (currentRoute == tabs[currentTab].route) {
            if (System.currentTimeMillis() - lastBackPressTime < 2000) {
                (context as? android.app.Activity)?.finishAffinity()
            } else {
                lastBackPressTime = System.currentTimeMillis()
                Toast.makeText(context, "Press back again to exit", Toast.LENGTH_SHORT).show()
            }
        } else {
            navController.popBackStack()
        }
    }

    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEachIndexed { index, tab ->
                    NavigationBarItem(
                        selected = currentTab == index,
                        onClick = {
                            currentTab = index
                            navController.navigate(tab.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(if (currentTab == index) tab.selectedIcon else tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) }
                    )
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = NavTab.Brokers.route,
            modifier = androidx.compose.ui.Modifier.fillMaxSize().padding(padding)
        ) {
            composable(NavTab.Brokers.route) {
                BrokerListScreen(
                    viewModel = brokerViewModel,
                    onBrokerClick = { broker -> navController.navigate("broker/${broker.id}") },
                    onAddBroker = { navController.navigate("broker/edit") }
                )
            }
            composable("broker/{brokerId}") { backStackEntry ->
                val brokerId = backStackEntry.arguments?.getString("brokerId")?.toLongOrNull() ?: 0L
                BrokerDetailScreen(
                    brokerId = brokerId,
                    viewModel = brokerViewModel,
                    onNavigateBack = { navController.popBackStack() },
                    onEdit = { broker -> navController.navigate("broker/edit/${broker.id}") }
                )
            }
            composable("broker/edit") {
                BrokerEditScreen(
                    viewModel = brokerViewModel,
                    onSave = { navController.popBackStack() },
                    onCancel = { navController.popBackStack() }
                )
            }
            composable("broker/edit/{brokerId}") { backStackEntry ->
                val brokerId = backStackEntry.arguments?.getString("brokerId")?.toLongOrNull()
                BrokerEditScreen(
                    viewModel = brokerViewModel,
                    brokerId = brokerId,
                    onSave = { navController.popBackStack() },
                    onCancel = { navController.popBackStack() }
                )
            }
            composable(NavTab.Listings.route) {
                ListingManagerScreen(
                    viewModel = listingViewModel,
                    onListingClick = { }
                )
            }
            composable(NavTab.Campaigns.route) {
                CampaignScreen(
                    viewModel = campaignViewModel,
                    senderConfig = senderConfig,
                    aiConfig = aiConfig,
                    paymentManager = paymentManager,
                    onNavigateToDashboard = { campaignId -> navController.navigate("campaign_dashboard/$campaignId") }
                )
            }
            composable("campaign_dashboard/{campaignId}") { backStackEntry ->
                val campaignId = backStackEntry.arguments?.getString("campaignId")?.toLongOrNull() ?: 0L
                CampaignDashboard(
                    campaignId = campaignId,
                    viewModel = campaignViewModel,
                    onNavigateBack = { navController.popBackStack() }
                )
            }
            composable(NavTab.Dashboard.route) {
                CampaignOverviewScreen(
                    viewModel = campaignViewModel,
                    onCampaignClick = { campaignId -> navController.navigate("campaign_dashboard/$campaignId") },
                    onNavigateBack = { }
                )
            }
            composable(NavTab.Settings.route) {
                SettingsScreen(
                    senderConfig = senderConfig,
                    aiConfig = aiConfig,
                    validator = remember { AppValidator(context) },
                    paymentManager = paymentManager
                )
            }
        }
    }
}
