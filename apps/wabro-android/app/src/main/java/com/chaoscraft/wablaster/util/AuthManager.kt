package com.chaoscraft.wablaster.util

import android.content.SharedPreferences
import androidx.annotation.Keep
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Singleton

@Keep
data class AuthSession(
    val email: String,
    val token: String,
    val refreshToken: String?,
    val expiresAt: Long?
)

@Keep
data class AuthRequest(
    val mode: String,
    val email: String,
    val password: String,
    val fullName: String? = null,
    val phone: String? = null
)

@Keep
data class AuthResponse(
    @SerializedName("session") val session: AuthSessionDto?,
    @SerializedName("user") val user: AuthUserDto?,
    @SerializedName("error") val error: String?,
    @SerializedName("message") val message: String?
)

@Keep
data class AuthSessionDto(
    @SerializedName("access_token") val accessToken: String?,
    @SerializedName("refresh_token") val refreshToken: String?,
    @SerializedName("expires_in") val expiresIn: Long?,
    @SerializedName("expires_at") val expiresAt: Long?
)

@Keep
data class AuthUserDto(
    @SerializedName("id") val id: String?,
    @SerializedName("email") val email: String?
)

@Singleton
class AuthManager @Inject constructor(
    private val prefs: SharedPreferences,
    private val httpClient: OkHttpClient,
    private val gson: Gson
) {
    companion object {
        private const val PREF_TOKEN = "auth_token"
        private const val PREF_REFRESH_TOKEN = "auth_refresh_token"
        private const val PREF_EMAIL = "auth_email"
        private const val PREF_EXPIRES_AT = "auth_expires_at"
        private val JSON_MEDIA_TYPE = "application/json".toMediaType()

        private const val AUTH_API_URL = "https://app.propai.live/api/auth/password"

        fun apiBaseUrl() = "https://app.propai.live/api/wabro/"
    }

    fun getSession(): AuthSession? {
        val token = prefs.getString(PREF_TOKEN, null) ?: return null
        return AuthSession(
            email = prefs.getString(PREF_EMAIL, "") ?: "",
            token = token,
            refreshToken = prefs.getString(PREF_REFRESH_TOKEN, null),
            expiresAt = if (prefs.contains(PREF_EXPIRES_AT)) prefs.getLong(PREF_EXPIRES_AT, 0) else null
        )
    }

    fun isLoggedIn(): Boolean = prefs.contains(PREF_TOKEN)

    suspend fun signIn(email: String, password: String): Result<AuthSession> =
        authenticate(AuthRequest("signin", email, password))

    suspend fun signUp(email: String, password: String, fullName: String, phone: String): Result<AuthSession> =
        authenticate(AuthRequest("signup", email, password, fullName = fullName, phone = phone))

    private suspend fun authenticate(request: AuthRequest): Result<AuthSession> =
        withContext(Dispatchers.IO) {
            runCatching {
                val json = gson.toJson(request)
                val httpRequest = Request.Builder()
                    .url(AUTH_API_URL)
                    .post(json.toRequestBody(JSON_MEDIA_TYPE))
                    .addHeader("Content-Type", "application/json")
                    .build()

                val response = httpClient.newCall(httpRequest).execute()
                val body = response.body?.string().orEmpty()
                val authResp = gson.fromJson(body, AuthResponse::class.java)

                if (!response.isSuccessful) {
                    throw Exception(authResp.error ?: authResp.message ?: "Authentication failed (HTTP ${response.code})")
                }

                val sessionDto = authResp.session
                    ?: throw Exception("No session returned from server")

                val accessToken = sessionDto.accessToken
                    ?: throw Exception("No access token returned")

                val email = authResp.user?.email ?: request.email

                val expiresAt = sessionDto.expiresAt
                    ?: sessionDto.expiresIn?.let { System.currentTimeMillis() + it * 1000 }

                prefs.edit()
                    .putString(PREF_TOKEN, accessToken)
                    .putString(PREF_REFRESH_TOKEN, sessionDto.refreshToken)
                    .putString(PREF_EMAIL, email)
                    .apply {
                        if (expiresAt != null) putLong(PREF_EXPIRES_AT, expiresAt)
                    }
                    .apply()

                AuthSession(
                    email = email,
                    token = accessToken,
                    refreshToken = sessionDto.refreshToken,
                    expiresAt = expiresAt
                )
            }
        }

    fun logout() {
        prefs.edit()
            .remove(PREF_TOKEN)
            .remove(PREF_REFRESH_TOKEN)
            .remove(PREF_EMAIL)
            .remove(PREF_EXPIRES_AT)
            .apply()
    }

    fun getAuthToken(): String? = prefs.getString(PREF_TOKEN, null)
}
