package kg.osmotr.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** Перечни Excel (автор, 29.10.2026): своя структура у каждого — поиск по всем ячейкам, шапка угадывается. */
class ListsTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun setUp(): File {
        Store.init(File(tmp.root.path), File(tmp.root.path + "/.app")); Store.ensureRoot()
        return Objects.create("Школа")
    }

    private fun book(f: File) = Xlsx.writeBook(f, listOf(
        Xlsx.Out("Здания", listOf(
            listOf("Перечень зданий и сооружений"),
            listOf("по состоянию на 01.10.2026"),
            listOf("№", "Наименование", "Адрес", "Площадь, м²", "Год"),
            listOf(1, "Главный корпус", "ул. Ленина, д. 10", 2450.5, 1975),
            listOf(2, "Котельная", "ул. Ленина, д. 10а", 180, 1982),
            listOf(3, "Склад", "пр. Чуй, 5", 600, 1990),
        )),
        Xlsx.Out("Прочее", listOf(listOf("Навес у склада", "пр. Чуй, 5"))),
    ))

    @Test fun шапка_угадывается_и_поиск_по_всем_ячейкам() {
        val obj = setUp()
        val f = File(obj, "${Objects.DOCS}/Перечень зданий.xlsx"); book(f)
        val b = Lists.open(f)
        assertEquals(listOf(2, null), b.headers)
        val hits = Lists.search(b, "ленина 10")
        assertEquals("оба здания на Ленина, 10 и 10а", listOf(3, 4), hits.map { it.row })
        assertEquals("Главный корпус", hits[0].cells.first { it.first == "Наименование" }.second)
        assertEquals("Год", hits[0].cells.last().first)
        val чуй = Lists.search(b, "ЧУЙ")
        assertEquals("без регистра, оба листа", listOf(0 to 5, 1 to 0), чуй.map { it.sheet to it.row })
        assertEquals("без шапки — буквы столбцов", "A", чуй[1].cells[0].first)
        assertTrue("шапка сама себя не находит", Lists.search(b, "наименование").isEmpty())
        assertTrue("ё как е", Lists.search(b, "котёльная").size == 1)
    }

    @Test fun служебные_книги_не_перечни() {
        val obj = setUp()
        val docs = File(obj, Objects.DOCS)
        book(File(docs, "Перечень.xlsx"))
        book(File(docs, "Опись — Мебель.xlsx")); book(File(docs, "Осмотр — Мебель.xlsx")); book(File(docs, Store.CONTACTS))
        assertEquals(listOf("Перечень.xlsx"), Store.list(docs).lists.map { it.name })
        assertFalse(Lists.isList(File(docs, "нет.xlsx")))
    }

    /** Как в книгах, что присылают: справа от данных — своя табличка итогов, внизу — пустые отформатированные строки. */
    @Test fun табличка_сбоку_не_шапка_и_пустой_хвост_прочь() {
        val obj = setUp()
        val f = File(obj, "${Objects.DOCS}/Сводная.xlsx")
        val blank = List(8) { "" }
        val rows: List<List<Any?>> = listOf(
            listOf("№", "Объект", "Адрес", "ЕНИ", "Тип", "Фото"),
            listOf("", "Honda CR-V", "05KG000AA", "есть", "ТС", "есть", "", "ТИП", "сельхоз по га", "сельхоз по кол-ву", "несельхоз по га", "жилое", "нежилое", "ТС по кол-ву"),
            listOf("", "Toyota Rav 4", "05KG111BB", "есть", "ТС", "есть", "", "сельхоз", 0, 0, 0, 0, 0, 5),
        ) + List(40) { blank }
        Xlsx.writeBook(f, listOf(Xlsx.Out("32. Пример", rows)))
        val b = Lists.open(f)
        assertEquals("шапка — первая строка, не строка с табличкой сбоку", listOf(0), b.headers)
        assertEquals("пустой хвост отброшен", 3, b.sheets[0].rows.size)
        assertEquals("05KG111BB", Lists.search(b, "05kg111").single().cells.first { it.first == "Адрес" }.second)
    }

    @Test fun поиск_по_всем_перечням() {
        val obj = setUp()
        book(File(obj, "${Objects.DOCS}/Перечень.xlsx"))
        val other = Objects.create("Склад")
        Xlsx.writeBook(File(other, "${Objects.DOCS}/Ещё.xlsx"), listOf(Xlsx.Out("Л", listOf(listOf("Наименование", "Адрес"), listOf("Гараж", "ул. Ленина, д. 10б")))))
        Xlsx.writeBook(File(other, "${Objects.DOCS}/Опись — нет.xlsx"), listOf(Xlsx.Out("Л", listOf(listOf("Наименование", "Адрес"), listOf("Шкаф", "ул. Ленина 10")))))
        val found = Lists.searchAll("ленина 10")
        assertEquals("из обеих книг, служебная — мимо", setOf("Перечень.xlsx", "Ещё.xlsx"), found.map { it.first.name }.toSet())
        assertEquals(3, found.size)
        assertEquals(1, Lists.searchAll("ленина", limit = 1).size)
    }
}
