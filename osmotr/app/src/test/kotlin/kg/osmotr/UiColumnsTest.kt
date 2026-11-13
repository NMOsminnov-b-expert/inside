package kg.osmotr

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performSemanticsAction
import androidx.test.ext.junit.runners.AndroidJUnit4
import kg.osmotr.core.File
import kg.osmotr.core.Inventory
import kg.osmotr.core.Objects
import kg.osmotr.core.Xlsx
import kg.osmotr.ui.ColumnsScreen
import kg.osmotr.ui.LocalHost
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * «Столбцы описи» (окно — без поля ввода, Robolectric его проверяет): листы, «брать лист», столбец, сохранение.
 * До 29.10.2026 тестов экрана не было вовсе (покрытие 0 %), ловила только матрица на эмуляторе.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w360dp-h800dp-xhdpi")
class UiColumnsTest {
    @get:Rule val compose = createComposeRule()
    @get:Rule val tmp = TemporaryFolder()
    private val rig by lazy { UiRig(compose, tmp.root.path) }

    /** Как опись матрицы: «Сводка» и «Опись» на 12 шкафов со стоимостью. */
    private fun опись(): File {
        val src = File("${tmp.root.path}/src.xlsx")
        Xlsx.writeBook(src, listOf(
            Xlsx.Out("Сводка", listOf(listOf("Объект", "Матрица"), listOf("Предметов", 12))),
            Xlsx.Out("Опись", listOf(listOf("№ п/п", "Наименование", "Инв. номер", "Стоимость")) +
                (1..12).map { listOf(it, "Шкаф металлический $it", "МТ-${100 + it}", 1000 * it) }),
        ))
        val bytes = src.readBytes()
        return Inventory.create("Мебель", File(Objects.create("Склад"), Objects.MACHINES)) { it.write(bytes) }
    }

    private fun open(inv: File, saved: () -> Unit = {}) =
        compose.setContent { CompositionLocalProvider(LocalHost provides rig.host) { ColumnsScreen(inv, onClose = {}, onSaved = saved) } }

    /**
     * Нажать — действием доступности, не касанием: в окне Robolectric (360×800) переключатель «брать лист» внизу
     * панели, а столбец D — за правым краем таблицы, и касание по их середине туда не попадает (на эмуляторе
     * касание работает — матрица, «столбцы: …»).
     */
    private fun act(tag: String) {
        compose.onNode(androidx.compose.ui.test.hasTestTag(tag), true).performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        compose.waitForIdle()
    }
    private fun toggleSheet() = act("брать лист")

    @Test fun лист_не_брать_и_вернуть() {
        rig.init()
        val inv = опись()
        open(inv)
        rig.waitFor("лист с предметами выбран сам") { rig.has("Лист «Опись»: 12 предметов") && rig.has("Сводка  ·  не взят") }
        toggleSheet()
        rig.waitFor("лист не взят") { rig.has("Лист «Опись» не взят в опись") && rig.has("Опись  ·  не взят") }
        toggleSheet()
        rig.waitFor("снова 12") { rig.has("Лист «Опись»: 12 предметов") && rig.has("Опись  ·  12") }
    }

    @Test fun столбец_не_брать_и_сохранить() {
        rig.init()
        val inv = опись()
        var saved = false
        open(inv) { saved = true }
        rig.waitFor("стоимость подобрана") { rig.has("Лист «Опись»: 12 предметов") && rig.count("подпись столбца") >= 3 }
        act("столбец D")
        rig.waitFor("окно столбца") { rig.has("Столбец D") && rig.has("Не брать этот столбец") }
        rig.click("Не брать этот столбец")
        rig.waitFor("сохранить можно") { rig.has("Как решит приложение") }
        rig.clickTag("сохранить")
        rig.waitFor("сохранено") { saved }
        assertTrue("выбор — в описи", Inventory.choicesOf(inv).sheets.isNotEmpty())
        assertEquals(12, Inventory.parse(Inventory.fileIn(inv)!!).items.size)
    }
}
