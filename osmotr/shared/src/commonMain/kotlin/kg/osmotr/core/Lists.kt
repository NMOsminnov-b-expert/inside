package kg.osmotr.core

/**
 * Присланные книги Excel — перечни зданий и прочее (автор, 29.10.2026: «иногда присылают excel файлы. Надо
 * предусмотреть их просмотр и поиск по ним. Там перечни зданий. Структура каждого файла своя»). Столбцы не
 * разбираются вовсе: лист показывается как есть, поиск идёт по всем ячейкам, а найденная строка читается
 * парами «шапка: значение», где шапка — угаданная строка заголовков ([headerRow]); не угадалась — буквы
 * столбцов. Служебные книги приложения (опись, отчёт, контакты) — не перечни.
 */
object Lists {
    private val EXT = setOf("xlsx", "xls")

    fun isList(f: File): Boolean {
        val n = f.name
        return f.isFile && !n.startsWith(".") && f.extension.lowercase() in EXT && f.length() > 0 &&
            !n.startsWith(Inventory.PREFIX) && !n.startsWith("Осмотр — ") && n != Store.CONTACTS
    }

    fun listsIn(dir: File): List<File> = (dir.listFiles() ?: emptyArray()).filter(::isList).sortedBy { it.name.lowercase() }

    /** Книга как прочитана: листы и строка шапки каждого (null — не угадалась). */
    /** [tooBig] — не хватило памяти разобрать: книга не повреждена, она велика для телефона. */
    class Book(val sheets: List<Xlsx.Sheet>, val headers: List<Int?>, val tooBig: Boolean = false)

    /** Найденная строка: лист, строка (с нуля) и непустые ячейки парами «шапка: значение». */
    data class Hit(val sheet: Int, val row: Int, val cells: List<Pair<String, String>>)

    // Последние прочитанные — поиск по каждой букве не перечитывает книгу.
    private val cache = LinkedHashMap<String, Pair<Long, Book>>()

    /** Прочитать (из памяти, если файл не менялся). Не читается — книга без листов. */
    fun open(f: File): Book {
        val stamp = f.lastModified() * 31 + f.length()
        cache[f.path]?.let { (s, b) -> if (s == stamp) return b }
        // Пустые строки в конце листа — прочь: книги форматируют вниз далеко за данными (пример автора — 199
        // строк на листе с пятью машинами), и лист показывал сотни пустых, а заголовок — «1382 строки».
        // Нехватка памяти — не «файл повреждён»: книга, может, и целая, и сказать надо прямо (03.11.2026).
        var tooBig = false
        val sheets = try { Xlsx.sheets(f.readBytes()) } catch (e: OutOfMemoryError) { tooBig = true; emptyList() } catch (e: Exception) { emptyList() }
        val trimmed = sheets.map { sh ->
            val last = sh.rows.indexOfLast { r -> r.any { it.isNotBlank() } }
            if (last == sh.rows.lastIndex) sh else Xlsx.Sheet(sh.name, sh.rows.subList(0, last + 1), sh.wide.filterTo(HashSet()) { it <= last })
        }
        val book = Book(trimmed, trimmed.map(::headerRow), tooBig)
        if (tooBig) Telemetry.event("перечень", "не хватило памяти: ${f.length() / 1024} КБ")
        cache[f.path] = stamp to book
        // Разобранная книга весит в памяти в разы больше файла: держим две, а не шестнадцать.
        while (cache.size > 2) cache.remove(cache.keys.first())
        return book
    }

    /**
     * Строка шапки: верхняя из первых 30, где текстовых (не числовых) ячеек не меньше 40 % от самой
     * «текстовой» строки и не меньше двух. Не просто самая текстовая: сбоку от данных бывает своя табличка
     * (пример автора — итоги «ТИП, сельхоз по га…» справа на строках машин), и строка данных с ней
     * обгоняла настоящую шапку. Название над шапкой (одна ячейка) не проходит. Под шапкой должны быть строки.
     */
    fun headerRow(sheet: Xlsx.Sheet): Int? {
        val top = minOf(30, sheet.rows.size - 1)
        if (top <= 0) return null
        val text = (0 until top).map { r -> sheet.rows[r].count { it.isNotBlank() && it.trim().toDoubleOrNull() == null } }
        val most = text.max()
        if (most < 2) return null
        return text.indexOfFirst { it >= 2 && it * 10 >= most * 4 }.takeIf { it >= 0 }
    }

    /** Все перечни в «Осмотрах» (в любых папках; скрытые не смотрим). */
    fun all(): List<File> = Store.root.walkTopDown().onEnter { it == Store.root || !it.name.startsWith(".") }
        .filter { it.isFile && isList(it) }.toList()

    /** Найденное по всем перечням разом — для общего поиска: книга и строка; не больше [limit]. */
    fun searchAll(query: String, limit: Int = 30): List<Pair<File, Hit>> {
        val out = ArrayList<Pair<File, Hit>>()
        for (f in all()) {
            search(open(f), query, limit - out.size).forEach { out += f to it }
            if (out.size >= limit) break
        }
        return out
    }

    /** Для поиска: без регистра, «ё» как «е», пробелы схлопнуты. */
    fun norm(s: String) = s.lowercase().replace('ё', 'е').replace(Regex("\\s+"), " ").trim()

    /**
     * Строки, где есть все слова запроса (в любых ячейках, в любом порядке): «ленина 10» находит и
     * «ул. Ленина, д. 10». Шапка сама себя не находит. Не больше [limit].
     */
    fun search(book: Book, query: String, limit: Int = 300): List<Hit> {
        val words = norm(query).split(' ').filter { it.isNotEmpty() }
        if (words.isEmpty()) return emptyList()
        val out = ArrayList<Hit>()
        for ((si, sheet) in book.sheets.withIndex()) {
            val head = book.headers[si]
            for ((ri, row) in sheet.rows.withIndex()) {
                if (ri == head) continue
                val text = norm(row.joinToString(" "))
                if (words.all { it in text }) {
                    out += Hit(si, ri, cells(sheet, head, row))
                    if (out.size >= limit) return out
                }
            }
        }
        return out
    }

    /** Непустые ячейки строки парами «шапка: значение» (шапки нет или пусто в ней — буква столбца). */
    fun cells(sheet: Xlsx.Sheet, head: Int?, row: List<String>): List<Pair<String, String>> =
        row.withIndex().filter { it.value.isNotBlank() }.map { (c, v) ->
            (head?.let { sheet.rows[it].getOrNull(c) }?.trim()?.takeIf { it.isNotEmpty() } ?: Inventory.letter(c)) to v.trim()
        }
}
