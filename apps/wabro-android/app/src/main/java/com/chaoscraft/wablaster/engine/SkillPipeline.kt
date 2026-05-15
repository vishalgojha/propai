package com.chaoscraft.wablaster.engine

import android.net.Uri
import com.chaoscraft.wablaster.db.entities.Contact

data class SendContext(
    val contact: Contact,
    val rawMessage: String,
    val mediaUri: Uri?,
    val skillsConfig: SkillsConfig
)

data class ProcessedMessage(
    val body: String,
    val mediaUri: Uri?,
    val skipSend: Boolean = false,
    val pauseMs: Long = 0
)

data class SkillsConfig(
    val spinEnabled: Boolean = true,
    val mergeEnabled: Boolean = true,
    val translateEnabled: Boolean = false,
    val smartCaptionEnabled: Boolean = true,
    val replyGuardEnabled: Boolean = true,
    val warmupEnabled: Boolean = true,
    val aiRewriteEnabled: Boolean = false,
    val aiTranslateEnabled: Boolean = false,
    val aiCaptionEnabled: Boolean = false
)

interface Skill {
    val name: String
    suspend fun process(ctx: SendContext, current: ProcessedMessage): ProcessedMessage
}

class SkillPipeline(private val skills: List<Skill>) {
    suspend fun run(ctx: SendContext): ProcessedMessage {
        var result = ProcessedMessage(body = ctx.rawMessage, mediaUri = ctx.mediaUri)
        for (skill in skills) {
            val enabled = when (skill.name) {
                "Spin Text" -> ctx.skillsConfig.spinEnabled
                "Personalize" -> ctx.skillsConfig.mergeEnabled
                "Translate" -> ctx.skillsConfig.translateEnabled
                "Smart Caption" -> ctx.skillsConfig.smartCaptionEnabled
                "Reply Guard" -> ctx.skillsConfig.replyGuardEnabled
                "Number Warmup" -> ctx.skillsConfig.warmupEnabled
                "AI Rewrite" -> ctx.skillsConfig.aiRewriteEnabled
                else -> true
            }
            if (!enabled) continue
            result = skill.process(ctx, result)
            if (result.skipSend) break
        }
        return result
    }
}
