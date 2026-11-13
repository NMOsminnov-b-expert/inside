package kg.osmotr.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** Сообщение о выезде (автор, 29.10.2026) — в объект: код, учреждение, адрес, лицо, телефоны с ролями. Данные выдуманы. */
class BriefTest {
    @get:Rule val tmp = TemporaryFolder()

    private val msg = """
        93.32. Администрация( мэрия города Примерный)	
        г.Примерный, ул.Ленина 74	
        Иванов Иван Иванович(рук)	
        509123456 - рук./701654321 - исп
    """.trimIndent()

    @Test fun разбор_как_присылают() {
        val i = Brief.parse(msg).single()
        assertEquals("93.32", i.code)
        assertEquals("Администрация (мэрия города Примерный)", i.institution)
        assertEquals("г.Примерный, ул.Ленина 74", i.address)
        assertEquals(listOf(Store.Contact("Иванов Иван Иванович", "руководитель", "+996 509 123 456"),
            Store.Contact(role = "исполнитель", phone = "+996 701 654 321")), i.contacts)
        assertEquals("93.32 Администрация (мэрия города Примерный)", i.folder)
    }

    @Test fun несколько_учреждений_и_иной_порядок() {
        val two = Brief.parse("""
            93.34. ДМС
            Петров Пётр (рук.)
            0555 12 34 56
            ул. Токтогула, 5
            
            93.35. МП Тазалык
            с. Доболу, ул. Мира 1
        """.trimIndent())
        assertEquals(listOf("93.34", "93.35"), two.map { it.code })
        assertEquals("ул. Токтогула, 5", two[0].address)
        assertEquals(Store.Contact("Петров Пётр", "руководитель", "+996 555 123 456"), two[0].contacts.single())
        assertEquals("с. Доболу, ул. Мира 1", two[1].address)
        assertTrue(two[1].contacts.isEmpty())
    }

    @Test fun не_сообщение_пусто() {
        assertTrue(Brief.parse("").isEmpty())
        assertFalse("одна строка текста — учреждение", Brief.parse("Школа № 5").isEmpty())
    }

    @Test fun объект_заводится_и_повтор_обновляет() {
        Store.init(File(tmp.root.path), File(tmp.root.path + "/.app")); Store.ensureRoot()
        val (obj, made) = Brief.apply(Brief.parse(msg).single())
        assertTrue(made)
        assertEquals(Objects.Info("Администрация (мэрия города Примерный)", "г.Примерный, ул.Ленина 74"), Objects.info(obj))
        assertEquals(2, Store.contacts(obj).size)
        val again = Brief.parse("93.32. Мэрия\nг.Примерный, ул.Ленина 76\n700111222 - бух").single()
        val (same, made2) = Brief.apply(again)
        assertEquals("тот же код — тот же объект", obj, same)
        assertFalse(made2)
        assertEquals("г.Примерный, ул.Ленина 76", Objects.info(obj).address)
        assertEquals("контакты дополнены, без повторов", listOf("руководитель", "исполнитель", "бухгалтер"), Store.contacts(obj).map { it.role })
        Brief.apply(again)
        assertEquals(3, Store.contacts(obj).size)
    }
}
