package com.chaoscraft.wablaster.engine

import kotlinx.coroutines.test.runTest
import kotlin.time.Duration.Companion.seconds
import org.junit.Assert.*
import org.junit.Test

class HumanTimingEngineTest {

    @Test
    fun `average delay is midpoint of min and max`() {
        val engine = HumanTimingEngine(
            HumanTimingEngine.TimingConfig(
                minDelayMs = 40_000,
                maxDelayMs = 60_000
            )
        )
        assertEquals(50_000, engine.getAverageDelayMs())
    }

    @Test
    fun `custom config values are used`() {
        val config = HumanTimingEngine.TimingConfig(
            minDelayMs = 10_000,
            maxDelayMs = 30_000,
            jitterFactor = 0.1,
            burstLimit = 5,
            sessionSendLimit = 20,
            sessionBreakMinMs = 100_000,
            sessionBreakMaxMs = 200_000,
            activeStartHour = 8,
            activeEndHour = 20,
            typingMsPerTenChars = 500
        )
        val engine = HumanTimingEngine(config)
        assertEquals(20_000, engine.getAverageDelayMs())
    }

    @Test
    fun `default timing config has reasonable values`() {
        val config = HumanTimingEngine.TimingConfig()
        assertTrue(config.minDelayMs > 0)
        assertTrue(config.maxDelayMs > config.minDelayMs)
        assertTrue(config.burstLimit > 0)
        assertTrue(config.sessionSendLimit > 0)
        assertTrue(config.typingMsPerTenChars > 0)
    }

    @Test
    fun `waitBeforeNextSend completes with minimal config`() = runTest(timeout = 5.seconds) {
        val engine = HumanTimingEngine(
            HumanTimingEngine.TimingConfig(
                minDelayMs = 1,
                maxDelayMs = 1,
                jitterFactor = 0.0,
                burstLimit = 100,
                sessionSendLimit = Int.MAX_VALUE,
                activeStartHour = 0,
                activeEndHour = 24
            )
        )
        engine.waitBeforeNextSend(50)
    }

    @Test
    fun `getAverageDelayMs returns correct value with defaults`() {
        val engine = HumanTimingEngine()
        val defaults = HumanTimingEngine.TimingConfig()
        val expected = (defaults.minDelayMs + defaults.maxDelayMs) / 2
        assertEquals(expected, engine.getAverageDelayMs())
    }
}
