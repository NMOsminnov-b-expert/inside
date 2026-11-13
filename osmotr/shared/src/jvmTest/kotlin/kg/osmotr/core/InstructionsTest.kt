package kg.osmotr.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** Разметка инструкций (composeResources/files/instructions) и поиск по ней. Дословность — tools/instructions/check.py. */
class InstructionsTest {
    private val dir = java.io.File(System.getProperty("user.dir")).let { d ->
        listOf(d, d.parentFile).map { java.io.File(it, "shared/src/commonMain/composeResources/files/instructions") }
            .plus(java.io.File(d, "src/commonMain/composeResources/files/instructions")).first { it.isDirectory }
    }
    private val index = Instructions.parseIndex(java.io.File(dir, "index.json").readText())
    private val docs = index.map { Instructions.parseDoc(it, java.io.File(dir, "${it.id}/doc.json").readText()) }
    private fun doc(id: String) = docs.first { it.id == id }

    @Test fun все_документы_и_их_файлы_на_месте() {
        assertEquals(22, docs.size)
        docs.forEach { d ->
            d.images.forEach { assertTrue(java.io.File(dir, "${d.id}/${it.file}").isFile, "${d.id}/${it.file}") }
            d.pdf?.let { assertTrue(java.io.File(dir, "${d.id}/$it").isFile, "${d.id}/$it") }
            assertTrue(d.blocks.isNotEmpty() || d.pages.isNotEmpty(), d.id)
        }
        // Общая памятка фаст-режима — первой: с неё начинают; названия — видом объекта, не именем файла.
        assertEquals("fast", docs.first().id)
        assertEquals("Жилой дом", docs.first { it.id == "dom" }.title)
    }

    @Test fun памятки_разделы_и_бланк() {
        // У каждой инструкции «как фотографировать» — памятка и разделы с итогом; у ИБП разделов
        // нет: одна страница шагов «1.–4.», заголовков в ней не было.
        docs.filter { it.entry.group == "Как фотографировать" }.forEach { d ->
            assertNotNull(d.memo, d.id)
            if (d.id != "ibp") assertTrue(d.sections.size >= 2, "${d.id}: ${d.sections.map { it.title }}")
        }
        assertEquals(listOf("Подготовка", "Общий вид", "Шильдик", "Состояние и износ", "ИТОГ: последовательность осмотра"),
            doc("transformator").sections.map { it.title })
        // Акт — бланком: страницы PDF и сам PDF для отправки организации.
        val akt = doc("akt")
        assertEquals(2, akt.pages.size)
        assertEquals("original.pdf", akt.pdf)
        assertEquals("original.pdf", doc("infopc").pdf)
        // Картинки для листания — памятка первой.
        assertEquals(doc("transformator").memo, doc("transformator").images.first())
    }

    @Test fun жирное_курсив_и_подписи_сохранены() {
        val t = doc("transformator")
        val safety = t.blocks.filterIsInstance<Instructions.Block.Para>().first()
        assertEquals("Техника безопасности!", safety.runs.first().text.trim())
        assertTrue(safety.runs.first().bold)
        val photos = t.blocks.filterIsInstance<Instructions.Block.Images>().first()
        assertEquals(listOf("Общий вид спереди", "Общий вид под углом"), photos.items.map { Instructions.text(it.caption) })
        assertTrue(photos.items.first().caption.all { it.italic })
        // Подпись на пару фото — общая на ряд, а не одному из них.
        val row = doc("tehnologicheskoe").blocks.filterIsInstance<Instructions.Block.Images>().first { Instructions.text(it.caption) == "Элеватор" }
        assertTrue(row.items.all { it.caption.isEmpty() })
    }

    @Test fun поиск_по_всем() {
        val hits = Instructions.search(docs, "шильдик")
        assertTrue(hits.map { it.doc.id }.toSet().size >= 5, hits.map { it.doc.id }.toString())
        // Заголовки — первыми.
        assertTrue(hits.first().doc.blocks[hits.first().block] is Instructions.Block.Heading)
        // Регистр и «ё» не различаются; слова — в любом порядке.
        assertTrue(Instructions.search(docs, "ПОДТЕКИ МАСЛА").any { it.doc.id == "transformator" })
        assertTrue(Instructions.search(docs, "масла подтёки").any { it.doc.id == "transformator" })
        // Подписи к фото тоже ищутся; находка знает свой раздел.
        val elevator = Instructions.search(docs, "элеватор").single()
        assertEquals("tehnologicheskoe", elevator.doc.id)
        assertEquals("3. Технологическая линия", elevator.section)
        // Бланк — по названию.
        assertTrue(Instructions.search(docs, "акт подтверждения").any { it.doc.id == "akt" })
        assertTrue(Instructions.search(docs, "  ").isEmpty())
    }

    @Test fun перекрёстные_ссылки_текста() {
        val p = doc("poryadok")
        val text = "Остальные позиции подтверждаются актом (см. п. 4)."
        val ref = Instructions.references(p, text).single()
        assertEquals("см. п. 4", text.substring(ref.start, ref.end))
        assertEquals("4. Акт подтверждения наличия", Instructions.text((p.blocks[ref.block!!] as Instructions.Block.Heading).runs))
        // «InfoPC.bat» — в инструкцию по нему; в ней самой — не ссылка; «тип. 5» — не пункт.
        assertEquals("infopc", Instructions.references(doc("pk"), "программу InfoPC.bat для").single().doc)
        assertTrue(Instructions.references(doc("infopc"), "файлом InfoPC.bat;").isEmpty())
        assertTrue(Instructions.references(p, "тип. 5 и п. 9").isEmpty())
    }

    @Test fun инструкция_к_предмету_по_названию() {
        val cases = mapOf(
            "Трансформатор силовой ТМ-630/10" to "transformator",
            "КТП-400" to "transformator",
            "Ячейка КРУ-2-10 с вакуумным выключателем" to "yacheiki",
            "Камера КСО-366" to "yacheiki",
            "Трансформатор тока в ячейке" to "yacheiki",
            "Насос центробежный К 100-65" to "nasosy",
            "Электродвигатель АИР 132" to "nasosy",
            "ИБП APC Smart-UPS 1500" to "ibp",
            "Источник бесперебойного питания" to "ibp",
            "Ноутбук HP ProBook" to "pk",
            "Системный блок Intel i5" to "pk",
            "Котёл водогрейный" to "inzhenernye",
            "Сплит-система Midea" to "inzhenernye",
            "Станок токарный 16К20" to "tehnologicheskoe",
            "Линия розлива" to "tehnologicheskoe",
        )
        cases.forEach { (name, id) -> assertEquals(id, Instructions.forItem(name), name) }
        // Короткие слова — только целиком: «кру» не ловит «круглый», «пк» — «пкс».
        listOf("Стол круглый", "Стул офисный", "Шкаф металлический", "").forEach { assertEquals(null, Instructions.forItem(it), it) }
    }

    @Test fun фаст_режим_к_месту_и_к_предмету() {
        fun place(form: Params.Form, vararg v: Pair<String, Any>, house: Boolean = false) = Instructions.forPlace(form, mapOf(*v), house)
        assertEquals(Instructions.Advice("avto", listOf("spectehnika")), place(Params.Form.VEHICLE))
        assertEquals(Instructions.Advice("uchastok", emptyList()), place(Params.Form.LAND))
        assertEquals(Instructions.Advice("kvartira", emptyList()), place(Params.Form.BUILDING, Params.OBJ_KIND to Params.FLAT))
        assertEquals(Instructions.Advice("dom", emptyList()), place(Params.Form.BUILDING, Params.OBJ_KIND to Params.HOUSE))
        assertEquals("otdelnoe", place(Params.Form.BUILDING, Params.OBJ_KIND to Params.BUILDING).best, "здание — отдельностоящее (офисы, склады)")
        assertEquals("vstroennoe", place(Params.Form.BUILDING, Params.OBJ_KIND to Params.BUILDING, "buildType" to "Встроенное").best)
        assertEquals("baza", place(Params.Form.BUILDING, Params.OBJ_KIND to Params.OTHER).best, "прочее — навесы, ангары, сооружения")
        assertEquals("dom", place(Params.Form.BUILDING, Params.OBJ_KIND to Params.AUX, house = true).best, "постройка у дома — хозпостройка")
        assertEquals("baza", place(Params.Form.BUILDING, Params.OBJ_KIND to Params.AUX).best)
        val none = place(Params.Form.BUILDING)
        assertEquals(null, none.best, "тип не выбран — не угадывать")
        assertTrue("dom" in none.more && "kvartira" in none.more && "baza" in none.more)
        assertEquals("spectehnika", Instructions.forItem("Экскаватор-погрузчик JCB"))
        assertEquals("avto", Instructions.forItem("Автомобиль Toyota Camry"))
        assertEquals("ofis", Instructions.forItem("МФУ Canon"))
        assertEquals("ibp", Instructions.forItem("ИБП APC 1500"))
    }
}
