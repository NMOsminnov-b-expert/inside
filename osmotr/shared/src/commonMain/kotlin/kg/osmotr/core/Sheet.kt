package kg.osmotr.core

/**
 * Лист объекта в сводной книге и папки по его строкам (автор, 29.10.2026: «Да, имеет смысл» — на предложение
 * по коду объекта находить его лист и заводить ТС и здания из строк). Сводная — по организациям, по листу на
 * каждую: лист «32. Нарын мэриясы» — объект с кодом «93.32» (код из сообщения о выезде, [Brief]).
 *
 * Строка — по шапке листа: «Объект» (наименование), «Тип» — «ТС», «жилое»/«нежилое» (здание),
 * «сельхоз»/«несельхоз» (участок). ТС — по госномеру (ячейка вида «05KG005AC»; нет — по названию), здание —
 * литером с помещениями и фасадом ([Objects.addBuilding]), участок — папкой в «Земельном участке». Остальные
 * ячейки строки — комментарием папки: адрес, ЕНИ, госакт… на месте, без книги под рукой.
 */
object Sheet {
    enum class Kind { VEHICLE, BUILDING, LAND }

    /** Что завести: вид, имя папки, подпись в списке (модель, адрес), комментарий папки, есть ли уже. */
    data class Proposal(val kind: Kind, val folder: String, val title: String, val note: String, val exists: Boolean)

    /** Где нашёлся лист: книга, номер листа, его имя. */
    data class Found(val book: File, val sheet: Int, val name: String)

    private val CODE = Regex("""^(\d+(?:\.\d+)+)""")
    private val SHEET_NUM = Regex("""^\s*(\d+(?:\.\d+)*)[.\s]""")
    /** Госномер Кыргызстана: «05KG005AC», «05 KG 005 AC», старые «1774NA». */
    private val PLATE = Regex("""^(\d{2}\s?KG\s?\d{3}\s?[A-Z]{2,3}|\d{3,4}\s?[A-Z]{2,3})$""")

    /** Код объекта — из имени папки («93.32 Администрация…»); нет — null. */
    fun code(obj: File): String? = CODE.find(obj.name)?.groupValues?.get(1)

    /** Лист с этим кодом: номер в начале имени листа — весь код или его хвост («32» у «93.32»). */
    fun matches(sheetName: String, code: String): Boolean {
        val n = SHEET_NUM.find(sheetName)?.groupValues?.get(1) ?: return false
        return n == code || code.endsWith(".$n")
    }

    /** Лист объекта — в перечнях его «Документов», затем других объектов; не нашёлся — null. */
    fun find(obj: File): Found? {
        val code = code(obj) ?: return null
        val books = Lists.listsIn(File(obj, Objects.DOCS)) + Objects.all().filter { it != obj }.flatMap { Lists.listsIn(File(it, Objects.DOCS)) }
        for (f in books) {
            val b = Lists.open(f)
            b.sheets.indexOfFirst { matches(it.name, code) }.takeIf { it >= 0 }?.let { return Found(f, it, b.sheets[it].name) }
        }
        return null
    }

    fun proposals(obj: File, found: Found): List<Proposal> {
        val book = Lists.open(found.book)
        val sheet = book.sheets.getOrNull(found.sheet) ?: return emptyList()
        val head = book.headers.getOrNull(found.sheet) ?: return emptyList()
        val titles = sheet.rows[head].map { Lists.norm(it) }
        fun col(vararg names: String) = titles.indexOfFirst { t -> names.any { t.startsWith(it) } }
        val nameCol = col("объект", "наименование", "название").takeIf { it >= 0 } ?: return emptyList()
        val typeCol = col("тип")
        val addrCol = col("адрес")
        val used = HashSet<String>()
        val out = ArrayList<Proposal>()
        for (r in head + 1 until sheet.rows.size) {
            val row = sheet.rows[r]
            val name = row.getOrNull(nameCol)?.trim().orEmpty()
            if (name.isEmpty()) continue
            val type = Lists.norm(row.getOrNull(typeCol).orEmpty())
            val plate = row.firstOrNull { PLATE.matches(it.trim().uppercase()) }?.trim()?.uppercase()
            val kind = when {
                type == "тс" || plate != null -> Kind.VEHICLE
                type.endsWith("сельхоз") || Lists.norm(name).startsWith("участок") || Lists.norm(name).startsWith("зем") -> Kind.LAND
                else -> Kind.BUILDING
            }
            val base = Store.cleanName(if (kind == Kind.VEHICLE && plate != null) Objects.plate(plate) else name).trim()
            if (base.isEmpty()) continue
            // Одинаковые имена («Участок», «Квартира Ленина») — различить адресом.
            var folder = base
            if (folder in used) folder = Store.cleanName("$base (${row.getOrNull(addrCol)?.trim().orEmpty().ifEmpty { "строка ${r + 1}" }})").trim()
            if (folder in used) continue
            used += folder
            val note = Lists.cells(sheet, head, row).filter { (h, v) -> v != name && !(kind == Kind.VEHICLE && v.uppercase() == plate) && h.isNotBlank() }
                .joinToString("\n") { (h, v) -> "${h.replace('\n', ' ').replace(Regex("\\s+"), " ").trim()}: $v" }
            val title = if (kind == Kind.VEHICLE) "$name · ${plate ?: "без госномера"}" else listOfNotNull(name, row.getOrNull(addrCol)?.trim()?.ifEmpty { null }).joinToString(" · ")
            out += Proposal(kind, folder, title, "Из «${found.book.name.substringBeforeLast('.')}», лист «${found.name}», строка ${r + 1}\n$note", exists = dirOf(obj, kind, folder).exists())
        }
        return out
    }

    fun dirOf(obj: File, kind: Kind, folder: String): File = when (kind) {
        Kind.VEHICLE -> File(obj, "${Objects.MOVABLE}/$folder")
        Kind.BUILDING -> File(obj, "${Objects.REAL}/$folder")
        Kind.LAND -> File(obj, "${Objects.REAL}/${Objects.LAND}/$folder")
    }

    /** Завести выбранное; уже заведённое не трогается. Сколько завелось. */
    fun apply(obj: File, chosen: List<Proposal>): Int {
        var n = 0
        for (p in chosen) {
            val dir = dirOf(obj, p.kind, p.folder)
            if (dir.exists()) continue
            val made = when (p.kind) {
                Kind.BUILDING -> Objects.addBuilding(obj, p.folder)
                else -> dir.also { it.mkdirs() }
            } ?: continue
            if (p.note.isNotBlank()) Store.setNote(made, p.note)
            n++
        }
        Store.changed()
        return n
    }
}
