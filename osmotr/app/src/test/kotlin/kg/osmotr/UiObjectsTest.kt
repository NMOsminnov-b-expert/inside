package kg.osmotr

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performImeAction
import androidx.test.ext.junit.runners.AndroidJUnit4
import kg.osmotr.core.File
import kg.osmotr.core.Inventory
import kg.osmotr.core.Objects
import kg.osmotr.core.Store
import kg.osmotr.core.Xlsx
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
 * Объекты на экране (автор, 29.10.2026): новый объект со сведениями, литер или найденное с помещениями и
 * фасадом, ТС по госномеру, новая опись — всегда с выбором объекта, прежнее — в «Осмотрено ранее» с объёмом.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w360dp-h800dp-xhdpi")
class UiObjectsTest {
    @get:Rule val compose = createComposeRule()
    @get:Rule val tmp = TemporaryFolder()
    private val rig by lazy { UiRig(compose, tmp.root.path) }

    /** Окно объекта — без всплывающего окна (поле ввода в окне не даёт Robolectric «успокоиться», см. ObjectInfoFields). */
    @Test fun поля_объекта() {
        rig.init()
        val form = kg.osmotr.ui.ObjectForm()
        var submitted = false
        compose.setContent { kg.osmotr.ui.ObjectInfoFields(form, askName = true, onSubmit = { submitted = true }) }
        compose.onNode(androidx.compose.ui.test.hasTestTag("объект: название"), true).performTextReplacement("Школа № 5")
        compose.onNode(androidx.compose.ui.test.hasTestTag("объект: учреждение"), true).performTextReplacement("СШ № 5")
        compose.onNode(androidx.compose.ui.test.hasTestTag("объект: адрес"), true).performTextReplacement("Бишкек, ул. Ленина 10")
        compose.onNode(androidx.compose.ui.test.hasTestTag("объект: адрес"), true).performImeAction()
        assertEquals("Школа № 5", form.name)
        assertEquals(Objects.Info("СШ № 5", "Бишкек, ул. Ленина 10"), form.info())
        assertTrue("«Готово» на клавиатуре — создать", submitted)
    }

    @Test fun объект_шапка_категории_и_литер() {
        rig.init()
        val obj = Objects.create("Школа № 5", Objects.Info("СШ № 5", "Бишкек, ул. Ленина 10"))
        Objects.addBuilding(obj, "Навес")
        rig.start()
        rig.waitFor("на главном — «Новый объект» и «Новая опись»") { rig.count("кнопка новый объект") == 1 && rig.has("Новая опись") }
        rig.click("Школа № 5")
        rig.waitFor("шапка") { rig.count("шапка объекта") == 1 && rig.has("СШ № 5") && rig.has("Бишкек, ул. Ленина 10") }
        for (c in listOf(Objects.REAL, Objects.MOVABLE, Objects.MACHINES, Objects.DOCS)) rig.waitFor("«$c»") { rig.hasExact(c) }
        rig.click(Objects.REAL)
        rig.waitFor("в «Недвижимом» — участок и «Литер или найденное»") { rig.hasExact(Objects.LAND) && rig.has("Литер или найденное") }
        rig.click("Навес")
        rig.waitFor("внутри — помещения и фасад") { rig.hasExact(Objects.INSIDE) && rig.hasExact(Objects.FACADE) && rig.has("Снимать") }
    }

    @Test fun движимое_добавить_тс() {
        rig.init()
        val obj = Objects.create("Автобаза")
        rig.start(Screen.Browser(File(obj, Objects.MOVABLE)))
        rig.waitFor("в «Движимом» — «Добавить ТС»") { rig.has("Добавить ТС") && rig.count("кнопка категории") == 1 }
    }

    @Test fun механизмы_новая_опись() {
        rig.init()
        val obj = Objects.create("Склад")
        rig.start(Screen.Browser(File(obj, Objects.MACHINES)))
        rig.waitFor("в «Механизмах» — «Новая опись»") { rig.has("Новая опись") && rig.count("кнопка категории") == 1 }
    }

    @Test fun новая_опись_всегда_с_выбором_объекта() {
        rig.init()
        val obj = Objects.create("Склад № 2", Objects.Info("ОАО Склад", "Ош"))
        val src = File("${tmp.root.path}/src.xlsx")
        Xlsx.writeBook(src, listOf(Xlsx.Out("Опись", listOf(listOf("№", "Наименование", "Инв. номер"), listOf(1, "Шкаф", "МТ-1"), listOf(2, "Стол", "МТ-2")))))
        rig.books = listOf(Picked("Мебель.xlsx", src.readBytes()))
        rig.start()
        rig.click("Новая опись")
        rig.waitFor("спрашивает объект") { rig.has("В какой объект опись?") }
        rig.clickTag("объект: ${obj.name}")
        rig.click("Сюда")
        rig.waitFor("опись в «Механизмах» объекта") { Objects.inventories().any { it.parentFile == File(obj, Objects.MACHINES) } }
        val inv = Objects.inventories().single()
        assertEquals(obj, Objects.of(inv))
        assertEquals(2, Inventory.parse(Inventory.fileIn(inv)!!).items.size)
    }

    @Test fun прежнее_при_первом_запуске() {
        rig.init(migrate = true)
        val old = rig.inventory("Склад")
        Store.addPhotos(Inventory.openFolder(old, Inventory.parse(Inventory.fileIn(old)!!).items[0]), listOf(Triple("a.jpg", rig.jpeg, null)))
        rig.start()
        rig.waitFor("перенесено") { File(Objects.old(), "Склад").isDirectory && !old.exists() }
        rig.waitFor("карточка с объёмом") { rig.has("Занимает") && rig.has("Выгрузите эти данные") }
        rig.waitFor("напоминание — жёлтой плашкой") { rig.has("Выгрузите и сотрите с телефона") && rig.count("напоминание") == 1 }
        rig.waitFor("в карточке — «Выгрузить»") { rig.count("выгрузить прежнее") == 1 }
    }

    @Test fun pdf_в_документах_добавить_и_открыть() {
        rig.init()
        val obj = Objects.create("Школа")
        rig.files = listOf(Picked("Техпаспорт.pdf", "%PDF-1.4\n%%EOF\n".encodeToByteArray()), Picked("фото.jpg", rig.jpeg))
        rig.start(Screen.Browser(File(obj, Objects.DOCS)))
        rig.clickTag("добавить документ")
        rig.waitFor("плитка PDF и счёт") { rig.count("pdf") == 1 && rig.has("Документы: 1") }
        rig.clickTag("pdf")
        rig.waitFor("страницы открыты") { rig.count("страницы pdf") == 1 && rig.has("Техпаспорт.pdf") }
    }

    /** Документы — разделом: плитки нет, строка открывает все документы, «Добавить документ» спрашивает, к чему он. */
    @Test fun документы_разделом_и_добавление_с_выбором_места() {
        rig.init()
        val obj = Objects.create("Школа")
        val car = Objects.addVehicle(obj, "01KG 123 ABC")!!
        rig.files = listOf(Picked("Техпаспорт.pdf", "%PDF-1.4\n%%EOF\n".encodeToByteArray()))
        rig.start(Screen.Browser(obj))
        rig.waitFor("раздел, а не плитка") { rig.count("раздел документы") == 1 && rig.count("плитка") == 3 }
        rig.clickTag("раздел документы")
        rig.waitFor("все документы") { rig.has("Документы объекта") }
        rig.clickTag("добавить документ")
        rig.waitFor("к чему документ") { rig.count("куда: Недвижимость") == 1 && rig.count("куда: ТС ${car.name}") == 1 }
        rig.clickTag("куда: Недвижимость")
        rig.waitFor("лёг в документы недвижимости") { Store.pdfsIn(Objects.realDocs(obj)).size == 1 }
    }

    /** Перенос: ТС в «Недвижимое» — с вопросом, что он станет литером; в документы — серым и с причиной. */
    @Test fun перенос_проверяет_тип_папки() {
        rig.init()
        val obj = Objects.create("Школа")
        val car = Objects.addVehicle(obj, "01KG 123 ABC")!!
        rig.start(Screen.Browser(car))
        rig.menu("Переместить папку")
        rig.waitFor("дерево с пустыми разделами", 15_000) { rig.has(Objects.REAL) }
        rig.click(Objects.REAL)
        rig.clickTag("перенести сюда")
        rig.waitFor("вопрос о смене типа") { rig.has("Перенести?") && rig.has("станет: литер") }
        rig.clickTag("перенести всё равно")
        rig.waitFor("ТС стал литером") { File(obj, "${Objects.REAL}/${car.name}").isDirectory && !car.exists() }
    }

    /** Базовая папка не удаляется — очищается: содержимое уходит, папка остаётся на экране (автор, 03.11.2026). */
    @Test fun базовая_папка_только_очистить() {
        rig.init()
        val obj = Objects.create("Школа")
        val docs = File(obj, Objects.DOCS)
        Store.writeDurably(File(docs, "Акт.pdf"), "%PDF-1.4\n%%EOF\n".encodeToByteArray())
        rig.start(Screen.Browser(obj), Screen.Browser(docs))
        rig.clickDesc("Ещё")
        rig.waitFor("в меню — очистить, а не удалить") { rig.has("Очистить папку") && !rig.has("Удалить папку") && !rig.has("Переименовать") }
        rig.click("Очистить папку")
        rig.clickTag("подтвердить удаление")
        rig.waitFor("содержимое ушло, папка на экране") { !File(docs, "Акт.pdf").exists() && rig.has(Objects.DOCS) }
        rig.clickDesc("Назад")
        rig.waitFor("в объекте плитка документов осталась") { rig.has(Objects.DOCS) && rig.has(Objects.MACHINES) }
    }

    @Test fun документы_недвижимости_добавить() {
        rig.init()
        val obj = Objects.create("Школа")
        rig.files = listOf(Picked("Техпаспорт.pdf", "%PDF-1.4\n%%EOF\n".encodeToByteArray()))
        rig.start(Screen.Browser(File(obj, Objects.REAL)), Screen.Browser(Objects.realDocs(obj)))
        rig.clickTag("добавить документ")
        rig.waitFor("лёг в «Недвижимое/Документы»") { rig.count("pdf") == 1 && Store.list(Objects.realDocs(obj)).pdfs.size == 1 }
        // Это не литер — нет «Параметров осмотра».
        assertEquals(0, rig.count("карточка параметров"))
        rig.clickDesc("Назад")
        rig.waitFor("в «Недвижимом» — папка документов") { rig.has(Objects.DOCS) }
    }

    @Test fun pdf_у_тс() {
        rig.init()
        val obj = Objects.create("Автобаза")
        val car = Objects.addVehicle(obj, "01KG 123 ABC")!!
        rig.files = listOf(Picked("СТС.pdf", "%PDF-1.4\n%%EOF\n".encodeToByteArray()))
        rig.start(Screen.Browser(car))
        rig.clickTag("добавить документ")
        rig.waitFor("документ у госномера, в его «Документах»") { File(car, "${Objects.DOCS}/СТС.pdf").isFile }
    }

    @Test fun разбор_из_шапки_объекта() {
        rig.init()
        val obj = Objects.create("Школа")
        rig.files = listOf(Picked("a.jpg", rig.jpeg), Picked("Техпаспорт.pdf", "%PDF-1.4\n%%EOF\n".encodeToByteArray()), Picked("заметка.txt", "x".encodeToByteArray()))
        rig.start(Screen.Browser(obj))
        rig.clickTag("разобрать файлы")
        rig.waitFor("разбор: снимок, PDF и документ любого формата") { rig.count("разбор снимок") == 1 && rig.has("Разложено 0 из 3") }
    }

    @Test fun разбор_по_местам_pdf_только_куда_можно() {
        rig.init()
        val obj = Objects.create("Школа")
        val a = Objects.addBuilding(obj, "Литер А")!!
        val pdf = "%PDF-1.4\n%%EOF\n".encodeToByteArray()
        rig.start(Screen.Sort(obj, listOf(Picked("1.jpg", rig.jpeg), Picked("2.jpg", rig.jpeg), Picked("Техпаспорт.pdf", pdf))))
        rig.waitFor("сетка") { rig.count("разбор снимок") == 2 && rig.count("разбор pdf") == 1 }
        // Все три — на фасад: снимки лягут, PDF останется отмеченным.
        rig.click("Все неразложенные")
        rig.clickTag("куда")
        rig.clickTag("место: Литер А · фасад")
        rig.waitFor("снимки — на фасад, PDF — нет") { rig.count("место") == 2 && rig.has("Куда (1)…") && rig.has("Разложено 2 из 3") }
        rig.clickTag("куда")
        rig.clickTag("место: ${Objects.DOCS}")
        rig.waitFor("PDF — в документы") { rig.count("место") == 3 && rig.has("Разложить (3)") }
        rig.clickTag("разложить")
        rig.waitFor("легло на диск") {
            Store.list(File(a, Objects.FACADE)).photos.size == 2 && File(obj, "${Objects.DOCS}/Техпаспорт.pdf").isFile
        }
        rig.waitFor("разбор закрылся — всё разложено") { rig.count("разбор") == 0 }
    }

    /** Список мест — без окна (окно с полем ввода нового литера в Robolectric не «успокаивается»). */
    @Test fun места_для_pdf_с_пояснением() {
        rig.init()
        val obj = Objects.create("Автобаза")
        Objects.addVehicle(obj, "01KG 123 ABC")
        var picked: kg.osmotr.core.Objects.Place? = null
        compose.setContent { kg.osmotr.ui.SortPlaces(Objects.places(obj), pdfs = 2, onPick = { picked = it }, addBuilding = {}, addVehicle = {}) }
        rig.waitFor("пояснение и места") { rig.has("Документы — в «") && rig.has("ТС 01KG 123 ABC · документы") && rig.has("+ ТС по госномеру") }
        rig.clickTag("место: ТС 01KG 123 ABC · документы")
        assertEquals(File(obj, "${Objects.MOVABLE}/01KG 123 ABC/${Objects.DOCS}"), picked!!.dir)
    }

    /**
     * Раскладка присланного — опись в объекте: дерево раскрывает и путь к ней (объект, «Механизмы и
     * оборудование»), предметы без папки видны сразу (матрица на эмуляторе 29.10.2026: пропадали — раскрыта
     * была только сама опись, внутри свёрнутого объекта).
     */
    @Test fun раскладка_дерево_опись_в_объекте_видна() {
        rig.init()
        val obj = Objects.create("Склад № 2")
        rig.inventory("Мебель", home = File(obj, Objects.MACHINES))
        rig.start(Screen.Tree(Store.root, place = listOf(Picked("a.jpg", rig.jpeg))))
        rig.waitFor("предметы описи в объекте — сразу") { rig.count("предмет без папки") == 3 && rig.has("МТ-102") }
    }
}
