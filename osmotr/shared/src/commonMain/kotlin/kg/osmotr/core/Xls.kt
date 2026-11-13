package kg.osmotr.core

/**
 * Старый Excel (.xls — книга BIFF8, у совсем старых BIFF5, в составном файле OLE2) — читается сам,
 * без просьбы пересохранить (автор, 23.10.2026: «Давай без таких выкрутасов. Совместимость нужна»).
 * Листы — в том же виде, что у [Xlsx.sheets]: строки текстом, числа — как в .xlsx (plain), объединённые
 * ячейки заполнены значением, строки «во всю ширину» — в [Xlsx.Sheet.wide]. Опись при загрузке
 * переводится в .xlsx ([asXlsx]): дальше её хранят, сверяют и правят как обычную книгу.
 */
object Xls {
    private val MAGIC = byteArrayOf(0xD0.toByte(), 0xCF.toByte(), 0x11, 0xE0.toByte(), 0xA1.toByte(), 0xB1.toByte(), 0x1A, 0xE1.toByte())

    /** Составной файл OLE2 (.xls, .doc, зашифрованный .xlsx). */
    fun isOle(b: ByteArray) = b.size >= 512 && MAGIC.indices.all { b[it] == MAGIC[it] }

    /** Книга защищена паролем (запись FILEPASS) — содержимое зашифровано. */
    fun isProtected(b: ByteArray): Boolean = runCatching { workbook(b)?.let { records(it).takeWhile { r -> r.type != EOF }.any { r -> r.type == FILEPASS } } }.getOrNull() == true

    /** Листы книги; не .xls или повреждена — пусто. */
    fun sheets(book: ByteArray, rowLimit: Int = Int.MAX_VALUE): List<Xlsx.Sheet> = runCatching {
        read(book, rowLimit).map { s -> Xlsx.Sheet(s.name, s.rows.map { r -> r.map(::text) }, s.wide) }
    }.getOrDefault(emptyList())

    /**
     * Та же книга в .xlsx: значения (числа — числами), объединения ячеек. Оформление старого файла
     * не переносится — описи оно не нужно. Не .xls — как есть.
     */
    fun asXlsx(book: ByteArray): ByteArray {
        if (!isOle(book)) return book
        val sheets = read(book)
        require(sheets.isNotEmpty()) { "файл .xls повреждён — листов не найдено; пришлите заново" }
        val tmp = File(Store.cacheDir, "xls-${Platform.nanoTime()}.xlsx").also { it.parentFile?.mkdirs() }
        try {
            Xlsx.writeBook(tmp, sheets.map { s -> Xlsx.Out(s.name, s.rows, asIs = true, merges = s.merges) })
            return tmp.readBytes()
        } finally { tmp.delete() }
    }

    private fun text(v: Any?): String = when (v) {
        null -> ""
        is Double -> Xlsx.plain(if (v == kotlin.math.floor(v) && kotlin.math.abs(v) < 1e15) v.toLong().toString() else v.toString())
        else -> v.toString()
    }

    // ---------- Составной файл OLE2 ----------

    private const val END = -2 // ENDOFCHAIN
    private const val FREE = -1

    private fun u16(b: ByteArray, o: Int) = (b[o].toInt() and 0xFF) or ((b[o + 1].toInt() and 0xFF) shl 8)
    private fun i32(b: ByteArray, o: Int) = (b[o].toInt() and 0xFF) or ((b[o + 1].toInt() and 0xFF) shl 8) or
        ((b[o + 2].toInt() and 0xFF) shl 16) or ((b[o + 3].toInt() and 0xFF) shl 24)

    /** Поток «Workbook» (BIFF8) или «Book» (BIFF5); null — его нет. */
    private fun workbook(f: ByteArray): ByteArray? {
        if (!isOle(f)) return null
        val ss = 1 shl u16(f, 0x1E)
        val mss = 1 shl u16(f, 0x20)
        val cutoff = i32(f, 0x38).toLong() and 0xFFFFFFFFL
        fun sector(id: Int): Int = (id + 1) * ss
        // Таблица размещения (FAT): номера её секторов — в заголовке (109) и в цепочке DIFAT.
        val fatSectors = ArrayList<Int>()
        for (i in 0 until 109) { val s = i32(f, 0x4C + 4 * i); if (s >= 0) fatSectors += s }
        var difat = i32(f, 0x44)
        var guard = 0
        while (difat >= 0 && guard++ < 10_000 && sector(difat) + ss <= f.size) {
            val o = sector(difat)
            for (i in 0 until ss / 4 - 1) { val s = i32(f, o + 4 * i); if (s >= 0) fatSectors += s }
            difat = i32(f, o + ss - 4)
        }
        val fat = IntArray(fatSectors.size * ss / 4)
        fatSectors.forEachIndexed { k, s -> val o = sector(s); for (i in 0 until ss / 4) if (o + 4 * i + 4 <= f.size) fat[k * ss / 4 + i] = i32(f, o + 4 * i) }
        fun chain(start: Int): ByteArray {
            val out = ArrayList<Int>()
            var s = start
            while (s >= 0 && s < fat.size && out.size <= fat.size) { out += s; s = fat[s] }
            val b = ByteArray(out.size * ss)
            out.forEachIndexed { k, id -> val o = sector(id); if (o < f.size) f.copyInto(b, k * ss, o, minOf(f.size, o + ss)) }
            return b
        }
        val dir = chain(i32(f, 0x30))
        class Entry(val name: String, val type: Int, val start: Int, val size: Long)
        val entries = (0 until dir.size / 128).map { k ->
            val o = k * 128
            val len = (u16(dir, o + 64) / 2 - 1).coerceIn(0, 31)
            val name = CharArray(len) { u16(dir, o + 2 * it).toChar() }.concatToString()
            Entry(name, dir[o + 66].toInt(), i32(dir, o + 116), i32(dir, o + 120).toLong() and 0xFFFFFFFFL)
        }
        val root = entries.firstOrNull { it.type == 5 } ?: return null
        val wb = entries.firstOrNull { it.type == 2 && (it.name == "Workbook" || it.name == "Book") }
            ?: entries.firstOrNull { it.type == 2 && (it.name.equals("workbook", true) || it.name.equals("book", true)) } ?: return null
        if (wb.size >= cutoff) return chain(wb.start).copyOf(wb.size.toInt())
        // Маленький поток — в мини-потоке корня, секторами по 64 байта со своей таблицей.
        val mini = chain(root.start)
        val miniFat = chain(i32(f, 0x3C)).let { b -> IntArray(b.size / 4) { i32(b, 4 * it) } }
        val out = ByteArray(wb.size.toInt())
        var s = wb.start; var pos = 0
        while (s >= 0 && pos < out.size && s < miniFat.size) {
            val o = s * mss
            val n = minOf(mss, out.size - pos)
            if (o + n <= mini.size) mini.copyInto(out, pos, o, o + n)
            pos += n; s = miniFat[s]
        }
        return out
    }

    // ---------- Записи BIFF ----------

    private const val BOF = 0x0809; private const val EOF = 0x000A; private const val BOUNDSHEET = 0x0085
    private const val SST = 0x00FC; private const val CONTINUE = 0x003C; private const val LABELSST = 0x00FD
    private const val LABEL = 0x0204; private const val NUMBER = 0x0203; private const val RK = 0x027E
    private const val MULRK = 0x00BD; private const val FORMULA = 0x0006; private const val STRING = 0x0207
    private const val BOOLERR = 0x0205; private const val MERGEDCELLS = 0x00E5; private const val FILEPASS = 0x002F
    private const val CODEPAGE = 0x0042; private const val RSTRING = 0x00D6

    private class Rec(val type: Int, val data: ByteArray, val pos: Int)

    private fun records(wb: ByteArray, from: Int = 0): Sequence<Rec> = sequence {
        var p = from
        while (p + 4 <= wb.size) {
            val type = u16(wb, p); val len = u16(wb, p + 2)
            if (p + 4 + len > wb.size) break
            yield(Rec(type, wb.copyOfRange(p + 4, p + 4 + len), p))
            p += 4 + len
        }
    }

    private class Raw(val name: String, val rows: List<List<Any?>>, val wide: Set<Int>, val merges: List<String>)

    private fun read(book: ByteArray, rowLimit: Int = Int.MAX_VALUE): List<Raw> {
        val wb = workbook(book) ?: return emptyList()
        val first = records(wb).firstOrNull() ?: return emptyList()
        if (first.type != BOF && first.type != 0x0409 && first.type != 0x0209) return emptyList()
        val biff8 = first.data.size >= 2 && u16(first.data, 0) == 0x0600
        var codepage = 1251
        val sheets = ArrayList<Pair<String, Int>>()
        var sst: List<String> = emptyList()
        // Глобальная часть книги: листы, общие строки, кодировка.
        val globals = records(wb).takeWhile { it.type != EOF }.toList()
        var i = 0
        while (i < globals.size) {
            val r = globals[i]
            when (r.type) {
                FILEPASS -> throw IllegalArgumentException("книга защищена паролем")
                CODEPAGE -> codepage = u16(r.data, 0)
                BOUNDSHEET -> if (r.data.size > 6 && r.data[5].toInt() == 0) {
                    val off = i32(r.data, 0)
                    val name = if (biff8) Str(listOf(r.data), 6, codepage).short() else bytesText(r.data, 7, r.data[6].toInt() and 0xFF, codepage)
                    sheets += name to off
                }
                SST -> {
                    val segs = arrayListOf(r.data)
                    while (i + 1 < globals.size && globals[i + 1].type == CONTINUE) { i++; segs += globals[i].data }
                    val s = Str(segs, 8, codepage)
                    val n = i32(r.data, 4)
                    sst = ArrayList<String>(n.coerceIn(0, 1_000_000)).also { out -> repeat(n) { if (!s.eof()) out += s.long() } }
                }
            }
            i++
        }
        return sheets.mapNotNull { (name, off) -> if (off in 0 until wb.size) sheet(wb, off, name, biff8, sst, codepage, rowLimit) else null }
    }

    private fun sheet(wb: ByteArray, off: Int, name: String, biff8: Boolean, sst: List<String>, codepage: Int, rowLimit: Int): Raw {
        val rows = HashMap<Int, HashMap<Int, Any?>>()
        val merges = ArrayList<IntArray>()
        fun put(r: Int, c: Int, v: Any?) { if (r < rowLimit && v != null && v != "") rows.getOrPut(r) { HashMap() }[c] = v }
        var pendingString: Pair<Int, Int>? = null
        var depth = 0
        for (rec in records(wb, off)) {
            val d = rec.data
            when (rec.type) {
                BOF, 0x0409, 0x0209 -> depth++
                EOF -> { depth--; if (depth <= 0) break }
            }
            if (depth != 1) continue // вложенные (диаграммы) — мимо
            when (rec.type) {
                LABELSST -> put(u16(d, 0), u16(d, 2), sst.getOrNull(i32(d, 6)))
                LABEL, RSTRING -> put(u16(d, 0), u16(d, 2), if (biff8) Str(listOf(d), 6, codepage).long() else bytesText(d, 8, u16(d, 6), codepage))
                NUMBER -> put(u16(d, 0), u16(d, 2), Double.fromBits(long(d, 6)))
                RK -> put(u16(d, 0), u16(d, 2), rk(i32(d, 6)))
                MULRK -> {
                    val row = u16(d, 0); var col = u16(d, 2)
                    var p = 4
                    while (p + 6 <= d.size - 2) { put(row, col++, rk(i32(d, p + 2))); p += 6 }
                }
                FORMULA -> {
                    val row = u16(d, 0); val col = u16(d, 2)
                    if (u16(d, 12) == 0xFFFF) when (d[6].toInt()) {
                        0 -> pendingString = row to col // значение — в следующей записи STRING
                        1 -> put(row, col, if (d[8].toInt() != 0) "ИСТИНА" else "ЛОЖЬ")
                        else -> {} // ошибка формулы, пусто — не данные
                    } else put(row, col, Double.fromBits(long(d, 6)))
                }
                STRING -> pendingString?.let { (r, c) ->
                    put(r, c, if (biff8) Str(listOf(d), 0, codepage).long() else bytesText(d, 2, u16(d, 0), codepage))
                    pendingString = null
                }
                BOOLERR -> if (d[7].toInt() == 0) put(u16(d, 0), u16(d, 2), if (d[6].toInt() != 0) "ИСТИНА" else "ЛОЖЬ")
                MERGEDCELLS -> {
                    val n = u16(d, 0)
                    for (k in 0 until n) { val o = 2 + 8 * k; if (o + 8 <= d.size) merges += intArrayOf(u16(d, o), u16(d, o + 2), u16(d, o + 4), u16(d, o + 6)) }
                }
            }
        }
        // Объединённые — значением на весь диапазон, как у .xlsx.
        val wide = HashSet<Int>()
        for ((r1, r2, c1, c2) in merges) {
            if (c2 > c1) for (r in r1..r2) wide += r
            val v = rows[r1]?.get(c1) ?: continue
            if ((r2 - r1 + 1).toLong() * (c2 - c1 + 1) > 5000) continue
            for (r in r1..minOf(r2, rowLimit - 1)) for (c in c1..c2) rows.getOrPut(r) { HashMap() }.getOrPut(c) { v }
        }
        val last = rows.keys.maxOrNull() ?: -1
        val list = (0..last).map { r -> rows[r]?.let { m -> List((m.keys.maxOrNull() ?: -1) + 1) { m[it] } } ?: emptyList() }
        return Raw(name, list, wide, merges.map { (r1, r2, c1, c2) -> "${col(c1)}${r1 + 1}:${col(c2)}${r2 + 1}" })
    }

    private fun col(i: Int): String { var n = i + 1; val s = StringBuilder(); while (n > 0) { s.insert(0, 'A' + (n - 1) % 26); n = (n - 1) / 26 }; return s.toString() }

    private fun long(b: ByteArray, o: Int): Long = (i32(b, o).toLong() and 0xFFFFFFFFL) or (i32(b, o + 4).toLong() shl 32)

    /** Число RK: целое или старшие 30 бит double, возможно ×100. */
    private fun rk(v: Int): Double {
        val n = if (v and 2 != 0) (v shr 2).toDouble() else Double.fromBits((v and -4).toLong() shl 32)
        return if (v and 1 != 0) n / 100 else n
    }

    /** Строка BIFF5 — байты в кодировке книги (кириллица — 1251). */
    private fun bytesText(b: ByteArray, o: Int, n: Int, codepage: Int): String {
        val end = minOf(b.size, o + n)
        if (o >= end) return ""
        return CharArray(end - o) { k -> byteChar(b[o + k].toInt() and 0xFF, codepage) }.concatToString()
    }

    private fun byteChar(v: Int, codepage: Int): Char = when {
        v < 0x80 || codepage == 1252 || codepage == 0x8000 -> v.toChar()
        codepage == 1251 || codepage == 0x04E3 -> CP1251[v - 0x80]
        else -> v.toChar()
    }

    private val CP1251: CharArray = ("ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—\u0098™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕї" +
        "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя").toCharArray()

    /**
     * Строки Unicode BIFF8 поверх записи и её продолжений (CONTINUE): на границе продолжения
     * символы идут дальше, а перед ними — новый байт флагов (8 или 16 бит на символ).
     */
    private class Str(private val segs: List<ByteArray>, start: Int, private val codepage: Int) {
        private var seg = 0
        private var pos = start
        fun eof(): Boolean { norm(); return seg >= segs.size }
        private fun norm() { while (seg < segs.size && pos >= segs[seg].size) { seg++; pos = 0 } }
        fun u8(): Int { norm(); if (seg >= segs.size) throw IndexOutOfBoundsException(); return segs[seg][pos++].toInt() and 0xFF }
        fun u16() = u8() or (u8() shl 8)
        fun u32() = u16() or (u16() shl 16)
        fun skip(n: Long) { var left = n; while (left > 0) { norm(); if (seg >= segs.size) return; val k = minOf(left, (segs[seg].size - pos).toLong()).toInt(); pos += k; left -= k } }
        private fun chars(n: Int, flags0: Int): String {
            var wide = flags0 and 1 != 0
            val sb = StringBuilder(n)
            while (sb.length < n) {
                if (seg < segs.size && pos >= segs[seg].size) {
                    seg++; pos = 0
                    if (seg >= segs.size) break
                    wide = (segs[seg][pos++].toInt() and 1) != 0 // флаги продолжения
                }
                if (seg >= segs.size) break
                sb.append(if (wide) u16().toChar() else u8().toChar())
            }
            return sb.toString()
        }
        /** XLUnicodeString с длиной в 2 байта (SST, LABEL, STRING). */
        fun long(): String = body(u16())
        /** ShortXLUnicodeString — длина в 1 байт (имя листа). */
        fun short(): String = body(u8())
        private fun body(n: Int): String {
            val flags = u8()
            val runs = if (flags and 8 != 0) u16() else 0
            val ext = if (flags and 4 != 0) u32().toLong() and 0xFFFFFFFFL else 0L
            val s = chars(n, flags)
            skip(4L * runs + ext)
            return s
        }
    }
}
