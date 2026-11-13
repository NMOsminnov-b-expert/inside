package kg.osmotr

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import kg.osmotr.core.Inventory
import kg.osmotr.ui.Screen
import androidx.compose.ui.test.click
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performTouchInput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Инструкции по осмотрам: вход с главного, разделы, поиск, подсказка в папке предмета, отправка бланка. */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w360dp-h800dp-xhdpi")
class UiInstructionsTest {
    @get:Rule val compose = createComposeRule()
    @get:Rule val tmp = TemporaryFolder()
    private val rig by lazy { UiRig(compose, tmp.root.path) }

    /** Высокий экран: список ленивый, а инструкций теперь 22. */
    @org.robolectric.annotation.Config(sdk = [35], qualifiers = "w360dp-h2400dp-xhdpi")
    @Test fun с_главного_список_и_инструкция_с_разделами() {
        rig.init()
        rig.start()
        rig.clickTag("значок инструкции")
        // Разделы списка — в порядке работы: порядок осмотра, как снимать, бумаги для организации.
        rig.waitFor("список") { rig.has("Быстрый осмотр") && rig.has("Недвижимость") && rig.has("Транспорт") && rig.has("Порядок осмотра") }
        rig.clickTag("инструкция: transformator")
        rig.waitFor("инструкция открыта") { rig.count("памятка") > 0 && rig.count("разделы") > 0 }
        rig.waitFor("раздел «Шильдик» в полосе") { rig.count("раздел: Шильдик") > 0 }
        // Памятка — на весь экран, с подписью «Памятка»; «назад» — к тексту.
        rig.clickTag("памятка")
        rig.waitFor("памятка на весь экран") { rig.hasExact("Памятка") && rig.has("1 из 5") }
        rig.clickDesc("Назад")
        // Касание раздела — прокрутка к нему; полоса держит текущий раздел на виду.
        rig.clickTag("раздел: Шильдик")
        rig.waitFor("раздел на экране") { rig.has("Обязательно сфотографировать основной шильдик") }
        rig.waitFor("текущий раздел в полосе") { rig.count("раздел: Шильдик") > 0 }
    }

    @Test fun поиск_ведёт_к_месту() {
        rig.init()
        rig.start(Screen.Instructions())
        rig.type("подтёки масла")
        rig.waitFor("найдено") { rig.has("Найдено:") }
        // Документ и раздел — отдельными строками; находка открывается с заголовком раздела над ней.
        val t = rig.texts()
        assertTrue(t.toString(), t.indexOf("Трансформатор") >= 0 && t[t.indexOf("Трансформатор") + 1] == "Состояние и износ")
        rig.click("Подтёки масла;")
        rig.waitFor("открыто на месте") { rig.hasExact("Подтёки масла;") && rig.hasExact("Состояние и износ") }
    }

    @Test fun ссылка_в_тексте_ведёт_к_пункту() {
        rig.init()
        // «(см. п. 4)» в разделе «3. Мелкие позиции» — касание по ссылке переносит к «4. Акт подтверждения наличия».
        rig.start(Screen.Instructions())
        rig.type("подтверждаются актом")
        rig.click("Остальные позиции подтверждаются актом (см. п. 4).")
        rig.waitFor("пункт со ссылкой") { rig.count("текст инструкции") > 0 && rig.hasExact("3. Мелкие позиции") }
        // Касание — точно по словам «п. 4»: их место берётся из раскладки текста.
        val node = compose.onAllNodes(androidx.compose.ui.test.hasText("Остальные позиции подтверждаются актом", substring = true), true).onFirst()
        val layouts = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
        node.fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult].action!!.invoke(layouts)
        val text = layouts.first().layoutInput.text.text
        val box = layouts.first().getBoundingBox(text.indexOf("п. 4") + 1)
        fun current(tag: String) = compose.onAllNodes(androidx.compose.ui.test.hasTestTag(tag) and androidx.compose.ui.test.isSelected(), true)
            .fetchSemanticsNodes().isNotEmpty()
        rig.waitFor("до касания — в разделе 3, полоса доехала до него") { current("раздел: 3. Мелкие позиции") }
        node.performTouchInput { click(box.center) }
        rig.waitFor("переехали к разделу 4") { current("раздел: 4. Акт подтверждения наличия") }
    }

    /** «InfoPC.bat» — ссылка в инструкцию по нему; «назад» — на то же место, а не туда, где кончился бы чужой текст. */
    @Test fun ссылка_в_другую_инструкцию_и_назад_на_место() {
        rig.init()
        fun current(tag: String) = compose.onAllNodes(androidx.compose.ui.test.hasTestTag(tag) and androidx.compose.ui.test.isSelected(), true)
            .fetchSemanticsNodes().isNotEmpty()
        rig.start(Screen.Instructions())
        rig.type("представителю организации передается")
        rig.click("Представителю организации передается программа InfoPC.bat;")
        rig.waitFor("раздел 5") { current("раздел: 5. Компьютеры") }
        val pc = compose.onAllNodes(androidx.compose.ui.test.hasText("Представителю организации передается", substring = true), true).onFirst()
        val layout = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
        pc.fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult].action!!.invoke(layout)
        val box = layout.first().getBoundingBox(layout.first().layoutInput.text.text.indexOf("InfoPC") + 2)
        pc.performTouchInput { click(box.center) }
        rig.waitFor("инструкция InfoPC") { rig.has("Порядок работы при сборе данных") }
        rig.clickDesc("Назад")
        rig.waitFor("снова раздел 5") { current("раздел: 5. Компьютеры") && rig.has("Представителю организации передается") }
    }

    @Test fun в_папке_предмета_подсказка_как_снимать() {
        rig.init()
        val obj = rig.inventory("Подстанция", listOf(listOf(1, "Трансформатор силовой ТМ-630", "ТП-1", 1987), listOf(2, "Стол письменный", "ТП-2", 2018)))
        val items = Inventory.parse(Inventory.fileIn(obj)!!).items
        // Под папкой трансформатора в стеке — папка стола: «назад» из инструкции и из папки ведёт к ней.
        rig.start(Screen.Browser(Inventory.openFolder(obj, items[1])), Screen.Browser(Inventory.openFolder(obj, items[0])))
        rig.waitFor("подсказка") { rig.has("Как снимать: Трансформатор") }
        rig.click("Как снимать: Трансформатор")
        rig.waitFor("инструкция") { rig.count("разделы") > 0 }
        rig.clickDesc("Назад")
        rig.waitFor("снова папка трансформатора") { rig.has("ТП-1") }
        // У стола инструкции нет — и подсказки нет.
        rig.clickDesc("Назад")
        rig.waitFor("папка стола") { rig.has("ТП-2") }
        assertEquals(0, rig.count("подсказка инструкции"))
    }

    @Test fun акт_отправляется_самим_pdf() {
        rig.init()
        rig.start(Screen.Instruction("akt"))
        rig.waitFor("бланк страницами") { rig.count("страница бланка") == 2 }
        rig.clickTag("отправить pdf")
        rig.waitFor("отправлено") { rig.shared.isNotEmpty() }
        val (files, mime) = rig.shared.last()
        assertEquals("application/pdf", mime)
        assertEquals("Акт подтверждения наличия имущества.pdf", files.single().name)
        assertTrue("PDF целиком", files.single().readBytes().decodeToString(0, 5) == "%PDF-")
        // Наружу файл уходит через FileProvider: папка кэша инструкций должна быть в его корнях, иначе
        // «Отправить» роняет приложение (так и было на устройстве 30.10.2026; подмена host здесь этого не видит).
        val ctx = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.content.Context>()
        val onDevice = java.io.File(ctx.cacheDir, "instructions/akt/" + files.single().name)
        androidx.core.content.FileProvider.getUriForFile(ctx, ctx.packageName + ".files", onDevice)
    }
}
