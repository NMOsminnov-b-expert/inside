package kg.osmotr.core

import okio.Path.Companion.toPath
import okio.buffer
import okio.use

/**
 * Архив по частям (автор, 21.10.2026, после жалобы осмотрщика: «не смогла отправить, много весит»;
 * «с возможностью отправки, в том числе по частям из-за ограничений ватсаппа»).
 *
 * Каждая часть — **самостоятельный архив**: открывается сам по себе на любом телефоне и компьютере,
 * без остальных частей и без особых программ (многотомный zip так не умеет). Записи переносятся
 * байт в байт — без перепаковки, CRC и содержимое те же. Порядок записей сохраняется: папка
 * предмета не разлетается по частям без нужды. Запись больше предела — своей частью (её не
 * разрезать, не испортив), о ней сообщается.
 */
object ZipSplit {
    /** Запись архива: имя, где лежит заголовок, сколько байт занимает целиком (заголовок + данные). */
    class Entry(val name: String, internal val nameBytes: ByteArray, internal val crc: Long, internal val size: Long,
                internal val packed: Long, internal val method: Int, internal val localOffset: Long, internal val localLength: Long)

    /** Часть: файл, сколько в ней записей и весит. */
    class Part(val file: File, val entries: Int, val bytes: Long)

    class Result(val parts: List<Part>, val oversized: List<String>)

    /** Записи архива по его оглавлению (центральный каталог). Поддержан zip без ZIP64 — такой пишет ZipWriter. */
    fun entries(zip: File): List<Entry> {
        val path = zip.path.toPath()
        systemFs.openReadOnly(path).use { h ->
            val len = h.size()
            // Конец оглавления — в последних 22 + до 65535 байт (комментарий архива).
            val tailLen = minOf(len, 22L + 65535L).toInt()
            val tail = ByteArray(tailLen)
            h.read(len - tailLen, tail, 0, tailLen)
            var eocd = -1
            for (i in tailLen - 22 downTo 0) {
                if (tail[i] == 0x50.toByte() && tail[i + 1] == 0x4b.toByte() && tail[i + 2] == 0x05.toByte() && tail[i + 3] == 0x06.toByte()) { eocd = i; break }
            }
            require(eocd >= 0) { "не архив zip: нет оглавления" }
            val count = u16(tail, eocd + 10)
            val dirSize = u32(tail, eocd + 12)
            val dirOffset = u32(tail, eocd + 16)
            require(count != 0xFFFF && dirOffset != 0xFFFFFFFFL) { "архив ZIP64 не поддержан" }
            val dir = ByteArray(dirSize.toInt())
            h.read(dirOffset, dir, 0, dir.size)
            val out = ArrayList<Entry>(count)
            var p = 0
            repeat(count) {
                require(u32(dir, p) == 0x02014b50L) { "оглавление архива повреждено" }
                val method = u16(dir, p + 10)
                val crc = u32(dir, p + 16)
                val packed = u32(dir, p + 20)
                val size = u32(dir, p + 24)
                val nLen = u16(dir, p + 28); val xLen = u16(dir, p + 30); val cLen = u16(dir, p + 32)
                val local = u32(dir, p + 42)
                val name = dir.copyOfRange(p + 46, p + 46 + nLen)
                // Длина локального заголовка — из него самого: поле «доп.» там может отличаться от оглавления.
                val lh = ByteArray(30)
                h.read(local, lh, 0, 30)
                require(u32(lh, 0) == 0x04034b50L) { "запись архива повреждена" }
                val headLen = 30L + u16(lh, 26) + u16(lh, 28)
                out += Entry(name.decodeToString(), name, crc, size, packed, method, local, headLen + packed)
                p += 46 + nLen + xLen + cLen
            }
            return out
        }
    }

    /** Сколько байт займёт часть с такими записями (заголовки, данные, оглавление). */
    private fun cost(e: Entry) = 30L + e.nameBytes.size + e.packed + 46L + e.nameBytes.size
    private const val END = 22L

    /**
     * Разбить [zip] на части не больше [limit] байт — в папку [outDir], имена «<имя> — часть N из M.zip».
     * Прежние части того же архива в папке заменяются.
     */
    fun split(zip: File, limit: Long, outDir: File, progress: (Float) -> Unit = {}): Result {
        val all = entries(zip)
        val groups = ArrayList<MutableList<Entry>>()
        val oversized = ArrayList<String>()
        var cur = ArrayList<Entry>(); var curSize = END
        for (e in all) {
            val c = cost(e)
            if (c + END > limit) {
                // Больше предела — отдельной частью: файл не режем.
                if (cur.isNotEmpty()) { groups += cur; cur = ArrayList(); curSize = END }
                groups += mutableListOf(e); oversized += e.name
                continue
            }
            if (curSize + c > limit && cur.isNotEmpty()) { groups += cur; cur = ArrayList(); curSize = END }
            cur += e; curSize += c
        }
        if (cur.isNotEmpty() || groups.isEmpty()) groups += cur
        outDir.mkdirs()
        val base = zip.nameWithoutExtension
        outDir.listFiles()?.filter { it.name.startsWith("$base — часть ") && it.name.endsWith(".zip") }?.forEach { it.delete() }
        val total = all.sumOf { it.localLength }.coerceAtLeast(1)
        var done = 0L
        val parts = ArrayList<Part>()
        systemFs.openReadOnly(zip.path.toPath()).use { src ->
            groups.forEachIndexed { i, g ->
                val f = File(outDir, "$base — часть ${i + 1} из ${groups.size}.zip")
                val tmp = File(outDir, ".${f.name}.tmp")
                systemFs.sink(tmp.path.toPath()).buffer().use { out ->
                    var off = 0L
                    val moved = ArrayList<Pair<Entry, Long>>()
                    for (e in g) {
                        moved += e to off
                        // Заголовок и данные — как были: CRC, размеры и способ хранения не меняются.
                        src.source(e.localOffset).buffer().use { s -> out.write(s, e.localLength) }
                        off += e.localLength; done += e.localLength
                        progress(done.toFloat() / total)
                    }
                    val dirStart = off
                    for ((e, at) in moved) {
                        out.writeIntLe(0x02014b50); out.writeShortLe(20); out.writeShortLe(20); out.writeShortLe(0x0800)
                        out.writeShortLe(e.method); out.writeShortLe(0); out.writeShortLe(0x21)
                        out.writeIntLe(e.crc.toInt()); out.writeIntLe(e.packed.toInt()); out.writeIntLe(e.size.toInt())
                        out.writeShortLe(e.nameBytes.size); out.writeShortLe(0); out.writeShortLe(0); out.writeShortLe(0); out.writeShortLe(0)
                        out.writeIntLe(0); out.writeIntLe(at.toInt())
                        out.write(e.nameBytes)
                        off += 46 + e.nameBytes.size
                    }
                    out.writeIntLe(0x06054b50); out.writeShortLe(0); out.writeShortLe(0)
                    out.writeShortLe(moved.size); out.writeShortLe(moved.size)
                    out.writeIntLe((off - dirStart).toInt()); out.writeIntLe(dirStart.toInt()); out.writeShortLe(0)
                }
                if (f.exists()) f.delete()
                check(tmp.renameTo(f)) { "часть ${i + 1} не записана" }
                parts += Part(f, g.size, f.length())
            }
        }
        return Result(parts, oversized)
    }

    private fun u16(b: ByteArray, i: Int) = (b[i].toInt() and 0xFF) or ((b[i + 1].toInt() and 0xFF) shl 8)
    private fun u32(b: ByteArray, i: Int) = (u16(b, i).toLong()) or (u16(b, i + 2).toLong() shl 16)
}
