package com.chaoscraft.wablaster

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import com.chaoscraft.wablaster.ui.theme.WaBroV2Theme
import com.chaoscraft.wablaster.ui.MainNavigation
import com.chaoscraft.wablaster.util.PaymentManager
import com.chaoscraft.wablaster.util.SenderConfig
import com.chaoscraft.wablaster.util.AiConfig
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * V2 Entry Activity — the main launcher activity for the broker-focused rebuild.
 * Replaces the legacy MainActivity for V2+.
 */
@AndroidEntryPoint
class V2MainActivity : ComponentActivity() {

    @Inject lateinit var paymentManager: PaymentManager
    @Inject lateinit var senderConfig: SenderConfig
    @Inject lateinit var aiConfig: AiConfig

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        com.chaoscraft.wablaster.service.DashboardSyncManager.start(this)

        if (paymentManager.installedAt == 0L) {
            paymentManager.installedAt = System.currentTimeMillis()
        }

        setContent {
            WaBroV2Theme {
                Surface(
                    modifier = androidx.compose.ui.Modifier.fillMaxSize(),
                    color = androidx.compose.material3.MaterialTheme.colorScheme.background
                ) {
                    if (!paymentManager.isUnlocked) {
                        com.chaoscraft.wablaster.ui.PaywallScreen(
                            onUnlocked = { paymentManager.unlock() }
                        )
                    } else {
                        MainNavigation(
                            senderConfig = senderConfig,
                            aiConfig = aiConfig,
                            paymentManager = paymentManager
                        )
                    }
                }
            }
        }
    }
}
