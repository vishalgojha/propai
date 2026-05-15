package com.chaoscraft.wablaster.util

import android.content.SharedPreferences
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AiConfig @Inject constructor(
    private val prefs: SharedPreferences
) {
    var geminiApiKey: String
        get() = prefs.getString(KEY_API_KEY, "") ?: ""
        set(value) = prefs.edit().putString(KEY_API_KEY, value).apply()

    val hasValidKey: Boolean get() = geminiApiKey.isNotBlank() && geminiApiKey.startsWith("AI")

    companion object {
        private const val KEY_API_KEY = "gemini_api_key"
    }
}
