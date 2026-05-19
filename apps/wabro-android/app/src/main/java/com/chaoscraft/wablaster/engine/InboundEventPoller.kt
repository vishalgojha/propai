package com.chaoscraft.wablaster.engine

import android.util.Log
import com.chaoscraft.wablaster.util.InboundEventDto
import com.chaoscraft.wablaster.util.WaBroApiClient
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class InboundEventPoller @Inject constructor(
    private val waBroApiClient: WaBroApiClient
) {
    private val _replyEvents = MutableSharedFlow<String>(replay = 0)
    val replyEvents: SharedFlow<String> = _replyEvents

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var pollingJob: Job? = null
    private var currentCursor: String? = null

    private val _isPolling = MutableSharedFlow<Boolean>(replay = 1, extraBufferCapacity = 0)
    val isPolling: SharedFlow<Boolean> = _isPolling

    fun start(deviceId: String) {
        if (pollingJob?.isActive == true) return
        _isPolling.tryEmit(true)
        pollingJob = scope.launch {
            Log.d(TAG, "Starting inbound event polling for device $deviceId")
            while (isActive) {
                try {
                    val result = waBroApiClient.getInboundEvents(currentCursor)
                    result.onSuccess { response ->
                        response.events.forEach { event ->
                            processEvent(event)
                        }
                        if (response.nextCursor != null) {
                            currentCursor = response.nextCursor
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Event poll failed", e)
                }
                delay(INTERVAL_MS)
            }
        }
    }

    fun stop() {
        pollingJob?.cancel()
        pollingJob = null
        _isPolling.tryEmit(false)
    }

    private fun processEvent(event: InboundEventDto) {
        if (event.type != "message" && event.type != "reply") return
        val text = event.text ?: return
        _replyEvents.tryEmit(text)
    }

    companion object {
        private const val TAG = "InboundEventPoller"
        private const val INTERVAL_MS = 10_000L
    }
}
