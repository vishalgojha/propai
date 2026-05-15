package com.chaoscraft.wablaster.engine.skills

import com.chaoscraft.wablaster.engine.ProcessedMessage
import com.chaoscraft.wablaster.engine.SendContext
import com.chaoscraft.wablaster.engine.Skill
import com.chaoscraft.wablaster.util.GeminiClient

class TranslateSkill(private val gemini: GeminiClient?) : Skill {
    override val name = "Translate"

    private val greetings = mapOf(
        "hi" to "नमस्ते राम 👐\n",
        "mr" to "नमस्कार 👐\n",
        "gu" to "નમસ્કાર 👐\n",
        "bn" to "নমস্কার 👐\n",
        "te" to "నమస్కారం 👐\n",
        "ta" to "வணக்கம் 👐\n",
        "kn" to "ನಮಸ್ಕಾರ 👐\n",
        "en" to ""
    )

    private val languageNames = mapOf(
        "hi" to "Hindi", "mr" to "Marathi", "gu" to "Gujarati",
        "bn" to "Bengali", "te" to "Telugu", "ta" to "Tamil",
        "kn" to "Kannada", "ml" to "Malayalam", "pa" to "Punjabi",
        "or" to "Odia", "en" to "English"
    )

    override suspend fun process(ctx: SendContext, current: ProcessedMessage): ProcessedMessage {
        val lang = ctx.contact.language ?: "en"
        if (lang == "en") return current

        if (ctx.skillsConfig.aiTranslateEnabled && gemini != null) {
            val target = languageNames[lang] ?: lang
            val result = gemini.translate(current.body, target)
            if (result.isSuccess) {
                return current.copy(body = result.getOrThrow())
            }
        }

        val prefix = greetings[lang] ?: ""
        return current.copy(body = prefix + current.body)
    }
}
