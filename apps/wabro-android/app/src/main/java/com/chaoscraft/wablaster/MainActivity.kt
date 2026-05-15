package com.chaoscraft.wablaster

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity

/**
 * Legacy compatibility shim. All runtime entry should converge on V2MainActivity.
 */
class MainActivity : ComponentActivity() {
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
