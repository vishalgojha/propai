package com.chaoscraft.wablaster.engine

import kotlinx.coroutines.delay
import java.util.Calendar
import kotlin.random.Random

class HumanTimingEngine(private val config: TimingConfig = TimingConfig()) {

    data class TimingConfig(
        val minDelayMs: Long = 45_000,
        val maxDelayMs: Long = 180_000,
        val jitterFactor: Double = 0.20,
        val burstLimit: Int = 3,
        val sessionSendLimit: Int = 15,
        val sessionBreakMinMs: Long = 480_000,
        val sessionBreakMaxMs: Long = 1_200_000,
        val activeStartHour: Int = 9,
        val activeEndHour: Int = 22,
        val typingMsPerTenChars: Long = 800
    )

    private var sendsInCurrentSession = 0
    private val recentSendTimestamps = mutableListOf<Long>()

    suspend fun waitBeforeNextSend(messageLength: Int) {
        enforceTimeWindow()
        enforceBurstGuard()

        if (sendsInCurrentSession >= config.sessionSendLimit) {
            val breakMs = Random.nextLong(config.sessionBreakMinMs, config.sessionBreakMaxMs)
            delay(breakMs)
            sendsInCurrentSession = 0
        }

        val typingDelay = (messageLength / 10.0 * config.typingMsPerTenChars).toLong()
        delay(typingDelay.coerceIn(500, 4000))

        val baseDelay = gaussianDelay(config.minDelayMs, config.maxDelayMs)
        val jitter = (baseDelay * config.jitterFactor * (Random.nextDouble() * 2 - 1)).toLong()
        delay((baseDelay + jitter).coerceAtLeast(config.minDelayMs / 2))

        sendsInCurrentSession++
        recentSendTimestamps.add(System.currentTimeMillis())
    }

    private fun gaussianDelay(min: Long, max: Long): Long {
        val u = (1..12).sumOf { Random.nextDouble() } - 6.0
        val normalized = (u / 6.0 + 1.0) / 2.0
        return min + ((max - min) * normalized.coerceIn(0.0, 1.0)).toLong()
    }

    private suspend fun enforceTimeWindow() {
        val now = Calendar.getInstance()
        val hour = now.get(Calendar.HOUR_OF_DAY)
        if (hour < config.activeStartHour || hour >= config.activeEndHour) {
            val msUntilActive = msUntilHour(config.activeStartHour)
            delay(msUntilActive)
        }
    }

    private suspend fun enforceBurstGuard() {
        val fiveMinAgo = System.currentTimeMillis() - 300_000
        val recentCount = recentSendTimestamps.count { it > fiveMinAgo }
        if (recentCount >= config.burstLimit) {
            delay(Random.nextLong(90_000, 180_000))
        }
        recentSendTimestamps.removeAll { it < fiveMinAgo }
    }

    private fun msUntilHour(targetHour: Int): Long {
        val now = Calendar.getInstance()
        val target = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, targetHour)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            if (before(now)) add(Calendar.DAY_OF_YEAR, 1)
        }
        return target.timeInMillis - now.timeInMillis
    }

    fun getAverageDelayMs(): Long {
        return (config.minDelayMs + config.maxDelayMs) / 2
    }
}
