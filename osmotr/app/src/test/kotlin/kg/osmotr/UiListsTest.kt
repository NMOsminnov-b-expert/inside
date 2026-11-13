package kg.osmotr

import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import kg.osmotr.core.File
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

/** Перечни Excel на экране (автор, 29.10.2026): «просмотр и поиск по ним… Структура каждого файла своя». */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w360dp-h800dp-xhdpi")
class UiListsTest {
    @get:Rule val compose = createComposeRule()
    @get:Rule val tmp = TemporaryFolder()
    private val rig by lazy { UiRig(compose, tmp.root.path) }

    private fun перечень(f: File) = Xlsx.writeBook(f, listOf(Xlsx.Out("Здания", listOf(
        listOf("Перечень зданий"),
        listOf("№", "Наименование", "Адрес", "Площадь"),
        listOf(1, "Главный корпус", "ул. Ленина, д. 10", 2450),
        listOf(2, "Котельная", "ул. Ленина, д. 10а", 180),
        listOf(3, "Склад", "пр. Чуй, 5", 600),
    ))))

    @Test fun перечень_открыть_найти_и_прийти_к_строке() {
        rig.init()
        val obj = Objects.create("Школа")
        перечень(File(obj, "${Objects.DOCS}/Перечень зданий.xlsx"))
        rig.start(Screen.Browser(File(obj, Objects.DOCS)))
        rig.waitFor("раздел перечней") { rig.has("Перечни Excel: 1") && rig.count("перечень") == 1 }
        rig.clickTag("перечень")
        rig.waitFor("лист как в Excel") { rig.count("таблица") == 1 && rig.has("Главный корпус") && rig.has("1 лист") }
        compose.onNode(hasTestTag("поиск в перечне"), true).performTextReplacement("ленина 10")
        rig.waitFor("найдено два здания") { rig.has("Найдено: 2") && rig.count("строка перечня") == 2 }
        assertTrue("пары «шапка: значение»", rig.hasExact("Наименование") && rig.hasExact("Котельная"))
        rig.clickTagAt("строка перечня", 1)
        rig.waitFor("лист на найденной строке, дорога назад") { rig.count("таблица") == 1 && rig.count("к найденному") == 1 }
        rig.clickTag("к найденному")
        rig.waitFor("снова найденное") { rig.count("строка перечня") == 2 }
        compose.onNode(hasTestTag("поиск в перечне"), true).performTextReplacement("нет такого")
        rig.waitFor("пусто — так и сказано") { rig.has("Ничего не нашлось") }
    }

    @Test fun документы_принимают_любой_формат() {
        rig.init()
        val obj = Objects.create("Школа")
        val src = File("${tmp.root.path}/src.xlsx"); перечень(src)
        rig.files = listOf(Picked("Техпаспорт.pdf", "%PDF-1.4\n%%EOF\n".encodeToByteArray()), Picked("Перечень.xlsx", src.readBytes()), Picked("a.jpg", rig.jpeg))
        rig.start(Screen.Browser(File(obj, Objects.DOCS)))
        rig.clickTag("добавить документ")
        rig.waitFor("PDF и перечень легли") { rig.count("pdf") == 1 && rig.count("перечень") == 1 }
        val docs = File(obj, Objects.DOCS)
        assertEquals(listOf("Перечень.xlsx"), Store.list(docs).lists.map { it.name })
    }

    @Test fun присланная_книга_опись_или_перечень() {
        rig.init()
        var asList = false
        compose.setContent { kg.osmotr.ui.BookKinds(asList) { asList = it } }
        rig.waitFor("два вида") { rig.count("вид: Опись") == 1 && rig.count("вид: Перечень") == 1 }
        rig.clickTag("вид: Перечень")
        assertTrue(asList)
    }

    /** Сообщение о выезде «Поделиться» текстом — объект со сведениями и контактами (данные выдуманы). */
    @Test fun сообщение_о_выезде_в_объект() {
        rig.init()
        rig.start()
        rig.incoming.add(Picked(kg.osmotr.core.Brief.SHARED,
            "93.32. Администрация( мэрия города Примерный)\nг.Примерный, ул.Ленина 74\nИванов Иван Иванович(рук)\n509123456 - рук./701654321 - исп".encodeToByteArray()))
        rig.waitFor("окно с разобранным") { rig.has("Сообщение о выезде") && rig.has("93.32 Администрация") && rig.has("+996 509 123 456") }
        rig.clickTag("завести из сообщения")
        rig.waitFor("объект открыт со сведениями") { rig.count("шапка объекта") == 1 && rig.has("г.Примерный, ул.Ленина 74") }
        val obj = Objects.all().single()
        assertEquals(listOf("руководитель", "исполнитель"), Store.contacts(obj).map { it.role })
    }

    /** Корень объекта: снимков нет (автор: «убираем»), своя категория — можно. */
    @Test fun корень_объекта_своя_категория_без_съёмки() {
        rig.init()
        val obj = Objects.create("Школа")
        rig.start(Screen.Browser(obj))
        rig.waitFor("«Новая категория», без «Снимать» и галереи") { rig.count("новая категория") == 1 && !rig.has("Снимать") && rig.count("из галереи") == 0 }
    }

    /** Лист объекта в сводной по коду (данные выдуманы) — карточка со счётом, «Завести папки» — папки с комментариями. */
    @Test fun лист_объекта_завести_папки() {
        rig.init()
        val obj = kg.osmotr.core.Brief.apply(kg.osmotr.core.Brief.parse("93.32. Администрация").single()).first
        val head = listOf("№", "Объект", "Адрес", "ЕНИ", "Тип")
        Xlsx.writeBook(File(obj, "${Objects.DOCS}/Сводная.xlsx"), listOf(Xlsx.Out("32. Пример", listOf(head,
            listOf("", "Honda CR-V", "", "05KG005AC", "ТС"),
            listOf(1, "Админ здание", "ул. Ленина, 64", "4050200010699", "нежилое"),
            listOf(2, "Участок", "ул. Мира 1", "4050300012020", "несельхоз"),
        ))))
        rig.start(Screen.Browser(obj))
        rig.waitFor("карточка листа") { rig.count("лист объекта") == 1 && rig.has("ТС: 1 · зданий: 1 · участков: 1") }
        rig.clickTag("завести из листа")
        rig.waitFor("выбор — всё отмечено") { rig.has("Завести (3)") && rig.count("из листа: 05KG005AC") == 1 }
        rig.clickTag("из листа: Участок")
        rig.waitFor("участок снят") { rig.has("Завести (2)") }
        rig.clickTag("завести выбранное")
        rig.waitFor("папки заведены") { File(obj, "${Objects.MOVABLE}/05KG005AC").isDirectory && Objects.present(File(obj, "${Objects.REAL}/Админ здание/${Objects.FACADE}")) }
        assertTrue("участок не заводили", !File(obj, "${Objects.REAL}/${Objects.LAND}/Участок").exists())
        assertTrue(Store.note(File(obj, "${Objects.MOVABLE}/05KG005AC"))!!.contains("Тип: ТС"))
        rig.waitFor("в карточке — только оставшееся") { rig.has("участков: 1") && !rig.has("ТС: 1") }
    }

    /** Общий поиск — и по перечням: строка найдена, касание — перечень с тем же запросом, найденное на экране. */
    @Test fun общий_поиск_находит_в_перечне() {
        rig.init()
        val obj = Objects.create("Школа")
        перечень(File(obj, "${Objects.DOCS}/Перечень зданий.xlsx"))
        rig.start(Screen.Search(Store.root))
        compose.onAllNodes(androidx.compose.ui.test.hasSetTextAction()).onFirst().performTextReplacement("ленина 10")
        rig.waitFor("раздел «В перечнях»") { rig.has("В перечнях") && rig.count("найдено в перечне") == 2 && rig.has("Главный корпус · ул. Ленина, д. 10") }
        rig.clickTagAt("найдено в перечне", 0)
        rig.waitFor("перечень с запросом") { rig.has("Найдено: 2") && rig.count("строка перечня") == 2 }
    }
}
