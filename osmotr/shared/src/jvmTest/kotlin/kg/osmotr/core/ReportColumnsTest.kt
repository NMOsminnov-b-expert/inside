package kg.osmotr.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Отчёт повторяет опись (отзыв пользователя 21.10.2026: «чтобы отображались все столбцы, которые
 * были при импорте… копировать все поля описи и добавлять свои») и год из описи (автор: «год в
 * карточке и поиске»).
 */
class ReportColumnsTest {
    @get:Rule val tmp = TemporaryFolder()
    private val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 1, 2, 0xFF.toByte(), 0xD9.toByte())

    private val header = listOf("№ п/п", "Наименование", "Инвентарный номер", "Год выпуска", "Заводской номер", "Ответственный", "Первоначальная стоимость")
    private val rows = listOf(
        listOf("1", "Шкаф металлический", "001234", "2015", "SN-77", "Иванов И.", "12 500"),
        listOf("2", "Стол письменный", "001235", "12.03.2018", "", "Петров П.", "8 000"),
        listOf("3", "Кресло офисное", "001236", "2021 г.", "SN-91", "Иванов И.", "4 300"),
    )

    private fun obj(): File {
        Store.init(File(tmp.root.path), File(tmp.root.path + "/.app")); Store.ensureRoot()
        Journal.forget()
        val obj = Store.createFolder(Store.root, "Кабинет")!!
        Xlsx.write(File(obj, Inventory.PREFIX + "Кабинет.xlsx"), listOf(header) + rows)
        return obj
    }

    @Test fun все_столбцы_описи_как_есть_затем_свои() {
        val obj = obj()
        val items = Inventory.parse(Inventory.fileIn(obj)!!).items
        File(Inventory.openFolder(obj, items[0]), "a.jpg").writeBytes(jpeg)
        val f = Inventory.reportFor(obj, Inventory.ReportKind.ALL).single()
        val sheet = Xlsx.sheets(f.readBytes()).first { it.name != "Итог" && it.rows.firstOrNull()?.contains("Осмотрено") == true }
        val head = sheet.rows.first().filter { it.isNotBlank() }
        assertEquals("столбцы описи — первыми и в её порядке", header, head.take(header.size))
        assertTrue("свои — после", head.drop(header.size).containsAll(listOf("Осмотрено", "Снимков")))
        assertTrue("дублей полей описи нет", "Инв. номер" !in head && "Наименование" == head[1])
        val body = sheet.rows.drop(1).filter { r -> r.any { it.isNotBlank() } }
        assertEquals(3, body.size)
        assertEquals("ячейки — как в описи", "SN-77", body[0][4])
        assertEquals("Петров П.", body[1][5])
        assertEquals("инвентарник с ведущими нулями — текстом", "001234", body[0][2])
        assertEquals("Да", body[0][header.size])
    }

    @Test fun год_из_описи_в_предмете_и_поиске() {
        val obj = obj()
        val items = Inventory.parse(Inventory.fileIn(obj)!!).items
        assertEquals(listOf("2015", "2018", "2021"), items.map { it.year })
        assertTrue(Search.scoreItem(items[1], "2018") > 0)
        assertEquals("2015", Inventory.yearOf("42076"))      // число-дата Excel 13.03.2015
        assertEquals("", Inventory.yearOf("12"))
        assertEquals("", Inventory.yearOf("SN-2015X"))
    }
}
