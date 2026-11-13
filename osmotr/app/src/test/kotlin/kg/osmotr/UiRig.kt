package kg.osmotr

import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import androidx.test.core.app.ApplicationProvider
import kg.osmotr.core.File
import kg.osmotr.core.Inventory
import kg.osmotr.core.Journal
import kg.osmotr.core.Platform
import kg.osmotr.core.Store
import kg.osmotr.core.Xlsx
import kg.osmotr.ui.Host
import kg.osmotr.ui.PdfOpen
import kg.osmotr.ui.OsmotrApp
import kg.osmotr.ui.Picked
import kg.osmotr.ui.Screen
import kg.osmotr.ui.Shot
import org.junit.Assert.fail

/**
 * Стенд для тестов экранов (Robolectric): приложение целиком с поддельной платформой — что отправлено
 * наружу, какие сообщения показаны, что «выбрал» человек в галерее и среди файлов.
 */
class UiRig(private val compose: ComposeContentTestRule, private val root: String) {
    val shared = mutableListOf<Pair<List<File>, String>>()
    val toasts = mutableListOf<String>()
    var gallery: List<Picked> = emptyList()
    var books: List<Picked> = emptyList()
    /** Что «выбрано» среди файлов (снимки и PDF). */
    var files: List<Picked> = emptyList()
    val opened = mutableListOf<File>()
    /** Открыто во внешнем приложении (PDF: «Открыть в другом приложении»). */
    val external = mutableListOf<Pair<File, String>>()
    /** Что просили нарисовать: страница, масштаб, угол куска. */
    val renders = mutableListOf<Triple<Int, Float, Pair<Int, Int>>>()
    /** Размеры страниц PDF для подмены, пункты. */
    var pdfSizes: List<Pair<Float, Float>> = listOf(595f to 842f, 595f to 842f)

    val host = object : Host {
        override fun takePhotos(dir: File) {}
        override suspend fun afterResume(): Shot? = null
        override fun canWrite() = true
        override fun requestStorage() {}
        override fun pickBooks(multiple: Boolean, got: (List<Picked>) -> Unit) { got(books) }
        override val canPickGallery: Boolean get() = true
        override fun pickGallery(got: (List<Picked>) -> Unit) { got(gallery) }
        override fun share(files: List<File>, mime: String, title: String) { shared += files to mime }
        override fun toast(text: String, long: Boolean) { toasts += text }
        override val pickPhone: ((got: (String, String) -> Unit) -> Unit)? = null
        override val cacheDir: File get() = File("$root/.cache")
        override val exportsDir: File get() = File("$root/Загрузки/Осмотр")
        override fun openVideo(file: File) { opened += file }
        override val canPickFiles: Boolean get() = true
        override fun pickFiles(got: (List<Picked>) -> Unit) { got(files) }
        // PDF «рисуется» белым листом: проверяется путь к просмотру, а не PdfRenderer (его — на телефоне).
        // Страниц — сколько задано в [pdfSizes] (по умолчанию две A4); «замок» и битый — по имени файла.
        override suspend fun pdfOpen(file: File): PdfOpen = when {
            !Store.isPdf(file) || "битый" in file.name -> PdfOpen.Broken
            "парол" in file.name -> PdfOpen.Locked
            else -> PdfOpen.Pages(pdfSizes)
        }
        override suspend fun pdfRender(file: File, page: Int, scale: Float, x: Int, y: Int, w: Int, h: Int, quarters: Int) =
            androidx.compose.ui.graphics.ImageBitmap(w.coerceAtLeast(1), h.coerceAtLeast(1)).also { renders += Triple(page, scale, x to y) }
        override fun openExternal(file: File, mime: String) { external += file to mime }
    }

    val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte()) + ByteArray(200) { 7 } + byteArrayOf(0xFF.toByte(), 0xD9.toByte())

    /**
     * Часы композиции — вручную: поле ввода с мигающим курсором и бесконечные анимации не дают
     * экрану «успокоиться», и waitForIdle ждал бы вечно. Время двигаем сами, малыми шагами.
     */
    private fun settle(ms: Long = 64) { compose.mainClock.advanceTimeBy(ms); compose.waitForIdle() }

    fun init(migrate: Boolean = false) {
        compose.mainClock.autoAdvance = false
        kg.osmotr.ui.DialogFocus.auto = false
        Platform.context = ApplicationProvider.getApplicationContext()
        Store.init(File(root), File("$root/.app")); Store.ensureRoot()
        Journal.forget()
        // Стенд — «новая установка»: описи тестов лежат в корне, переносить их в «Осмотрено ранее» не надо.
        // Сам перенос — UiObjectsTest.прежнее_при_первом_запуске.
        if (migrate) Unit else kg.osmotr.core.Objects.markMigrated()
        // Загрузка описей — глобальная: окно и ждущие выбора объекта книги прошлого теста не тянуть.
        kg.osmotr.ui.InventoryImport.jobs.clear(); kg.osmotr.ui.InventoryImport.pending.value = null
    }

    /** Опись «Склад» из трёх шкафов (с годом) — своя папка. */
    fun inventory(name: String = "Склад", rows: List<List<Any>> = listOf(
        listOf(1, "Шкаф металлический", "МТ-101", 2015), listOf(2, "Стол письменный", "МТ-102", 2018), listOf(3, "Кресло офисное", "МТ-103", 2021),
    ), home: File = Store.root): File {
        val book = File("$root/$name-src.xlsx")
        Xlsx.writeBook(book, listOf(Xlsx.Out("Опись", listOf(listOf("№ п/п", "Наименование", "Инв. номер", "Год выпуска")) + rows)))
        val bytes = book.readBytes()
        return Inventory.create(name, home) { it.write(bytes) }
    }

    /** Присланное «Поделиться» — добавить сюда после start(). */
    val incoming = mutableStateListOf<Picked>()
    fun start(vararg screens: Screen) { compose.setContent { OsmotrApp(host, incoming, screens.toList()) }; settle(300) }

    fun waitFor(what: String = "", timeout: Long = 10_000, cond: () -> Boolean) {
        val end = System.currentTimeMillis() + timeout
        while (!cond()) {
            if (System.currentTimeMillis() > end) fail("не дождались: $what")
            settle(); Thread.sleep(20)
        }
    }

    fun has(text: String) = compose.onAllNodes(hasText(text, substring = true), true).fetchSemanticsNodes().isNotEmpty()
    fun hasExact(text: String) = compose.onAllNodes(hasText(text), true).fetchSemanticsNodes().isNotEmpty()
    fun hasDesc(d: String) = compose.onAllNodes(hasContentDescription(d), true).fetchSemanticsNodes().isNotEmpty()
    fun texts(): List<String> = compose.onAllNodes(androidx.compose.ui.test.isRoot().not(), true).fetchSemanticsNodes().mapNotNull { n ->
        if (n.config.contains(androidx.compose.ui.semantics.SemanticsProperties.Text)) n.config[androidx.compose.ui.semantics.SemanticsProperties.Text].joinToString { t -> t.text } else null }
    fun count(tag: String) = compose.onAllNodes(hasTestTag(tag), true).fetchSemanticsNodes().size

    private fun node(text: String, exact: Boolean): SemanticsNodeInteraction {
        waitFor("«$text»") { if (exact) hasExact(text) else has(text) }
        return compose.onAllNodes(hasText(text, substring = !exact), true).onFirst()
    }
    fun click(text: String, exact: Boolean = true) { node(text, exact).performClick(); settle(200) }
    /** Последний из одноимённых — в окне поверх экрана (папка в выборе места, а не плитка под ним). */
    fun clickLast(text: String) {
        waitFor("«$text»") { hasExact(text) }
        compose.onAllNodes(hasText(text), true).onLast().performClick(); settle(200)
    }
    fun clickDesc(d: String) { waitFor("«$d»") { hasDesc(d) }; compose.onAllNodes(hasContentDescription(d), true).onFirst().performClick(); settle(200) }
    fun clickTag(tag: String) { waitFor(tag) { count(tag) > 0 }; compose.onAllNodes(hasTestTag(tag), true).onFirst().performClick(); settle(200) }
    fun clickTagAt(tag: String, i: Int) { waitFor(tag) { count(tag) > i }; compose.onAllNodes(hasTestTag(tag), true)[i].performClick(); settle(200) }
    fun longTag(tag: String) { waitFor(tag) { count(tag) > 0 }; compose.onAllNodes(hasTestTag(tag), true).onFirst().performTouchInput { longClick() }; settle(200) }
    fun longText(text: String) { node(text, true).performTouchInput { longClick() }; settle(200) }
    /** Ввести в первое поле ввода на экране (в окне — его поле). */
    fun type(value: String) {
        waitFor("поле ввода") { compose.onAllNodes(hasSetTextAction(), true).fetchSemanticsNodes().isNotEmpty() }
        compose.onAllNodes(hasSetTextAction(), true).onFirst().performTextReplacement(value); settle(200)
    }
    fun menu(item: String) { clickDesc("Ещё"); click(item) }
}
