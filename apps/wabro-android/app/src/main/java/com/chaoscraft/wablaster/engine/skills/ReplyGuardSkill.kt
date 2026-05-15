package com.chaoscraft.wablaster.engine.skills

import com.chaoscraft.wablaster.engine.ProcessedMessage
import com.chaoscraft.wablaster.engine.SendContext
import com.chaoscraft.wablaster.engine.Skill
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch

class ReplyGuardSkill(
    private val replyFlow: SharedFlow<String>,
    private val pauseOnReplyMs: Long = 300_000
) : Skill {
    override val name = "Reply Guard"

    private var lastReplyTime = 0L

    init {
        CoroutineScope(Dispatchers.IO).launch {
            replyFlow.collect {
                lastReplyTime = System.currentTimeMillis()
            }
        }
    }

    override suspend fun process(ctx: SendContext, current: ProcessedMessage): ProcessedMessage {
        val timeSinceReply = System.currentTimeMillis() - lastReplyTime
        if (timeSinceReply < pauseOnReplyMs) {
            val remainingPause = pauseOnReplyMs - timeSinceReply
            return current.copy(pauseMs = remainingPause)
        }
        return current
    }
}
