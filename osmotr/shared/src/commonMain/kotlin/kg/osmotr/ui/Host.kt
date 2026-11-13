package kg.osmotr.ui

import androidx.compose.runtime.staticCompositionLocalOf
import kg.osmotr.core.File

/**
 * Присланный или выбранный файл: имя, содержимое; [takenMs] — когда снято (фото: EXIF), если известно.
 *
 * Содержимое — в памяти или во временном файле ([file], Android: присланные фото переписываются
 * потоком — сотня снимков по 4 МБ в памяти роняла бы приложение). [bytes] у файлового читает файл.
 */
class Picked private constructor(val name: String, private val data: ByteArray?, val takenMs: Long?, val file: File?, private val start: ByteArray?) {
    constructor(name: String, bytes: ByteArray, takenMs: Long? = null) : this(name, bytes, takenMs, null, null)

    val bytes: ByteArray get() = data ?: file!!.readBytes()

    /** Размер содержимого. */
    val size: Long get() = data?.size?.toLong() ?: file!!.length()

    /** Записать содержимое потоком: файловое — кусками, не поднимая целиком в память. */
    fun writeTo(sink: okio.BufferedSink) { if (data != null) sink.write(data) else file!!.read { sink.writeAll(this) } }

    /** То же содержимое, что у [f] (тот же документ прислали ещё раз): сначала размер, потом кусками. */
    fun sameAs(f: File): Boolean {
        if (!f.isFile || f.length() != size) return false
        if (data != null) return f.readBytes().contentEquals(data)
        return f.read { val a = this; file!!.read { sameStream(a, this) } }
    }

    companion object {
        /** Содержимое — во временном файле; [head] — его начало (вид по содержимому). */
        fun ofFile(name: String, file: File, takenMs: Long?, head: ByteArray) = Picked(name, null, takenMs, file, head)
    }

    /** PDF — по расширению или по началу файла («%PDF»). */
    val isPdf: Boolean get() {
        if (name.endsWith(".pdf", ignoreCase = true)) return true
        val b = start ?: data ?: return false
        return b.size > 4 && b[0] == '%'.code.toByte() && b[1] == 'P'.code.toByte() && b[2] == 'D'.code.toByte() && b[3] == 'F'.code.toByte()
    }

    /** Книга Excel (перечень; .xlsx или старый .xls) — по расширению. */
    val isList: Boolean get() = name.substringAfterLast('.', "").lowercase() in setOf("xlsx", "xls")

    /** Документ объекта — PDF или книга Excel: ложится файлом под своим именем, туда, где документам место. */
    val isDoc: Boolean get() = !isPhoto

    /** Фото (по расширению или по началу файла): JPEG, HEIC/HEIF, PNG, WebP. */
    val isPhoto: Boolean get() {
        if (name.substringAfterLast('.', "").lowercase() in setOf("jpg", "jpeg", "heic", "heif", "png", "webp")) return true
        val b = start ?: data ?: return false
        return b.size > 12 && (b[0] == 0xFF.toByte() && b[1] == 0xD8.toByte() ||
            b[0] == 0x89.toByte() && b[1] == 'P'.code.toByte() ||
            b[4] == 'f'.code.toByte() && b[5] == 't'.code.toByte() && b[6] == 'y'.code.toByte() && b[7] == 'p'.code.toByte() ||
            b[0] == 'R'.code.toByte() && b[1] == 'I'.code.toByte() && b[8] == 'W'.code.toByte() && b[9] == 'E'.code.toByte())
    }
}

/** Снято штатной камерой: куда и сколько. */
class Shot(val dir: File, val count: Int)

/**
 * Что делает только платформа: камера, выбор файлов, «Поделиться», сообщения, контакты.
 * Android — MainActivity, iPhone — iosMain. Экраны пишутся один раз (общие) и зовут его.
 */
interface Host {
    /** Снимать в [dir] штатной камерой (снятое забирается в [afterResume]). */
    fun takePhotos(dir: File)
    /** Вернулись в приложение: если снимали — что легло и куда; иначе null. */
    suspend fun afterResume(): Shot?
    /** Можно ли писать в хранилище «Осмотров» (Android — доступ к памяти; iPhone — всегда). */
    fun canWrite(): Boolean
    /** Попросить доступ к памяти (настройки системы). */
    fun requestStorage()
    /** Выбрать книгу(и) Excel. */
    fun pickBooks(multiple: Boolean, got: (List<Picked>) -> Unit)
    /** Есть ли выбор фото из галереи (пока — Android). */
    val canPickGallery: Boolean get() = false
    /** Выбрать фото из галереи — несколько сразу. */
    fun pickGallery(got: (List<Picked>) -> Unit) {}
    /** Можно ли сохранить файл туда, куда укажет человек (PWA: «Сохранить как», на iPhone — «Сохранить в Файлы»). */
    /**
     * Файлы с телефона — снимки и PDF разом (документы недвижимости и ТС, массовая подгрузка; автор, 29.10.2026:
     * «Обязателен просмотр подгружаемых пдф документов»). Android и PWA.
     */
    val canPickFiles: Boolean get() = false
    fun pickFiles(got: (List<Picked>) -> Unit) {}
    /** Открыть PDF для просмотра: размеры страниц или почему нельзя. Документ держится открытым до [pdfClose]. */
    suspend fun pdfOpen(file: File): PdfOpen = PdfOpen.Unsupported
    /**
     * Кусок страницы [page] картинкой на белом: страница в масштабе [scale] (пикселей на пункт PDF), из неё —
     * прямоугольник [x], [y], [w]×[h] пикселей. Вся страница — x = y = 0 и её полный размер. Не вышло — null.
     */
    suspend fun pdfRender(file: File, page: Int, scale: Float, x: Int, y: Int, w: Int, h: Int, quarters: Int = 0): androidx.compose.ui.graphics.ImageBitmap? = null
    /** Отпустить открытый документ (ушли с просмотра). */
    fun pdfClose(file: File) {}
    /**
     * Открыть файл в другом приложении телефона (PDF: поиск по тексту, формы — там). По умолчанию — окно
     * «Поделиться», в нём есть «Открыть в…» (iPhone).
     */
    fun openExternal(file: File, mime: String) = share(listOf(file), mime, "Открыть")

    val canLocate: Boolean get() = false
    /** Координаты места «широта, долгота»; нет разрешения или фикса — null. */
    fun locate(done: (String?) -> Unit) = done(null)
    val canSaveAs: Boolean get() = false
    /** Сохранить файл (архив выгрузки) — место выбирает человек. */
    fun saveAs(file: File, mime: String) {}
    /** Отправить файлы через «Поделиться» (мессенджер, почта, «Файлы»). */
    fun share(files: List<File>, mime: String, title: String = "Отправить")
    /** Короткое сообщение внизу экрана. */
    fun toast(text: String, long: Boolean = false)
    /** Выбрать контакт из телефонной книги: имя и телефон; null — нет такой возможности. */
    val pickPhone: ((got: (name: String, phone: String) -> Unit) -> Unit)?
    /** Папка для временных файлов (архивы перед отправкой). */
    val cacheDir: File
    /**
     * Куда ложатся выгрузки — архивы остаются, пока их не удалят на экране «Выгрузки» (автор, 21.10.2026:
     * «автодублирование в папку загрузок»). Android — «Загрузки/Осмотр», видна в «Файлах» и по USB.
     */
    val exportsDir: File get() = File(cacheDir, "exports")
    /** Как назвать эту папку человеку. */
    val exportsPlace: String get() = "в приложении"
    /** Свободно в памяти телефона там, где [dir]; −1 — неизвестно. */
    fun freeBytes(dir: File): Long = -1

    // Диктофон — голосовые заметки к папке и к описи (AAC, .m4a, рядом со снимками).
    /** Умеет ли платформа записывать голос (браузер без MediaRecorder — нет). */
    val canRecord: Boolean get() = true
    /** Начать запись в [file]; false — нет доступа к микрофону (попросили — нажать ещё раз). */
    fun startRecording(file: File): Boolean = false
    /** Остановить запись; true — записалось. */
    fun stopRecording(): Boolean = false
    /** Громкость сейчас, 0…1 — полоска, что микрофон слышит. */
    fun recordingLevel(): Float = 0f
    /** Проиграть запись; [done] — доиграла или остановили. */
    fun play(file: File, done: () -> Unit) { done() }
    fun stopPlaying() {}
    /** Открыть видео системным проигрывателем (iPhone — позже). */
    fun openVideo(file: File) {}
    /** Длительность записи, мс; 0 — неизвестно. */
    fun duration(file: File): Long = 0

    // ---------- Система E•state (ветка estate-integration) ----------

    /** Связь с системой; null — приложение не в системе и работает как прежде (Estate). */
    val estate: kg.osmotr.core.EstateLink? get() = null

    /** Есть ли карта (клетки подложки по сети). */
    val canMap: Boolean get() = false

    /** Клетка подложки карты [z]/[x]/[y] (OpenStreetMap); нет сети — null. */
    suspend fun mapTile(z: Int, x: Int, y: Int): androidx.compose.ui.graphics.ImageBitmap? = null

    /** Открыть ссылку снаружи приложения (маршрут в навигаторе). */
    fun openUrl(url: String) {}
}

val LocalHost = staticCompositionLocalOf<Host> { error("Host не задан") }

/** Чем кончилось открытие PDF. Размеры страниц — в пунктах PDF (ширина, высота). */
sealed interface PdfOpen {
    class Pages(val sizes: List<Pair<Float, Float>>) : PdfOpen
    /** Защищён паролем на открытие. */
    data object Locked : PdfOpen
    /** Не PDF или повреждён. */
    data object Broken : PdfOpen
    /** Платформа не рисует PDF сама (iPhone, браузер) — только в другом приложении. */
    data object Unsupported : PdfOpen
}

/** Два потока одной длины — побайтно равны (кусками по 64 КБ). */
internal fun sameStream(a: okio.BufferedSource, b: okio.BufferedSource): Boolean {
    val x = ByteArray(64 * 1024)
    while (true) {
        val n = a.read(x, 0, x.size)
        if (n <= 0) return b.exhausted()
        val y = b.readByteArray(n.toLong())
        for (k in 0 until n) if (x[k] != y[k]) return false
    }
}
