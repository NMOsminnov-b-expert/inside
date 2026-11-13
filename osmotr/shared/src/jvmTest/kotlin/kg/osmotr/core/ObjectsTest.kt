package kg.osmotr.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Объекты (автор, 29.10.2026): раскладка объекта, сведения, литеры и найденное, ТС по госномеру, места описей
 * и разовый перенос прежнего в «Осмотрено ранее (старая версия)» — с целым журналом описи.
 */
class ObjectsTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun setUp() {
        Store.init(File(tmp.root.path), File(tmp.root.path + "/.app")); Store.ensureRoot()
        Journal.forget()
    }

    private fun опись(home: File, name: String): File {
        val dir = File(home, name).also { it.mkdirs() }
        Xlsx.writeBook(File(dir, Inventory.PREFIX + "$name.xlsx"), listOf(Xlsx.Out("Опись", listOf(listOf("№", "Наименование", "Инв. номер"),
            listOf("1", "Шкаф", "МТ-101"), listOf("2", "Стол", "МТ-102")))))
        return dir
    }

    /** Три сущности (автор, 03.11.2026: «ТС, недвижка и опись. Документы - раздел»): разделы — по сущности. */
    @Test fun сущности_объекта() {
        setUp()
        val car = Objects.create("КамАЗ · 02KG200", Objects.Info("Министерство", "", Objects.Entity.VEHICLE))
        assertEquals("у ТС — только документы", listOf(Objects.DOCS), Objects.baseChildren(car))
        assertEquals("объект-ТС — сам машина: форма ТС у объекта", Params.Form.VEHICLE, Params.formOf(car))
        assertEquals(Objects.Entity.VEHICLE, Objects.entity(car))
        Objects.setInfo(car, Objects.Info("Министерство", "Бишкек"))
        assertEquals("сведения без вида вид не стирают", Objects.Entity.VEHICLE, Objects.entity(car))
        val inv = Objects.create("Котельная", Objects.Info("", "", Objects.Entity.INVENTORY))
        assertEquals(listOf(Objects.DOCS, Objects.MACHINES), Objects.baseChildren(inv))
        val house = Objects.create("Дом", Objects.Info("", "", Objects.Entity.REAL))
        assertEquals(listOf(Objects.DOCS, Objects.REAL, Objects.MOVABLE, Objects.MACHINES), Objects.baseChildren(house))
        assertEquals("ТС — «Транспортные средства»", "Транспортные средства", Objects.MOVABLE)
        assertTrue("госномер без регистра — то же ТС", Objects.addVehicle(house, "01kg 123") != null && Objects.addVehicle(house, "01KG 123") == null)
    }

    /** «Движимое» прежних объектов — «Транспортные средства» (шаг перехода раскладки 3). */
    @Test fun движимое_в_транспортные_средства() {
        setUp()
        val obj = Objects.create("Школа", Objects.Info())
        val car = File(obj, "${Objects.OLD_MOVABLE}/01KG123").also { it.mkdirs() }
        File(car, "a.jpg").writeBytes(byteArrayOf(1, 2, 3))
        File(Store.root, ".структура").writeText("2")
        Layout.migrate()
        assertTrue(File(obj, "${Objects.MOVABLE}/01KG123/a.jpg").isFile)
        assertFalse(File(obj, Objects.OLD_MOVABLE).exists())
    }

    @Test fun объект_со_всей_раскладкой_и_сведениями() {
        setUp()
        val obj = Objects.create("Школа № 5", Objects.Info("СШ № 5 им. Токтогула", "Бишкек, ул. Ленина 10"))
        assertTrue(Objects.isObject(obj))
        // Базовые папки — на экране сразу, на диске — с первым файлом (автор, 03.11.2026).
        for (p in listOf(Objects.DOCS, Objects.MOVABLE, Objects.MACHINES, "${Objects.REAL}/${Objects.LAND}", "${Objects.REAL}/${Objects.DOCS}")) {
            assertTrue("есть «$p»", Objects.present(File(obj, p)))
            assertTrue("«$p» не на диске, пока пуста", !File(obj, p).exists())
        }
        assertEquals(Objects.Info("СШ № 5 им. Токтогула", "Бишкек, ул. Ленина 10"), Objects.info(obj))
        Objects.setInfo(obj, Objects.Info("СШ № 5", "Бишкек"))
        assertEquals("СШ № 5", Objects.info(obj).institution)
        assertEquals("имя занято — с номером", "Школа № 5 (2)", Objects.create("Школа № 5").name)
        assertEquals(listOf(obj.name, "Школа № 5 (2)"), Objects.all().map { it.name })
    }

    @Test fun базовые_папки_пустые_с_диска_прочь_своё_остаётся() {
        setUp()
        val obj = Objects.create("Школа")
        val a = Objects.addBuilding(obj, "Литер А")!!
        File(a, Objects.FACADE).mkdirs(); File(a, Objects.INSIDE).mkdirs(); File(obj, Objects.MACHINES).mkdirs()
        Store.writeDurably(File(obj, "${Objects.DOCS}/Акт.pdf"), "%PDF".encodeToByteArray())
        val own = File(a, "${Objects.INSIDE}/Котельная").also { it.mkdirs() }
        File(obj, "${Objects.REAL}/${Objects.LAND}").mkdirs()
        Objects.prune(obj)
        assertTrue("пустые базовые — прочь", !File(a, Objects.FACADE).exists() && !File(obj, Objects.MACHINES).exists() && !File(obj, "${Objects.REAL}/${Objects.LAND}").exists())
        assertTrue("с файлом — остаётся", File(obj, "${Objects.DOCS}/Акт.pdf").isFile)
        assertTrue("своя папка (пусть пустая) — остаётся", own.isDirectory && a.isDirectory)
        assertTrue("базовая с моей папкой — остаётся", File(a, Objects.INSIDE).isDirectory)
        assertTrue(Objects.isBase(File(a, Objects.FACADE)) && !Objects.isBase(own) && !Objects.isBase(a))
    }

    @Test fun документы_недвижимости_в_недвижимом_не_литер() {
        setUp()
        val obj = Objects.create("Школа")
        val docs = Objects.realDocs(obj)
        assertTrue("папка есть сразу", Objects.present(docs))
        Objects.addBuilding(obj, "Литер А")
        // Не литер: ни в списке литеров, ни формы параметров; литер с таким именем не завести.
        assertEquals(listOf("Литер А"), Objects.buildings(obj).map { it.name })
        assertEquals(null, Params.formOf(docs))
        assertEquals(null, Objects.addBuilding(obj, "документы"))
        // Разбор: PDF — можно; в литер и его помещения — по-прежнему нельзя (техпаспорт к литеру не привязать).
        val places = Objects.places(obj)
        assertTrue(places.single { it.dir == docs }.pdf)
        assertTrue(places.filter { "Литер А" in it.title }.none { it.pdf })
    }

    @Test fun литеры_и_найденное_с_помещениями_и_фасадом() {
        setUp()
        val obj = Objects.create("Склад")
        val a = Objects.addBuilding(obj, "Литер А")!!
        assertTrue(Objects.present(File(a, Objects.INSIDE))); assertTrue(Objects.present(File(a, Objects.FACADE)))
        assertTrue("найденное, которого нет в техпаспорте", Objects.addBuilding(obj, "Навес") != null)
        assertNull("повтор — нет", Objects.addBuilding(obj, "Литер А"))
        assertNull("участок — не литер", Objects.addBuilding(obj, "земельный участок"))
        assertNull("пустое имя — нет", Objects.addBuilding(obj, "   "))
        assertEquals(listOf("Литер А", "Навес"), Objects.buildings(obj).map { it.name })
        assertTrue("участок без деления", Store.foldersIn(File(obj, "${Objects.REAL}/${Objects.LAND}")).isEmpty())
    }

    @Test fun тс_по_госномеру_руками() {
        setUp()
        val obj = Objects.create("Автобаза")
        assertEquals("01KG 123 ABC", Objects.plate("  01kg  123   abc "))
        val v = Objects.addVehicle(obj, "01kg 123 abc")!!
        assertEquals("01KG 123 ABC", v.name)
        assertNull("тот же номер иначе написан — та же машина", Objects.addVehicle(obj, "01KG123ABC"))
        assertNull("пусто — нет", Objects.addVehicle(obj, " "))
        assertEquals(listOf("01KG 123 ABC"), Objects.vehicles(obj).map { it.name })
    }

    @Test fun прежнее_целиком_в_осмотрено_ранее_и_журнал_цел() {
        setUp()
        val склад = опись(Store.root, "Склад")
        val items = Inventory.parse(Inventory.fileIn(склад)!!).items
        val dir = Inventory.openFolder(склад, items[0])
        val photo = Store.newPhotoFile(dir, "jpg"); photo.writeBytes(ByteArray(3000) { (it % 251).toByte() }); Store.releasePhotoName(photo)
        Journal.add(dir, "Снимок", file = photo)
        assertTrue("до переноса журнал цел", Journal.verifyQuick(склад).let { it.brokenAt == null && it.problems.isEmpty() })
        Store.createFolder(Store.root, "Просто папка")!!
        File(Store.root, "заметка.txt").writeText("x")

        Objects.migrateOnce()

        val old = Objects.old()
        assertEquals("в «Осмотрах» — только «Осмотрено ранее»", listOf(Objects.OLD), (Store.root.listFiles() ?: emptyArray()).filter { !it.name.startsWith(".") }.map { it.name })
        assertEquals(setOf("Склад", "Просто папка", "заметка.txt"), (old.listFiles() ?: emptyArray()).filter { !it.name.startsWith(".") }.map { it.name }.toSet())
        val moved = File(old, "Склад")
        assertTrue("снимок на месте", File(moved, Store.relative(photo).removePrefix("Склад/")).isFile)
        val check = Journal.verifyQuick(moved)
        assertNull("журнал не сломан переносом: ${check.reason}", check.brokenAt)
        assertTrue("ни одного «пропал»/«появился»: ${check.problems}", check.problems.isEmpty())
        assertEquals("опись видна на новом месте", listOf(moved), Objects.inventories())
        assertTrue("объём прежнего посчитан", Objects.oldBytes() > 3000)
    }

    @Test fun перенос_один_раз_и_новое_не_трогает() {
        setUp()
        опись(Store.root, "Склад")
        Objects.migrateOnce()
        val obj = Objects.create("Школа")
        опись(File(obj, Objects.MACHINES), "Мебель")
        Store.createFolder(Store.root, "Позже по USB")!!
        Objects.migrateOnce()
        assertTrue("объект на месте", obj.isDirectory)
        assertTrue("положенное позже — не трогаем, перенос был", File(Store.root, "Позже по USB").isDirectory)
        assertEquals(setOf("Склад", "Мебель"), Objects.inventories().map { it.name }.toSet())
        assertEquals(obj, Objects.of(File(obj, "${Objects.MACHINES}/Мебель")))
        assertNull(Objects.of(File(Objects.old(), "Склад")))
    }

    @Test fun пустые_осмотры_только_метка() {
        setUp()
        Objects.migrateOnce()
        assertFalse("«Осмотрено ранее» не заводим зря", Objects.old().exists())
        assertEquals(0L, Objects.oldBytes())
    }

    @Test fun новая_опись_в_механизмы_объекта() {
        setUp()
        val obj = Objects.create("Школа")
        val src = опись(tmp.newFolder("src").let { File(it.path) }, "Мебель")
        val inv = Inventory.create("Мебель", File(obj, Objects.MACHINES)) { it.write(Inventory.fileIn(src)!!.readBytes()) }
        assertEquals(File(obj, Objects.MACHINES), inv.parentFile)
        assertEquals(obj, Objects.of(inv))
        assertEquals(inv, Inventory.sameAs(Inventory.fileIn(src)!!.readBytes()))
    }

    @Test fun pdf_в_папке_под_своим_именем() {
        setUp()
        val obj = Objects.create("Школа")
        val docs = File(obj, Objects.DOCS)
        val pdf = "%PDF-1.4\n%%EOF\n".encodeToByteArray()
        val a = Store.addFile(docs, "Техпаспорт.pdf") { it.write(pdf) }
        val b = Store.addFile(docs, "Техпаспорт.pdf") { it.write(pdf) }
        val c = Store.addFile(docs, "Акт: 5/2.pdf") { it.write(pdf) }
        assertEquals("Техпаспорт.pdf", a.name)
        assertEquals("имя занято — с номером", "Техпаспорт (2).pdf", b.name)
        assertTrue("запрещённые знаки — пробелами: ${c.name}", c.name.endsWith(".pdf") && ':' !in c.name && '/' !in c.name)
        assertTrue(Store.isPdf(a))
        assertEquals(3, Store.list(docs).pdfs.size)
        assertTrue("PDF — не снимок", Store.list(docs).photos.isEmpty())
    }

    @Test fun места_разбора_и_где_можно_pdf() {
        setUp()
        val obj = Objects.create("Школа")
        Objects.addBuilding(obj, "Литер А"); Objects.addVehicle(obj, "01KG 1 A")
        val p = Objects.places(obj)
        assertEquals(listOf(Objects.DOCS, "Недвижимое · документы", Objects.LAND, "Литер А · помещения", "Литер А · фасад", "ТС 01KG 1 A · документы", "ТС 01KG 1 A · снимки"), p.map { it.title })
        assertEquals("PDF — к объекту, к недвижимости (не к литеру) и к госномеру", listOf(Objects.DOCS, "Недвижимое · документы", "ТС 01KG 1 A · документы"),
            p.filter { it.pdf }.map { it.title })
        assertTrue("все места — папки объекта", p.all { Objects.present(it.dir) && Objects.of(it.dir) == obj })
    }

    @Test fun места_своих_категорий_и_участков() {
        setUp()
        val obj = Objects.create("Школа")
        Store.createFolder(obj, "Сооружения")!!
        File(obj, "${Objects.REAL}/${Objects.LAND}/Участок 1").mkdirs()
        val p = Objects.places(obj)
        assertTrue("участок из листа — место", p.any { it.title == "${Objects.LAND} · Участок 1" && !it.pdf })
        assertTrue("своя категория — место, и для PDF", p.any { it.title == "Сооружения" && it.pdf })
        assertEquals(listOf("Сооружения"), Objects.categories(obj).map { it.name })
    }

    @Test fun все_документы_объекта_по_местам() {
        val obj = Objects.create("Школа")
        Store.addFile(File(obj, Objects.DOCS), "Устав.pdf") { it.write("%PDF".encodeToByteArray()) }
        val car = Objects.addVehicle(obj, "01KG123ABC")!!
        val docs = Objects.vehicleDocs(car)
        Store.addFile(docs, "СТС.jpg") { it.write(byteArrayOf(1, 2)) }
        Store.addFile(docs, "Договор.docx") { it.write(byteArrayOf(1, 2)) }
        Store.addFile(car, "снимок.jpg") { it.write(byteArrayOf(1, 2)) }
        val all = Objects.documents(obj).associate { it.title to it.files.map(File::name).toSet() }
        assertEquals(setOf("Устав.pdf"), all[Objects.DOCS])
        assertEquals("скан в «Документах» — документ, снимок ТС — нет", setOf("СТС.jpg", "Договор.docx"), all.entries.single { "01KG123ABC" in it.key }.value)
        assertTrue("служебное не документ", Store.docsIn(car).isEmpty())
    }
}
