package kg.osmotr.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** Параметры осмотра недвижимости (автор, 29.10.2026): какая форма у папки, видимость и обязательность, хранение. */
class ParamsTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun setUp(): File {
        Store.init(File(tmp.root.path), File(tmp.root.path + "/.app")); Store.ensureRoot()
        return Objects.create("Школа")
    }

    @Test fun форма_по_папке() {
        val obj = setUp()
        val a = Objects.addBuilding(obj, "Литер А")!!
        val plot = File(obj, "${Objects.REAL}/${Objects.LAND}/Участок 1").also { it.mkdirs() }
        assertEquals(Params.Form.BUILDING, Params.formOf(a))
        assertEquals(Params.Form.LAND, Params.formOf(File(obj, "${Objects.REAL}/${Objects.LAND}")))
        assertEquals("участок из листа — тоже участок", Params.Form.LAND, Params.formOf(plot))
        assertNull("помещения литера — не форма", Params.formOf(File(a, Objects.INSIDE)))
        assertNull(Params.formOf(File(obj, Objects.DOCS)))
        assertNull(Params.formOf(obj))
    }

    @Test fun видимость_и_обязательность_строения() {
        val f = Params.Form.BUILDING
        val empty = Params.progress(f, emptyMap())
        assertEquals("обязательны только инженерные сети", 5, empty.requiredLeft)
        val keys = Params.visibleFields(f, emptyMap()).map { it.key }
        assertTrue("капитальность вырезана", keys.none { it == "litKind" || it.startsWith("cap_") || it.startsWith("purposeFact") || it == "tempMode" })
    }

    @Test fun участок_обязательные_сети() {
        val p = Params.progress(Params.Form.LAND, mapOf("electricity" to "Подведены", "centralWater" to "На удалении"))
        assertEquals(2, p.filled); assertEquals(12, p.total); assertEquals("канализация, газ, отопление", 3, p.requiredLeft)
        val keys = Params.visibleFields(Params.Form.LAND, emptyMap()).map { it.key }
        assertTrue("сервитуты и расположение убраны", listOf("encumbrance", "location", "roadLocation", "corner").none { it in keys })
        assertTrue("особенности остались", "locationFeatures" in keys)
    }

    @Test fun хранение_в_папке() {
        val obj = setUp()
        val a = Objects.addBuilding(obj, "Литер А")!!
        Params.save(a, mapOf("buildType" to "Встроенное", "floorsN" to "2", "cap_civil_eng" to listOf("Стандартное", "Высокое"), "note" to " "))
        assertTrue("файл по имени литера", File(a, "Литер_А.json").isFile)
        assertEquals(mapOf("buildType" to "Встроенное", "floorsN" to "2", "cap_civil_eng" to listOf("Стандартное", "Высокое")), Params.load(a))
        Params.save(a, emptyMap())
        assertTrue("всё пусто — файла нет", !File(a, "Литер_А.json").exists())
    }

    @Test fun сети_с_участка_копией_в_литеры() {
        val obj = setUp()
        val a = Objects.addBuilding(obj, "Литер А")!!; val b = Objects.addBuilding(obj, "Литер Б")!!
        val land = File(obj, "${Objects.REAL}/${Objects.LAND}")
        assertEquals(obj, Params.objectOfLand(land))
        assertEquals("в обе литеры", 2, Params.carryFromLand(land, "electricity", "Подведены", replaceOwn = false))
        assertEquals("Подведены", Params.load(a)["electricity"])
        // В литере Б правят своё — следующий перенос его не трогает без согласия.
        Params.save(b, Params.load(b) + ("electricity" to "На удалении"))
        assertEquals(listOf(b), Params.ownValues(obj, land, "electricity", "Проходят рядом").map { it.first })
        assertEquals("только копия обновилась", 1, Params.carryFromLand(land, "electricity", "Проходят рядом", replaceOwn = false))
        assertEquals("Проходят рядом", Params.load(a)["electricity"]); assertEquals("На удалении", Params.load(b)["electricity"])
        assertEquals("с согласием — и копия, и своё", 2, Params.carryFromLand(land, "electricity", "Подведены", replaceOwn = true))
        assertEquals("Подведены", Params.load(b)["electricity"])
        // Участок очищен — копии снимаются.
        Params.carryFromLand(land, "electricity", "", replaceOwn = false)
        assertNull(Params.load(a)["electricity"])
    }

    @Test fun сети_всем_литерам_разом() {
        val obj = setUp()
        val a = Objects.addBuilding(obj, "Литер А")!!; Objects.addBuilding(obj, "Литер Б")!!
        assertEquals("", Params.commonValue(obj, "sewerage"))
        Params.save(a, mapOf("sewerage" to "Септик"))
        assertNull("разные", Params.commonValue(obj, "sewerage"))
        assertEquals("своё у А не тронуто", 1, Params.setForAll(obj, "sewerage", "Подведена центральная", replaceOwn = false))
        assertEquals("Септик", Params.load(a)["sewerage"])
        Params.setForAll(obj, "sewerage", "Подведена центральная", replaceOwn = true)
        assertEquals("Подведена центральная", Params.commonValue(obj, "sewerage"))
    }

    @Test fun прежние_файлы_в_файл_литера() {
        val obj = setUp()
        val a = Objects.addBuilding(obj, "Литер А")!!
        File(a, Params.LEGACY).writeText("{\"buildType\": \"Встроенное\"}")
        File(a, Store.NOTE).writeText("Крыша течёт\n")
        assertEquals("Крыша течёт", Store.note(a))
        assertEquals(mapOf("buildType" to "Встроенное", "note" to "Крыша течёт"), Params.load(a))
        assertTrue("прежнее убрано", !File(a, Params.LEGACY).exists() && !File(a, Store.NOTE).exists())
        Store.setNote(a, "Течь устранена")
        assertEquals("Течь устранена", Params.load(a)["note"])
        assertTrue("комментарий — не отдельным файлом", !File(a, Store.NOTE).exists())
        // Литер переименовали — файл переименуется следом.
        val b = File(a.parentFile!!, "Литер Б"); assertTrue(a.renameTo(b))
        assertEquals("Встроенное", Params.load(b)["buildType"])
        assertTrue(File(b, "Литер_Б.json").isFile)
    }

    @Test fun тип_участка() {
        val other = Params.visibleFields(Params.Form.LAND, emptyMap()).map { it.key }
        assertTrue("тип не выбран — сети", listOf("electricity", "railway").all { it in other })
        assertTrue("сельхоза нет", listOf("useCategory", "soil", "irrigationDistance", "utilities").none { it in other })
        assertEquals("сети обязательны", 5, Params.progress(Params.Form.LAND, emptyMap()).requiredLeft)
        val agri = mapOf<String, Any>(Params.LAND_TYPE to Params.AGRI)
        val keys = Params.visibleFields(Params.Form.LAND, agri).map { it.key }
        assertTrue("сельхоз-характеристики", listOf("useCategory", "irrigation", "irrigationDistance", "irrigationType", "soil", "utilities", "form", "note").all { it in keys })
        assertTrue("сетей и ветки нет", listOf("electricity", "railway").none { it in keys })
        assertEquals("обязательных нет", 0, Params.progress(Params.Form.LAND, agri).requiredLeft)
    }

    @Test fun тс_и_квартира() {
        val obj = setUp()
        val car = Objects.addVehicle(obj, "01KG 123 ABC")!!
        assertEquals("папка госномера — форма ТС", Params.Form.VEHICLE, Params.formOf(car))
        val keys = Params.visibleFields(Params.Form.VEHICLE, emptyMap()).map { it.key }
        assertTrue("показания", listOf("f.plate", "ts.addr", "f.mileage", "f.mileage@unit", "f.wheel", "f.fuel").all { it in keys })
        assertTrue("осей и комплектности нет", listOf("f.axles", "f.kit").none { it in keys })
        assertTrue("модули, VIN, кузов и шасси осмотрщик не ставит", listOf("hasModule", "m.model", "f.vin", "f.bodyNo", "f.chassisNo").none { it in keys })
        assertEquals("подставленный госномер заполненным не считается", 0, Params.progress(Params.Form.VEHICLE, mapOf(Params.PLATE to "01KG123ABC")).filled)
        Params.save(car, mapOf("f.plate" to "01KG123ABC"))
        assertTrue("файл по госномеру", File(car, "01KG_123_ABC.json").isFile)

        val flat = mapOf<String, Any>(Params.OBJ_KIND to "Квартира")
        val fk = Params.visibleFields(Params.Form.BUILDING, flat).map { it.key }
        assertTrue("поля квартиры", listOf("aptFloor", "aptRooms", "electricity", "note").all { it in fk })
        assertTrue("строения у квартиры нет", listOf("buildType", "floorsN").none { it in fk })
        assertEquals("обязательны только инженерные сети", 5, Params.progress(Params.Form.BUILDING, flat).requiredLeft)
        val lit = Objects.addBuilding(obj, "Б")!!
        Params.save(lit, mapOf(Params.OBJ_KIND to "Строение", "sanuzel" to listOf("Внутри", "Снаружи")))
        assertEquals("прежнее «Строение» — Здание", "Здание", Params.load(lit)[Params.OBJ_KIND])
        assertEquals("прежний «sanuzel» — ключ системы «bathroom»", listOf("Внутри", "Снаружи"), Params.load(lit)["bathroom"])
        assertTrue("bathroom" in fk && "sanuzel" !in Params.load(lit))
    }
}
