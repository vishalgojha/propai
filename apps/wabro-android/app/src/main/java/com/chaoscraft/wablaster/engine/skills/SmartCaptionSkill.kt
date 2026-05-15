package com.chaoscraft.wablaster.engine.skills

import com.chaoscraft.wablaster.engine.ProcessedMessage
import com.chaoscraft.wablaster.engine.SendContext
import com.chaoscraft.wablaster.engine.Skill
import com.chaoscraft.wablaster.util.GeminiClient

class SmartCaptionSkill(private val gemini: GeminiClient?) : Skill {
    override val name = "Smart Caption"

    override suspend fun process(ctx: SendContext, current: ProcessedMessage): ProcessedMessage {
        if (current.mediaUri == null) return current
        if (current.body.isNotBlank()) return current

        if (ctx.skillsConfig.aiCaptionEnabled && gemini != null) {
            val result = gemini.generateCaption(
                contactName = ctx.contact.name,
                locality = ctx.contact.locality,
                budget = ctx.contact.budget,
                rawMessage = ctx.rawMessage
            )
            if (result.isSuccess) {
                return current.copy(body = result.getOrThrow())
            }
        }

        val autoCaption = buildString {
            append("\uD83D\uDCCD ${ctx.contact.locality ?: "Prime Location"}\n")
            append("\uD83D\uDCB0 ${ctx.contact.budget ?: "Competitive Pricing"}\n")
            append("\uD83D\uDCDE Call/WhatsApp for details")
        }
        return current.copy(body = autoCaption)
    }
}
