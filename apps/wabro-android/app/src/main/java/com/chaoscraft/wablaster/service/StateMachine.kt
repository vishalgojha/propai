package com.chaoscraft.wablaster.service

sealed class WaState {
    object Idle : WaState()
    object OpeningContact : WaState()
    object InChat : WaState()
    object AttachingMedia : WaState()
    object Typing : WaState()
    object Sending : WaState()
    object WaitingConfirmation : WaState()
    object ReadingGroupParticipants : WaState()
    data class Error(val reason: String) : WaState()
}

object WaNodeIds {
    const val SEARCH_MENU_ITEM = "com.whatsapp:id/menuitem_search"
    const val SEARCH_SRC_TEXT = "com.whatsapp:id/search_src_text"
    const val CONTACT_ROW = "com.whatsapp:id/conversations_row_contact_name"
    const val MESSAGE_INPUT = "com.whatsapp:id/entry"
    const val SEND_BUTTON = "com.whatsapp:id/send"
    const val ATTACH_BUTTON = "com.whatsapp:id/input_attach_button"
    const val ATTACH_IMAGE_OPTION = "com.whatsapp:id/pickfiletype_gallery_holder"
    const val ATTACH_DOC_OPTION = "com.whatsapp:id/pickfiletype_document_holder"
    const val CAPTION_INPUT = "com.whatsapp:id/caption"
    const val CONVERSATION_LIST = "com.whatsapp:id/conversations_row_message_count"
    const val WHATSAPP_HOME = "com.whatsapp:id/home_app_bar"
}
