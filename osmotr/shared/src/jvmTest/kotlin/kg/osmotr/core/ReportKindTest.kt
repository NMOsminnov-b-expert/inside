package kg.osmotr.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Виды отчёта (автор, 19.10.2026: «Добавить типы отчетов. Осмотренное, не осмотренное, все»):
 * на листах описи — только такие строки, итог — по всей описи, отчёт рядом с описью — полный.
 */
class ReportKindTest {
    @get:Rule val tmp = TemporaryFolder()

    private val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 1, 2, 0xFF.toByte(), 0xD9.toByte())

    @Test fun осмотренное_не_осмотренное_всё() {
        Store.init(File(tmp.root.path), File(tmp.root.path + "/.app")); Store.ensureRoot()
        Journal.forget()
        val obj = Store.createFolder(Store.root, "Склад")!!
        java.io.File(System.getProperty("templates"), "02-inv1.xlsx").copyTo(java.io.File(obj.path, Inventory.PREFIX + "Склад.xlsx"))
        val items = Inventory.parse(Inventory.fileIn(obj)!!).items
        assertTrue("в описи есть что делить", items.size >= 4)
        // Осмотрены первые два — снимками в их папках.
        items.take(2).forEach { i -> File(Inventory.openFolder(obj, i), "a.jpg").writeBytes(jpeg) }
        assertEquals(items.size to 2, Inventory.inspectedCount(obj))

        fun rows(kind: Inventory.ReportKind): Pair<String, List<List<String>>> {
            val f = Inventory.reportFor(obj, kind).single()
            val sheets = Xlsx.sheets(f.readBytes())
            val list = sheets.first { it.name != "Итог" && it.rows.firstOrNull()?.contains("Осмотрено") == true }
            return f.name to list.rows.drop(1).filter { r -> r.any { it.isNotBlank() } }
        }
        val (allName, all) = rows(Inventory.ReportKind.ALL)
        val (doneName, done) = rows(Inventory.ReportKind.INSPECTED)
        val (leftName, left) = rows(Inventory.ReportKind.NOT_INSPECTED)
        assertEquals(items.size, all.size)
        assertEquals(2, done.size)
        assertEquals(items.size - 2, left.size)
        val inv = items.take(2).map { it.inventory }.toSet()
        assertTrue("осмотренное — те самые", done.all { r -> r.any { it in inv } })
        assertTrue("в не осмотренном — ни одного осмотренного", left.none { r -> r.any { it in inv } })
        assertTrue(doneName.endsWith(" — осмотренное.xlsx") && leftName.endsWith(" — не осмотренное.xlsx"))
        assertTrue("полный — рядом с описью", Inventory.reportFile(Inventory.fileIn(obj)!!).name == allName)
        // Выборочные — не рядом с описью (не путают и не попадают в архив).
        assertEquals(listOf(allName), java.io.File(obj.path).list()!!.filter { it.startsWith("Осмотр — ") })
    }
}
