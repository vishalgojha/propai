package com.chaoscraft.wablaster.engine.skills

import com.chaoscraft.wablaster.engine.ProcessedMessage
import com.chaoscraft.wablaster.engine.SendContext
import com.chaoscraft.wablaster.engine.Skill

class MergeSkill() : Skill {
    override val name = "Personalize"

    override suspend fun process(ctx: SendContext, current: ProcessedMessage): ProcessedMessage {
        var body = current.body
        body = body.replace("{{name}}", ctx.contact.name.split(" ").first())
        body = body.replace("{{locality}}", ctx.contact.locality ?: "your area")
        body = body.replace("{{budget}}", ctx.contact.budget ?: "your budget")
        body = body.replace("{{phone}}", ctx.contact.phone)
        body = body.replace("{{full_name}}", ctx.contact.name)
        return current.copy(body = body)
    }
}
