package com.chaoscraft.wablaster.engine

import android.util.Log
import com.chaoscraft.wablaster.db.daos.BrokerDao
import com.chaoscraft.wablaster.db.daos.CampaignResponseDao
import com.chaoscraft.wablaster.db.daos.DealDao
import com.chaoscraft.wablaster.db.daos.ListingDao
import com.chaoscraft.wablaster.db.entities.Broker
import com.chaoscraft.wablaster.db.entities.CampaignResponse
import com.chaoscraft.wablaster.db.entities.Deal
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Tracks and classifies incoming broker responses for campaign analytics.
 * Polls a transient incoming-message queue and routes responses to the
 * correct campaign/broker with NLP-based intent scoring.
 *
 * Production notes:
 * - In backend delivery mode, this queue should be fed from webhook or polling events
 * - The tracker itself is transport-agnostic and only needs normalized inbound messages
 */
@Singleton
class ResponseTracker @Inject constructor(
    private val responseDao: CampaignResponseDao,
    private val dealDao: DealDao,
    private val brokerDao: BrokerDao,
    private val listingDao: ListingDao
) {
    private val activeCampaigns = ConcurrentHashMap<Long, CampaignTracker>()
    private val incomingQueue = mutableListOf<PendingResponse>()
    private val queueLock = Any()
    private var isRunning = false
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * Called by whichever transport integration receives a new inbound message.
     */
    @Synchronized
    fun enqueueMessage(senderPhone: String, message: String, timestamp: Long) {
        synchronized(queueLock) {
            incomingQueue.add(PendingResponse(senderPhone, message, timestamp))
        }
    }

    fun start() {
        if (isRunning) return
        isRunning = true

        scope.launch {
            while (isRunning) {
                pollResponses()
                delay(2000L)
            }
        }
    }

    fun stop() {
        isRunning = false
        scope.cancel()
    }

    fun registerCampaign(campaignId: Long, brokerIds: List<Long>, listingId: Long = 0L) {
        activeCampaigns[campaignId] = CampaignTracker(
            campaignId = campaignId,
            listingId = listingId,
            trackedBrokerIds = brokerIds.toMutableSet()
        )
    }

    fun unregisterCampaign(campaignId: Long) {
        activeCampaigns.remove(campaignId)
    }

    fun getCampaignTracker(campaignId: Long): CampaignTracker? = activeCampaigns[campaignId]

    /**
     * Poll the incoming message queue and classify responses.
     */
    private suspend fun pollResponses() {
        val messages = synchronized(queueLock) {
            val batch = incomingQueue.toList()
            incomingQueue.clear()
            batch
        }

        for (msg in messages) {
            handleIncomingMessage(msg.senderPhone, msg.message, msg.timestamp)
        }
    }

    private suspend fun handleIncomingMessage(phone: String, message: String, timestamp: Long) {
        val broker = try {
            brokerDao.getByPhone(phone)
        } catch (e: Exception) {
            Log.e(TAG, "Error looking up broker for phone: $phone", e)
            return
        } ?: run {
            Log.d(TAG, "Unknown sender (not in broker list): $phone")
            return
        }

        for ((campaignId, tracker) in activeCampaigns) {
            if (broker.id in tracker.trackedBrokerIds) {
                val listingId = tracker.listingId
                val responseTimeSec = (System.currentTimeMillis() - tracker.campaignStartedAt) / 1000

                val response = ResponseClassifier.classify(
                    campaignId = campaignId,
                    listingId = listingId,
                    brokerId = broker.id,
                    brokerName = broker.name.ifEmpty { phone },
                    brokerPhone = phone,
                    responseText = message,
                    responseTimeSec = responseTimeSec
                )

                try {
                    responseDao.insert(response)
                } catch (e: Exception) {
                    Log.e(TAG, "Error saving response for ${broker.name}", e)
                }

                tracker.responseCount++
                when (response.intentLevel) {
                    "HOT" -> tracker.hotLeadCount++
                    "WARM" -> tracker.warmLeadCount++
                    else -> tracker.coldLeadCount++
                }
                tracker.lastResponseAt = timestamp

                Log.d(TAG,
                    "Response from ${broker.name}: ${response.intentLevel} (score: ${response.hotLeadScore})")

                // Auto-follow-up for hot/warm leads
                if (response.intentLevel == "HOT" || response.intentLevel == "WARM") {
                    tracker.onHotLead?.invoke(response)
                }

                break
            }
        }
    }

    data class CampaignTracker(
        val campaignId: Long,
        val listingId: Long = 0L,
        val trackedBrokerIds: MutableSet<Long>,
        val campaignStartedAt: Long = System.currentTimeMillis(),
        var responseCount: Int = 0,
        var hotLeadCount: Int = 0,
        var warmLeadCount: Int = 0,
        var coldLeadCount: Int = 0,
        var lastResponseAt: Long = 0,
        var onHotLead: ((CampaignResponse) -> Unit)? = null
    )

    data class PendingResponse(
        val senderPhone: String,
        val message: String,
        val timestamp: Long
    )

    companion object {
        private const val TAG = "ResponseTracker"
    }
}
