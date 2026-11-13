@file:OptIn(ExperimentalWasmJsInterop::class)

package kg.osmotr.ui

import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toComposeImageBitmap
import kg.osmotr.core.Describe
import kg.osmotr.core.File
import kg.osmotr.core.Kadr
import kg.osmotr.core.Store
import kg.osmotr.core.Telemetry
import kg.osmotr.core.WebFs
import kg.osmotr.core.jsNewKey
import kg.osmotr.core.jsPutBlob
import kg.osmotr.core.jsSize
import kg.osmotr.core.toBytes
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import org.jetbrains.skia.Image
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

/**
 * PWA: своя камера на странице (серия без выхода, кадр — сразу в папку, как своя камера iPhone),
 * описи и снимки — выбором файлов, «Поделиться» — системным окном браузера, архив — файлом туда,
 * куда укажет человек.
 */
object WebHost : Host {
    private val scope = MainScope()
    private var shot: Shot? = null

    override fun takePhotos(dir: File) {
        // Каждый кадр несёт свою съёмку (папку): закрыли камеру и открыли на другой — прежние
        // кадры дописываются в свою (то же правило, что у iPhone).
        val kadr = Kadr(dir)
        var taken = 0
        Telemetry.event("камера", "открыта")
        jsCamera({ blob, _, _, done ->
            val slot = kadr.reserve()
            Describe.of(blob) { sha, head, tail ->
                val key = jsNewKey()
                jsPutBlob(key, blob) {
                    val err = runCatching {
                        WebFs.adopt(slot.tmp.path, key, jsSize(blob).toLong(), sha, head, tail)
                        kadr.finish(slot).getOrThrow()
                    }.fold({ taken++; null }, { kadr.abort(slot); it.message ?: "кадр не сохранился" })
                    Store.changed(structure = false)
                    jsCall(done, err)
                }
            }
        }, {
            shot = Shot(dir, taken)
            Store.changed()
            resumed()
        }, { blob, ext, ms, done ->
            // Видео — как на Android (CameraWork.startVideo): имя по началу записи, временный «.имя.rec»,
            // легло целиком — своё имя и регистрация (журнал с отпечатком).
            val target = Store.newPhotoFile(dir, ext, kg.osmotr.core.Platform.nowMs() - ms.toLong())
            val tmp = File(dir, ".${target.name}.rec")
            Describe.of(blob) { sha, head, tail ->
                val key = jsNewKey()
                jsPutBlob(key, blob) {
                    val err = runCatching {
                        WebFs.adopt(tmp.path, key, jsSize(blob).toLong(), sha, head, tail)
                        check(!target.exists()) { "имя уже занято" }
                        check(tmp.renameTo(target)) { "не переименовалось" }
                    }.fold({ taken++; null }, { tmp.delete(); it.message ?: "видео не сохранилось" })
                    Store.releasePhotoName(target)
                    if (err == null) Store.videoSaved(target) else Telemetry.event("камера: видео", "не легло: $err")
                    jsCall(done, err)
                }
            }
        })
    }

    override fun openVideo(file: File) {
        scope.launch {
            val blob = WebFs.blob(file.path) ?: return@launch toast("Файл не найден")
            jsPlayVideo(blob, file.name)
        }
    }

    // PDF и прочее — встроенным просмотром браузера (Safari на iPhone показывает PDF целиком, со своим поиском).
    override fun openExternal(file: File, mime: String) {
        scope.launch {
            val blob = WebFs.blob(file.path) ?: return@launch toast("Файл не найден")
            jsOpenFile(blob, file.name, mime)
        }
    }

    override suspend fun afterResume(): Shot? = shot.also { shot = null }
    override fun canWrite() = true
    override fun requestStorage() {}

    private fun pick(accept: String, multiple: Boolean, got: (List<Picked>) -> Unit) {
        val out = ArrayList<Picked>()
        jsPick(accept, multiple) { name, bytes, modified ->
            if (name == null || bytes == null) { if (out.isNotEmpty()) got(out.toList()); return@jsPick }
            val b = bytes.toBytes()
            out += Picked(name, b, kg.osmotr.core.Exif.taken(b) ?: modified.toLong().takeIf { it > 0 })
        }
    }

    override fun pickBooks(multiple: Boolean, got: (List<Picked>) -> Unit) =
        pick(".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel", multiple, got)

    override val canPickGallery: Boolean get() = true

    /**
     * Снимки из галереи — сразу в хранилище браузера, в приложение — временными файлами (как присланное на
     * Android): размер, отпечаток, начало; дата съёмки — из EXIF первых 128 КБ. Сто снимков по 2,5 МБ в
     * памяти приложения поднимали процессы браузера до 1,6 ГБ.
     */
    override fun pickGallery(got: (List<Picked>) -> Unit) = pickStored("image/*", got)

    override val canPickFiles: Boolean get() = true

    /** Документы любого формата — тем же путём: скан или книга бывают большими. */
    override fun pickFiles(got: (List<Picked>) -> Unit) = pickStored("*/*", got)

    override val canLocate: Boolean get() = jsCanLocate()

    override fun locate(done: (String?) -> Unit) = jsLocate(done)

    /** PDF рисует pdf.js (glue.js): ответ открытия — «locked», «broken», «unsupported» или размеры страниц. */
    override suspend fun pdfOpen(file: File): PdfOpen {
        val blob = WebFs.blob(file.path) ?: return PdfOpen.Broken
        return when (val r = suspendCoroutine<String> { c -> jsPdfOpen(file.path, blob) { c.resume(it) } }) {
            "locked" -> PdfOpen.Locked
            "broken" -> PdfOpen.Broken
            "unsupported" -> PdfOpen.Unsupported
            else -> PdfOpen.Pages(r.split(';').map { s -> s.substringBefore(',').toFloat() to s.substringAfter(',').toFloat() })
        }
    }

    override suspend fun pdfRender(file: File, page: Int, scale: Float, x: Int, y: Int, w: Int, h: Int, quarters: Int): ImageBitmap? {
        val blob = WebFs.blob(file.path) ?: return null
        val png = suspendCoroutine<JsAny?> { c -> jsPdfRender(file.path, blob, page, scale.toDouble(), x, y, w, h, quarters) { c.resume(it) } } ?: return null
        return runCatching { Image.makeFromEncoded(png.toBytes()).toComposeImageBitmap() }.getOrNull()
    }

    override fun pdfClose(file: File) = jsPdfClose(file.path)

    private fun pickStored(accept: String, got: (List<Picked>) -> Unit) {
        val out = ArrayList<Picked>()
        jsPickStored(accept) { name, key, size, modified, sha, head, tail, exif ->
            if (name == null || key == null) { if (out.isNotEmpty()) got(out.toList()); return@jsPickStored }
            val ext = name.substringAfterLast('.', "jpg").lowercase()
            val tmp = File(cacheDir, "pick-${kg.osmotr.core.Platform.nanoTime()}.$ext")
            runCatching {
                tmp.parentFile?.mkdirs()
                val h = head?.toBytes() ?: ByteArray(0)
                WebFs.adopt(tmp.path, key, size.toLong(), sha?.toBytes(), h, tail?.toBytes() ?: ByteArray(0))
                val taken = exif?.let { kg.osmotr.core.Exif.taken(it.toBytes()) } ?: modified.toLong().takeIf { it > 0 }
                out += Picked.ofFile(name, tmp, taken, h)
            }.onFailure { toast("$name: не легло — ${it.message}", long = true) }
        }
    }

    override fun share(files: List<File>, mime: String, title: String) {
        scope.launch {
            val list = jsArray()
            for (f in files) {
                val blob = WebFs.blob(f.path) ?: continue
                jsPush(list, blob, f.name, mimeOf(f, mime))
            }
            jsShare(list, title) { r -> Telemetry.event("поделиться", r) }
        }
    }

    override val canSaveAs: Boolean get() = true
    override fun saveAs(file: File, mime: String) {
        scope.launch {
            val blob = WebFs.blob(file.path) ?: return@launch toast("Файл не найден")
            jsSaveAs(blob, file.name, mime) { r ->
                Telemetry.event("сохранить файлом", r)
                if (r == "сохранено") toast("Сохранено: ${file.name}")
                else if (r.startsWith("ошибка")) toast("Не сохранилось: $r", long = true)
            }
        }
    }

    private fun mimeOf(f: File, fallback: String) = when (f.extension.lowercase()) {
        "zip" -> "application/zip"
        "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        "jpg", "jpeg" -> "image/jpeg"
        "png" -> "image/png"
        "heic" -> "image/heic"
        "txt" -> "text/plain"
        "m4a" -> "audio/mp4"
        "mp4" -> "video/mp4"
        else -> fallback
    }

    override fun toast(text: String, long: Boolean) = ToastBus.show(text)

    /** Выбора контакта из телефонной книги в Safari нет — вводится руками. */
    override val pickPhone: ((got: (String, String) -> Unit) -> Unit)? = null

    override val cacheDir: File get() = File("/app/cache")
    override val exportsPlace: String get() = "в приложении (Выгрузки)"

    // ---------- Диктофон ----------
    // Запись дописывается браузером после «стоп»: заметка ложится, когда готова (журнал, список — тогда же).

    private val durations = HashMap<String, Long>()

    override val canRecord: Boolean get() = jsHasRecorder()

    override fun startRecording(file: File): Boolean = jsRecStart { blob, ms ->
        if (blob == null) return@jsRecStart
        Describe.of(blob) { sha, head, tail ->
            val key = jsNewKey()
            jsPutBlob(key, blob) {
                runCatching {
                    WebFs.adopt(file.path, key, jsSize(blob).toLong(), sha, head, tail)
                    durations[file.path] = ms.toLong()
                    Store.voiceSaved(file)
                    toast("Записано: ${ms.toLong() / 60000}:${(ms.toLong() / 1000 % 60).toString().padStart(2, '0')}")
                }.onFailure { toast("Запись не сохранилась: ${it.message}", long = true) }
            }
        }
    }

    /** Возвращает false: файл ляжет, когда браузер допишет запись (см. [startRecording]). */
    override fun stopRecording(): Boolean { jsRecStop(); return false }
    override fun recordingLevel(): Float = jsRecLevel().toFloat()

    override fun play(file: File, done: () -> Unit) {
        scope.launch {
            val blob = WebFs.blob(file.path) ?: return@launch done()
            jsPlay(blob, done)
        }
    }
    override fun stopPlaying() = jsStopPlaying()
    override fun duration(file: File): Long = durations[file.path] ?: 0

    /** Вернулись с экрана камеры — экраны забирают снятое так же, как после возврата в приложение. */
    private fun resumed() = jsResume()

    // ---------- Система E•state, карта ----------

    /** В рамке страницы осмотрщиков системы — связь с ней; открыто само по себе — без системы. */
    override val estate: kg.osmotr.core.EstateLink? get() = if (WebEstate.embedded) WebEstate else null

    override val canMap: Boolean get() = true

    override suspend fun mapTile(z: Int, x: Int, y: Int): ImageBitmap? {
        val png = suspendCoroutine<JsAny?> { c -> jsTile(z, x, y) { c.resume(it) } } ?: return null
        return runCatching { Image.makeFromEncoded(png.toBytes()).toComposeImageBitmap() }.getOrNull()
    }

    override fun openUrl(url: String) = jsOpenUrl(url)
}

private fun jsTile(z: Int, x: Int, y: Int, done: (JsAny?) -> Unit): Unit = js("globalThis.osmotrWeb.tile(z, x, y, done)")
private fun jsOpenUrl(url: String): Unit = js("globalThis.osmotrWeb.openUrl(url)")

private fun jsCamera(frame: (JsAny, Int, Int, JsAny) -> Unit, closed: () -> Unit, clip: (JsAny, String, Double, JsAny) -> Unit): Unit =
    js("globalThis.osmotrWeb.camera(frame, closed, clip)")
private fun jsPlayVideo(blob: JsAny, name: String): Unit = js("globalThis.osmotrWeb.playVideo(blob, name)")
private fun jsOpenFile(blob: JsAny, name: String, mime: String): Unit = js("globalThis.osmotrWeb.openFile(blob, name, mime)")
private fun jsCall(f: JsAny, err: String?): Unit = js("f(err)")
private fun jsPick(accept: String, multiple: Boolean, got: (String?, JsAny?, Double) -> Unit): Unit = js("globalThis.osmotrWeb.pick(accept, multiple, got)")
private fun jsArray(): JsAny = js("[]")
private fun jsPush(a: JsAny, blob: JsAny, name: String, type: String): Unit = js("a.push({ blob, name, type })")
private fun jsShare(files: JsAny, title: String, done: (String) -> Unit): Unit = js("globalThis.osmotrWeb.share(files, title, done)")
private fun jsSaveAs(blob: JsAny, name: String, type: String, done: (String) -> Unit): Unit = js("globalThis.osmotrWeb.saveAs(blob, name, type, done)")
private fun jsResume(): Unit = js("(window.dispatchEvent(new Event('blur')), void window.dispatchEvent(new Event('focus')))")
private fun jsRecStart(done: (JsAny?, Double) -> Unit): Boolean = js("globalThis.osmotrWeb.rec.start(done)")
private fun jsRecStop(): Unit = js("globalThis.osmotrWeb.rec.stop(false)")
private fun jsRecLevel(): Double = js("globalThis.osmotrWeb.rec.level()")
private fun jsPlay(blob: JsAny, done: () -> Unit): Unit = js("globalThis.osmotrWeb.rec.play(blob, done)")
private fun jsStopPlaying(): Unit = js("globalThis.osmotrWeb.rec.stopPlaying()")
private fun jsHasRecorder(): Boolean = js("typeof MediaRecorder !== 'undefined'")
private fun jsCanLocate(): Boolean = js("isSecureContext && 'geolocation' in navigator")
private fun jsLocate(done: (String?) -> Unit): Unit = js("globalThis.osmotrWeb.locate(done)")
private fun jsPdfOpen(path: String, blob: JsAny, done: (String) -> Unit): Unit = js("globalThis.osmotrWeb.pdf.open(path, blob, done)")
private fun jsPdfRender(path: String, blob: JsAny, page: Int, scale: Double, x: Int, y: Int, w: Int, h: Int, quarters: Int, done: (JsAny?) -> Unit): Unit =
    js("globalThis.osmotrWeb.pdf.render(path, blob, page, scale, x, y, w, h, quarters, done)")
private fun jsPdfClose(path: String): Unit = js("globalThis.osmotrWeb.pdf.close(path)")
private fun jsPickStored(accept: String, got: (String?, String?, Double, Double, JsAny?, JsAny?, JsAny?, JsAny?) -> Unit): Unit =
    js("globalThis.osmotrWeb.pickStored(accept, got)")
