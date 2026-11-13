package kg.osmotr

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Счёт камеры (автор, 20.10.2026: 4:3, 0.6, оптический зум пока возможен, выдержка в темноте, ручные настройки). */
class CameraMathTest {
    @Test fun оптика_пока_возможна_потом_цифровой() {
        val lenses = listOf(1f, 0.6f, 3f)
        assertEquals(0.6f, CameraMath.pickLens(0.6f, lenses), 0f)
        assertEquals(1f, CameraMath.pickLens(1f, lenses), 0f)
        assertEquals(1f, CameraMath.pickLens(2f, lenses), 0f)    // 2× — цифровой на основном, телевик 3× ещё не включается
        assertEquals(3f, CameraMath.pickLens(3f, lenses), 0f)
        assertEquals(3f, CameraMath.pickLens(8f, lenses), 0f)    // дальше 3× — цифровой на телевике
    }
    @Test fun ступени_зума() {
        assertEquals(listOf(0.6f, 1f, 3f), CameraMath.zoomStops(0.6f, 30f, listOf(0.6f, 1f, 3f)))
        assertEquals(listOf(1f, 2f), CameraMath.zoomStops(1f, 8f, emptyList()))
        assertEquals(listOf(1f), CameraMath.zoomStops(1f, 1.5f, emptyList()))
    }
    @Test fun подписи() {
        assertEquals("0.6", CameraMath.zoomLabel(0.6f)); assertEquals("1", CameraMath.zoomLabel(1f)); assertEquals("2.5", CameraMath.zoomLabel(2.5f))
        assertEquals("1/250", CameraMath.shutterLabel(4_000_000L)); assertEquals("2 с", CameraMath.shutterLabel(2_000_000_000L))
        assertEquals("∞", CameraMath.focusLabel(0f)); assertEquals("35 см", CameraMath.focusLabel(2.86f)); assertEquals("2 м", CameraMath.focusLabel(0.5f))
    }
    @Test fun в_темноте_частота_кадров_ниже() {
        assertEquals(7 to 30, CameraMath.lowLightFps(listOf(30 to 30, 15 to 30, 7 to 30, 60 to 60, 24 to 24)))
        assertNull(CameraMath.lowLightFps(listOf(30 to 30)))
    }
    @Test fun ряды_выдержки_и_iso() {
        assertEquals(listOf(1_000_000L, 2_000_000L), CameraMath.shutterSteps(900_000L, 3_000_000L).filter { it <= 2_000_000L })
        assertEquals(listOf(50, 100, 200, 400, 800, 1600, 3200), CameraMath.isoSteps(50, 3200))
        assertEquals(listOf(64, 100, 800, 1000), CameraMath.isoSteps(64, 1000).filter { it != 200 && it != 400 && it != 1600 })
    }
    @Test fun основная_камера_с_ультрашириком() {
        // Xiaomi: 0 — основной (от 1×), 1 — сведённая (от 0.6×): открывать сведённую.
        assertEquals(1, CameraMath.pickBase(listOf(0 to 1f, 1 to 0.6f), 0))
        assertEquals(0, CameraMath.pickBase(listOf(0 to 1f, 1 to 1f), 0))
        assertEquals(2, CameraMath.pickBase(listOf(0 to 1f, 1 to 0.7f, 2 to 0.5f), 0))
    }
    @Test fun вспомогательные_камеры_не_объективы() {
        val main = 4080L * 3072
        assertEquals(false, CameraMath.usefulLens(1.07f, 1600L * 1200, main))   // глубина/макро 2 Мп (Xiaomi, камера 3)
        assertEquals(true, CameraMath.usefulLens(0.6f, 3264L * 2448, main))     // ультраширик 8 Мп
        assertEquals(true, CameraMath.usefulLens(3f, 4000L * 3000, main))       // телевик
        assertEquals(false, CameraMath.usefulLens(0.6f, 1600L * 1200, main))    // 2 Мп ширик — нет
    }
}
