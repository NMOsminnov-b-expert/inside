package kg.osmotr.core

import kotlin.math.max
import kotlin.math.min

/**
 * Лента страниц PDF: страницы друг под другом, каждая — по ширине экрана [viewW], между ними [gap].
 * Увеличение [zoom] — всей ленты сразу, в точке пальцев; сдвиг [x], [y] — где левый верхний угол экрана
 * на увеличенной ленте. Геометрия отдельно от экрана: её проверяют тесты, экран только рисует.
 *
 * [pages] — размеры страниц в пунктах PDF (ширина, высота).
 */
class PdfLayout(val pages: List<Pair<Float, Float>>, val viewW: Float, viewH: Float, val gap: Float = 8f) {
    /** Высота страницы на ленте при zoom = 1. */
    val heights: List<Float> = pages.map { (w, h) -> if (w <= 0f) viewW * 1.414f else viewW * h / w }
    /** Верх страницы на ленте при zoom = 1. */
    val tops: List<Float> = heights.runningFold(0f) { acc, h -> acc + h + gap }.dropLast(1)
    val height: Float = if (pages.isEmpty()) 0f else tops.last() + heights.last()

    /** Высота экрана: меняется (клавиатура, плашки) без пересборки ленты — страницы уже нарисованы по ширине. */
    var viewH = viewH
        set(v) { field = v; clamp() }

    var zoom = 1f; private set
    var x = 0f; private set
    var y = 0f; private set

    /** Сколько пикселей экрана на пункт PDF у страницы [page] при текущем увеличении. */
    fun scaleOf(page: Int): Float = heights[page] / pages[page].second.coerceAtLeast(1f) * zoom

    private fun clamp() {
        x = x.coerceIn(0f, max(0f, viewW * zoom - viewW))
        y = y.coerceIn(0f, max(0f, height * zoom - viewH))
    }

    /** Увеличить в [factor] раз так, чтобы точка ленты под ([fx], [fy]) экрана осталась под пальцами. */
    fun zoomAt(factor: Float, fx: Float, fy: Float) {
        val z = (zoom * factor).coerceIn(MIN_ZOOM, MAX_ZOOM)
        val k = z / zoom
        x = (x + fx) * k - fx
        y = (y + fy) * k - fy
        zoom = z
        clamp()
    }

    /** Сдвинуть ленту: палец повёл на ([dx], [dy]) — содержимое едет за ним. */
    fun panBy(dx: Float, dy: Float) { x -= dx; y -= dy; clamp() }

    /** Поставить положение как есть (восстановление, анимация); лишнее обрезается. */
    fun set(zoom: Float, x: Float, y: Float) { this.zoom = zoom.coerceIn(MIN_ZOOM, MAX_ZOOM); this.x = x; this.y = y; clamp() }

    /** Страница — к верху экрана, увеличение прежнее. */
    fun goTo(page: Int) { y = tops[page.coerceIn(0, pages.lastIndex)] * zoom; clamp() }

    /** Прямоугольник страницы на экране: левый, верхний, правый, нижний. */
    fun screenRect(page: Int): FloatArray {
        val l = -x; val t = tops[page] * zoom - y
        return floatArrayOf(l, t, l + viewW * zoom, t + heights[page] * zoom)
    }

    /** Страницы, хоть краем попадающие на экран. */
    fun visible(): IntRange {
        if (pages.isEmpty()) return IntRange.EMPTY
        val top = y / zoom; val bottom = (y + viewH) / zoom
        val first = tops.indexOfLast { it <= top }.coerceAtLeast(0)
        var last = first
        while (last + 1 < pages.size && tops[last + 1] < bottom) last++
        return first..last
    }

    /** Текущая страница — та, на которую приходится середина экрана (последняя — если долистали до конца). */
    fun current(): Int {
        if (pages.isEmpty()) return 0
        if (y >= height * zoom - viewH - 1f && height * zoom > viewH) return pages.lastIndex
        val mid = (y + viewH / 2) / zoom
        return tops.indexOfLast { it <= mid }.coerceAtLeast(0)
    }

    /**
     * Видимая часть страницы [page] в пикселях отрисовки при текущем увеличении: (x, y, ширина, высота)
     * от левого верхнего угла страницы, и где она на экране. Нет на экране — null.
     */
    fun visiblePart(page: Int): Part? {
        val r = screenRect(page)
        val l = max(r[0], 0f); val t = max(r[1], 0f); val rr = min(r[2], viewW); val b = min(r[3], viewH)
        if (rr <= l || b <= t) return null
        return Part(l - r[0], t - r[1], rr - l, b - t, l, t)
    }

    class Part(val x: Float, val y: Float, val w: Float, val h: Float, val screenX: Float, val screenY: Float)

    /**
     * Положение для возврата и поворота: ширина страницы на экране в пикселях (не кратность — после
     * поворота текст остаётся того же размера, а не вырастает вдвое вместе с шириной экрана) и место в долях.
     */
    fun relative(): Triple<Float, Float, Float> =
        Triple(zoom * viewW, if (viewW * zoom > viewW) x / (viewW * zoom - viewW) else 0f, if (height > 0f) y / (height * zoom) else 0f)

    fun restore(r: Triple<Float, Float, Float>) {
        zoom = (r.first / viewW).coerceIn(MIN_ZOOM, MAX_ZOOM)
        x = r.second * max(0f, viewW * zoom - viewW)
        y = r.third * height * zoom
        clamp()
    }

    companion object {
        const val MIN_ZOOM = 1f
        const val MAX_ZOOM = 6f
    }
}
