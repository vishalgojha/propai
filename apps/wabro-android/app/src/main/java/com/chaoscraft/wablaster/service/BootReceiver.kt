package com.chaoscraft.wablaster.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.chaoscraft.wablaster.db.AppDatabase
import com.chaoscraft.wablaster.db.entities.CampaignStatus
import kotlinx.coroutines.runBlocking

class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val db = AppDatabase.getInstance(context)
        runBlocking {
            val running = db.campaignDao().getByStatusSync(CampaignStatus.RUNNING)
            for (campaign in running) {
                db.campaignDao().updateStatus(campaign.id, CampaignStatus.PAUSED)
            }
        }
    }
}
