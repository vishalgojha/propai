package com.chaoscraft.wablaster.util

data class RegisterDeviceRequest(
    val deviceName: String,
    val brokerUserId: String?,
    val appVersion: String,
    val platform: String = "android"
)

data class RegisterDeviceResponse(
    val deviceId: String,
    val displayName: String
)

data class CreateSessionRequest(
    val deviceId: String
)

data class CreateSessionResponse(
    val sessionId: String,
    val status: String,
    val qrText: String? = null,
    val qrImageUrl: String? = null
)

data class SessionStatusResponse(
    val deviceId: String,
    val sessionId: String? = null,
    val status: String,
    val phoneNumber: String? = null,
    val pushName: String? = null,
    val lastSeenAt: Long? = null,
    val error: String? = null
)

data class UploadMediaRequest(
    val fileName: String,
    val mimeType: String,
    val bytes: ByteArray
)

data class UploadMediaResponse(
    val mediaUrl: String,
    val mimeType: String? = null,
    val fileName: String? = null
)

data class SendMessageRequest(
    val deviceId: String,
    val campaignId: Long,
    val contactPhone: String,
    val contactName: String? = null,
    val text: String
)

data class SendMediaMessageRequest(
    val deviceId: String,
    val campaignId: Long,
    val contactPhone: String,
    val contactName: String? = null,
    val text: String,
    val mediaUrl: String,
    val mimeType: String? = null,
    val fileName: String? = null
)

data class SendMessageResponse(
    val status: String,
    val providerMessageId: String? = null,
    val serverTimestamp: Long,
    val error: String? = null
)

data class CreateCampaignRequest(
    val name: String,
    val messageTemplate: String,
    val mediaUrl: String? = null,
    val skillsConfigJson: String,
    val contacts: List<CampaignContactDto>
)

data class CampaignContactDto(
    val phone: String,
    val name: String,
    val locality: String? = null,
    val budget: String? = null,
    val language: String? = null
)

data class CreateCampaignResponse(
    val campaignId: Long
)

data class CampaignStatusResponse(
    val campaignId: Long,
    val status: String,
    val total: Int,
    val sent: Int,
    val failed: Int,
    val skipped: Int,
    val paused: Int,
    val updatedAt: Long
)

data class InboundEventsResponse(
    val nextCursor: String? = null,
    val events: List<InboundEventDto>
)

data class InboundEventDto(
    val id: String,
    val type: String,
    val deviceId: String,
    val campaignId: Long? = null,
    val phone: String? = null,
    val pushName: String? = null,
    val text: String? = null,
    val providerMessageId: String? = null,
    val status: String? = null,
    val timestamp: Long
)

data class GroupSummaryDto(
    val id: String,
    val name: String
)

data class GroupParticipantDto(
    val phone: String,
    val name: String
)

data class PendingCampaign(
    val id: String,
    val name: String,
    val messageTemplate: String,
    val mediaUrl: String?,
    val skillsConfigJson: String?,
    val contacts: List<CampaignContactDto>,
    val status: String,
    val totalContacts: Int,
    val sentCount: Int,
    val failedCount: Int,
    val skippedCount: Int,
    val scheduleAt: String?,
    val startedAt: String?,
    val completedAt: String?,
    val createdAt: String,
    val updatedAt: String
)

data class RemoteSendLog(
    val phone: String,
    val name: String,
    val status: String,
    val error: String?
)
