package com.chaoscraft.wablaster.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel

import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.chaoscraft.wablaster.campaign.CampaignManager
import com.chaoscraft.wablaster.db.daos.BroadcastListContactDao
import com.chaoscraft.wablaster.db.daos.BroadcastListDao
import com.chaoscraft.wablaster.util.AuthManager
import com.chaoscraft.wablaster.util.PaymentManager
import com.chaoscraft.wablaster.util.SenderConfig
import com.chaoscraft.wablaster.util.WaBroApiClient

@Composable
fun MainNavigation(
    authManager: AuthManager,
    paymentManager: PaymentManager,
    senderConfig: SenderConfig,
    waBroApiClient: WaBroApiClient,
    campaignManager: CampaignManager,
    broadcastListDao: BroadcastListDao,
    broadcastListContactDao: BroadcastListContactDao,
    onLogout: () -> Unit
) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    val showBottomBar = NavTab.tabs.any { tab ->
        currentDestination?.hierarchy?.any { it.route == tab.route } == true
    }

    Scaffold(
        bottomBar = {
            AnimatedVisibility(
                visible = showBottomBar,
                enter = slideInVertically(initialOffsetY = { it }),
                exit = slideOutVertically(targetOffsetY = { it })
            ) {
                NavigationBar(
                    containerColor = Color(0xFF0A0A0A).copy(alpha = 0.9f),
                    tonalElevation = 0.dp
                ) {
                    NavTab.tabs.take(5).forEach { tab ->
                        val selected = currentDestination?.hierarchy?.any {
                            it.route == tab.route
                        } == true

                        NavigationBarItem(
                            icon = {
                                Icon(
                                    imageVector = tab.icon,
                                    contentDescription = tab.label,
                                    modifier = Modifier.size(20.dp)
                                )
                            },
                            label = {
                                Text(
                                    text = tab.label,
                                    fontSize = 8.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 2.sp,
                                    color = if (selected) Color(0xFF10B981) else Color(0xFF666666).copy(alpha = 0.4f)
                                )
                            },
                            selected = selected,
                            onClick = {
                                navController.navigate(tab.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = Color(0xFF10B981),
                                unselectedIconColor = Color(0xFF666666),
                                indicatorColor = Color(0xFF10B981).copy(alpha = 0.15f)
                            )
                        )
                    }
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = NavTab.Home.route,
            modifier = Modifier.padding(padding)
        ) {
            composable(NavTab.Home.route) {
                HomeScreen(
                    onNavigateToTab = { tab ->
                        navController.navigate(tab.route) {
                            popUpTo(navController.graph.findStartDestination().id) {
                                saveState = true
                            }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                )
            }

            composable(NavTab.Brokers.route) {
                val brokerViewModel: BrokerViewModel = hiltViewModel()
                BrokerListScreen(
                    viewModel = brokerViewModel,
                    onBrokerClick = { brokerId ->
                        navController.navigate("broker/$brokerId")
                    },
                    onAddBroker = {
                        navController.navigate("broker/edit/0")
                    }
                )
            }

            composable(
                route = "broker/{brokerId}",
                arguments = listOf(navArgument("brokerId") { type = NavType.LongType })
            ) { backStackEntry ->
                val brokerViewModel: BrokerViewModel = hiltViewModel()
                val brokerId = backStackEntry.arguments?.getLong("brokerId") ?: 0L
                BrokerDetailScreen(
                    brokerId = brokerId,
                    viewModel = brokerViewModel,
                    onBack = { navController.popBackStack() },
                    onEdit = { id ->
                        navController.navigate("broker/edit/$id")
                    }
                )
            }

            composable(
                route = "broker/edit/{brokerId}",
                arguments = listOf(navArgument("brokerId") { type = NavType.LongType })
            ) { backStackEntry ->
                val brokerViewModel: BrokerViewModel = hiltViewModel()
                val brokerId = backStackEntry.arguments?.getLong("brokerId") ?: 0L
                BrokerEditScreen(
                    brokerId = if (brokerId > 0) brokerId else null,
                    viewModel = brokerViewModel,
                    onBack = { navController.popBackStack() }
                )
            }

            composable(NavTab.Listings.route) {
                val listingViewModel: ListingViewModel = hiltViewModel()
                ListingManagerScreen(viewModel = listingViewModel)
            }

            composable(NavTab.Campaigns.route) {
                val campaignViewModel: CampaignViewModel = hiltViewModel()
                CampaignOverviewScreen(
                    viewModel = campaignViewModel,
                    campaignManager = campaignManager,
                    onCampaignClick = { campaignId ->
                        campaignViewModel.selectDashboardCampaign(campaignId)
                        navController.navigate("campaign/dashboard/$campaignId")
                    },
                    onCreateCampaign = {
                        navController.navigate("campaigns/new")
                    }
                )
            }

            composable("campaigns/new") {
                val campaignViewModel: CampaignViewModel = hiltViewModel()
                CampaignScreen(
                    viewModel = campaignViewModel,
                    onBack = { navController.popBackStack() }
                )
            }

            composable(
                route = "campaign/dashboard/{campaignId}",
                arguments = listOf(navArgument("campaignId") { type = NavType.LongType })
            ) { backStackEntry ->
                val campaignViewModel: CampaignViewModel = hiltViewModel()
                val campaignId = backStackEntry.arguments?.getLong("campaignId") ?: 0L
                campaignViewModel.selectDashboardCampaign(campaignId)
                CampaignDashboardScreen(
                    viewModel = campaignViewModel,
                    onBack = { navController.popBackStack() }
                )
            }

            composable(NavTab.Dashboard.route) {
                val campaignViewModel: CampaignViewModel = hiltViewModel()
                DashboardScreen(viewModel = campaignViewModel)
            }

            composable(
                route = "responses/{campaignId}",
                arguments = listOf(navArgument("campaignId") { type = NavType.LongType })
            ) { backStackEntry ->
                val responseDashboardViewModel: ResponseDashboardViewModel = hiltViewModel()
                val campaignId = backStackEntry.arguments?.getLong("campaignId") ?: 0L
                responseDashboardViewModel.selectCampaign(campaignId)
                ResponseDashboardScreen(
                    viewModel = responseDashboardViewModel,
                    onBack = { navController.popBackStack() },
                    onLeadClick = { leadId ->
                        navController.navigate("lead/$leadId")
                    }
                )
            }

            composable(
                route = "lead/{leadId}",
                arguments = listOf(navArgument("leadId") { type = NavType.LongType })
            ) { backStackEntry ->
                val responseDashboardViewModel: ResponseDashboardViewModel = hiltViewModel()
                val leadId = backStackEntry.arguments?.getLong("leadId") ?: 0L
                LeadDetailScreen(
                    leadId = leadId,
                    viewModel = responseDashboardViewModel,
                    onBack = { navController.popBackStack() }
                )
            }

            composable(NavTab.Settings.route) {
                SettingsScreen(
                    authManager = authManager,
                    paymentManager = paymentManager,
                    senderConfig = senderConfig,
                    waBroApiClient = waBroApiClient,
                    onLogout = {
                        onLogout()
                        navController.navigate(NavTab.Home.route) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                )
            }

            composable("broadcast-lists") {
                BroadcastListsScreen(
                    broadcastListDao = broadcastListDao,
                    broadcastListContactDao = broadcastListContactDao
                )
            }
        }
    }
}
