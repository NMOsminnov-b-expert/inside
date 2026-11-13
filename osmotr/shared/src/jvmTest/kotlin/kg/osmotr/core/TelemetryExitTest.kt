package kg.osmotr.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Выход процесса со слов системы (ApplicationExitInfo) — отчётом рядом с падениями Kotlin, без личного. */
class TelemetryExitTest {
    private fun fresh() {
        val d = java.nio.file.Files.createTempDirectory("tel").toFile()
        Store.init(File(d.absolutePath), File(java.io.File(d, "app").absolutePath))
        Telemetry.dir().deleteRecursively()
        Telemetry.start("Android", "3.11", "Android 16 (API 36)", "Xiaomi 2502FRA65G")
    }

    @Test fun зависание_отчётом_и_предлагается_отправить() {
        fresh()
        Telemetry.systemExit("зависание (ANR)", Platform.nowMs(), "Input dispatching timed out · на экране",
            "\"main\" prio=5 tid=1 Blocked\n  at kg.osmotr.core.Store.list(Store.kt:120)\nзвонить +996 555 123 456")
        val f = Telemetry.unsentCrashes()
        assertEquals(1, f.size)
        val body = f[0].readText()
        assertTrue("Сбой «Осмотра» со слов системы" in body && "зависание (ANR)" in body && "Store.list" in body, body)
        assertFalse("555 123 456" in body, "номер телефона вычищен")
        assertTrue("<номер>" in body)
    }

    @Test fun падение_kotlin_рядом_со_своим_файлом_не_дублируется() {
        fresh()
        val now = Platform.nowMs()
        Telemetry.crash(IllegalStateException("снимок"))
        assertTrue(Telemetry.crashedNear(now + 3_000))
        assertFalse(Telemetry.crashedNear(now + 60_000))
    }

    @Test fun пути_с_названиями_описей_вычищаются() {
        val t = Telemetry.clean("E MediaScanner: failed /storage/emulated/0/Осмотры/Корпус A/1. МТ-101/IMG_1.jpg size 12")
        assertFalse("Корпус" in t || "МТ-101" in t, t)
        assertTrue(t.startsWith("E MediaScanner: failed /storage/emulated/0/Осмотры/<…>"), t)
    }

    @Test fun пути_служебных_папок_с_названиями_описей_вычищаются() {
        val t = Telemetry.clean("IllegalArgumentException: Failed to find configured root that contains /data/data/kg.osmotr/files/cache/reports/Осмотр — Корпус A — отчёт.xlsx")
        assertFalse("Корпус" in t, t)
        assertTrue("kg.osmotr/<…>" in t, t)
    }

    @Test fun в_списке_отчётов_дата_цела() {
        fresh()
        Telemetry.systemExit("падение нативного кода", Platform.nowMs(), "crash · на экране", "SIGSEGV")
        val r = Telemetry.reports().single()
        assertTrue(Regex("""\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}""").matches(r.whenText), r.whenText)
        assertEquals("Падение нативного кода", r.title)
    }
}
