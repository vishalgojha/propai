package com.chaoscraft.wablaster

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity

/**
 * Transitional launcher shim retained for compatibility while V2MainActivity is canonical.
 */
class V2LaunchActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(
            Intent(this, V2MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
        )
        finish()
    }
}
