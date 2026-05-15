package com.chaoscraft.wablaster.service

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts

class MediaTrampolineActivity : ComponentActivity() {

    private val pickMedia = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            grantUriPermission("com.whatsapp", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            grantUriPermission("com.whatsapp.w4b", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        MediaAttachment.result = uri
        finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val mimeType = intent.getStringExtra(EXTRA_MIME_TYPE) ?: "image/*"
        pickMedia.launch(arrayOf(mimeType))
    }

    companion object {
        const val EXTRA_MIME_TYPE = "extra_mime_type"
    }
}

object MediaAttachment {
    @Volatile
    var result: Uri? = null
}
