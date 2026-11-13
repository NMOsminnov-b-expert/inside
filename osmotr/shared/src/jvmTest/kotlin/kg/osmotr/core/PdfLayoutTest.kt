package kg.osmotr.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Лента страниц PDF: увеличение в точке пальцев, границы, видимые страницы, текущая, переход, поворот. */
class PdfLayoutTest {
    private val a4 = 595f to 842f
    private fun near(a: Float, b: Float, what: String) = assertTrue(abs(a - b) < 0.5f, "$what: $a ≠ $b")

    @Test fun страницы_по_ширине_экрана_с_промежутком() {
        val l = PdfLayout(listOf(a4, 842f to 595f, a4), viewW = 1000f, viewH = 1500f, gap = 10f)
        near(l.heights[0], 1415f, "A4 стоя"); near(l.heights[1], 707f, "A4 лёжа")
        near(l.tops[1], 1425f, "вторая — под первой через промежуток")
        near(l.height, 1415f + 10f + 707f + 10f + 1415f, "вся лента")
    }

    @Test fun увеличение_держит_точку_под_пальцами_и_не_уводит_за_края() {
        val l = PdfLayout(listOf(a4, a4), 1000f, 1500f)
        l.zoomAt(2f, 500f, 700f)
        // Точка ленты, что была под пальцами (500, 700), — там же.
        near((l.x + 500f) / l.zoom, 500f, "по ширине"); near((l.y + 700f) / l.zoom, 700f, "по высоте")
        l.panBy(5000f, 5000f)
        assertEquals(0f, l.x); assertEquals(0f, l.y)
        l.panBy(-99999f, -99999f)
        near(l.x, 1000f * 2 - 1000f, "правый край"); near(l.y, l.height * 2 - 1500f, "низ ленты")
        l.zoomAt(100f, 0f, 0f); assertEquals(PdfLayout.MAX_ZOOM, l.zoom)
        l.zoomAt(0.001f, 0f, 0f); assertEquals(1f, l.zoom); assertEquals(0f, l.x)
    }

    @Test fun видимые_и_текущая_страница_переход() {
        val l = PdfLayout(List(10) { a4 }, 1000f, 1500f)
        assertEquals(0..1, l.visible())
        assertEquals(0, l.current())
        l.goTo(4)
        assertEquals(4, l.current())
        assertTrue(4 in l.visible())
        // Конец ленты: середина экрана ещё на предпоследней, но страница — последняя.
        l.panBy(0f, -1e9f)
        assertEquals(9, l.current())
        l.goTo(99); assertEquals(9, l.current())
    }

    @Test fun видимая_часть_страницы_при_увеличении() {
        val l = PdfLayout(listOf(a4), 1000f, 1500f)
        l.zoomAt(3f, 0f, 0f)
        val p = l.visiblePart(0)!!
        near(p.x, 0f, "слева"); near(p.w, 1000f, "по ширине экрана"); near(p.h, 1500f, "по высоте экрана")
        near(l.scaleOf(0), 1000f / 595f * 3f, "пикселей на пункт")
        l.panBy(0f, -1e9f); l.panBy(-1e9f, 0f)
        val q = l.visiblePart(0)!!
        near(q.x + q.w, 3000f, "правый край страницы"); near(q.y + q.h, l.heights[0] * 3, "низ страницы")
        val far = PdfLayout(listOf(a4, a4, a4), 1000f, 500f)
        assertNull(far.visiblePart(2), "третья страница за экраном")
    }

    @Test fun положение_переживает_поворот() {
        val l = PdfLayout(List(5) { a4 }, 1000f, 1500f)
        l.zoomAt(2f, 500f, 750f); l.goTo(3)
        val r = l.relative()
        // Лёжа экран вдвое шире: страница той же ширины на экране — кратность 1, а не 2 (текст не вырастает).
        val wide = PdfLayout(List(5) { a4 }, 2000f, 900f).apply { restore(r) }
        assertEquals(1f, wide.zoom)
        assertEquals(1.5f, PdfLayout(List(5) { a4 }, 1333.3334f, 900f).apply { restore(r) }.zoom, 0.01f)
        assertEquals(3, PdfLayout(List(5) { a4 }, 1000f, 1500f).apply { restore(r) }.current())
        assertEquals(2f, PdfLayout(List(5) { a4 }, 1000f, 1500f).apply { restore(r) }.zoom)
        assertTrue(wide.current() in 3..4, "та же страница: ${wide.current()}")
    }

    @Test fun пустой_и_странный_pdf() {
        val l = PdfLayout(emptyList(), 1000f, 1500f)
        assertTrue(l.visible().isEmpty()); assertEquals(0, l.current())
        val zero = PdfLayout(listOf(0f to 0f), 1000f, 1500f)
        assertTrue(zero.heights[0] > 0f, "страница без размера — как A4, не схлопывается")
    }
}
