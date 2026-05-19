package com.chaoscraft.wablaster.util

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class GeminiClient @Inject constructor(
    private val aiConfig: AiConfig
) {
    private val baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"

    suspend fun translate(text: String, targetLanguage: String): Result<String> =
        callApi("Translate the following message to $targetLanguage language. Return ONLY the translated text, no explanations:\n\n$text")

    suspend fun generateCaption(contactName: String, locality: String?, budget: String?, rawMessage: String): Result<String> =
        callApi("""You are a WhatsApp marketing assistant. Generate a 1-line image caption for: $contactName${locality?.let { " from $it" } ?: ""}${budget?.let { ", budget $it" } ?: ""}.
Message context: $rawMessage
Return ONLY the caption text, max 100 characters.""")

    suspend fun rewrite(text: String, contactName: String, locality: String?, budget: String?): Result<String> =
        callApi("""Rewrite this WhatsApp broadcast message to be more engaging and conversational while keeping all key information. Return ONLY the rewritten message, no explanations.

Contact: $contactName${locality?.let { ", $it" } ?: ""}${budget?.let { ", $it" } ?: ""}
Original message: $text""")

    private suspend fun callApi(prompt: String): Result<String> {
        val key = aiConfig.geminiApiKey
        if (!aiConfig.hasValidKey) return Result.failure(IllegalStateException("No valid API key"))

        return withContext(Dispatchers.IO) {
            try {
                val url = URL("$baseUrl?key=$key")
                val conn = url.openConnection() as HttpURLConnection
                conn.apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    connectTimeout = 30_000
                    readTimeout = 30_000
                }

                val body = JSONObject().apply {
                    put("contents", JSONArray().apply {
                        put(JSONObject().apply {
                            put("parts", JSONArray().apply {
                                put(JSONObject().apply { put("text", prompt) })
                            })
                        })
                    })
                    put("generationConfig", JSONObject().apply {
                        put("temperature", 0.7)
                        put("maxOutputTokens", 256)
                    })
                }

                OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }

                val responseCode = conn.responseCode
                if (responseCode != 200) {
                    val error = BufferedReader(InputStreamReader(conn.errorStream)).readText()
                    return@withContext Result.failure(Exception("API $responseCode: $error"))
                }

                val response = BufferedReader(InputStreamReader(conn.inputStream)).readText()
                val json = JSONObject(response)
                val text = json.getJSONArray("candidates")
                    .optJSONObject(0)
                    ?.getJSONObject("content")
                    ?.getJSONArray("parts")
                    ?.optJSONObject(0)
                    ?.optString("text", "")
                    ?.trim() ?: ""

                if (text.isEmpty()) Result.failure(Exception("Empty response"))
                else Result.success(text)
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }
}
