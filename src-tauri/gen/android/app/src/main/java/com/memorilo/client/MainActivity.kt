package com.memorilo.client

import android.os.Bundle
import android.view.View
import android.view.WindowManager
import androidx.core.view.WindowCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WindowCompat.setDecorFitsSystemWindows(window, true)
    window.clearFlags(
      WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_LAYOUT_INSET_DECOR or
        WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS,
    )
    window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
    window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
  }
}
