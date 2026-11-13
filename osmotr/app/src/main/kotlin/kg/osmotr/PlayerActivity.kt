package kg.osmotr

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.MediaController
import android.widget.Toast
import android.widget.VideoView
import androidx.activity.ComponentActivity

/**
 * Видео из папки — внутри приложения (автор, 03.11.2026: «Видео надо уметь проигрывать и внутри приложения»):
 * системный VideoView с панелью управления, «назад» закрывает. Не играет — сказать и закрыть.
 */
class PlayerActivity : ComponentActivity() {
    private lateinit var video: VideoView
    private var position = 0

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        val path = intent.getStringExtra(PATH) ?: return finish()
        position = state?.getInt(POSITION) ?: 0
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        video = VideoView(this)
        root.addView(video, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
        val controls = MediaController(this).apply { setAnchorView(video) }
        video.setMediaController(controls)
        video.setOnPreparedListener { video.seekTo(position); video.start(); controls.show(3000) }
        video.setOnErrorListener { _, _, _ ->
            Toast.makeText(this, "Видео не воспроизводится", Toast.LENGTH_LONG).show(); finish(); true
        }
        video.setVideoPath(path)
        setContentView(root)
    }

    override fun onPause() { super.onPause(); position = video.currentPosition; video.pause() }

    override fun onSaveInstanceState(out: Bundle) { super.onSaveInstanceState(out); out.putInt(POSITION, video.currentPosition) }

    companion object {
        private const val PATH = "path"
        private const val POSITION = "position"
        fun intent(context: Context, path: String) = Intent(context, PlayerActivity::class.java).putExtra(PATH, path)
    }
}
