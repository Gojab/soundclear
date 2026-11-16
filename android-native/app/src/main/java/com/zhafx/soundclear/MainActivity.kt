package com.zhafx.soundclear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.zhafx.soundclear.ui.SoundClearRoot
import com.zhafx.soundclear.ui.theme.SoundClearTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val container = (application as SoundClearApp).container

        setContent {
            SoundClearTheme {
                SoundClearRoot(container = container)
            }
        }
    }
}

