@file:OptIn(ExperimentalWasmJsInterop::class)

package kg.osmotr.core

import okio.FileSystem

actual val systemFs: FileSystem = WebFs

/** В браузере поток один: «фон» — та же очередь, отдающая управление между шагами. */
actual val Background: kotlinx.coroutines.CoroutineDispatcher = kotlinx.coroutines.Dispatchers.Default

actual fun unzip(bytes: ByteArray): Map<String, ByteArray> = runCatching {
    val o = Fflate.unzipSync(bytes.toJs())
    val names = jsKeys(o)
    (0 until jsLen(names)).associate { i -> val n = jsAt(names, i); n to jsGet(o, n).toBytes() }
}.getOrDefault(emptyMap())

actual fun deflateRaw(bytes: ByteArray): ByteArray? = runCatching { Fflate.deflateSync(bytes.toJs()).toBytes() }.getOrNull()

actual suspend fun <T> withContent(f: File, block: suspend () -> T): T {
    WebFs.prefetch(f.path)
    try { return block() } finally { WebFs.release(f.path) }
}

actual fun memoMap(): MutableMap<String, Int> = HashMap()

actual object Platform {
    actual fun nowMs(): Long = jsNow().toLong()
    actual fun nanoTime(): Long = (jsPerfNow() * 1_000_000).toLong()

    actual fun format(ms: Long, pattern: String): String {
        val d = jsDateParts(ms.toDouble())
        fun two(v: Int) = v.toString().padStart(2, '0')
        val parts = mapOf("yyyy" to d[0].toString(), "MM" to two(d[1]), "dd" to two(d[2]), "HH" to two(d[3]), "mm" to two(d[4]), "ss" to two(d[5]))
        val out = StringBuilder()
        var i = 0
        while (i < pattern.length) {
            val hit = parts.keys.firstOrNull { pattern.startsWith(it, i) }
            if (hit != null) { out.append(parts[hit]); i += hit.length } else { out.append(pattern[i]); i++ }
        }
        return out.toString()
    }

    actual fun startOfDay(): Long = jsStartOfDay().toLong()
    actual fun scan(paths: List<String>) {}

    /** Миниатюры делает браузер (createImageBitmap) — асинхронно: пока её нет, сетка показывает снимок. */
    actual fun makeThumb(photo: String, out: String, px: Int): Boolean {
        if (File(out).isFile) return true
        val key = WebFs.keyOf(photo) ?: return false
        if (!thumbsInWork.add(out)) return false
        jsThumb(key, px) { blob ->
            if (blob == null) { thumbsInWork.remove(out); return@jsThumb }
            Describe.of(blob) { sha, head, tail ->
                val k = jsNewKey()
                jsPutBlob(k, blob) {
                    runCatching {
                        File(out).parentFile?.mkdirs()
                        WebFs.adopt(out, k, jsSize(blob).toLong(), sha, head, tail)
                        Store.changed(structure = false)
                    }
                    thumbsInWork.remove(out)
                }
            }
        }
        return false
    }
    private val thumbsInWork = HashSet<String>()

    actual fun log(msg: String) = jsLog("osmotr: $msg")

    // ---------- Журнал описи: отпечатки и подпись ----------

    actual fun sha256(bytes: ByteArray): ByteArray = Sha256.of(bytes)
    actual fun sha256File(path: String): ByteArray = WebFs.sha256(path)

    /** Закрытый ключ журнала — в хранилище этого браузера (как у телефона: не покидает устройство). */
    private val keyFile = File("/app/.journal-key")
    private fun privateKey(): ByteArray {
        if (keyFile.isFile) return keyFile.readBytes()
        val k = Noble.randomPrivateKey().toBytes()
        keyFile.parentFile?.mkdirs()
        keyFile.writeBytes(k)
        return k
    }

    actual fun publicKey(): ByteArray = Noble.publicKey(privateKey().toJs()).toBytes()
    actual fun sign(data: ByteArray): ByteArray = Noble.sign(Sha256.of(data).toJs(), privateKey().toJs()).toBytes()
    actual fun verify(publicKey: ByteArray, data: ByteArray, signature: ByteArray): Boolean =
        runCatching { Noble.verify(signature.toJs(), Sha256.of(data).toJs(), publicKey.toJs()) }.getOrDefault(false)

    actual fun deviceName(): String = jsDevice()
    actual fun appVersion(): String = "PWA " + jsAppVersion()
    actual fun osVersion(): String = jsOs()
    actual fun hardware(): String = jsDevice()
}

// ---------- Браузер ----------

private fun jsNow(): Double = js("Date.now()")
private fun jsPerfNow(): Double = js("performance.now()")
private fun jsLog(m: String): Unit = js("console.log(m)")
private fun jsStartOfDay(): Double = js("(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })()")
private fun jsPart(ms: Double, i: Int): Int =
    js("(() => { const d = new Date(ms); return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()][i] })()")
private fun jsDateParts(ms: Double): IntArray = IntArray(6) { jsPart(ms, it) }
private fun jsKeys(o: JsAny): JsAny = js("Object.keys(o)")
private fun jsLen(a: JsAny): Int = js("a.length")
private fun jsAt(a: JsAny, i: Int): String = js("a[i]")
private fun jsGet(o: JsAny, k: String): JsAny = js("o[k]")
internal fun jsSize(b: JsAny): Double = js("b.size")
private fun jsThumb(k: String, px: Int, got: (JsAny?) -> Unit): Unit = js("globalThis.osmotrWeb.thumb(k, px, got)")
internal fun jsPutBlob(k: String, data: JsAny, stored: (String) -> Unit): Unit = js("globalThis.osmotrWeb.putBlob(k, data, stored)")
private fun jsDevice(): String = js("""(() => {
    const u = navigator.userAgent
    if (/iPhone/.test(u)) return 'iPhone'
    if (/iPad|Macintosh/.test(u) && navigator.maxTouchPoints > 1) return 'iPad'
    if (/Android/.test(u)) return 'Android'
    return 'Компьютер'
})()""")
private fun jsOs(): String = js("""(() => {
    const u = navigator.userAgent
    const ios = u.match(/OS (\d+)_(\d+)/)
    if (/iPhone|iPad/.test(u) && ios) return 'iOS ' + ios[1] + '.' + ios[2]
    const a = u.match(/Android (\d+)/)
    if (a) return 'Android ' + a[1]
    return navigator.platform || 'веб'
})()""")
private fun jsAppVersion(): String = js("globalThis.OSMOTR_VERSION ?? 'dev'")

/** Отпечаток, начало и конец файла-Blob — для описи в [WebFs]. */
object Describe {
    fun of(blob: JsAny, got: (sha: ByteArray?, head: ByteArray, tail: ByteArray) -> Unit) =
        jsDescribe(blob) { sha, head, tail -> got(sha?.toBytes(), head?.toBytes() ?: ByteArray(0), tail?.toBytes() ?: ByteArray(0)) }
}
private fun jsDescribe(b: JsAny, got: (JsAny?, JsAny?, JsAny?) -> Unit): Unit = js("globalThis.osmotrWeb.describe(b, got)")
