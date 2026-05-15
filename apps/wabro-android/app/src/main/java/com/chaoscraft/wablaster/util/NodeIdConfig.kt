package com.chaoscraft.wablaster.util

data class WaNodeIdSet(
    val searchMenuItem: String,
    val searchSrcText: String,
    val contactRow: String,
    val messageInput: String,
    val sendButton: String,
    val attachButton: String,
    val attachImageOption: String,
    val attachDocOption: String,
    val captionInput: String,
    val whatsappHome: String,
    val conversationHeaderName: String = "com.whatsapp:id/conversation_header_name",
    val contactPickerRowName: String = "com.whatsapp:id/contactpicker_row_name",
    val contactPickerRowNumber: String = "com.whatsapp:id/contactpicker_row_number"
)

object NodeIdConfig {

    private val knownVersions = mapOf(
        "2.24." to WaNodeIdSet(
            searchMenuItem = "com.whatsapp:id/menuitem_search",
            searchSrcText = "com.whatsapp:id/search_src_text",
            contactRow = "com.whatsapp:id/conversations_row_contact_name",
            messageInput = "com.whatsapp:id/entry",
            sendButton = "com.whatsapp:id/send",
            attachButton = "com.whatsapp:id/input_attach_button",
            attachImageOption = "com.whatsapp:id/pickfiletype_gallery_holder",
            attachDocOption = "com.whatsapp:id/pickfiletype_document_holder",
            captionInput = "com.whatsapp:id/caption",
            whatsappHome = "com.whatsapp:id/home_app_bar"
        ),
        "2.23." to WaNodeIdSet(
            searchMenuItem = "com.whatsapp:id/menuitem_search",
            searchSrcText = "com.whatsapp:id/search_src_text",
            contactRow = "com.whatsapp:id/conversations_row_contact_name",
            messageInput = "com.whatsapp:id/entry",
            sendButton = "com.whatsapp:id/send",
            attachButton = "com.whatsapp:id/input_attach_button",
            attachImageOption = "com.whatsapp:id/pickfiletype_gallery_holder",
            attachDocOption = "com.whatsapp:id/pickfiletype_document_holder",
            captionInput = "com.whatsapp:id/caption",
            whatsappHome = "com.whatsapp:id/home_app_bar"
        )
    )

    private val fallback = WaNodeIdSet(
        searchMenuItem = "com.whatsapp:id/menuitem_search",
        searchSrcText = "com.whatsapp:id/search_src_text",
        contactRow = "com.whatsapp:id/conversations_row_contact_name",
        messageInput = "com.whatsapp:id/entry",
        sendButton = "com.whatsapp:id/send",
        attachButton = "com.whatsapp:id/input_attach_button",
        attachImageOption = "com.whatsapp:id/pickfiletype_gallery_holder",
        attachDocOption = "com.whatsapp:id/pickfiletype_document_holder",
        captionInput = "com.whatsapp:id/caption",
        whatsappHome = "com.whatsapp:id/home_app_bar"
    )

    fun forVersion(versionName: String): WaNodeIdSet {
        val match = knownVersions.entries.firstOrNull { (prefix, _) ->
            versionName.startsWith(prefix)
        }
        return match?.value ?: fallback
    }

    fun allKnown(): Map<String, WaNodeIdSet> = knownVersions

    fun registerVersion(prefix: String, ids: WaNodeIdSet) {
        val mutable = knownVersions.toMutableMap()
        mutable[prefix] = ids
    }
}
