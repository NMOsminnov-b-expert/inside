@file:OptIn(ExperimentalWasmJsInterop::class)

package kg.osmotr.core

import kotlinx.coroutines.suspendCancellableCoroutine
import okio.Buffer
import okio.FileHandle
import okio.FileMetadata
import okio.FileNotFoundException
import okio.FileSystem
import okio.IOException
import okio.Path
import okio.Path.Companion.toPath
import okio.Sink
import okio.Source
import okio.Timeout
import kotlin.coroutines.resume

/**
 * Файловая система PWA. Общий код (хранилище, описи, отчёты, журнал) работает с файлами
 * синхронно, а браузер отдаёт содержимое только асинхронно. Поэтому:
 *
 * - опись всех файлов и папок и содержимое небольших (описи Excel, комментарии, контакты, журнал)
 *   — в памяти, читается сразу; на диск (IndexedDB) пишется следом, в том же порядке;
 * - снимки, видео, голос и архивы — отдельно, по ключу ([Node.key]); в памяти — размер, отпечаток
 *   SHA-256, начало и конец файла (вид по содержимому, проверка JPEG). Целиком — асинхронно
 *   ([bytes], [prefetch]): показ снимка, архив.
 *
 * Пути — как у okio: «/Осмотры/ТЭЦ-2/снимок.jpg».
 */
object WebFs : FileSystem() {
    class Node(val dir: Boolean, var mtime: Long) {
        /** Содержимое: у небольших — всегда; у больших — пока не легло на диск или загружено ([prefetch]). */
        var data: ByteArray? = null
        var size = 0L
        var key: String? = null
        var sha: ByteArray? = null
        var head = ByteArray(0)
        var tail = ByteArray(0)
        /** Загружено на время (архив): после — отпустить. */
        var loaned = 0
    }

    private val nodes = HashMap<String, Node>()
    private val kids = HashMap<String, LinkedHashSet<String>>()

    private val BIG = setOf("jpg", "jpeg", "heic", "heif", "png", "webp", "mp4", "mov", "3gp", "webm", "mkv", "m4a", "zip", "pdf", "tif", "tiff", "djvu")
    /**
     * Большой (снимок, видео, голос, архив) — содержимое отдельно от описи. Временные имена
     * («.снимок.jpg.123.tmp», «.архив.zip.tmp») — по виду настоящего: переименование их не меняет.
     */
    fun isBig(path: String) = path.substringAfterLast('/').lowercase().split('.').drop(1).any { it in BIG }

    private fun norm(p: Path): String = p.normalized().toString().let { if (it.isEmpty() || it == ".") "/" else if (it.startsWith("/")) it else "/$it" }
    private fun parentOf(p: String): String? = if (p == "/") null else p.substringBeforeLast('/').ifEmpty { "/" }

    init { nodes["/"] = Node(dir = true, mtime = 0) }

    // ---------- Загрузка при запуске ----------

    /** Прочитать всё дерево из IndexedDB; [done] — с ошибкой или null. */
    fun load(done: (String?) -> Unit) {
        jsLoadAll({ p, d, m, s, k, h, hd, tl, x ->
            val n = Node(d, m.toLong())
            n.size = s.toLong(); n.key = k; n.sha = h?.unhex()
            n.head = hd?.unhex() ?: ByteArray(0); n.tail = tl?.unhex() ?: ByteArray(0)
            n.data = x?.toBytes()
            nodes[p] = n
        }, { err ->
            // Связи «папка → содержимое» — после всех записей (порядок в базе — по алфавиту путей).
            for (p in nodes.keys.toList()) {
                var c = p
                while (true) {
                    val parent = parentOf(c) ?: break
                    if (nodes[parent] == null) nodes[parent] = Node(dir = true, mtime = Platform.nowMs()).also { save(parent, it) }
                    kids.getOrPut(parent) { LinkedHashSet() }.add(c)
                    c = parent
                }
            }
            upgrade()
            jsPersist()
            done(err)
        })
    }

    /**
     * Хранилище первых сборок не меняло время папки при добавлении файлов — запомненные числа
     * снимков (Folders) могли застрять: «осмотрено 0» при снятом предмете. Один раз — все папки свежие.
     */
    private fun upgrade() {
        val mark = "/app/.webfs-2"
        if (nodes[mark] != null) return
        val now = Platform.nowMs()
        for ((p, n) in nodes) if (n.dir && p != "/") { n.mtime = now; save(p, n) }
        if (nodes["/app"] == null) createDirectory("/app".toPath(), mustCreate = false)
        commit(mark, ByteArray(0))
    }

    // ---------- Запись на диск ----------

    /**
     * Содержимое папки поменялось — её время изменения тоже, как у настоящей файловой системы:
     * по нему общий код (Folders) решает, верить ли запомненному числу снимков папки.
     */
    private fun touch(dir: String) {
        val n = nodes[dir] ?: return
        val now = Platform.nowMs()
        n.mtime = if (now > n.mtime) now else n.mtime + 1
        save(dir, n)
    }

    private fun save(p: String, n: Node) {
        if (p == "/") return
        val x = if (n.dir || n.key != null) null else (n.data ?: ByteArray(0)).toJs()
        jsPut(p, n.dir, n.mtime.toDouble(), n.size.toDouble(), n.key, n.sha?.hex(), n.head.hex(), n.tail.hex(), x)
    }

    /** Новое содержимое файла [p] (создать или заменить). */
    private fun commit(p: String, bytes: ByteArray) {
        val parent = parentOf(p) ?: throw IOException("корень — не файл")
        val pn = nodes[parent] ?: throw FileNotFoundException("нет папки $parent")
        if (!pn.dir) throw IOException("$parent — не папка")
        val old = nodes[p]
        if (old?.dir == true) throw IOException("$p — папка")
        val n = Node(dir = false, mtime = Platform.nowMs())
        n.size = bytes.size.toLong()
        n.data = bytes
        if (isBig(p)) {
            n.key = jsNewKey()
            n.sha = Sha256.of(bytes)
            n.head = bytes.copyOfRange(0, minOf(64, bytes.size))
            n.tail = bytes.copyOfRange(maxOf(0, bytes.size - 2), bytes.size)
            val key = n.key!!
            jsPutBlob(key, bytes.toJs()) { stored -> if (n.key == stored && n.loaned == 0) n.data = null }
        }
        old?.key?.let(::jsDelBlob)
        nodes[p] = n
        kids.getOrPut(parent) { LinkedHashSet() }.add(p)
        save(p, n)
        if (old == null) touch(parent)
    }

    /**
     * Большой файл, содержимое которого уже лежит в браузере (кадр камеры, выбранный снимок):
     * в опись — с ключом, размером, отпечатком, началом и концом.
     */
    fun adopt(path: String, key: String, size: Long, sha: ByteArray?, head: ByteArray, tail: ByteArray) {
        val p = norm(path.toPath())
        val parent = parentOf(p) ?: throw IOException("корень — не файл")
        if (nodes[parent]?.dir != true) throw FileNotFoundException("нет папки $parent")
        val old = nodes[p]
        old?.key?.takeIf { it != key }?.let(::jsDelBlob)
        val n = Node(dir = false, mtime = Platform.nowMs())
        n.size = size; n.key = key; n.sha = sha; n.head = head; n.tail = tail
        nodes[p] = n
        kids.getOrPut(parent) { LinkedHashSet() }.add(p)
        save(p, n)
        if (old == null) touch(parent)
    }

    // ---------- Содержимое больших — асинхронно ----------

    /** Содержимое целиком (показ снимка, архив). null — нет файла или не прочиталось. */
    suspend fun bytes(path: String): ByteArray? {
        val n = nodes[norm(path.toPath())] ?: return null
        if (n.dir) return null
        n.data?.let { return it }
        val key = n.key ?: return ByteArray(0)
        return suspendCancellableCoroutine { c -> jsGetBytes(key) { u -> c.resume(u?.toBytes()) } }
    }

    /** Содержимое как Blob браузера — для «Поделиться» и сохранения файлом, без копии в памяти Kotlin. */
    suspend fun blob(path: String): JsAny? {
        val n = nodes[norm(path.toPath())] ?: return null
        if (n.dir) return null
        val key = n.key
        if (key == null || n.data != null) return jsBlobOf((n.data ?: ByteArray(0)).toJs())
        return suspendCancellableCoroutine { c -> jsGetBlob(key) { b -> c.resume(b) } }
    }

    /**
     * Одолжить на время: синхронное чтение кусками (архив из снимков, деление архива на части) работает,
     * пока не [release]. Содержимое — в памяти браузера частями, в Kotlin — только читаемый кусок: архив
     * в сотни мегабайт целиком в памяти приложения ронял бы вкладку iPhone.
     */
    suspend fun prefetch(path: String) {
        val n = nodes[norm(path.toPath())] ?: return
        val key = n.key
        if (n.dir || key == null || n.data != null) return
        if (n.loaned++ == 0) suspendCancellableCoroutine<Double> { c -> jsLoan(key) { size -> c.resume(size) } }
    }

    fun release(path: String) {
        val n = nodes[norm(path.toPath())] ?: return
        val key = n.key ?: return
        if (n.loaned == 0) return
        if (--n.loaned == 0) jsUnloan(key)
    }

    /** Отпечаток SHA-256 без чтения файла: у больших — сохранён при записи. */
    fun sha256(path: String): ByteArray {
        val n = nodes[norm(path.toPath())] ?: throw FileNotFoundException(path)
        n.sha?.let { return it }
        return Sha256.of(n.data ?: throw IOException("$path: отпечатка нет"))
    }

    fun keyOf(path: String): String? = nodes[norm(path.toPath())]?.key

    // ---------- FileSystem ----------

    override fun canonicalize(path: Path): Path {
        val p = norm(path)
        if (nodes[p] == null) throw FileNotFoundException("нет $p")
        return p.toPath()
    }

    override fun metadataOrNull(path: Path): FileMetadata? {
        val n = nodes[norm(path)] ?: return null
        return FileMetadata(isRegularFile = !n.dir, isDirectory = n.dir, size = if (n.dir) null else n.size,
            lastModifiedAtMillis = n.mtime)
    }

    override fun list(dir: Path): List<Path> = listOrNull(dir) ?: throw FileNotFoundException("нет папки $dir")

    override fun listOrNull(dir: Path): List<Path>? {
        val p = norm(dir)
        if (nodes[p]?.dir != true) return null
        return kids[p].orEmpty().sorted().map { it.toPath() }
    }

    private fun readable(p: String): Node {
        val n = nodes[p] ?: throw FileNotFoundException("нет $p")
        if (n.dir) throw IOException("$p — папка")
        return n
    }

    /** Байты [from, from+count) — из содержимого или из сохранённых начала и конца. */
    private fun range(p: String, n: Node, from: Long, count: Int): ByteArray {
        n.data?.let { d -> val a = from.toInt().coerceIn(0, d.size); return d.copyOfRange(a, minOf(d.size, a + count)) }
        if (n.loaned > 0) n.key?.let { k -> jsReadRange(k, from.toDouble(), count)?.let { return it.toBytes() } }
        val end = minOf(n.size, from + count)
        if (end <= n.head.size) return n.head.copyOfRange(from.toInt(), end.toInt())
        val tailStart = n.size - n.tail.size
        if (from >= tailStart) return n.tail.copyOfRange((from - tailStart).toInt(), (end - tailStart).toInt())
        throw IOException("$p: содержимое не загружено")
    }

    override fun source(file: Path): Source {
        val p = norm(file)
        val n = readable(p)
        val bytes = n.data ?: if (n.size <= n.head.size) n.head.copyOf(n.size.toInt()) else null
        if (bytes != null) return Buffer().write(bytes)
        // Без содержимого — только начало (вид по содержимому): дальше — ошибка, а не тихий обрыв.
        return object : Source {
            private var pos = 0L
            override fun read(sink: Buffer, byteCount: Long): Long {
                if (pos >= n.size) return -1
                val chunk = range(p, n, pos, minOf(byteCount, n.size - pos).toInt())
                sink.write(chunk); pos += chunk.size
                return chunk.size.toLong()
            }
            override fun timeout() = Timeout.NONE
            override fun close() {}
        }
    }

    override fun sink(file: Path, mustCreate: Boolean): Sink {
        val p = norm(file)
        if (mustCreate && nodes[p] != null) throw IOException("$p уже есть")
        return if (isBig(p)) ChunkSink(p) else MemSink(p, ByteArray(0))
    }

    /**
     * Большой файл (архив) — частями по 4 МБ сразу в хранилище, отпечаток — по ходу: в памяти приложения
     * один кусок, а не весь архив (архив на 250 МБ в памяти — 4 ГБ у процессов браузера на пике).
     */
    private class ChunkSink(val p: String) : Sink {
        private val key = jsNewKey()
        private val buf = Buffer()
        private val sha = Sha256.Stream()
        private var part = 0
        private var size = 0L
        private var head = ByteArray(0)
        private var tail = ByteArray(0)
        private var closed = false

        override fun write(source: Buffer, byteCount: Long) {
            buf.write(source, byteCount)
            while (buf.size >= CHUNK) emit(buf.readByteArray(CHUNK.toLong()))
        }
        private fun emit(b: ByteArray) {
            sha.update(b, 0, b.size)
            size += b.size
            if (head.size < 64) head = (head + b).copyOf(minOf(64, head.size + b.size))
            tail = (tail + b).let { it.copyOfRange(maxOf(0, it.size - 2), it.size) }
            jsPutPart(key, part++, b.toJs()) {}
        }
        override fun flush() {}
        override fun timeout() = Timeout.NONE
        override fun close() {
            if (closed) return
            closed = true
            if (buf.size > 0 || part == 0) emit(buf.readByteArray())
            adopt(p, key, size, sha.digest(), head, tail)
        }
        companion object { const val CHUNK = 4 shl 20 }
    }

    override fun appendingSink(file: Path, mustExist: Boolean): Sink {
        val p = norm(file)
        val n = nodes[p]
        if (mustExist && n == null) throw FileNotFoundException("нет $p")
        val start = n?.let { readable(p); it.data ?: throw IOException("$p: содержимое не загружено") } ?: ByteArray(0)
        return MemSink(p, start)
    }

    private class MemSink(val p: String, start: ByteArray) : Sink {
        private val buf = Buffer().write(start)
        private var closed = false
        override fun write(source: Buffer, byteCount: Long) { buf.write(source, byteCount) }
        override fun flush() { if (!closed) commit(p, buf.copy().readByteArray()) }
        override fun timeout() = Timeout.NONE
        override fun close() { if (!closed) { commit(p, buf.readByteArray()); closed = true } }
    }

    override fun openReadOnly(file: Path): FileHandle {
        val p = norm(file)
        return Handle(p, readable(p), readWrite = false)
    }

    override fun openReadWrite(file: Path, mustCreate: Boolean, mustExist: Boolean): FileHandle {
        val p = norm(file)
        val n = nodes[p]
        if (mustCreate && n != null) throw IOException("$p уже есть")
        if (mustExist && n == null) throw FileNotFoundException("нет $p")
        if (n == null) commit(p, ByteArray(0))
        val node = readable(p)
        if (node.data == null) throw IOException("$p: содержимое не загружено")
        return Handle(p, node, readWrite = true)
    }

    private class Handle(val p: String, val n: Node, readWrite: Boolean) : FileHandle(readWrite) {
        private var data: ByteArray? = if (readWrite) n.data!!.copyOf() else null
        private var dirty = false
        override fun protectedRead(fileOffset: Long, array: ByteArray, arrayOffset: Int, byteCount: Int): Int {
            val d = data
            if (d != null) {
                if (fileOffset >= d.size) return -1
                val k = minOf(byteCount, d.size - fileOffset.toInt())
                d.copyInto(array, arrayOffset, fileOffset.toInt(), fileOffset.toInt() + k)
                return k
            }
            if (fileOffset >= n.size) return -1
            val chunk = range(p, n, fileOffset, minOf(byteCount.toLong(), n.size - fileOffset).toInt())
            chunk.copyInto(array, arrayOffset)
            return chunk.size
        }
        override fun protectedWrite(fileOffset: Long, array: ByteArray, arrayOffset: Int, byteCount: Int) {
            var d = data!!
            val end = fileOffset.toInt() + byteCount
            if (end > d.size) d = d.copyOf(end)
            array.copyInto(d, fileOffset.toInt(), arrayOffset, arrayOffset + byteCount)
            data = d; dirty = true
        }
        override fun protectedFlush() { if (dirty) { commit(p, data!!.copyOf()); dirty = false } }
        override fun protectedResize(size: Long) { data = data!!.copyOf(size.toInt()); dirty = true }
        override fun protectedSize(): Long = data?.size?.toLong() ?: n.size
        override fun protectedClose() { protectedFlush() }
    }

    override fun createDirectory(dir: Path, mustCreate: Boolean) {
        val p = norm(dir)
        val n = nodes[p]
        if (n != null) {
            if (!n.dir) throw IOException("$p — файл")
            if (mustCreate) throw IOException("$p уже есть")
            return
        }
        val parent = parentOf(p)!!
        if (nodes[parent]?.dir != true) throw FileNotFoundException("нет папки $parent")
        val node = Node(dir = true, mtime = Platform.nowMs())
        nodes[p] = node
        kids.getOrPut(parent) { LinkedHashSet() }.add(p)
        save(p, node)
        touch(parent)
    }

    override fun atomicMove(source: Path, target: Path) {
        val from = norm(source); val to = norm(target)
        if (from == to) return
        val n = nodes[from] ?: throw FileNotFoundException("нет $from")
        if (n.dir && (to + "/").startsWith("$from/")) throw IOException("папку нельзя перенести в саму себя")
        val toParent = parentOf(to) ?: throw IOException("в корень нельзя")
        if (nodes[toParent]?.dir != true) throw FileNotFoundException("нет папки $toParent")
        nodes[to]?.let { t ->
            if (t.dir != n.dir) throw IOException("$to — уже есть другого вида")
            if (t.dir && kids[to].orEmpty().isNotEmpty()) throw IOException("$to — непустая папка")
            if (!t.dir && t.key != null && t.key != n.key) jsDelBlob(t.key!!)
            nodes.remove(to); kids[toParent]?.remove(to); jsDel(to)
        }
        // Вся ветка — новыми путями; содержимое больших (ключи) остаётся где было.
        val moved = (listOf(from) + descendants(from)).map { it to (to + it.removePrefix(from)) }
        for ((old, new) in moved) {
            val node = nodes.remove(old)!!
            nodes[new] = node
            kids.remove(old)?.let { set -> kids[new] = LinkedHashSet(set.map { to + it.removePrefix(from) }) }
            jsDel(old); save(new, node)
        }
        kids[parentOf(from)!!]?.remove(from)
        kids.getOrPut(toParent) { LinkedHashSet() }.add(to)
        touch(parentOf(from)!!); if (toParent != parentOf(from)) touch(toParent)
    }

    private fun descendants(p: String): List<String> = kids[p].orEmpty().flatMap { listOf(it) + descendants(it) }

    override fun delete(path: Path, mustExist: Boolean) {
        val p = norm(path)
        val n = nodes[p] ?: if (mustExist) throw FileNotFoundException("нет $p") else return
        if (n.dir && kids[p].orEmpty().isNotEmpty()) throw IOException("$p — непустая папка")
        nodes.remove(p); kids.remove(p); kids[parentOf(p)!!]?.remove(p)
        n.key?.let(::jsDelBlob)
        jsDel(p)
        touch(parentOf(p)!!)
    }

    override fun copy(source: Path, target: Path) {
        val from = norm(source); val to = norm(target)
        val n = readable(from)
        val key = n.key
        if (key == null) { commit(to, n.data ?: ByteArray(0)); return }
        // Большой — копия содержимого в браузере, без чтения в Kotlin.
        val newKey = jsNewKey()
        jsCopyBlob(key, newKey)
        adopt(to, newKey, n.size, n.sha, n.head, n.tail)
    }

    override fun createSymlink(source: Path, target: Path) = throw IOException("ссылок нет")
}

// ---------- Связка с glue.js ----------

private fun jsLoadAll(onRecord: (String, Boolean, Double, Double, String?, String?, String?, String?, JsAny?) -> Unit, onDone: (String?) -> Unit): Unit =
    js("globalThis.osmotrWeb.loadAll(onRecord, onDone)")
private fun jsPersist(): Unit = js("globalThis.osmotrWeb.persist()")
private fun jsPut(p: String, d: Boolean, m: Double, s: Double, k: String?, h: String?, hd: String, tl: String, x: JsAny?): Unit =
    js("globalThis.osmotrWeb.put(p, d, m, s, k, h, hd, tl, x)")
private fun jsDel(p: String): Unit = js("globalThis.osmotrWeb.del(p)")
private fun jsGetBytes(k: String, got: (JsAny?) -> Unit): Unit = js("globalThis.osmotrWeb.getBytes(k, got)")
private fun jsGetBlob(k: String, got: (JsAny?) -> Unit): Unit = js("globalThis.osmotrWeb.getBlob(k, got)")
private fun jsDelBlob(k: String): Unit = js("globalThis.osmotrWeb.delBlob(k)")
private fun jsCopyBlob(from: String, to: String): Unit = js("globalThis.osmotrWeb.copyBlob(from, to, () => {})")
private fun jsBlobOf(u: JsAny): JsAny = js("new Blob([u])")
fun jsNewKey(): String = js("globalThis.osmotrWeb.newKey()")
private fun jsPutPart(k: String, i: Int, data: JsAny, stored: (String) -> Unit): Unit = js("globalThis.osmotrWeb.putPart(k, i, data, stored)")
private fun jsLoan(k: String, done: (Double) -> Unit): Unit = js("globalThis.osmotrWeb.loan(k, done)")
private fun jsUnloan(k: String): Unit = js("globalThis.osmotrWeb.unloan(k)")
private fun jsReadRange(k: String, off: Double, len: Int): JsAny? = js("globalThis.osmotrWeb.readRange(k, off, len)")
