package com.chaoscraft.wablaster.util

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MultipartBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WaBroApiClient @Inject constructor(
    @ApplicationContext private val context: Context,
    private val prefs: SharedPreferences,
    private val gson: Gson,
    private val httpClient: OkHttpClient
) : WaBroApi {

    suspend fun registerDevice(deviceId: String, model: String, androidVersion: String, appVersion: String): Result<Unit> {
        val request = RegisterDeviceRequest(
            deviceName = "$model (Android $androidVersion)",
            brokerUserId = deviceId,
            appVersion = appVersion
        )
        return registerDevice(request).map { Unit }
    }

    suspend fun getPendingCampaigns(deviceId: String): Result<List<PendingCampaign>> {
        val request = Request.Builder()
            .url(resolveUrl("campaigns/pending?deviceId=$deviceId"))
            .get()
            .build()
        return execute(request)
    }

    suspend fun syncSendLogs(campaignId: String, logs: List<RemoteSendLog>): Result<Unit> {
        val request = buildJsonRequest(
            path = "campaigns/$campaignId/logs",
            method = "POST",
            body = mapOf("logs" to logs)
        )
        return executeUnit(request)
    }

    suspend fun syncCampaignProgress(campaignId: String, updates: Map<String, Any>): Result<Unit> {
        val request = buildJsonRequest(
            path = "campaigns/$campaignId/progress",
            method = "POST",
            body = updates
        )
        return executeUnit(request)
    }

    suspend fun reportCrash(deviceId: String, model: String, androidVersion: String, appVersion: String, stackTrace: String): Result<Unit> {
        val request = buildJsonRequest(
            path = "crashes",
            method = "POST",
            body = mapOf(
                "deviceId" to deviceId,
                "model" to model,
                "androidVersion" to androidVersion,
                "appVersion" to appVersion,
                "stackTrace" to stackTrace
            )
        )
        return executeUnit(request)
    }

    override suspend fun registerDevice(request: RegisterDeviceRequest): Result<RegisterDeviceResponse> {
        return execute(buildJsonRequest("devices/register", "POST", request))
    }

    override suspend fun createSession(request: CreateSessionRequest): Result<CreateSessionResponse> {
        return execute(buildJsonRequest("sessions", "POST", request))
    }

    override suspend fun getSessionStatus(deviceId: String): Result<SessionStatusResponse> {
        return execute(
            Request.Builder()
                .url(resolveUrl("sessions/$deviceId"))
                .get()
                .build()
        )
    }

    override suspend fun disconnectSession(deviceId: String): Result<Unit> {
        return executeUnit(
            Request.Builder()
                .url(resolveUrl("sessions/$deviceId"))
                .delete()
                .build()
        )
    }

    override suspend fun uploadMedia(request: UploadMediaRequest): Result<UploadMediaResponse> {
        val multipart = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart(
                "file",
                request.fileName,
                request.bytes.toRequestBody(request.mimeType.toMediaType())
            )
            .addFormDataPart("mimeType", request.mimeType)
            .build()

        return execute(
            Request.Builder()
                .url(resolveUrl("media/upload"))
                .post(multipart)
                .build()
        )
    }

    override suspend fun sendMessage(request: SendMessageRequest): Result<SendMessageResponse> {
        return execute(buildJsonRequest("messages/send", "POST", request))
    }

    override suspend fun sendMediaMessage(request: SendMediaMessageRequest): Result<SendMessageResponse> {
        return execute(buildJsonRequest("messages/send-media", "POST", request))
    }

    override suspend fun createCampaign(request: CreateCampaignRequest): Result<CreateCampaignResponse> {
        return execute(buildJsonRequest("campaigns", "POST", request))
    }

    override suspend fun startCampaign(campaignId: Long): Result<Unit> {
        return executeUnit(buildJsonRequest("campaigns/$campaignId/start", "POST", emptyMap<String, String>()))
    }

    override suspend fun pauseCampaign(campaignId: Long): Result<Unit> {
        return executeUnit(buildJsonRequest("campaigns/$campaignId/pause", "POST", emptyMap<String, String>()))
    }

    override suspend fun stopCampaign(campaignId: Long): Result<Unit> {
        return executeUnit(buildJsonRequest("campaigns/$campaignId/stop", "POST", emptyMap<String, String>()))
    }

    override suspend fun getCampaignStatus(campaignId: Long): Result<CampaignStatusResponse> {
        return execute(
            Request.Builder()
                .url(resolveUrl("campaigns/$campaignId/status"))
                .get()
                .build()
        )
    }

    override suspend fun getInboundEvents(cursor: String?): Result<InboundEventsResponse> {
        val suffix = cursor?.let { "?cursor=$it" } ?: ""
        return execute(
            Request.Builder()
                .url(resolveUrl("events$suffix"))
                .get()
                .build()
        )
    }

    override suspend fun getGroups(deviceId: String): Result<List<GroupSummaryDto>> {
        return execute(
            Request.Builder()
                .url(resolveUrl("groups?deviceId=$deviceId"))
                .get()
                .build()
        )
    }

    override suspend fun getGroupParticipants(deviceId: String, groupId: String): Result<List<GroupParticipantDto>> {
        return execute(
            Request.Builder()
                .url(resolveUrl("groups/$groupId/participants?deviceId=$deviceId"))
                .get()
                .build()
        )
    }

    private suspend inline fun <reified T> execute(request: Request): Result<T> = withContext(Dispatchers.IO) {
        runCatching {
            httpClient.newCall(request).execute().use { response ->
                val responseText = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    throw IOException("HTTP ${response.code}: $responseText")
                }
                gson.fromJson<T>(responseText, object : TypeToken<T>() {}.type)
                    ?: throw IOException("Empty response body")
            }
        }
    }

    private suspend fun executeUnit(request: Request): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    throw IOException("HTTP ${response.code}: ${response.body?.string().orEmpty()}")
                }
            }
        }
    }

    private fun buildJsonRequest(path: String, method: String, body: Any): Request {
        val json = gson.toJson(body)
        val requestBody = json.toRequestBody(JSON_MEDIA_TYPE)
        return Request.Builder()
            .url(resolveUrl(path))
            .method(method, requestBody)
            .build()
    }

    private fun resolveUrl(path: String): String {
        val baseUrl = prefs.getString(PREF_API_BASE_URL, null)
            ?: DEFAULT_API_BASE_URL
        val normalizedBase = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        return normalizedBase + path.removePrefix("/")
    }

    companion object {
        private val JSON_MEDIA_TYPE = "application/json".toMediaType()
        private const val PREF_API_BASE_URL = "wabro_api_base_url"
        private const val DEFAULT_API_BASE_URL = "https://wabro.propai.live/api/v1/"
    }
}
