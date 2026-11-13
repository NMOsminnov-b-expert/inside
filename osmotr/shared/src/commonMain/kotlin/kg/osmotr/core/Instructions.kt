package kg.osmotr.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Инструкции по осмотрам (автор, 30.10.2026: «зашить в приложение… так, чтобы сами инструкции не
 * изменились, но было удобно по ним ориентироваться»).
 *
 * Источник — PDF компании в `instructions/source`; `tools/instructions/build.py` раскладывает их в
 * `composeResources/files/instructions`: слова дословно, жирное и курсив на местах, фото и памятки —
 * теми же байтами. `tools/instructions/check.py` сверяет слова с PDF. Здесь — только чтение
 * разметки, разделы, поиск и подбор инструкции к предмету описи.
 */
object Instructions {
    const val BOLD = 1
    const val ITALIC = 2

    class Run(val text: String, val style: Int) {
        val bold get() = style and BOLD != 0
        val italic get() = style and ITALIC != 0
    }

    class Image(val file: String, val width: Int, val height: Int, val caption: List<Run>)

    sealed interface Block {
        /** [level] 1 — заголовок документа, 2 — раздел. */
        class Heading(val level: Int, val runs: List<Run>) : Block
        class Para(val runs: List<Run>) : Block
        /** Пункт списка: [marker] как в документе — «•», «o», «-» или номер «1.». */
        class Item(val marker: String, val level: Int, val runs: List<Run>) : Block
        /** Фото рядом, как стоят в документе; [caption] — общая подпись ряда. */
        class Images(val items: List<Image>, val caption: List<Run>) : Block
    }

    class Entry(val id: String, val title: String, val group: String) {
        /** Имя в списках и подсказках: «Как фотографировать трансформатор» → «Трансформатор». */
        val short: String get() = title.removePrefix("Как фотографировать ").replaceFirstChar { it.uppercase() }
    }

    class Doc(
        val entry: Entry,
        /** Памятка — первая страница документа, одной картинкой. */
        val memo: Image?,
        /** Бланк (акт) — страницами самого PDF: колонкой таблицу с полями не прочесть. */
        val pages: List<Image>,
        /** PDF для передачи организации (акт, InfoPC.bat) — отправляется как есть. */
        val pdf: String?,
        val blocks: List<Block>,
    ) {
        val id get() = entry.id
        val title get() = entry.title

        /** Разделы — заголовки второго уровня; по ним полоса оглавления над текстом. */
        val sections: List<Section> by lazy {
            blocks.withIndex().mapNotNull { (i, b) -> (b as? Block.Heading)?.takeIf { it.level == 2 }?.let { Section(text(it.runs), i) } }
        }

        /** Все картинки по порядку: памятка, страницы бланка, фото — для листания при увеличении. */
        val images: List<Image> by lazy {
            listOfNotNull(memo) + pages + blocks.filterIsInstance<Block.Images>().flatMap { it.items }
        }
    }

    class Section(val title: String, val block: Int)

    /** Находка поиска: документ, блок (куда прокрутить), раздел и кусок текста вокруг совпадения. */
    class Hit(val doc: Doc, val block: Int, val section: String?, val snippet: String)

    private val json = Json { ignoreUnknownKeys = true }

    fun text(runs: List<Run>) = runs.joinToString("") { it.text }

    fun parseIndex(text: String): List<Entry> = json.parseToJsonElement(text).jsonArray.map {
        val o = it.jsonObject
        Entry(o.str("id"), o.str("title"), o.str("group"))
    }

    fun parseDoc(entry: Entry, text: String): Doc {
        val o = json.parseToJsonElement(text).jsonObject
        val blocks = o["blocks"]!!.jsonArray.map { e ->
            val b = e.jsonObject
            when (b.str("k")) {
                "h" -> Block.Heading(b["lvl"]!!.jsonPrimitive.int, runs(b["runs"]))
                "li" -> Block.Item(b.str("m"), b["lvl"]!!.jsonPrimitive.int, runs(b["runs"]))
                "img" -> Block.Images(b["items"]!!.jsonArray.map { image(it.jsonObject) }, runs(b["cap"]))
                else -> Block.Para(runs(b["runs"]))
            }
        }
        return Doc(entry, (o["memo"] as? JsonObject)?.let(::image), (o["pages"] as? JsonArray)?.map { image(it.jsonObject) }.orEmpty(),
            o["pdf"]?.jsonPrimitive?.content, blocks)
    }

    private fun JsonObject.str(k: String) = this[k]!!.jsonPrimitive.content

    private fun runs(e: kotlinx.serialization.json.JsonElement?): List<Run> = (e as? JsonArray)?.map {
        val r = it.jsonArray
        Run(r[0].jsonPrimitive.content, r[1].jsonPrimitive.int)
    }.orEmpty()

    private fun image(o: JsonObject) = Image(o.str("f"), o["w"]!!.jsonPrimitive.int, o["h"]!!.jsonPrimitive.int, runs(o["cap"]))

    /** Для поиска: регистр и «ё» не различаются (как в поиске по папкам). */
    fun fold(s: String) = s.lowercase().replace('ё', 'е')

    /** Текст блока для поиска: с подписями фото. */
    fun blockText(b: Block): String = when (b) {
        is Block.Heading -> text(b.runs)
        is Block.Para -> text(b.runs)
        is Block.Item -> text(b.runs)
        is Block.Images -> (b.items.map { text(it.caption) } + text(b.caption)).filter { it.isNotBlank() }.joinToString(" · ")
    }

    /**
     * Поиск по тексту всех инструкций: каждое слово запроса — в одном блоке (порядок не важен).
     * Сначала совпадения в заголовках, потом — по порядку документов и блоков.
     */
    fun search(docs: List<Doc>, query: String): List<Hit> {
        val words = fold(query).split(' ', ',', '.').filter { it.isNotBlank() }
        if (words.isEmpty()) return emptyList()
        val hits = mutableListOf<Pair<Boolean, Hit>>()
        for (d in docs) {
            if (d.pages.isNotEmpty() && words.all { it in fold(d.title) }) {
                hits += true to Hit(d, -1, null, d.title)
                continue
            }
            var section: String? = null
            d.blocks.forEachIndexed { i, b ->
                if (b is Block.Heading && b.level == 2) section = text(b.runs)
                val t = blockText(b)
                val f = fold(t)
                if (words.all { it in f }) hits += (b is Block.Heading) to Hit(d, i, section, snippet(t, f, words.first()))
            }
        }
        return hits.sortedByDescending { it.first }.map { it.second }
    }

    private fun snippet(t: String, f: String, word: String, around: Int = 60): String {
        val at = f.indexOf(word).coerceAtLeast(0)
        val from = (at - around).coerceAtLeast(0).let { s -> if (s == 0) 0 else t.indexOf(' ', s).let { if (it in s until at) it + 1 else s } }
        val to = (at + word.length + around).coerceAtMost(t.length).let { e -> if (e == t.length) e else t.lastIndexOf(' ', e).let { if (it > at) it else e } }
        return (if (from > 0) "…" else "") + t.substring(from, to) + (if (to < t.length) "…" else "")
    }

    /** Ссылка в тексте: [start, end) — на раздел [block] этого документа или на инструкцию [doc]. */
    class Ref(val start: Int, val end: Int, val block: Int?, val doc: String?)

    /**
     * Перекрёстные ссылки, которые уже есть в тексте документа: «см. п. 4» (нажимается целиком —
     * «п. 4» пальцу мала) — раздел, чей заголовок
     * начинается с «4.»; «InfoPC.bat» — инструкция по нему (кроме неё самой).
     */
    fun references(d: Doc, text: String): List<Ref> {
        val out = mutableListOf<Ref>()
        Regex("""(?<!\p{L})(?:см\.\s*)?п\.\s*(\d+)""").findAll(text).forEach { m ->
            d.sections.firstOrNull { it.title.startsWith(m.groupValues[1] + ".") }?.let { out += Ref(m.range.first, m.range.last + 1, it.block, null) }
        }
        if (d.id != "infopc") Regex("""InfoPC\.bat""").findAll(text).forEach { out += Ref(it.range.first, it.range.last + 1, null, "infopc") }
        return out
    }

    /**
     * Какая инструкция подходит к предмету описи — по названию. Первая подходящая по порядку:
     * частное раньше общего (ИБП и ПК — раньше «технологического»), ячейки раньше трансформатора
     * («трансформатор тока» стоит в ячейке).
     */
    private val match: List<Pair<String, List<String>>> = listOf(
        "ibp" to listOf("ибп", "бесперебойн", "ups"),
        // Фаст-режим (автор, 02.11.2026): техника — раньше общего «двигателя» насосов.
        "spectehnika" to listOf("экскаватор", "бульдозер", "погрузчик", "автокран", "трактор", "грейдер", "каток", "спецтехник", "кран"),
        "avto" to listOf("автомобил", "автобус", "микроавтобус", "грузовик", "легков", "прицеп"),
        "ofis" to listOf("принтер", "мфу", "копир", "сканер", "проектор", "телевизор", "факс", "шредер", "оргтехник"),
        "pk" to listOf("компьютер", "ноутбук", "моноблок", "системный блок", "пэвм", "эвм", "пк", "монитор"),
        "yacheiki" to listOf("ячейк", "кру", "крун", "ксо", "камера сборн"),
        "transformator" to listOf("трансформатор", "ктп", "тмг", "тмз"),
        "nasosy" to listOf("насос", "электродвигател", "двигател"),
        "inzhenernye" to listOf("вентиляц", "вентилятор", "кондиционер", "сплит", "котел", "котельн", "чиллер", "теплообменник",
            "калорифер", "отоплен", "водоснабжен", "канализац", "пожаротушен", "итп"),
        "tehnologicheskoe" to listOf("станок", "линия", "линии", "пресс", "конвейер", "дробил", "мельниц", "фасов", "розлив",
            "упаков", "технологическ"),
    )

    /**
     * Совет к месту: [best] — та, что подходит наверняка (null — угадывать не по чему), [more] — что ещё может подойти.
     * Правила — по содержанию инструкций (автор, 03.11.2026: «пересмотри систему рекомендаций… Что и когда показывать»):
     * квартира и жилой дом — свои (в доме и хозпостройки); здание — отдельностоящее (там и офисы, склады, кабинеты) или
     * встроенное, рядом база и незавершёнка; прочее строение — база (навесы, ангары, сооружения); вспомогательная
     * постройка — как хозпостройка дома, если на объекте жилой дом, иначе как сооружение базы; тип ОИ не выбран —
     * не гадать: все по недвижимости.
     */
    data class Advice(val best: String?, val more: List<String>) { val all: List<String> get() = listOfNotNull(best) + more }

    private val REALTY = listOf("dom", "kvartira", "otdelnoe", "vstroennoe", "baza", "nezavershenka")

    fun forPlace(form: Params.Form, values: Map<String, Any>, houseOnObject: Boolean = false): Advice = when (form) {
        Params.Form.VEHICLE -> Advice("avto", listOf("spectehnika"))
        Params.Form.LAND -> Advice("uchastok", emptyList())
        Params.Form.BUILDING -> when (values[Params.OBJ_KIND]) {
            Params.FLAT -> Advice("kvartira", emptyList())
            Params.HOUSE -> Advice("dom", emptyList())
            Params.BUILDING ->
                if (values["buildType"] == "Встроенное") Advice("vstroennoe", listOf("otdelnoe"))
                else Advice("otdelnoe", listOf("baza", "nezavershenka", "vstroennoe"))
            Params.OTHER -> Advice("baza", listOf("nezavershenka"))
            Params.AUX -> if (houseOnObject) Advice("dom", listOf("baza")) else Advice("baza", listOf("dom"))
            else -> Advice(null, REALTY)
        }
    }

    fun forItem(name: String): String? {
        val words = fold(name).split(Regex("[^\\p{L}\\p{N}]+")).filter { it.isNotEmpty() }
        val f = " " + words.joinToString(" ") + " "
        return match.firstOrNull { (_, keys) ->
            keys.any { k -> if (k.length <= 4 && ' ' !in k) words.any { it == k } else f.contains(" $k") }
        }?.first
    }
}
