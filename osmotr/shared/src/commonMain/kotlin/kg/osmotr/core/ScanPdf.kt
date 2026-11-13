package kg.osmotr.core

import okio.BufferedSink

/**
 * Снятые страницы документа — одним PDF (решения пользователя 06.11.2026: пересъёмка сканов, ответ на запрос документов
 * из кадастра, акт на группу позиций описи). Камера и сканер дают снимки jpg; система ждёт документ одним файлом, поэтому
 * страницы собираются в PDF без перекодирования: каждый снимок — своя страница, JPEG кладётся в файл как есть (DCTDecode).
 * Поворот по EXIF переносится в страницу (/Rotate), размер страницы — по снимку, длинная сторона не больше A4.
 */
object ScanPdf {
    /** Размеры и вид снимка: ширина, высота в пикселях, число компонент цвета, четверти поворота по EXIF. */
    class Jpeg(val w: Int, val h: Int, val comps: Int, val quarters: Int)

    /** Разбор заголовка JPEG; не JPEG — null. */
    fun info(b: ByteArray): Jpeg? {
        if (b.size < 4 || (b[0].toInt() and 0xFF) != 0xFF || (b[1].toInt() and 0xFF) != 0xD8) return null
        var i = 2
        var quarters = 0
        while (i + 4 <= b.size) {
            if ((b[i].toInt() and 0xFF) != 0xFF) { i++; continue }
            val m = b[i + 1].toInt() and 0xFF
            if (m == 0xFF) { i++; continue }
            if (m == 0xD8 || m in 0xD0..0xD7 || m == 0x01) { i += 2; continue }
            val len = u16(b, i + 2)
            if (m == 0xE1 && len >= 8) quarters = exifQuarters(b, i + 4, len - 2)
            if (m in 0xC0..0xCF && m != 0xC4 && m != 0xC8 && m != 0xCC && i + 9 < b.size) {
                return Jpeg(w = u16(b, i + 7), h = u16(b, i + 5), comps = b[i + 9].toInt() and 0xFF, quarters = quarters)
            }
            i += 2 + len
        }
        return null
    }

    private fun u16(b: ByteArray, i: Int) = ((b[i].toInt() and 0xFF) shl 8) or (b[i + 1].toInt() and 0xFF)

    /** Ориентация EXIF (тег 0x0112) → четверти по часовой: 3 → 2, 6 → 1, 8 → 3, прочее → 0. */
    private fun exifQuarters(b: ByteArray, from: Int, len: Int): Int {
        if (len < 20 || from + len > b.size) return 0
        val head = "Exif".encodeToByteArray()
        if (head.indices.any { b[from + it] != head[it] }) return 0
        val t = from + 6
        val le = b[t].toInt() == 0x49
        fun s(i: Int) = if (le) (b[i].toInt() and 0xFF) or ((b[i + 1].toInt() and 0xFF) shl 8) else u16(b, i)
        fun l(i: Int) = if (le) s(i) or (s(i + 2) shl 16) else (s(i) shl 16) or s(i + 2)
        val ifd = t + l(t + 4)
        if (ifd < t || ifd + 2 > from + len) return 0
        val n = s(ifd)
        for (k in 0 until n) {
            val e = ifd + 2 + 12 * k
            if (e + 12 > from + len) return 0
            if (s(e) == 0x0112) return when (s(e + 8)) { 3 -> 2; 6 -> 1; 8 -> 3; else -> 0 }
        }
        return 0
    }

    /** Все [pages] (снимки jpg по порядку) — PDF в [out]. Не JPEG или нет страниц — исключение. */
    fun write(pages: List<File>, out: BufferedSink) {
        require(pages.isNotEmpty()) { "нет страниц" }
        var pos = 0L
        val offsets = ArrayList<Long>()
        fun put(s: String) { val b = s.encodeToByteArray(); out.write(b); pos += b.size }
        fun begin(n: Int) { while (offsets.size < n) offsets.add(0); offsets[n - 1] = pos }
        put("%PDF-1.4\n")
        // Номера: 1 — каталог, 2 — страницы, дальше тройками: страница, содержимое, снимок.
        begin(1); put("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
        begin(2); put("2 0 obj\n<< /Type /Pages /Count ${pages.size} /Kids [" + pages.indices.joinToString(" ") { "${3 + 3 * it} 0 R" } + "] >>\nendobj\n")
        pages.forEachIndexed { i, f ->
            val bytes = f.readBytes()
            val j = info(bytes) ?: error("${f.name}: не JPEG")
            val side = maxOf(j.w, j.h).coerceAtLeast(1).toDouble()
            val k = if (side > 842.0) 842.0 / side else 1.0
            val w = kotlin.math.round(j.w * k * 100) / 100
            val h = kotlin.math.round(j.h * k * 100) / 100
            val page = 3 + 3 * i
            begin(page)
            put("$page 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $w $h]" + (if (j.quarters != 0) " /Rotate ${j.quarters * 90}" else "") +
                " /Resources << /XObject << /Im0 ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>\nendobj\n")
            val content = "q $w 0 0 $h 0 0 cm /Im0 Do Q"
            begin(page + 1)
            put("${page + 1} 0 obj\n<< /Length ${content.length} >>\nstream\n$content\nendstream\nendobj\n")
            begin(page + 2)
            val space = when (j.comps) { 1 -> "/DeviceGray"; 4 -> "/DeviceCMYK"; else -> "/DeviceRGB" }
            put("${page + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace $space /BitsPerComponent 8 " +
                "/Filter /DCTDecode /Length ${bytes.size} >>\nstream\n")
            out.write(bytes); pos += bytes.size
            put("\nendstream\nendobj\n")
        }
        val total = 3 + 3 * pages.size
        val xref = pos
        put("xref\n0 $total\n0000000000 65535 f \n")
        offsets.forEach { put(it.toString().padStart(10, '0') + " 00000 n \n") }
        put("trailer\n<< /Size $total /Root 1 0 R >>\nstartxref\n$xref\n%%EOF\n")
    }
}
