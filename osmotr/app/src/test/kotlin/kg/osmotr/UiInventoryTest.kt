package kg.osmotr

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import kg.osmotr.core.File
import kg.osmotr.core.Inventory
import kg.osmotr.core.Search
import kg.osmotr.core.Store
import kg.osmotr.core.Xlsx
import kg.osmotr.ui.Picked
import kg.osmotr.ui.Screen
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Опись — действия её меню и что видно в строках (реестр сценариев tools/matrix/scenarios.py). */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w360dp-h800dp-xhdpi")
class UiInventoryTest {
    @get:Rule val compose = createComposeRule()
    @get:Rule val tmp = TemporaryFolder()
    private val rig by lazy { UiRig(compose, tmp.root.path) }

    private fun book(rows: List<List<Any>>): ByteArray {
        val f = File(tmp.root.path + "/book-${System.nanoTime()}.xlsx")
        Xlsx.writeBook(f, listOf(Xlsx.Out("Опись", rows)))
        return f.readBytes()
    }

    @Test fun год_виден_в_строке_предмета() {
        rig.init()
        val obj = rig.inventory()
        rig.start(Screen.Inventory(obj))
        rig.waitFor("год в строке") { rig.has("2015 г.") && rig.has("2018 г.") }
    }

    @Test fun прикрепить_опись_к_начатой_папке() {
        rig.init()
        val dir = Store.createFolder(Store.root, "Цех")!!
        rig.books = listOf(Picked("Цех.xlsx", book(listOf(listOf("№", "Наименование", "Инв. номер"), listOf(1, "Станок токарный", "СТ-1")))))
        rig.start(Screen.Browser(dir))
        rig.menu("Прикрепить опись")
        rig.waitFor("опись в папке") { Inventory.fileIn(dir) != null }
        rig.waitFor("предмет на экране") { rig.has("Станок токарный") }
    }

    @Test fun импорт_осмотренного_из_меню() {
        rig.init()
        val obj = rig.inventory()
        rig.books = listOf(Picked("осмотрено.xlsx", book(listOf(listOf("№", "Инв. номер"), listOf(1, "МТ-102")))))
        rig.start(Screen.Inventory(obj))
        rig.menu("Импорт осмотренного")
        rig.click("Отметить осмотренными", exact = false)
        rig.waitFor("отмечен") {
            val st = Inventory.status(obj)
            Inventory.parse(Inventory.fileIn(obj)!!).items.filter(st::inspected).map { Search.compact(it.inventory) } == listOf(Search.compact("МТ-102"))
        }
    }
}
