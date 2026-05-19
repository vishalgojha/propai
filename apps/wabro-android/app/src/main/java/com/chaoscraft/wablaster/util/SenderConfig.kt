package com.chaoscraft.wablaster.util

import android.content.SharedPreferences
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SenderConfig @Inject constructor(
    private val prefs: SharedPreferences
) {
    var selectedPackage: String
        get() = prefs.getString(KEY_PACKAGE, "") ?: ""
        set(value) = prefs.edit().putString(KEY_PACKAGE, value).apply()

    var senderNumber: String
        get() = prefs.getString(KEY_NUMBER, "") ?: ""
        set(value) = prefs.edit().putString(KEY_NUMBER, value).apply()

    var multiAccount: Boolean
        get() = prefs.getBoolean(KEY_MULTI_ACCOUNT, false)
        set(value) = prefs.edit().putBoolean(KEY_MULTI_ACCOUNT, value).apply()

    val isConfigured: Boolean get() = selectedPackage.isNotEmpty()

    fun clear() {
        prefs.edit()
            .remove(KEY_PACKAGE)
            .remove(KEY_NUMBER)
            .remove(KEY_MULTI_ACCOUNT)
            .apply()
    }

    companion object {
        private const val KEY_PACKAGE = "sender_package"
        private const val KEY_NUMBER = "sender_number"
        private const val KEY_MULTI_ACCOUNT = "sender_multi_account"
    }
}
