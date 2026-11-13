package kg.osmotr.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** Лист объекта в сводной по коду и папки из строк (автор, 29.10.2026). Устроено как книга автора; данные выдуманы. */
class SheetTest {
    @get:Rule val tmp = TemporaryFolder()

    private val head = listOf("№", "Объект ", "Адрес", "ЕНИ ", "Госакт", "Техпаспорт ", "ПУД", "по литерам", "Н С/Х\nи \nС/Х", "Тип", "Составлен")

    private fun setUp(): File {
        Store.init(File(tmp.root.path), File(tmp.root.path + "/.app")); Store.ensureRoot()
        val obj = Brief.apply(Brief.parse("93.32. Администрация").single()).first
        Xlsx.writeBook(File(obj, "${Objects.DOCS}/Сводная.xlsx"), listOf(
            Xlsx.Out("31. Другой", listOf(head, listOf(1, "Чужое здание", "ул. Мира 1", "1", "", "", "", "", "", "нежилое"))),
            Xlsx.Out("32. Пример мэриясы", listOf(head,
                listOf("", "Honda CR-V ", "", "05KG005AC", "", "есть", "", "", "", "ТС", "по описи"),
                listOf("", "Toyota Rav 4", "", "05KG146AD", "", "есть", "", "", "", "ТС", "по описи"),
                listOf(1, "Админ здание", "ул. Ленина, 64", "4050200010699", "есть", "есть", "приказ №1", 3, "", "нежилое", "по описи"),
                listOf(2, "Участок", "ул. Орозбак 1", "4050300012020", "есть", "-", "", "", 0.17, "несельхоз"),
                listOf(3, "Участок", "ул. Аккоргон 5", "4050300022472", "есть", "-", "", "", 0.15, "несельхоз"),
                listOf("", "", "", "", "", "", "", "", "", "", "Многие ТС переданы"),
            )),
        ))
        return obj
    }

    @Test fun лист_по_коду() {
        assertTrue(Sheet.matches("32. Нарын мэриясы", "93.32"))
        assertTrue(Sheet.matches("93.32 Мэрия", "93.32"))
        assertFalse(Sheet.matches("132. Иное", "93.32"))
        assertFalse(Sheet.matches("Итоги ДМС", "93.32"))
        val obj = setUp()
        assertEquals("32. Пример мэриясы", Sheet.find(obj)!!.name)
        assertNull("без кода — не ищем", Sheet.find(Objects.create("Школа")))
    }

    @Test fun тс_здания_участки_и_комментарии() {
        val obj = setUp()
        val p = Sheet.proposals(obj, Sheet.find(obj)!!)
        assertEquals(listOf(Sheet.Kind.VEHICLE to "05KG005AC", Sheet.Kind.VEHICLE to "05KG146AD", Sheet.Kind.BUILDING to "Админ здание",
            Sheet.Kind.LAND to "Участок", Sheet.Kind.LAND to "Участок (ул. Аккоргон 5)"), p.map { it.kind to it.folder })
        assertEquals("Honda CR-V · 05KG005AC", p[0].title)
        assertTrue("строка — в комментарий: ${p[2].note}", "Адрес: ул. Ленина, 64" in p[2].note && "ЕНИ: 4050200010699" in p[2].note && "Тип: нежилое" in p[2].note)
        assertTrue(p.none { it.exists })

        assertEquals(5, Sheet.apply(obj, p))
        assertTrue(File(obj, "${Objects.MOVABLE}/05KG005AC").isDirectory)
        assertTrue("здание — с помещениями и фасадом", Objects.present(File(obj, "${Objects.REAL}/Админ здание/${Objects.FACADE}")))
        assertTrue(File(obj, "${Objects.REAL}/${Objects.LAND}/Участок (ул. Аккоргон 5)").isDirectory)
        assertTrue(Store.note(File(obj, "${Objects.REAL}/Админ здание"))!!.contains("Госакт: есть"))
        assertTrue("второй раз — всё уже есть", Sheet.proposals(obj, Sheet.find(obj)!!).all { it.exists })
        assertEquals(0, Sheet.apply(obj, p))
    }
}
