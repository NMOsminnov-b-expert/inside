package kg.osmotr.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Контакт из «Поделиться»: карточка vCard телефонной книги. */
class VcardTest {
    @Test fun имя_должность_телефон_почта() {
        val c = Vcard.parse("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Иван Петров\r\nN:Петров;Иван;;;\r\nTITLE:Завхоз\r\nTEL;TYPE=CELL:+996 555 123\r\nTEL:999\r\nEMAIL:i@x.kg\r\nEND:VCARD\r\n")
        assertEquals(listOf(Store.Contact(name = "Иван Петров", role = "Завхоз", phone = "+996 555 123", email = "i@x.kg")), c)
    }

    @Test fun без_FN_имя_из_N_и_две_карточки() {
        val c = Vcard.parse("BEGIN:VCARD\nN:Петров;Иван\nTEL:1\nEND:VCARD\nBEGIN:VCARD\nFN:Анна\nEND:VCARD\n")
        assertEquals(listOf("Петров Иван", "Анна"), c.map { it.name })
    }

    @Test fun старый_формат_quoted_printable_и_перенос_строки() {
        val c = Vcard.parse("BEGIN:VCARD\nVERSION:2.1\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D0=98=D0=B2=D0=B0=D0=BD\nTEL:12\n 34\nEND:VCARD\n")
        assertEquals("Иван", c.single().name); assertEquals("1234", c.single().phone)
    }

    @Test fun распознаётся_по_имени_и_началу() {
        assertTrue(Vcard.isVcard("контакт.vcf", "")); assertTrue(Vcard.isVcard("x", "BEGIN:VCARD"))
        assertTrue(!Vcard.isVcard("a.pdf", "%PDF"))
    }
}
