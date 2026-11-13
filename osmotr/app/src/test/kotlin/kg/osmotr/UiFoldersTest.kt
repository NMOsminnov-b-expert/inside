package kg.osmotr

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import kg.osmotr.core.File
import kg.osmotr.core.Inventory
import kg.osmotr.core.Store
import kg.osmotr.ui.Picked
import kg.osmotr.ui.Screen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Папки и снимки — каждое действие меню и выбора, как его делает человек (реестр сценариев
 * tools/matrix/scenarios.py; автор, 21.10.2026: «каждый путь, каждую вариацию покрыть»).
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w360dp-h800dp-xhdpi")
class UiFoldersTest {
    @get:Rule val compose = createComposeRule()
    @get:Rule val tmp = TemporaryFolder()
    private val rig by lazy { UiRig(compose, tmp.root.path) }

    @Test fun переместить_папку() {
        rig.init()
        val a = Store.createFolder(Store.root, "Корпус А")!!
        Store.createFolder(Store.root, "Корпус Б")!!
        val pump = Store.createFolder(a, "Насос")!!
        rig.start(Screen.Browser(pump))
        rig.menu("Переместить папку")
        rig.waitFor("дерево в окне", 15_000) { rig.texts().count { it == "Корпус Б" } >= 1 }
        rig.clickLast("Корпус Б")
        rig.click("Сюда")
        rig.waitFor("перенесена") { File(Store.root, "Корпус Б/Насос").isDirectory && !pump.exists() }
    }

    @Test fun удалить_папку_и_вернуть() {
        rig.init()
        val d = Store.createFolder(Store.root, "Насос")!!
        Store.addPhotos(d, listOf(Triple("a.jpg", rig.jpeg, null)))
        rig.start(Screen.Browser(Store.root), Screen.Browser(d))
        rig.menu("Удалить папку")
        rig.click("Удалить")
        rig.waitFor("удалена") { !d.exists() }
        rig.click("Вернуть")
        rig.waitFor("вернулась со снимком") { Store.photosIn(d).size == 1 }
    }

    @Test fun переместить_снимки() {
        rig.init()
        val d = Store.createFolder(Store.root, "Насос")!!
        Store.createFolder(d, "До ремонта")!!
        Store.addPhotos(d, List(2) { Triple("p$it.jpg", rig.jpeg, null) })
        rig.start(Screen.Browser(d))
        rig.waitFor("снимки") { rig.count("снимок") == 2 }
        rig.longTag("снимок")
        rig.clickTagAt("снимок", 1)
        rig.waitFor("выбраны оба") { rig.has("2") }
        rig.clickDesc("Переместить")
        rig.waitFor("окно переноса") { rig.has("Переместить: ") }
        // Дерево в окне строится в фоне — дождаться строки папки в нём (вторая «До ремонта» после плитки).
        rig.waitFor("дерево в окне", 15_000) { rig.texts().count { it == "До ремонта" } >= 2 }
        rig.clickLast("До ремонта")
        rig.click("Сюда")
        rig.waitFor("перенесены") { Store.photosIn(File(d, "До ремонта")).size == 2 && Store.photosIn(d).isEmpty() }
    }

    @Test fun из_галереи_в_папку() {
        rig.init()
        val d = Store.createFolder(Store.root, "Насос")!!
        rig.gallery = listOf(Picked("IMG_1.jpg", rig.jpeg), Picked("IMG_2.png", byteArrayOf(0x89.toByte(), 'P'.code.toByte(), 'N'.code.toByte(), 'G'.code.toByte()) + ByteArray(40)))
        rig.start(Screen.Browser(d))
        rig.clickTag("из галереи")
        rig.waitFor("легли") { Store.photosIn(d).size == 2 }
        assertEquals(setOf("jpg", "png"), Store.photosIn(d).map { it.extension }.toSet())
    }

    @Test fun просмотр_листать_удалить() {
        rig.init()
        val d = Store.createFolder(Store.root, "Насос")!!
        Store.addPhotos(d, List(2) { Triple("p$it.jpg", rig.jpeg, null) })
        rig.start(Screen.Browser(d))
        rig.waitFor("снимки") { rig.count("снимок") == 2 }
        rig.clickTag("снимок")
        rig.clickDesc("Отправить")
        assertEquals("отправлен один снимок", 1, rig.shared.single().first.size)
        rig.clickDesc("Удалить")
        rig.waitFor("удалён") { Store.photosIn(d).size == 1 }
    }

    @Test fun поворот_скана_запоминается_файл_не_меняется() {
        rig.init()
        val d = Store.createFolder(Store.root, "Насос")!!
        Store.addPhotos(d, listOf(Triple("скан.jpg", rig.jpeg, null)))
        val f = Store.photosIn(d).single()
        val before = f.readBytes()
        rig.start(Screen.Browser(d))
        rig.waitFor("снимок") { rig.count("снимок") == 1 }
        rig.clickTag("снимок")
        rig.clickDesc("Повернуть")
        rig.waitFor("на боку") { Store.turnsIn(d)[f.name] == 1 }
        rig.clickDesc("Повернуть"); rig.clickDesc("Повернуть"); rig.clickDesc("Повернуть")
        rig.waitFor("круг замкнулся") { Store.turnsIn(d)[f.name] == 0 }
        assertTrue("сам снимок не тронут", before.contentEquals(f.readBytes()))
        assertEquals("служебная отметка — не снимок", 1, Store.photosIn(d).size)
    }

    @Test fun контакты_добавить_и_удалить() {
        rig.init()
        val d = Store.createFolder(Store.root, "Насос")!!
        rig.start(Screen.Browser(d))
        rig.menu("Контакты")
        rig.click("Добавить")
        rig.type("Иванов Иван")
        rig.click("Готово")
        rig.waitFor("записан") { Store.contacts(d).singleOrNull()?.name == "Иванов Иван" }
        rig.click("Иванов Иван", exact = false)
        rig.clickDesc("Удалить")
        rig.click("Удалить")
        rig.waitFor("удалён") { Store.contacts(d).isEmpty() }
    }

    @Test fun предметы_из_описи_в_папку_и_убрать() {
        rig.init()
        val obj = rig.inventory()
        val shelf = Store.createFolder(obj, "Стеллаж")!!
        rig.start(Screen.Browser(shelf))
        rig.menu("Предметы из описи")
        rig.click("Шкаф металлический")
        rig.click("Стол письменный")
        rig.click("Готово", exact = false)
        fun held() = java.io.File(obj.path).walk().filter { it.name == Inventory.MEMBERS }.flatMap { it.readLines() }.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        rig.waitFor("два предмета в папке") { held() == setOf("МТ-101", "МТ-102") }
        // Убрать один — из карточки папки, куда вернулись после «Готово».
        rig.clickDesc("Убрать из папки")
        rig.waitFor("остался один") { held().size == 1 }
    }
}
