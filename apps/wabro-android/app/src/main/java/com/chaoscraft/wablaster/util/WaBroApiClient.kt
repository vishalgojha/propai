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
    private val httpClient: OkHttpClient,
    private val authManager: AuthManager
) : WaBroApi {

    suspend fun registerDevice(deviceId: String, model: String, androidVersion: String, appVersion: String): Result<Unit> {
        val request = RegisterDeviceRequest(
            deviceId = deviceId,
            deviceModel = model,
            androidVersion = androidVersion,
            appVersion = appVersion
        )
        return registerDevice(request).map { Unit }
    }

    suspend fun getPendingCampaigns(deviceId: String): Result<List<PendingCampaign>> {
        val request = Request.Builder()
            .url(resolveDeviceUrl("$deviceId/pending"))
            .addHeader(DEVICE_TOKEN_HEADER, requireProvisioningToken())
            .get()
            .build()
        return execute<PendingCampaignEnvelope>(request).map { it.campaigns }
    }

    suspend fun syncSendLogs(campaignId: String, logs: List<RemoteSendLog>): Result<Unit> {
        val request = buildDeviceJsonRequest(
            path = "sync/logs",
            method = "POST",
            body = SyncSendLogsRequest(campaignId = campaignId, logs = logs)
        )
        return executeUnit(request)
    }

    suspend fun syncCampaignProgress(campaignId: String, updates: Map<String, Any>): Result<Unit> {
        val request = buildDeviceJsonRequest(
            path = "sync/campaign/$campaignId",
            method = "POST",
            body = updates
        )
        return executeUnit(request)
    }

    suspend fun reportCrash(deviceId: String, model: String, androidVersion: String, appVersion: String, stackTrace: String): Result<Unit> {
        val request = buildDeviceJsonRequest(
            path = "crash",
            method = "POST",
            body = CrashLogRequest(
                deviceId = deviceId,
                deviceModel = model,
                androidVersion = androidVersion,
                appVersion = appVersion,
                stackTrace = stackTrace
            )
        )
        return executeUnit(request)
    }

    override suspend fun registerDevice(request: RegisterDeviceRequest): Result<RegisterDeviceResponse> {
        return execute(buildDeviceJsonRequest("register", "POST", request))
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
            userRequestBuilder("media/upload")
                .post(multipart)
                .build()
        )
    }

    override suspend fun sendMessage(request: SendMessageRequest): Result<SendMessageResponse> {
        return execute(buildUserJsonRequest("messages/send", "POST", request))
    }

    override suspend fun sendMediaMessage(request: SendMediaMessageRequest): Result<SendMessageResponse> {
        return execute(buildUserJsonRequest("messages/send-media", "POST", request))
    }

    override suspend fun createCampaign(request: CreateCampaignRequest): Result<CreateCampaignResponse> {
        return execute(buildUserJsonRequest("campaigns", "POST", request))
    }

    override suspend fun startCampaign(campaignId: Long): Result<Unit> {
        return executeUnit(buildUserJsonRequest("campaigns/$campaignId/start", "POST", emptyMap<String, String>()))
    }

    override suspend fun pauseCampaign(campaignId: Long): Result<Unit> {
        return executeUnit(buildUserJsonRequest("campaigns/$campaignId/pause", "POST", emptyMap<String, String>()))
    }

    override suspend fun stopCampaign(campaignId: Long): Result<Unit> {
        return executeUnit(buildUserJsonRequest("campaigns/$campaignId/stop", "POST", emptyMap<String, String>()))
    }

    override suspend fun getCampaignStatus(campaignId: Long): Result<CampaignStatusResponse> {
        return execute(
            userRequestBuilder("campaigns/$campaignId/status")
                .get()
                .build()
        )
    }

    override suspend fun getInboundEvents(cursor: String?): Result<InboundEventsResponse> {
        val suffix = cursor?.let { "?cursor=$it" } ?: ""
        return execute(
            userRequestBuilder("events$suffix")
                .get()
                .build()
        )
    }

    override suspend fun getGroups(deviceId: String): Result<List<GroupSummaryDto>> {
        return execute(
            userRequestBuilder("groups?deviceId=$deviceId")
                .get()
                .build()
        )
    }

    override suspend fun getGroupParticipants(deviceId: String, groupId: String): Result<List<GroupParticipantDto>> {
        return execute(
            userRequestBuilder("groups/$groupId/participants?deviceId=$deviceId")
                .get()
                .build()
        )
    }

    fun getDeviceApiBaseUrl(): String {
        return prefs.getString(PREF_DEVICE_API_BASE_URL, null)
            ?.takeIf { it.isNotBlank() }
            ?: DEFAULT_DEVICE_API_BASE_URL
    }

    fun setDeviceApiBaseUrl(value: String) {
        prefs.edit().putString(PREF_DEVICE_API_BASE_URL, value.trim()).apply()
    }

    fun getProvisioningToken(): String {
        return prefs.getString(PREF_DEVICE_PROVISIONING_TOKEN, null)?.trim().orEmpty()
    }

    fun setProvisioningToken(value: String) {
        prefs.edit().putString(PREF_DEVICE_PROVISIONING_TOKEN, value.trim()).apply()
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

    private fun buildUserJsonRequest(path: String, method: String, body: Any): Request {
        val json = gson.toJson(body)
        val requestBody = json.toRequestBody(JSON_MEDIA_TYPE)
        return userRequestBuilder(path)
            .method(method, requestBody)
            .build()
    }

    private fun buildDeviceJsonRequest(path: String, method: String, body: Any): Request {
        val json = gson.toJson(body)
        val requestBody = json.toRequestBody(JSON_MEDIA_TYPE)
        return Request.Builder()
            .url(resolveDeviceUrl(path))
            .addHeader(DEVICE_TOKEN_HEADER, requireProvisioningToken())
            .method(method, requestBody)
            .build()
    }

    private fun userRequestBuilder(path: String): Request.Builder {
        return Request.Builder()
            .url(resolveUserUrl(path))
            .addHeader("Authorization", "Bearer ${requireAuthToken()}")
    }

    private fun resolveUserUrl(path: String): String {
        val baseUrl = prefs.getString(PREF_USER_API_BASE_URL, null)
            ?.takeIf { it.isNotBlank() }
            ?: DEFAULT_USER_API_BASE_URL
        val normalizedBase = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        return normalizedBase + path.removePrefix("/")
    }

    private fun resolveDeviceUrl(path: String): String {
        val baseUrl = getDeviceApiBaseUrl()
        val normalizedBase = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        return normalizedBase + path.removePrefix("/")
    }

    private fun requireAuthToken(): String {
        return authManager.getAuthToken()?.trim()?.takeIf { it.isNotEmpty() }
            ?: throw IOException("Sign in is required before using WaBro API routes")
    }

    private fun requireProvisioningToken(): String {
        return getProvisioningToken().takeIf { it.isNotEmpty() }
            ?: throw IOException("Set the WaBro provisioning token in Settings before syncing this device")
    }

    companion object {
        private val JSON_MEDIA_TYPE = "application/json".toMediaType()
        private const val DEVICE_TOKEN_HEADER = "x-wabro-device-token"
        private const val PREF_USER_API_BASE_URL = "wabro_user_api_base_url"
        private const val PREF_DEVICE_API_BASE_URL = "wabro_device_api_base_url"
        private const val PREF_DEVICE_PROVISIONING_TOKEN = "wabro_device_provisioning_token"
        private const val DEFAULT_USER_API_BASE_URL = "https://app.propai.live/api/wabro/"
        private const val DEFAULT_DEVICE_API_BASE_URL = "https://app.propai.live/api/wabro/device/"
    }
}
