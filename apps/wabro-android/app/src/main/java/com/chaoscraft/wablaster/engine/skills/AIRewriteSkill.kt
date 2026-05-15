package com.chaoscraft.wablaster.engine.skills

import com.chaoscraft.wablaster.engine.ProcessedMessage
import com.chaoscraft.wablaster.engine.SendContext
import com.chaoscraft.wablaster.engine.Skill
import com.chaoscraft.wablaster.util.GeminiClient

class AIRewriteSkill(private val gemini: GeminiClient?) : Skill {
    override val name = "AI Rewrite"

    override suspend fun process(ctx: SendContext, current: ProcessedMessage): ProcessedMessage {
        if (gemini == null || !ctx.skillsConfig.aiRewriteEnabled) return current

        val result = gemini.rewrite(
            text = current.body,
            contactName = ctx.contact.name,
            locality = ctx.contact.locality,
            budget = ctx.contact.budget
        )
        return if (result.isSuccess) current.copy(body = result.getOrThrow())
        else current
    }
}
