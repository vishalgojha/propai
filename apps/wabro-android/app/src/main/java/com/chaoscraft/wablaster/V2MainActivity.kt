package com.chaoscraft.wablaster

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.chaoscraft.wablaster.campaign.CampaignManager
import com.chaoscraft.wablaster.db.daos.BroadcastListContactDao
import com.chaoscraft.wablaster.db.daos.BroadcastListDao
import com.chaoscraft.wablaster.ui.AuthScreen
import com.chaoscraft.wablaster.ui.MainNavigation
import com.chaoscraft.wablaster.ui.PaywallScreen
import com.chaoscraft.wablaster.ui.theme.WaBroV2Theme
import com.chaoscraft.wablaster.util.AuthManager
import com.chaoscraft.wablaster.util.PaymentManager
import com.chaoscraft.wablaster.util.SenderConfig
import com.chaoscraft.wablaster.util.WaBroApiClient
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class V2MainActivity : ComponentActivity() {

    @Inject lateinit var authManager: AuthManager
    @Inject lateinit var paymentManager: PaymentManager
    @Inject lateinit var senderConfig: SenderConfig
    @Inject lateinit var waBroApiClient: WaBroApiClient
    @Inject lateinit var campaignManager: CampaignManager
    @Inject lateinit var broadcastListDao: BroadcastListDao
    @Inject lateinit var broadcastListContactDao: BroadcastListContactDao

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            WaBroV2Theme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    var isLoggedIn by remember { mutableStateOf(authManager.isLoggedIn()) }
                    var isUnlocked by remember { mutableStateOf(paymentManager.isUnlocked) }

                    if (!isLoggedIn) {
                        AuthScreen(
                            authManager = authManager,
                            onAuthenticated = {
                                isLoggedIn = true
                            }
                        )
                    } else if (!isUnlocked && !paymentManager.isTrialActive()) {
                        PaywallScreen(
                            paymentManager = paymentManager,
                            onUnlocked = {
                                isUnlocked = true
                            }
                        )
                    } else {
                        MainNavigation(
                            authManager = authManager,
                            paymentManager = paymentManager,
                            senderConfig = senderConfig,
                            waBroApiClient = waBroApiClient,
                            campaignManager = campaignManager,
                            broadcastListDao = broadcastListDao,
                            broadcastListContactDao = broadcastListContactDao,
                            onLogout = {
                                isLoggedIn = false
                                isUnlocked = false
                            }
                        )
                    }
                }
            }
        }
    }
}
