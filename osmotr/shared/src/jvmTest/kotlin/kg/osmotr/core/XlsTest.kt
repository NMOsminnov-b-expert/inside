package kg.osmotr.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Старый Excel (.xls) — разбирается так же, как .xlsx (автор, 23.10.2026: «Совместимость нужна»).
 * Те же 23 кривые описи, сохранённые в .xls (tools/make_xls_templates.py): предметы из .xls и из
 * .xlsx совпадают поле в поле; после перевода в .xlsx (как при загрузке описи) — тоже.
 */
class XlsTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun dir() = java.io.File(System.getProperty("templates"))
    private fun book(name: String) = java.io.File(dir(), name).readBytes()
    private fun items(b: ByteArray) = Xlsx.sheets(b).mapNotNull { s -> Inventory.detect(s)?.let { s to it } }.flatMap { (s, t) -> Inventory.items(s, t) }

    private fun names() = dir().list()!!.filter { it.endsWith(".xlsx") }.sorted()

    @Test fun тоЖеЧтоXlsx() {
        for (n in names()) {
            val xls = book("xls/" + n.dropLast(1))
            assertTrue("$n: .xls — составной файл", Xls.isOle(xls))
            assertNull("$n: .xls годится в опись", Inventory.problemOf(xls))
            val a = Xlsx.sheets(book(n)); val b = Xlsx.sheets(xls)
            assertEquals("$n: листы", a.map { it.name }, b.map { it.name })
            assertEquals("$n: предметы", items(book(n)), items(xls))
        }
    }

    @Test fun переводВXlsx() {
        Store.init(File(tmp.root.path + "/phone"), File(tmp.root.path + "/.app"))
        for (n in names()) {
            val xls = book("xls/" + n.dropLast(1))
            val x = Xls.asXlsx(xls)
            assertTrue("$n: стал .xlsx", x[0] == 'P'.code.toByte() && x[1] == 'K'.code.toByte())
            assertNull("$n: годится", Inventory.problemOf(x))
            assertEquals("$n: предметы те же", items(book(n)), items(x))
        }
    }

    @Test fun неXls() {
        assertEquals(0, Xls.sheets(ByteArray(600)).size)
        assertTrue(Xls.sheets("не excel".encodeToByteArray()).isEmpty())
    }
}
