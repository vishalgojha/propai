package com.chaoscraft.wablaster.engine.skills

import com.chaoscraft.wablaster.engine.ProcessedMessage
import com.chaoscraft.wablaster.engine.SendContext
import com.chaoscraft.wablaster.engine.Skill

class SpinSkill() : Skill {
    override val name = "Spin Text"

    private val synonyms = mapOf(
        "property" to listOf("property", "flat", "unit", "home", "apartment"),
        "available" to listOf("available", "ready", "open", "on offer", "up for grabs"),
        "contact me" to listOf("contact me", "ping me", "DM for details", "reach out", "get in touch"),
        "urgent" to listOf("urgent", "immediate", "today only", "limited time", "hurry"),
        "bhav" to listOf("bhav", "price", "rate", "cost", "valuation"),
        "ready possession" to listOf("ready possession", "move-in ready", "immediate possession", "ready to move"),
        "deal" to listOf("deal", "offer", "proposition", "opportunity"),
        "best" to listOf("best", "top", "great", "excellent", "fantastic"),
        "location" to listOf("location", "area", "locality", "neighbourhood", "sector"),
        "discount" to listOf("discount", "offer", "price drop", "reduction", "special price")
    )

    private val fillers = listOf(
        "",
        "\n\nInterested? Let's connect.",
        "\n\nDrop a \u2705 for details.",
        "\n\nSerious buyers only.",
        "\n\nLimited slots available.",
        "\n\nCall now for a site visit.",
        "\n\nExclusive deal just for you!"
    )

    override suspend fun process(ctx: SendContext, current: ProcessedMessage): ProcessedMessage {
        var spun = current.body
        synonyms.forEach { (word, variants) ->
            if (spun.contains(word, ignoreCase = true)) {
                spun = spun.replace(word, variants.random(), ignoreCase = true)
            }
        }
        spun += fillers.random()
        return current.copy(body = spun)
    }
}
