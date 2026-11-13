package kg.osmotr

import androidx.compose.ui.test.doubleClick
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.test.ext.junit.runners.AndroidJUnit4
import kg.osmotr.core.File
import kg.osmotr.core.Objects
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

/** Просмотр PDF: страницы, номер и переход, увеличение с чётким куском, отказы, место, плитка, дубль документа. */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w360dp-h800dp-xhdpi")
class UiPdfTest {
    @get:Rule val compose = createComposeRule()
    @get:Rule val tmp = TemporaryFolder()
    private val rig by lazy { UiRig(compose, tmp.root.path) }
    private val pdf = "%PDF-1.4\n%%EOF\n".encodeToByteArray()

    private fun docs(name: String = "Техпаспорт.pdf"): File {
        val dir = File(Objects.create("Школа"), Objects.DOCS)
        return Store.addFile(dir, name) { it.write(pdf) }
    }
    private fun page() = compose.onAllNodes(hasTestTag("страницы pdf"), true).onFirst()
    /** Ползунок страниц — на страницу [index] (с нуля), как его двигает и TalkBack. */
    private fun slide(index: Int) {
        rig.waitFor("ползунок") { rig.count("ползунок страниц") > 0 }
        compose.onAllNodes(hasTestTag("ползунок страниц"), true).onFirst()
            .performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.SetProgress) { it(index.toFloat()) }
    }

    @Test fun номер_страницы_и_переход() {
        rig.init()
        rig.pdfSizes = List(12) { 595f to 842f }
        val f = docs()
        rig.start(Screen.Pdf(f))
        rig.waitFor("первая страница") { rig.has("1 / 12") && rig.renders.isNotEmpty() }
        rig.clickTag("номер страницы")
        slide(6)
        rig.waitFor("седьмая") { rig.has("7 / 12") && rig.has("Страница 7 из 12") }
        rig.clickDesc("Следующая страница")
        rig.waitFor("восьмая") { rig.has("8 / 12") }
        rig.click("Закрыть")
        // Листание вверх пальцем — дальше по документу.
        page().performTouchInput { swipeUp() }
        rig.waitFor("после листания — не седьмая") { !rig.has("7 / 12") }
    }

    @Test fun одна_страница_ползунок_не_уводит_за_последнюю() {
        rig.init()
        rig.pdfSizes = listOf(595f to 842f)
        rig.start(Screen.Pdf(docs("Свидетельство.pdf")))
        rig.waitFor("открыт") { rig.has("1 / 1") }
        rig.clickTag("номер страницы")
        slide(1)
        rig.waitFor("по-прежнему первая") { rig.has("Страница 1 из 1") && !rig.has("Страница 2 из 1") }
    }

    @Test fun поворот_страницы_запоминается_миниатюры_ведут_к_листу() {
        rig.init()
        rig.pdfSizes = List(6) { 595f to 842f }
        val f = docs()
        rig.start(Screen.Pdf(f))
        rig.waitFor("открыт") { rig.has("1 / 6") }
        rig.clickTag("повернуть страницу")
        rig.waitFor("страница на боку, поворот записан") { File(f.parentFile!!, ".${f.name}.поворот").isFile }
        // Под нагрузкой всего набора первое касание приходило, пока экран перекладывался после поворота, — повторить.
        repeat(3) { if (rig.count("миниатюры") == 0) { rig.clickTag("номер страницы"); runCatching { rig.waitFor("миниатюры", 4_000) { rig.count("миниатюры") == 1 } } } }
        rig.waitFor("миниатюры") { rig.count("миниатюры") == 1 }
        rig.clickTag("миниатюра 3")
        rig.waitFor("третья") { rig.has("3 / 6") }
    }

    @Test fun увеличение_двойным_касанием_рисует_чёткий_кусок() {
        rig.init()
        val f = docs()
        rig.start(Screen.Pdf(f))
        rig.waitFor("основа") { rig.renders.any { it.third == (0 to 0) } }
        val baseScale = rig.renders.first().second
        page().performTouchInput { doubleClick(center) }
        // После увеличения — кусок страницы в масштабе больше основы (шильдик, мелкий текст читаются).
        rig.waitFor("чёткий кусок", 5_000) { rig.renders.any { it.second > baseScale * 2f } }
    }

    @Test fun пароль_битый_и_открыть_в_другом_приложении() {
        rig.init()
        val locked = docs("Договор с паролем.pdf")
        rig.start(Screen.Pdf(locked), Screen.Pdf(File(locked.parentFile!!, "битый.pdf").also { it.writeBytes(pdf) }))
        rig.waitFor("битый") { rig.has("PDF не открывается") }
        rig.click("Открыть в другом приложении")
        assertEquals("application/pdf", rig.external.single().second)
        rig.clickDesc("Назад")
        rig.waitFor("с паролем") { rig.has("PDF защищён паролем") }
        rig.clickDesc("Открыть в другом приложении")
        assertEquals(listOf("битый.pdf", "Договор с паролем.pdf"), rig.external.map { it.first.name })
    }

    @Test fun место_помнится_при_возврате() {
        rig.init()
        rig.pdfSizes = List(12) { 595f to 842f }
        val f = docs()
        // Под PDF — папка документов: «назад» и снова открыть.
        rig.start(Screen.Browser(f.parentFile!!), Screen.Pdf(f))
        rig.waitFor("открыт") { rig.has("1 / 12") }
        rig.clickTag("номер страницы"); slide(8); rig.click("Закрыть")
        rig.waitFor("девятая") { rig.has("9 / 12") }
        rig.clickDesc("Назад")
        rig.clickTag("pdf")
        rig.waitFor("снова девятая") { rig.has("9 / 12") }
    }

    @Test fun плитка_первой_страницей_и_дубль_не_копируется() {
        rig.init()
        val obj = Objects.create("Школа")
        val dir = File(obj, Objects.DOCS)
        rig.files = listOf(Picked("Техпаспорт.pdf", pdf))
        rig.start(Screen.Browser(dir))
        rig.clickTag("добавить документ")
        rig.waitFor("лёг") { rig.count("pdf") == 1 }
        // Плитка — первой страницей шириной 240: просили нарисовать страницу 0 целиком.
        rig.waitFor("миниатюра") { rig.renders.any { it.first == 0 && it.third == (0 to 0) } }
        // Тот же документ ещё раз — не копируется.
        rig.clickTag("добавить документ")
        rig.waitFor("сказано, что уже лежит") { rig.toasts.any { "уже лежит: 1" in it } }
        assertEquals(1, Store.list(dir).pdfs.size)
        assertTrue(dir.listFiles()!!.none { "(2)" in it.name })
    }
}
