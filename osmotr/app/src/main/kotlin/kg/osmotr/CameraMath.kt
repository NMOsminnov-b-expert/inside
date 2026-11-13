package kg.osmotr

import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Счёт камеры без самой камеры — объективы, ступени зума, выдержка, ISO, частота кадров в темноте.
 * Отдельно, чтобы проверять на компьютере (CameraMathTest): на эмуляторе одна камера и нет ручного
 * управления, а ошибки здесь видны только на чужом телефоне.
 */
object CameraMath {
    /** Объектив под желаемое увеличение: оптика, пока возможно, — самый длинный, что не длиннее желаемого; дальше — электронный зум на нём. */
    fun pickLens(desired: Float, lenses: List<Float>): Float =
        lenses.filter { it <= desired + 0.01f }.maxOrNull() ?: lenses.minOrNull() ?: 1f

    /**
     * Ступени зума кнопками, как в штатной камере: широкий (0.6 и т. п.), 1×, оптические телевики;
     * телевика нет — 2× (электронный), если зум до него достаёт.
     */
    fun zoomStops(min: Float, max: Float, optical: List<Float>): List<Float> {
        val out = sortedSetOf<Float>()
        if (min < 0.95f) out += min
        out += 1f
        val tele = optical.filter { it > 1.2f && it <= max + 0.01f }
        if (tele.isEmpty()) { if (max >= 2f) out += 2f } else out += tele
        return out.toList()
    }

    /**
     * Какую заднюю камеру открывать основной: ту, у которой зум начинается ниже всего (< 1) — это
     * камера, в которую телефон свёл объективы (ультраширик + основной + телевик, переключаются
     * зумом сами). Xiaomi отдаёт её отдельной логической камерой, а «камера по умолчанию» —
     * только основной объектив (зум от 1×), и 0.6 не было (21.10.2026). Нет такой — по умолчанию.
     * [cams] — (номер в списке, нижняя граница зума); [default] — номер камеры по умолчанию.
     */
    fun pickBase(cams: List<Pair<Int, Float>>, default: Int): Int =
        cams.filter { it.second < 0.95f }.minByOrNull { it.second }?.first ?: default

    /**
     * Годится ли отдельная задняя камера в объективы: ширик (< 0.9) или телевик (> 1.4) и не
     * вспомогательная — у датчиков глубины и макро по 2 Мп и фокус не наводится (Xiaomi отдаёт такую
     * приложениям, а ультраширик прячет; кнопка «1.1» вела бы на камеру глубины). [pixels] — точек
     * матрицы этой камеры, [mainPixels] — основной.
     */
    fun usefulLens(zoom: Float, pixels: Long, mainPixels: Long): Boolean =
        (zoom < 0.9f || zoom > 1.4f) && (mainPixels <= 0 || pixels >= mainPixels * 0.3)

    /** «0.6», «1», «2.5», «5». */
    fun zoomLabel(z: Float): String {
        val r = (z * 10).roundToInt() / 10f
        return if (abs(r - r.roundToInt()) < 0.05f) r.roundToInt().toString() else r.toString()
    }

    /**
     * Частота кадров, при которой в темноте выдержка длиннее: верх — как обычно (до 30), низ — как
     * можно ниже. Автоэкспозиция на свету держит верх, в темноте опускается — кадр светлее и без
     * режима ночи производителя (тот снимает серию с задержкой). null — выбирать не из чего.
     */
    fun lowLightFps(ranges: List<Pair<Int, Int>>): Pair<Int, Int>? {
        val fit = ranges.filter { it.second <= 30 && it.first < it.second }
        val top = fit.maxOfOrNull { it.second } ?: return null
        return fit.filter { it.second == top }.minByOrNull { it.first }
    }

    /** Выдержки привычного ряда (в наносекундах) внутри того, что даёт матрица. */
    fun shutterSteps(minNs: Long, maxNs: Long): List<Long> =
        SHUTTER.map { (1_000_000_000.0 / it).toLong() }.filter { it in minNs..maxNs }.sorted()

    private val SHUTTER = listOf(8000.0, 4000.0, 2000.0, 1000.0, 500.0, 250.0, 125.0, 60.0, 30.0, 15.0, 8.0, 4.0, 2.0, 1.0, 0.5, 0.25)

    /** «1/250», «1/4», «1 с», «2 с». */
    fun shutterLabel(ns: Long): String {
        val s = ns / 1e9
        return if (s >= 1) "${s.roundToInt()} с" else "1/${(1 / s).roundToInt()}"
    }

    /** ISO привычного ряда внутри того, что даёт матрица (края — свои). */
    fun isoSteps(min: Int, max: Int): List<Int> =
        (listOf(min) + listOf(50, 100, 200, 400, 800, 1600, 3200, 6400, 12800).filter { it in (min + 1) until max } + listOf(max)).distinct()

    /** Ручной фокус — доля ползунка 0 (бесконечность) … 1 (ближе всего) в диоптрии объектива. */
    fun focusDiopters(share: Float, minFocusDiopters: Float): Float = (share.coerceIn(0f, 1f) * minFocusDiopters)

    /** «∞», «2 м», «35 см», «8 см» — расстояние фокуса по диоптриям. */
    fun focusLabel(diopters: Float): String {
        if (diopters < 0.05f) return "∞"
        val m = 1 / diopters
        return if (m >= 1) "${(m * 10).roundToInt() / 10f} м".replace(".0 м", " м") else "${(m * 100).roundToInt()} см"
    }

    /** «0:07», «12:30» — сколько записано. */
    fun clock(ms: Long): String { val s = ms / 1000; return "${s / 60}:${(s % 60).toString().padStart(2, '0')}" }
}
