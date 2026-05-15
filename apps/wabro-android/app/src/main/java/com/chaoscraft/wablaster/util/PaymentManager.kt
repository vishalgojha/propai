package com.chaoscraft.wablaster.util

import android.content.Context
import android.content.SharedPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PaymentManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val prefs: SharedPreferences
        get() = context.getSharedPreferences("payment_prefs", Context.MODE_PRIVATE)

    var isUnlocked: Boolean
        get() {
            if (prefs.getBoolean(KEY_UNLOCKED, false)) return true
            val elapsed = System.currentTimeMillis() - installedAt
            return elapsed < TRIAL_MS
        }
        set(value) = prefs.edit().putBoolean(KEY_UNLOCKED, value).apply()

    var installedAt: Long
        get() = prefs.getLong(KEY_INSTALLED_AT, System.currentTimeMillis())
        set(value) = prefs.edit().putLong(KEY_INSTALLED_AT, value).apply()

    fun isTrialActive(): Boolean {
        if (isUnlocked) return false
        val elapsed = System.currentTimeMillis() - installedAt
        return elapsed < TRIAL_MS
    }

    fun trialDaysRemaining(): Int {
        val elapsed = System.currentTimeMillis() - installedAt
        val remaining = TRIAL_MS - elapsed
        if (remaining <= 0) return 0
        return (remaining / (24 * 60 * 60 * 1000L)).toInt() + 1
    }

    fun unlock() {
        isUnlocked = true
    }

    fun lock() {
        isUnlocked = false
        prefs.edit().putBoolean(KEY_UNLOCKED, false).apply()
    }

    companion object {
        private const val KEY_UNLOCKED = "app_unlocked"
        private const val KEY_INSTALLED_AT = "installed_at"
        private const val TRIAL_MS = 3 * 24 * 60 * 60 * 1000L
    }
}
