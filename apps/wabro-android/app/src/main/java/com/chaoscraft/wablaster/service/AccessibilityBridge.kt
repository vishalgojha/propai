package com.chaoscraft.wablaster.service

import com.chaoscraft.wablaster.db.entities.Contact
import com.chaoscraft.wablaster.engine.ProcessedMessage
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.flow.MutableSharedFlow

data class SendCommand(
    val contact: Contact,
    val message: ProcessedMessage,
    val campaignId: Long = 0,
    val senderPackage: String = "com.whatsapp"
)

data class SendResult(
    val success: Boolean,
    val contact: Contact? = null,
    val error: String? = null,
    val campaignId: Long = 0
)

data class GroupContactCommand(
    val groupName: String,
    val senderPackage: String = "com.whatsapp"
)

data class GroupContactResult(
    val contacts: List<Contact> = emptyList(),
    val error: String? = null
)

object AccessibilityBridge {
    val commandChannel = Channel<SendCommand>(Channel.UNLIMITED)
    val resultChannel = Channel<SendResult>(Channel.UNLIMITED)
    val groupCommandChannel = Channel<GroupContactCommand>(Channel.UNLIMITED)
    val groupResultChannel = Channel<GroupContactResult>(Channel.UNLIMITED)
    val replyFlow = MutableSharedFlow<String>(replay = 0)

    suspend fun send(contact: Contact, message: ProcessedMessage, campaignId: Long = 0, senderPackage: String = "com.whatsapp"): Boolean {
        commandChannel.send(SendCommand(contact, message, campaignId, senderPackage))
        val result = withTimeoutOrNull(120_000L) {
            resultChannel.receive()
        }
        return result?.success ?: false
    }

    suspend fun scrapeGroupContacts(groupName: String, senderPackage: String = "com.whatsapp"): GroupContactResult {
        groupCommandChannel.send(GroupContactCommand(groupName, senderPackage))
        return withTimeoutOrNull(120_000L) {
            groupResultChannel.receive()
        } ?: GroupContactResult(error = "Timeout")
    }
}
