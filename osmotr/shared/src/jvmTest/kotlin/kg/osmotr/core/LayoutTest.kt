package kg.osmotr.core

import kg.osmotr.core.Layout.Kind
import kg.osmotr.core.Layout.Verdict
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** Строгая типизация папок и защита структуры (автор, 03.11.2026: «Приложение не должно давать возможность сломать структуру»). */
class LayoutTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun setUp(): File {
        Store.init(File(tmp.root.path), File(tmp.root.path + "/.app")); Store.ensureRoot()
        Journal.forget()
        return Objects.create("Школа")
    }

    private fun опись(home: File, name: String): File {
        val dir = File(home, name).also { it.mkdirs() }
        Xlsx.writeBook(File(dir, Inventory.PREFIX + "$name.xlsx"), listOf(Xlsx.Out("Опись", listOf(listOf("№", "Наименование", "Инв. номер"),
            listOf("1", "Шкаф", "МТ-101")))))
        return dir
    }

    @Test fun тип_папки_по_месту() {
        val obj = setUp()
        val a = Objects.addBuilding(obj, "Литер А")!!
        val car = Objects.addVehicle(obj, "01KG 123 ABC")!!
        val inv = опись(File(obj, Objects.MACHINES), "Цех")
        val cases = listOf(
            Store.root to Kind.ROOT, obj to Kind.OBJECT, File(obj, Objects.DOCS) to Kind.DOCS, File(obj, Objects.REAL) to Kind.REAL,
            Objects.realDocs(obj) to Kind.REAL_DOCS, File(obj, "${Objects.REAL}/${Objects.LAND}") to Kind.LAND,
            File(obj, "${Objects.REAL}/${Objects.LAND}/Участок 2") to Kind.PLOT, a to Kind.BUILDING,
            File(a, Objects.INSIDE) to Kind.ROOMS, File(a, Objects.FACADE) to Kind.FACADE, File(a, "${Objects.INSIDE}/Кухня") to Kind.FOLDER,
            File(obj, Objects.MOVABLE) to Kind.MOVABLE, car to Kind.VEHICLE, Objects.vehicleDocs(car) to Kind.VEHICLE_DOCS,
            File(obj, Objects.MACHINES) to Kind.MACHINES, inv to Kind.INVENTORY, File(inv, "1. Шкаф") to Kind.FOLDER,
            File(obj, "Сооружения") to Kind.CATEGORY, File(Store.root, "Мусор") to Kind.OUTSIDE,
        )
        cases.forEach { (d, k) -> assertEquals(d.path, k, Layout.kindOf(d)) }
    }

    @Test fun новая_папка_только_где_можно_и_подсказка_по_месту() {
        val obj = setUp()
        val a = Objects.addBuilding(obj, "Литер А")!!
        for (d in listOf(Store.root, File(obj, Objects.DOCS), Objects.realDocs(obj), File(obj, Objects.REAL), File(obj, Objects.MOVABLE), File(obj, Objects.MACHINES)))
            assertFalse("нельзя: ${d.path}", Layout.canCreateFolder(d))
        for (d in listOf(obj, a, File(a, Objects.INSIDE), File(a, Objects.FACADE))) assertTrue("можно: ${d.path}", Layout.canCreateFolder(d))
        assertEquals("Например, Кухня", Layout.nameHint(File(a, Objects.INSIDE)))
        assertFalse("в помещениях не «Насос»", "Насос" in Layout.nameHint(File(a, Objects.INSIDE)))
    }

    @Test fun перенос_запрет_предупреждение_разрешение() {
        val obj = setUp()
        val other = Objects.create("Склад")
        val a = Objects.addBuilding(obj, "Литер А")!!
        val b = Objects.addBuilding(obj, "Литер Б")!!
        val car = Objects.addVehicle(obj, "01KG 123 ABC")!!
        val kitchen = File(a, "${Objects.INSIDE}/Кухня").also { it.mkdirs() }
        val inv = опись(File(obj, Objects.MACHINES), "Цех")
        fun deny(d: File, t: File) = assertTrue("${d.name} → ${t.path}: запрет", Layout.checkMove(d, t) is Verdict.Deny)
        fun warn(d: File, t: File) = assertTrue("${d.name} → ${t.path}: предупредить", Layout.checkMove(d, t) is Verdict.Warn)
        fun allow(d: File, t: File) = assertEquals("${d.name} → ${t.path}", Verdict.Allow, Layout.checkMove(d, t))
        // Нельзя: литер в документы, раздел объекта куда-либо, объект в объект, не опись в механизмы, опись не в механизмы.
        deny(a, File(obj, Objects.DOCS)); deny(a, Objects.realDocs(obj)); deny(car, Objects.vehicleDocs(car))
        deny(File(a, Objects.FACADE), b); deny(File(obj, Objects.REAL), other); deny(other, obj)
        deny(kitchen, File(obj, Objects.MACHINES)); deny(inv, a); deny(a, Store.root); deny(kitchen, kitchen)
        // С предупреждением: ТС — в недвижимое (станет литером), литер — в движимое (станет ТС), литер — в чужой объект.
        warn(car, File(obj, Objects.REAL)); warn(a, File(obj, Objects.MOVABLE)); warn(a, File(other, Objects.REAL)); warn(a, File(b, Objects.INSIDE))
        assertTrue((Layout.checkMove(car, File(obj, Objects.REAL)) as Verdict.Warn).text.contains("литер"))
        // Можно молча: помещение из одного литера в другой, опись — в механизмы другого объекта предупреждением.
        allow(kitchen, File(b, Objects.INSIDE))
        warn(inv, File(other, Objects.MACHINES))
    }

    @Test fun хранилище_само_отказывает_в_запрещённом() {
        val obj = setUp()
        val a = Objects.addBuilding(obj, "Литер А")!!
        File(obj, Objects.DOCS).mkdirs()
        assertNull("литер в документы — нет", Store.moveFolder(a, File(obj, Objects.DOCS)))
        assertTrue(a.isDirectory)
        val facade = File(a, Objects.FACADE).also { it.mkdirs() }
        assertNull("раздел не переименовывается", Store.renameFolder(facade, "Двор"))
        assertNull("раздел не переносится", Store.moveFolder(facade, obj))
        assertTrue(facade.isDirectory)
    }

    @Test fun переход_раскладки_помечен_и_чинит() {
        val obj = setUp()
        File(obj, Objects.MACHINES).mkdirs()
        File(obj, "${Objects.DOCS}/Лишняя папка").mkdirs()
        assertEquals(listOf("папка внутри документов"), Layout.problems())
        Layout.migrate()
        assertEquals(Layout.VERSION.toString(), File(Store.root, ".структура").readText())
        assertFalse("пустой раздел с диска убран", File(obj, Objects.MACHINES).exists())
        assertTrue("чужое не трогается", File(obj, "${Objects.DOCS}/Лишняя папка").isDirectory)
    }
}
