package com.chaoscraft.wablaster.util

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings

data class ValidationResult(
    val isValid: Boolean,
    val errors: List<String> = emptyList(),
    val warnings: List<String> = emptyList()
)

class AppValidator(private val context: Context) {

    fun validateAll(): ValidationResult {
        val errors = mutableListOf<String>()
        val warnings = mutableListOf<String>()

        val batteryOptCheck = isBatteryOptimizationIgnored()
        if (!batteryOptCheck) {
            warnings.add("Battery optimization is not disabled - background sync may be interrupted")
        }

        return ValidationResult(
            isValid = errors.isEmpty(),
            errors = errors,
            warnings = warnings
        )
    }

    fun isWhatsAppInstalled(): Boolean {
        return try {
            context.packageManager.getPackageInfo("com.whatsapp", 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            try {
                context.packageManager.getPackageInfo("com.whatsapp.w4b", 0)
                true
            } catch (_: PackageManager.NameNotFoundException) {
                false
            }
        }
    }

    fun getWhatsAppVersion(): String {
        return try {
            val pkg = context.packageManager.getPackageInfo("com.whatsapp", 0)
            pkg.versionName ?: "unknown"
        } catch (_: PackageManager.NameNotFoundException) {
            try {
                val pkg = context.packageManager.getPackageInfo("com.whatsapp.w4b", 0)
                pkg.versionName ?: "unknown"
            } catch (_: PackageManager.NameNotFoundException) {
                "not_installed"
            }
        }
    }

    fun isAccessibilityServiceEnabled(): Boolean {
        val service = "${context.packageName}/com.chaoscraft.wablaster.service.WhatsAppAccessibilityService"
        return try {
            val enabledServices = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            )
            enabledServices?.contains(service) == true
        } catch (_: Exception) {
            false
        }
    }

    fun isBatteryOptimizationIgnored(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
        return powerManager?.isIgnoringBatteryOptimizations(context.packageName) ?: false
    }

    fun canDrawOverlays(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        return Settings.canDrawOverlays(context)
    }

    fun isLegacyAutomationReady(): Boolean {
        return isWhatsAppInstalled() && isAccessibilityServiceEnabled()
    }

    fun isNotificationPermissionGranted(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }
}
