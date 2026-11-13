package kg.osmotr.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.zip.ZipFile

/**
 * Архив частями (автор, 21.10.2026: «Под каждый из вариантов мессенджера своё ограничение»;
 * «Архивы должны при распаковке в одну папку сами образовать нужную нам структуру»).
 */
class ZipSplitTest {
    @get:Rule val tmp = TemporaryFolder()

    // Несжимаемые, как снимки JPEG: ZipWriter сжимает только то, что сжимается.
    private fun bytes(n: Int, seed: Int) = ByteArray(n).also { java.util.Random(seed.toLong()).nextBytes(it) }

    /** Архив, как его собирает «Отправить архивом»: опись, папки предметов, снимки разного размера, Unicode-имена. */
    private fun archive(): Pair<File, Map<String, ByteArray>> {
        val files = linkedMapOf<String, ByteArray>()
        files["Объект «Сложный»/Опись — Объект.xlsx"] = bytes(40_000, 1)
        for (i in 1..12) files["Объект «Сложный»/МТ-${100 + i}/МТ-${100 + i}_20261021_08000${i % 10}_001.jpg"] = bytes(150_000 + i * 9_000, i)
        files["Объект «Сложный»/МТ-105/Комментарий.txt"] = "нет на месте".encodeToByteArray()
        files["Объект «Сложный»/МТ-107/видео.mp4"] = bytes(1_300_000, 99)   // крупнее предела
        val zip = File(tmp.root.path + "/Объект 2026-10-21 08-00.zip")
        zip.sink { s -> val w = ZipWriter(s); files.forEach { (n, b) -> w.add(n, b) }; w.finish() }
        return zip to files
    }

    @Test fun части_самостоятельны_не_больше_предела_и_складываются_в_ту_же_структуру() {
        val (zip, files) = archive()
        val limit = 600_000L
        val r = ZipSplit.split(zip, limit, File(tmp.root.path + "/Части"))
        assertTrue("больше одной части", r.parts.size > 1)
        assertEquals(listOf("Объект «Сложный»/МТ-107/видео.mp4"), r.oversized)
        val merged = HashMap<String, ByteArray>()
        for (p in r.parts) {
            val names = ZipFile(java.io.File(p.file.path)).use { z -> z.entries().toList().map { it.name } }
            // Каждая часть открывается сама: обычный ZipFile, CRC проверяются при чтении.
            ZipFile(java.io.File(p.file.path)).use { z -> z.entries().toList().forEach { e -> merged[e.name] = z.getInputStream(e).readBytes() } }
            if (names.none { it in r.oversized }) assertTrue("часть ${p.file.name} ${p.bytes} > $limit", p.bytes <= limit)
            assertTrue(p.file.name.matches(Regex("""Объект 2026-10-21 08-00 — часть \d+ из ${r.parts.size}\.zip""")))
        }
        // Все части вместе — ровно исходные файлы по тем же путям, ни одного дважды.
        assertEquals(files.keys, merged.keys)
        files.forEach { (n, b) -> assertTrue(n, b.contentEquals(merged[n])) }
        assertEquals(files.size, r.parts.sumOf { it.entries })
    }

    @Test fun повторное_разбиение_заменяет_прежние_части() {
        val (zip, _) = archive()
        val dir = File(tmp.root.path + "/Части")
        val many = ZipSplit.split(zip, 400_000L, dir).parts.size
        val few = ZipSplit.split(zip, 1_000_000L, dir).parts.size
        assertTrue(many > few)
        assertEquals(few, dir.listFiles()!!.count { it.name.endsWith(".zip") })
    }

    @Test fun архив_меньше_предела_одной_частью() {
        val (zip, files) = archive()
        val r = ZipSplit.split(zip, 100_000_000L, File(tmp.root.path + "/Части"))
        assertEquals(1, r.parts.size)
        assertEquals(files.size, r.parts[0].entries)
    }
}
