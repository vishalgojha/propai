package com.chaoscraft.wablaster.util

interface WaBroApi {
    suspend fun registerDevice(request: RegisterDeviceRequest): Result<RegisterDeviceResponse>

    suspend fun createSession(request: CreateSessionRequest): Result<CreateSessionResponse>
    suspend fun getSessionStatus(deviceId: String): Result<SessionStatusResponse>
    suspend fun disconnectSession(deviceId: String): Result<Unit>

    suspend fun uploadMedia(request: UploadMediaRequest): Result<UploadMediaResponse>
    suspend fun sendMessage(request: SendMessageRequest): Result<SendMessageResponse>
    suspend fun sendMediaMessage(request: SendMediaMessageRequest): Result<SendMessageResponse>

    suspend fun createCampaign(request: CreateCampaignRequest): Result<CreateCampaignResponse>
    suspend fun startCampaign(campaignId: Long): Result<Unit>
    suspend fun pauseCampaign(campaignId: Long): Result<Unit>
    suspend fun stopCampaign(campaignId: Long): Result<Unit>
    suspend fun getCampaignStatus(campaignId: Long): Result<CampaignStatusResponse>

    suspend fun getInboundEvents(cursor: String?): Result<InboundEventsResponse>

    suspend fun getGroups(deviceId: String): Result<List<GroupSummaryDto>>
    suspend fun getGroupParticipants(deviceId: String, groupId: String): Result<List<GroupParticipantDto>>
}
