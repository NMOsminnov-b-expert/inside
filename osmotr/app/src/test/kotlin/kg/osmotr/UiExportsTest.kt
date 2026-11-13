package kg.osmotr

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import kg.osmotr.core.File
import kg.osmotr.core.Inventory
import kg.osmotr.core.Store
import kg.osmotr.ui.Screen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Выгрузка описи и экран «Выгрузки» (реестр сценариев tools/matrix/scenarios.py). */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w360dp-h800dp-xhdpi")
class UiExportsTest {
    @get:Rule val compose = createComposeRule()
    @get:Rule val tmp = TemporaryFolder()
    private val rig by lazy { UiRig(compose, tmp.root.path) }

    private fun entries(f: File) = java.util.zip.ZipFile(java.io.File(f.path)).use { z -> z.entries().toList().map { it.name } }

    @Test fun архив_за_сегодня_и_новое_с_прошлой() {
        rig.init()
        val obj = rig.inventory()
        val items = Inventory.parse(Inventory.fileIn(obj)!!).items
        val shkaf = Inventory.openFolder(obj, items[0])
        Store.addPhotos(shkaf, listOf(Triple("a.jpg", rig.jpeg, null)))
        rig.start(Screen.Inventory(obj))
        // Всё архивом — снимок в архиве; архив остался в «Выгрузках».
        rig.clickDesc("Выгрузить опись")
        rig.click("Всё архивом")
        rig.waitFor("отправлен архив") { rig.shared.size == 1 }
        val all = rig.shared.last().first.single()
        assertTrue(entries(all).any { it.endsWith(".jpg") })
        assertTrue("лежит в выгрузках", all.parentFile == rig.host.exportsDir)
        // Новый снимок — «Новое с прошлой выгрузки»: только он.
        Thread.sleep(1100)
        val stol = Inventory.openFolder(obj, items[1])
        val fresh = Store.addPhotos(stol, listOf(Triple("b.jpg", rig.jpeg, null))).single()
        rig.clickDesc("Выгрузить опись")
        rig.click("Новое с прошлой выгрузки", exact = false)
        rig.waitFor("второй архив") { rig.shared.size == 2 }
        val jpgs = entries(rig.shared.last().first.single()).filter { it.endsWith(".jpg") }
        assertEquals("только новый снимок", listOf(fresh.name), jpgs.map { it.substringAfterLast('/') })
        // За сегодня — оба.
        rig.clickDesc("Выгрузить опись")
        rig.click("За сегодня", exact = false)
        rig.waitFor("третий архив") { rig.shared.size == 3 }
        assertEquals(2, entries(rig.shared.last().first.single()).count { it.endsWith(".jpg") })
        assertEquals("архивы не затираются", 3, rig.host.exportsDir.listFiles()!!.count { it.name.endsWith(".zip") })
    }

    @Test fun список_части_и_удаление() {
        rig.init()
        val dir = rig.host.exportsDir.apply { mkdirs() }
        // Архив ~40 МБ несжимаемых «снимков» — больше предела почты (18 МБ).
        val zip = File(dir, "Склад 2026-10-21 08-00.zip")
        zip.sink { s ->
            val w = kg.osmotr.core.ZipWriter(s)
            repeat(4) { i -> w.add("Склад/МТ-10$i/s$i.jpg", ByteArray(10_000_000).also { java.util.Random(i.toLong()).nextBytes(it) }) }
            w.finish()
        }
        // Окно «По частям» с полем ввода в Robolectric не проверить (среда не дожидается затишья) —
        // его проверяет путь матрицы «выгрузки: архив остаётся, частями, удалить» на устройстве.
        // Здесь части уже есть: «Части» отправляет их, удаление убирает и их.
        val parts = kg.osmotr.core.ZipSplit.split(zip, 18L * 1048576, File(File(dir, "Части"), zip.nameWithoutExtension)).parts.map { it.file }
        assertTrue("частей не меньше трёх: ${parts.size}", parts.size >= 3)
        rig.start(Screen.Exports)
        rig.waitFor("архив в списке") { rig.has("Склад 2026-10-21 08-00") && rig.has("частей: ${parts.size}") }
        rig.click("Отправить")
        assertEquals(listOf(zip.name), rig.shared.last().first.map { it.name })
        rig.click("Части")
        assertEquals(parts.map { it.name }, rig.shared.last().first.map { it.name })
        rig.clickDesc("Удалить")
        rig.click("Удалить")
        rig.waitFor("удалён вместе с частями") { !zip.exists() && parts.none { it.exists() } }
    }
}
