package com.chaoscraft.wablaster.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import com.chaoscraft.wablaster.BuildConfig
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import javax.inject.Inject
import javax.inject.Singleton

data class AppVersionInfo(
    @SerializedName("versionCode") val versionCode: Int,
    @SerializedName("versionName") val versionName: String,
    @SerializedName("apkUrl") val apkUrl: String,
    @SerializedName("releaseNotes") val releaseNotes: String?,
    @SerializedName("forceUpdate") val forceUpdate: Boolean = false
)

sealed class UpdateResult {
    data object Installing : UpdateResult()
    data class Failed(val message: String) : UpdateResult()
}

@Singleton
class AppUpdateManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val httpClient: OkHttpClient,
    private val gson: Gson
) {
    companion object {
        private const val VERSION_URL = "https://app.propai.live/api/wabro/app-version"
        private const val APK_DIR = "apk"
        private const val APK_FILE = "wabro-update.apk"
    }

    suspend fun checkForUpdate(): AppVersionInfo? = withContext(Dispatchers.IO) {
        runCatching {
            val request = Request.Builder()
                .url(VERSION_URL)
                .get()
                .build()

            val response = httpClient.newCall(request).execute()
            if (!response.isSuccessful) return@runCatching null

            val body = response.body?.string().orEmpty()
            gson.fromJson(body, AppVersionInfo::class.java)
        }.getOrNull()
    }

    fun needsUpdate(remote: AppVersionInfo): Boolean {
        return remote.versionCode > BuildConfig.VERSION_CODE
    }

    suspend fun downloadAndInstall(versionInfo: AppVersionInfo): UpdateResult =
        withContext(Dispatchers.IO) {
            runCatching {
                val apkDir = File(context.cacheDir, APK_DIR)
                apkDir.mkdirs()

                val existing = apkDir.listFiles()
                if (existing != null) {
                    for (f in existing) {
                        if (f.name.endsWith(".apk")) f.delete()
                    }
                }

                val apkFile = File(apkDir, APK_FILE)

                val request = Request.Builder()
                    .url(versionInfo.apkUrl)
                    .get()
                    .build()

                val response = httpClient.newCall(request).execute()
                if (!response.isSuccessful) {
                    return@runCatching UpdateResult.Failed("Download failed (HTTP ${response.code})")
                }

                val body = response.body ?: return@runCatching UpdateResult.Failed("Empty response body")
                val totalBytes = body.contentLength()

                FileOutputStream(apkFile).use { output ->
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    var totalRead = 0L
                    val source = body.byteStream()

                    while (source.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        totalRead += bytesRead
                    }
                }

                triggerInstall(apkFile)
                UpdateResult.Installing
            }.getOrElse { e ->
                UpdateResult.Failed(e.message ?: "Unknown error")
            }
        }

    private fun triggerInstall(apkFile: File) {
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apkFile
        )

        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                flags = flags or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
        }

        runCatching {
            context.startActivity(intent)
        }.onFailure {
            // fallback: open the file URI directly if FileProvider intent fails
            val fallbackIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(Uri.fromFile(apkFile), "application/vnd.android.package-archive")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            runCatching {
                context.startActivity(fallbackIntent)
            }
        }
    }
}
