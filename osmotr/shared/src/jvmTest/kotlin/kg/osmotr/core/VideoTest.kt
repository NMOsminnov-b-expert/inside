package kg.osmotr.core

import kg.osmotr.ui.Host
import kg.osmotr.ui.Picked
import kg.osmotr.ui.Shot
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** Видео (автор, 20.10.2026: «как фото, счёт отдельно»): в папке, в счёте, в отчёте, в архиве и журнале. */
class VideoTest {
    @get:Rule val tmp = TemporaryFolder()
    private val mp4 = ByteArray(4000) { (it % 251).toByte() }

    private fun setUp(): Pair<File, List<Inventory.Item>> {
        Store.init(File(tmp.root.path), File(tmp.root.path + "/.app")); Store.ensureRoot()
        Journal.forget()
        val obj = Store.createFolder(Store.root, "Склад")!!
        Xlsx.writeBook(File(obj, Inventory.PREFIX + "Склад.xlsx"), listOf(Xlsx.Out("Опись", listOf(listOf("№", "Наименование", "Инв. номер"),
            listOf("1", "Шкаф", "МТ-101"), listOf("2", "Стол", "МТ-102")))))
        return obj to Inventory.parse(Inventory.fileIn(obj)!!).items
    }

    @Test fun видео_считается_отдельно_и_предмет_осмотрен() {
        val (obj, items) = setUp()
        val dir = Inventory.openFolder(obj, items[0])
        val v = Store.newPhotoFile(dir, "mp4"); v.writeBytes(mp4); Store.releasePhotoName(v); Store.videoSaved(v)
        assertTrue(Store.isVideo(v)); assertTrue(!Store.isPhoto(v))
        assertEquals(listOf(v.name), Store.list(dir).videos.map { it.name })
        assertTrue("снимков нет", Store.list(dir).photos.isEmpty())
        val st = Inventory.status(obj)
        assertEquals(1, st.videosOf(items[0])); assertEquals(0, st.photosOf(items[0]))
        assertTrue("только видео — осмотрен", st.inspected(items[0]))
        assertTrue(!st.inspected(items[1]))
        val tile = Store.list(obj).folders.first { it.dir == dir }
        assertEquals(1, tile.videos); assertEquals(0, tile.photos)
        // Отчёт — столбец «Видео».
        val f = Inventory.reportFor(obj, Inventory.ReportKind.ALL).single()
        val sheet = Xlsx.sheets(f.readBytes()).first { it.name != "Итог" && it.rows.firstOrNull()?.contains("Видео") == true }
        val h = sheet.rows[0]
        assertEquals("1", sheet.rows.first { "МТ-101" in it }[h.indexOf("Видео")])
        assertEquals("Да", sheet.rows.first { "МТ-101" in it }[h.indexOf("Осмотрено")])
    }

    @Test fun видео_в_архиве_и_журнале() {
        val (obj, items) = setUp()
        val dir = Inventory.openFolder(obj, items[0])
        val v = Store.newPhotoFile(dir, "mp4"); v.writeBytes(mp4); Store.releasePhotoName(v); Store.videoSaved(v)
        assertTrue("журнал следит за видео", Journal.tracked(obj).any { it.name == v.name })
        val host = object : Host {
            override fun takePhotos(dir: File) {}
            override suspend fun afterResume(): Shot? = null
            override fun canWrite() = true
            override fun requestStorage() {}
            override fun pickBooks(multiple: Boolean, got: (List<Picked>) -> Unit) {}
            override fun share(files: List<File>, mime: String, title: String) {}
            override fun toast(text: String, long: Boolean) {}
            override val pickPhone: ((got: (String, String) -> Unit) -> Unit)? = null
            override val cacheDir: File get() = File(tmp.root.path + "/.cache")
        }
        val z = runBlocking { kg.osmotr.ui.zipItems(host, listOf(obj), Store.root, "Склад") {} }
        val names = java.util.zip.ZipFile(java.io.File(z.file.path)).use { zf -> zf.entries().toList().map { it.name } }
        assertTrue("видео в архиве: $names", names.any { it.endsWith(v.name) })
        assertTrue("архив остался в выгрузках", z.file.parentFile == host.exportsDir)
    }
}
