package com.chaoscraft.wablaster.util

import com.google.gson.annotations.SerializedName

data class RegisterDeviceRequest(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("device_model") val deviceModel: String,
    @SerializedName("android_version") val androidVersion: String,
    @SerializedName("app_version") val appVersion: String,
    val platform: String = "android"
)

data class RegisterDeviceResponse(
    val success: Boolean = true,
    val deviceId: String,
    val displayName: String
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

data class PendingCampaignEnvelope(
    val campaigns: List<PendingCampaign> = emptyList()
)

data class RemoteSendLog(
    val phone: String,
    val name: String,
    val status: String,
    val error: String?
)

data class SyncSendLogsRequest(
    @SerializedName("campaign_id") val campaignId: String,
    val logs: List<RemoteSendLog>
)

data class CrashLogRequest(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("device_model") val deviceModel: String,
    @SerializedName("android_version") val androidVersion: String,
    @SerializedName("app_version") val appVersion: String,
    @SerializedName("stack_trace") val stackTrace: String
)
