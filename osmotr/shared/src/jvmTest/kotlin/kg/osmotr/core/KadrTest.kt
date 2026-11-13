package kg.osmotr.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File as JFile

/**
 * Кадр своей камеры (19.10.2026): имя в папке предмета → временный файл → проверка → своё имя →
 * регистрация. Галерея и сборщик из DCIM больше не участвуют.
 */
class KadrTest {
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var dir: File

    private val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 1, 2, 3, 4, 5, 0xFF.toByte(), 0xD9.toByte())

    @Before fun setUp() {
        Store.init(File(tmp.root.path), File(tmp.root.path + "/.app")); Store.ensureRoot()
        dir = File(Store.root.path + "/Насос 1")
    }

    private fun shoot(k: Kadr, slot: Kadr.Slot, bytes: ByteArray = jpeg) { slot.tmp.writeBytes(bytes) }

    @Test fun серия_в_одну_секунду_разные_имена() {
        val k = Kadr(dir)
        val now = 1_760_000_000_000L
        val slots = (1..5).map { k.reserve(now) }
        assertEquals("пять кадров — пять имён", 5, slots.map { it.target.name }.toSet().size)
        slots.forEach { shoot(k, it) }
        // Дописываются в другом порядке, чем сняты, — каждый на своё место.
        slots.reversed().forEach { assertTrue(k.finish(it).isSuccess) }
        val names = JFile(dir.path).listFiles()!!.map { it.name }.filter { it.endsWith(".jpg") }.sorted()
        assertEquals(slots.map { it.target.name }.sorted(), names)
        assertTrue("временных не осталось", JFile(dir.path).listFiles()!!.none { it.name.endsWith(".tmp") })
    }

    @Test fun кадр_сразу_в_папке_предмета_и_не_скрытый() {
        val k = Kadr(dir)
        val s = k.reserve()
        assertEquals("временный — в той же папке (переименование, не копия)", s.target.parentFile, s.tmp.parentFile)
        assertTrue("временный скрыт от галереи и экрана", s.tmp.name.startsWith("."))
        shoot(k, s)
        val f = k.finish(s).getOrThrow()
        assertEquals(dir.path, f.parentFile!!.path)
        assertTrue(f.name.startsWith("Насос 1_") && f.name.endsWith(".jpg"))
        assertTrue("виден экрану папки", Store.photosIn(dir).any { it.name == f.name })
    }

    @Test fun оборванный_кадр_не_ложится() {
        val k = Kadr(dir)
        val s = k.reserve()
        shoot(k, s, jpeg.copyOf(jpeg.size - 2))  // нет FF D9 — запись оборвалась
        assertTrue(k.finish(s).isFailure)
        assertFalse(s.target.exists())
        assertFalse(s.tmp.exists())
        // Имя освободилось — следующий кадр может его взять.
        val again = k.reserve(Platform.nowMs())
        shoot(k, again); assertTrue(k.finish(again).isSuccess)
    }

    @Test fun камера_не_записала_и_отказ_камеры() {
        val k = Kadr(dir)
        val empty = k.reserve()
        assertTrue("файла нет — отказ", k.finish(empty).isFailure)
        val failed = k.reserve()
        failed.tmp.writeBytes(byteArrayOf(1))
        k.abort(failed)
        assertFalse(failed.tmp.exists())
        assertTrue(JFile(dir.path).listFiles().orEmpty().none { it.isFile && !it.name.startsWith(".") })
    }

    @Test fun чужой_файл_с_тем_же_именем_не_затирается() {
        val k = Kadr(dir)
        val s = k.reserve()
        s.target.writeBytes(byteArrayOf(9, 9, 9))  // кто-то положил файл с этим именем, пока кадр писался
        shoot(k, s)
        assertTrue(k.finish(s).isFailure)
        assertEquals(3L, s.target.length())
    }

    @Test fun целый_jpeg() {
        val f = File(tmp.newFile("a.jpg").path)
        f.writeBytes(jpeg); assertTrue(Kadr.isWholeJpeg(f))
        f.writeBytes(byteArrayOf(0xFF.toByte(), 0xD8.toByte())); assertFalse(Kadr.isWholeJpeg(f))
        f.writeBytes(ByteArray(0)); assertFalse(Kadr.isWholeJpeg(f))
    }
}
