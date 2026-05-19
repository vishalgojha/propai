package com.chaoscraft.wablaster.media

import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MediaHelper @Inject constructor(
    @ApplicationContext private val context: Context
) {

    fun copyToCache(uri: Uri, mimeType: String): Uri {
        val extension = when {
            mimeType.startsWith("image/") -> ".jpg"
            mimeType == "application/pdf" -> ".pdf"
            else -> ".bin"
        }

        val subDir = when {
            mimeType.startsWith("image/") -> "images"
            else -> "documents"
        }

        val cacheDir = File(context.cacheDir, subDir)
        if (!cacheDir.exists()) cacheDir.mkdirs()

        val file = File.createTempFile("media_", extension, cacheDir)
        context.contentResolver.openInputStream(uri)?.use { input ->
            file.outputStream().use { output ->
                input.copyTo(output)
            }
        }

        return FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )
    }

    fun getMimeType(uri: Uri): String {
        return context.contentResolver.getType(uri) ?: "image/*"
    }

    fun readBytes(uri: Uri): ByteArray {
        return context.contentResolver.openInputStream(uri)?.use { input ->
            input.readBytes()
        } ?: error("Unable to read media")
    }

    fun getDisplayName(uri: Uri): String {
        if (uri.scheme == "file") {
            return uri.lastPathSegment ?: "upload.bin"
        }

        val cursor: Cursor? = context.contentResolver.query(
            uri,
            arrayOf(OpenableColumns.DISPLAY_NAME),
            null,
            null,
            null
        )
        cursor?.use {
            if (it.moveToFirst()) {
                val index = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) {
                    return it.getString(index) ?: "upload.bin"
                }
            }
        }
        return uri.lastPathSegment ?: "upload.bin"
    }
}
