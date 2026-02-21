package app.tauri.android.statusbar

import android.app.Activity
import android.graphics.Color
import android.view.View
import android.view.WindowManager
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

@InvokeArg
class SetFullscreenArgs {
  var fullscreen: Boolean = false
  var statusBarColor: String? = null
}

@TauriPlugin
class AndroidStatusbarPlugin(private val activity: Activity) : Plugin(activity) {
  private var contentPadding: IntArray? = null
  private var fullscreenEnabled: Boolean = false
  private var insetsListenerAttached: Boolean = false

  @Command
  fun setFullscreen(invoke: Invoke) {
    val args = invoke.parseArgs(SetFullscreenArgs::class.java)

    activity.runOnUiThread {
      val window = activity.window
      val controller = WindowCompat.getInsetsController(window, window.decorView)
      val content = window.decorView.findViewById<View>(android.R.id.content)
      fullscreenEnabled = args.fullscreen
      if (content != null) {
        if (contentPadding == null) {
          contentPadding = intArrayOf(
            content.paddingLeft,
            content.paddingTop,
            content.paddingRight,
            content.paddingBottom,
          )
        }
        if (!insetsListenerAttached) {
          ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
            val base = contentPadding ?: intArrayOf(0, 0, 0, 0)
            if (fullscreenEnabled) {
              view.setPadding(base[0], base[1], base[2], base[3])
            } else {
              val systemInsets = insets.getInsets(WindowInsetsCompat.Type.systemBars())
              view.setPadding(
                base[0] + systemInsets.left,
                base[1] + systemInsets.top,
                base[2] + systemInsets.right,
                base[3] + systemInsets.bottom,
              )
            }
            insets
          }
          insetsListenerAttached = true
        }
      }
      if (args.fullscreen) {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        controller.hide(WindowInsetsCompat.Type.statusBars())
        controller.systemBarsBehavior =
          WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      } else {
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS)
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        args.statusBarColor?.let { colorValue ->
          val parsedColor = runCatching { Color.parseColor(colorValue) }.getOrNull()
          if (parsedColor != null) {
            window.statusBarColor = parsedColor
            content?.setBackgroundColor(parsedColor)
          }
        }
        controller.show(WindowInsetsCompat.Type.statusBars())
        controller.systemBarsBehavior =
          WindowInsetsControllerCompat.BEHAVIOR_SHOW_BARS_BY_SWIPE
      }
      if (content != null) {
        ViewCompat.requestApplyInsets(content)
      }
      invoke.resolve()
    }
  }
}
