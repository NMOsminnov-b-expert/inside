package kg.osmotr.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.io.File as JFile

/**
 * Параллельные очереди (автор, 19.10.2026: «Пусть всё дообрабатывается в фоне… чтобы не было
 * конфликтов, если 3–4 параллельные очереди»): кадры нескольких заходов камеры — в одну папку и в
 * разные — дописываются вперемешку, тем временем галерея кладёт фото в ту же папку. Ни один файл не
 * теряется и не затирается, имена не повторяются, временных не остаётся.
 */
class KadrQueuesTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun jpeg(tag: Int) = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), (tag shr 8).toByte(), tag.toByte(), 7, 0xFF.toByte(), 0xD9.toByte())

    @Test fun четыре_очереди_и_галерея_без_конфликтов() {
        Store.init(File(tmp.root.path), File(tmp.root.path + "/.app")); Store.ensureRoot()
        val a = File(Store.root.path + "/Насос 1")
        val b = File(Store.root.path + "/Насос 2")
        // Два захода в одну папку (вернулись снимать, пока прежние кадры пишутся) и два — в другую.
        val queues = listOf(Kadr(a), Kadr(a), Kadr(b), Kadr(b))
        val perQueue = 40
        val now = 1_760_000_000_000L  // все кадры — в одну секунду: имена различаются только номером
        val written = Collections.synchronizedList(mutableListOf<Pair<String, Int>>())
        val pool = Executors.newFixedThreadPool(8)
        val start = CountDownLatch(1)
        var tag = 0
        val jobs = mutableListOf<java.util.concurrent.Future<*>>()
        queues.forEachIndexed { qi, k ->
            repeat(perQueue) {
                val t = synchronized(this) { ++tag }
                jobs += pool.submit {
                    start.await()
                    val slot = k.reserve(now)
                    Thread.sleep((t * 7 % 5).toLong())         // камера пишет кадр — разное время
                    slot.tmp.writeBytes(jpeg(t))
                    val r = k.finish(slot)
                    if (r.isSuccess) written += r.getOrThrow().path to t
                    else error("кадр $t очереди $qi не лёг: ${r.exceptionOrNull()?.message}")
                }
            }
        }
        // Галерея — в ту же папку, тем же временем, параллельно с камерой.
        val gallery = (1..20).map { 10_000 + it }
        jobs += pool.submit {
            start.await()
            gallery.forEach { t -> Store.addPhotos(a, listOf(Triple("x.jpg", jpeg(t), now))).forEach { written += it.path to t } }
        }
        start.countDown()
        jobs.forEach { it.get(60, TimeUnit.SECONDS) }
        pool.shutdown()

        val total = queues.size * perQueue + gallery.size
        assertEquals("каждый кадр — свой файл", total, written.map { it.first }.toSet().size)
        // На диске — ровно столько, и в каждом — свои байты (ничего не затёрто чужим кадром).
        val onDisk = (JFile(a.path).listFiles()!! + JFile(b.path).listFiles()!!).filter { it.isFile && it.name.endsWith(".jpg") }
        assertEquals(total, onDisk.size)
        written.forEach { (path, t) -> assertTrue("файл $path — свой кадр", JFile(path).readBytes().contentEquals(jpeg(t))) }
        assertTrue("временных не осталось", (JFile(a.path).listFiles()!! + JFile(b.path).listFiles()!!).none { it.name.endsWith(".tmp") })
        // Резерв имён пуст — следующая съёмка начнёт с первого свободного номера.
        val next = Store.newPhotoFile(a, "jpg", now); Store.releasePhotoName(next)
        assertTrue(!next.exists())
    }

    @Test fun имя_не_отдаётся_дважды_пока_пишется() {
        Store.init(File(tmp.root.path), File(tmp.root.path + "/.app")); Store.ensureRoot()
        val d = File(Store.root.path + "/П")
        val first = Store.newPhotoFile(d, "jpg", 0L)
        val second = Store.newPhotoFile(d, "jpg", 0L)
        assertTrue("второму — другое имя, хотя первого файла на диске нет", first.name != second.name)
        Store.releasePhotoName(first)
        assertEquals("освобождённое — снова свободно", first.name, Store.newPhotoFile(d, "jpg", 0L).name)
    }
}
