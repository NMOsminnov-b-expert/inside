package kg.osmotr.core

/**
 * Сообщение о выезде — как его присылают осмотрщикам (автор, 29.10.2026: «Сообщения осмотрщикам приходят
 * подобным образом… Стоит это использовать. Например через поделиться»):
 *
 * ```
 * 93.32. Администрация( мэрия города Нарын)
 * г.Нарын, ул.Ленина 74
 * Фамилия Имя Отчество(рук)
 * 509470099 - рук./701381000 - исп
 * ```
 *
 * Код и учреждение, адрес, лицо с ролью, телефоны с ролями. Порядок строк и их число не обязательны: строка
 * узнаётся по виду (телефоны — по цифрам, адрес — по «г.», «ул.»…, лицо — по словам с заглавной). В одном
 * сообщении бывает несколько учреждений — каждое начинается со своего кода.
 */
object Brief {
    /** Имя, под которым присланный текст приходит в общий код (не файл: в «Осмотрах» не появляется). */
    const val SHARED = ".сообщение о выезде.txt"

    data class Item(val code: String, val institution: String, val address: String, val contacts: List<Store.Contact>) {
        /** Имя папки объекта: код впереди — объекты встают по порядку перечня. */
        val folder: String get() = Store.cleanName(listOf(code, institution).filter { it.isNotBlank() }.joinToString(" ")).trim()
    }

    private val CODE = Regex("""^\s*(\d+(?:\.\d+)+|\d+)\.?\s+(\S.*)$""")
    private val PHONE = Regex("""\+?\d[\d\s\-()]{6,}\d""")
    private val ADDRESS = Regex("""(?iu)(^|[\s,(])(г|ул|с|пр|пос|мкр|кв|д|пер|обл|р-н)\.|микрорайон|район|област|аймак|айыл|улица|проспект|№\s*\d""")
    private val ROLES = mapOf("рук" to "руководитель", "исп" to "исполнитель", "бух" to "бухгалтер", "зам" to "заместитель", "отв" to "ответственный")

    /** Роль как написали («рук.», «(исп)») — полным словом; незнакомая — как есть. */
    fun role(raw: String): String {
        val r = raw.trim().trim('(', ')', '.', ' ', '-', ',').lowercase()
        return ROLES.entries.firstOrNull { r.startsWith(it.key) }?.value ?: r
    }

    /** Телефон Кыргызстана: 9 цифр (или с 0, 996, +996 впереди) — «+996 509 470 099»; прочее — как написано. */
    fun phone(raw: String): String {
        val d = raw.filter { it.isDigit() }
        val local = when {
            d.length == 9 -> d
            d.length == 10 && d.startsWith("0") -> d.drop(1)
            d.length == 12 && d.startsWith("996") -> d.drop(3)
            else -> return raw.trim()
        }
        return "+996 ${local.substring(0, 3)} ${local.substring(3, 6)} ${local.substring(6)}"
    }

    fun parse(text: String): List<Item> {
        val blocks = ArrayList<MutableList<String>>()
        for (line in text.lines().map { it.replace('\t', ' ').trim() }.filter { it.isNotEmpty() }) {
            // Новое учреждение — строка с кодом, но не строка телефона («0555 12 34 56» тоже «цифры и пробел»).
            if (CODE.matches(line) && !hasPhone(line) || blocks.isEmpty()) blocks += mutableListOf(line)
            else blocks.last() += line
        }
        return blocks.mapNotNull(::item)
    }

    private fun phonesIn(line: String) = PHONE.findAll(line).filter { m -> m.value.count { it.isDigit() } in 9..12 }.toList()
    private fun hasPhone(line: String) = phonesIn(line).isNotEmpty()

    private fun item(lines: List<String>): Item? {
        var code = ""; var institution = ""; var address = ""
        val people = ArrayList<Store.Contact>()
        val phones = ArrayList<Pair<String, String>>()   // телефон и роль при нём
        for ((i, line) in lines.withIndex()) {
            if (i == 0) CODE.find(line)?.let { m -> code = m.groupValues[1]; institution = tidy(m.groupValues[2]); return@let }
                ?: run { if (!PHONE.containsMatchIn(line) && !ADDRESS.containsMatchIn(line)) institution = tidy(line) }
            if (i == 0 && institution.isNotEmpty()) continue
            val found = phonesIn(line)
            if (found.isNotEmpty()) {
                // «509470099 - рук./701381000 - исп»: после номера — его роль (до следующего номера).
                found.forEachIndexed { k, m ->
                    val tail = line.substring(m.range.last + 1, found.getOrNull(k + 1)?.range?.first ?: line.length)
                    phones += phone(m.value) to role(tail.substringBefore('/').substringBefore(';'))
                }
                val rest = PHONE.replace(line, " ").replace(Regex("""[-/;,.]+"""), " ").trim()
                if (looksLikePerson(rest)) people += person(rest)
                continue
            }
            if (address.isEmpty() && ADDRESS.containsMatchIn(line)) { address = tidy(line); continue }
            if (looksLikePerson(line)) { people += person(line); continue }
            if (institution.isEmpty()) institution = tidy(line) else if (address.isEmpty()) address = tidy(line)
        }
        // Телефон — к лицу с той же ролью; без пары — отдельной строкой контактов с одной ролью.
        val out = people.toMutableList()
        for ((p, r) in phones) {
            val k = out.indexOfFirst { it.phone.isEmpty() && (r.isEmpty() || it.role == r) }
            if (k >= 0) out[k] = out[k].copy(phone = p) else out += Store.Contact(role = r, phone = p)
        }
        if (code.isEmpty() && institution.isEmpty() && address.isEmpty()) return null
        return Item(code, institution, address, out)
    }

    /** Лицо: два-три слова с заглавной (кириллица или латиница), без цифр; роль — в скобках. */
    private fun looksLikePerson(s: String): Boolean {
        val name = s.substringBefore('(').trim()
        val words = name.split(Regex("\\s+")).filter { it.isNotEmpty() }
        return words.size in 2..4 && words.all { w -> w.first().isUpperCase() && w.none { it.isDigit() } } && !ADDRESS.containsMatchIn(name)
    }

    private fun person(s: String): Store.Contact {
        val r = Regex("""\(([^)]*)\)?""").find(s)?.groupValues?.get(1).orEmpty()
        return Store.Contact(name = s.substringBefore('(').trim(), role = role(r))
    }

    /** «Администрация( мэрия города Нарын)» — «Администрация (мэрия города Нарын)». */
    private fun tidy(s: String) = s.replace(Regex("""\s*\(\s*"""), " (").replace(Regex("""\s*\)"""), ")").replace(Regex("\\s+"), " ").trim().trimEnd(',', ';')

    /**
     * Объект по сообщению: с тем же кодом уже есть — обновить (сведения — присланными, контакты —
     * дополнить, без повторов по телефону); нет — завести. Возвращает объект и создан ли он.
     */
    fun apply(item: Item): Pair<File, Boolean> {
        val same = if (item.code.isEmpty()) null else Objects.all().firstOrNull { it.name == item.code || it.name.startsWith(item.code + " ") }
        val obj = same ?: Objects.create(item.folder.ifEmpty { "Объект" }, Objects.Info(item.institution, item.address))
        if (same != null) {
            val was = Objects.info(same)
            Objects.setInfo(same, Objects.Info(item.institution.ifBlank { was.institution }, item.address.ifBlank { was.address }))
        }
        if (item.contacts.isNotEmpty()) {
            val had = Store.contacts(obj)
            val fresh = item.contacts.filter { c -> had.none { h -> (c.phone.isNotEmpty() && h.phone == c.phone) || (c.name.isNotEmpty() && h.name == c.name && h.role == c.role) } }
            Store.setContacts(obj, had + fresh)
        }
        Store.changed()
        return obj to (same == null)
    }
}
