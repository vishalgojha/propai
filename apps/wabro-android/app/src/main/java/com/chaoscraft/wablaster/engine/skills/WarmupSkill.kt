package com.chaoscraft.wablaster.engine.skills

import android.content.SharedPreferences
import com.chaoscraft.wablaster.engine.ProcessedMessage
import com.chaoscraft.wablaster.engine.SendContext
import com.chaoscraft.wablaster.engine.Skill

class WarmupSkill(
    private val prefs: SharedPreferences
) : Skill {
    override val name = "Number Warmup"

    private val dailyLimits = listOf(20, 40, 80, 150, Int.MAX_VALUE)

    override suspend fun process(ctx: SendContext, current: ProcessedMessage): ProcessedMessage {
        val daysSinceStart = prefs.getInt("warmup_days", 0)
        val todayCount = prefs.getInt("today_send_count", 0)
        val limit = dailyLimits.getOrElse(daysSinceStart) { Int.MAX_VALUE }

        if (todayCount >= limit) {
            return current.copy(skipSend = true)
        }
        prefs.edit().putInt("today_send_count", todayCount + 1).apply()
        return current
    }
}
