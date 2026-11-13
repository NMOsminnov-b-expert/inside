package kg.osmotr

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kg.osmotr.core.File
import kg.osmotr.core.Telemetry
import kg.osmotr.ui.PdfOpen

/**
 * Системный PdfRenderer — один открытый документ на приложение. Обращения — строго по очереди:
 * PdfRenderer не допускает двух страниц сразу, а страницы просят и лента просмотра, и плитки папки.
 * Открытие разбирает весь PDF — поэтому документ держится открытым, а не открывается на каждую страницу.
 */
object PdfDocs {
    private var path: String? = null
    private var fd: ParcelFileDescriptor? = null
    private var renderer: PdfRenderer? = null
    private var sizes: List<Pair<Float, Float>> = emptyList()

    /** Предел картинки: больше — память на одну страницу (ARGB, 4 байта на точку) выходит за 64 МБ. */
    private const val MAX_SIDE = 4096
    private const val MAX_PIXELS = 16_000_000L

    @Synchronized
    fun open(file: File): PdfOpen {
        if (path == file.path && renderer != null) return PdfOpen.Pages(sizes)
        closeCurrent()
        return try {
            val f = ParcelFileDescriptor.open(java.io.File(file.path), ParcelFileDescriptor.MODE_READ_ONLY)
            val r = try { PdfRenderer(f) } catch (e: Throwable) { f.close(); throw e }
            val s = (0 until r.pageCount).map { i -> r.openPage(i).use { it.width.toFloat() to it.height.toFloat() } }
            fd = f; renderer = r; path = file.path; sizes = s
            if (s.isEmpty()) PdfOpen.Broken else PdfOpen.Pages(s)
        } catch (e: SecurityException) {
            // Пароль на открытие (на Android 15+ PdfRenderer умеет и с паролем, но его у нас не спрашивают).
            PdfOpen.Locked
        } catch (e: Throwable) {
            Telemetry.event("pdf", "не открылся: ${e.javaClass.simpleName}")
            PdfOpen.Broken
        }
    }

    @Synchronized
    fun render(file: File, page: Int, scale: Float, x: Int, y: Int, w: Int, h: Int, quarters: Int = 0): ImageBitmap? = runCatching {
        if (open(file) !is PdfOpen.Pages) return null
        val r = renderer ?: return null
        if (page !in 0 until r.pageCount || w <= 0 || h <= 0) return null
        // Слишком большой кусок — уменьшить целиком, сохранив пропорции (а не обрезать и не сплющить): вытянутая
        // страница выше 4096 точек обрезалась по стороне и растягивалась на экране.
        val k = minOf(1.0, MAX_SIDE.toDouble() / w, MAX_SIDE.toDouble() / h, kotlin.math.sqrt(MAX_PIXELS.toDouble() / (w.toLong() * h)))
        val s = (scale * k).toFloat()
        var bw = w; var bh = h
        if (k < 1.0) { bw = (w * k).toInt().coerceAtLeast(1); bh = (h * k).toInt().coerceAtLeast(1) }
        r.openPage(page).use { p ->
            val bmp = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888)
            bmp.eraseColor(Color.WHITE)  // у PDF фон прозрачный
            val pw = p.width * s; val ph = p.height * s
            val m = Matrix().apply {
                postScale(s, s)
                // Поворот — вокруг угла страницы, затем страница возвращается в начало координат.
                when (quarters % 4) {
                    1 -> { postRotate(90f); postTranslate(ph, 0f) }
                    2 -> { postRotate(180f); postTranslate(pw, ph) }
                    3 -> { postRotate(270f); postTranslate(0f, pw) }
                }
                postTranslate((-x * k).toFloat(), (-y * k).toFloat())
            }
            p.render(bmp, null, m, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            bmp.asImageBitmap()
        }
    }.getOrNull()

    @Synchronized
    fun close(file: File) { if (path == file.path) closeCurrent() }

    private fun closeCurrent() {
        runCatching { renderer?.close() }; runCatching { fd?.close() }
        renderer = null; fd = null; path = null; sizes = emptyList()
    }
}
