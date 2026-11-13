package kg.osmotr

import android.Manifest
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.ContactsContract
import android.provider.OpenableColumns
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import kg.osmotr.core.File
import kg.osmotr.core.Platform
import kg.osmotr.core.Store
import kg.osmotr.ui.Host
import kg.osmotr.ui.OsmotrApp
import kg.osmotr.ui.Picked
import kg.osmotr.ui.Shot

/**
 * Android-часть «Осмотра»: всё приложение — общее (shared, то же на iPhone), здесь только то,
 * что умеет одна платформа: своя камера, выбор файлов, «Поделиться», контакты, доступ к памяти.
 */
/** Перехватчик падений ставится один раз на процесс (активность пересоздаётся). */

class MainActivity : ComponentActivity(), Host {
    private companion object { const val INCOMING = "incoming" }

    /** Описи, присланные через «Поделиться» / «Открыть с помощью». */
    private val incoming = mutableStateListOf<Picked>()

    // Своя камера (19.10.2026): кадры пишет сразу в папку; в ответ — сколько легло.
    private var shooting: File? = null
    private var shot: Shot? = null
    private val camera = registerForActivityResult(CameraActivity.Shoot) { n ->
        shot = shooting?.let { d -> Shot(d, n) }
        shooting = null
    }
    private var gotBooks: ((List<Picked>) -> Unit)? = null
    private val openOne = registerForActivityResult(ActivityResultContracts.OpenDocument()) { u -> gotBooks?.invoke(listOfNotNull(u).mapNotNull(::read)); gotBooks = null }
    private val openMany = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { us -> gotBooks?.invoke(us.mapNotNull(::read)); gotBooks = null }
    // Фото из галереи — системный выбор (Photo Picker): несколько сразу, разрешений на память не надо.
    private var gotGallery: ((List<Picked>) -> Unit)? = null
    private val gallery = registerForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(100)) { us ->
        val got = gotGallery; gotGallery = null
        if (got == null || us.isEmpty()) return@registerForActivityResult
        // Читать — в фоне: два десятка снимков по 4 МБ на главном потоке подвесили бы экран.
        Thread { val list = us.mapNotNull(::read); runOnUiThread { got(list) } }.start()
    }
    // Снимки и PDF разом — системный выбор файлов (документы объекта и ТС, массовая подгрузка).
    private var gotFiles: ((List<Picked>) -> Unit)? = null
    private val files = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { us ->
        val got = gotFiles; gotFiles = null
        if (got == null || us.isEmpty()) return@registerForActivityResult
        Thread { val list = us.mapNotNull(::read); runOnUiThread { got(list) } }.start()
    }
    private var gotPhone: ((String, String) -> Unit)? = null
    private val phone = registerForActivityResult(PickPhone) { uri ->
        uri ?: return@registerForActivityResult
        runCatching {
            contentResolver.query(uri, arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER), null, null, null)?.use { c ->
                if (c.moveToFirst()) gotPhone?.invoke(c.getString(0).orEmpty(), c.getString(1).orEmpty())
            }
        }
        gotPhone = null
    }
    private val legacyStorage = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // Хранилище, телеметрия и перехват падений — в OsmotrApplication: процесс бывает поднят сразу на камере.
        // Присланное, которое так и не разложили, — прочь через сутки.
        Thread { java.io.File(super.getCacheDir(), INCOMING).listFiles()?.forEach { if (System.currentTimeMillis() - it.lastModified() > 86_400_000L) it.delete() } }.start()
        take(intent)
        // Метки testTag — ещё и resource-id: обход на эмуляторе (tools/matrix) находит блоки по ним.
        setContent {
            androidx.compose.foundation.layout.Box(androidx.compose.ui.Modifier.semantics { @OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class) testTagsAsResourceId = true }) {
                OsmotrApp(this@MainActivity, incoming)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        take(intent)
    }

    /** Присланное «Поделиться» (WhatsApp, Telegram, почта) или «Открыть с помощью». */
    private fun take(intent: Intent?) {
        intent ?: return
        // Сообщение о выезде текстом (без файла) — в объект: разбор и окно — в общем коде (Brief).
        if (intent.action == Intent.ACTION_SEND && intent.type?.startsWith("text/") == true) {
            val text = intent.getStringExtra(Intent.EXTRA_TEXT)
            if (!text.isNullOrBlank()) {
                intent.action = null
                incoming.add(Picked(kg.osmotr.core.Brief.SHARED, text.encodeToByteArray()))
                return
            }
        }
        val got = mutableListOf<Uri>()
        when (intent.action) {
            Intent.ACTION_SEND -> (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM))?.let(got::add)
            Intent.ACTION_SEND_MULTIPLE -> (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else @Suppress("DEPRECATION") intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM))?.let(got::addAll)
            Intent.ACTION_VIEW -> intent.data?.let(got::add)
            else -> return
        }
        // Некоторые мессенджеры кладут файлы только в clipData.
        if (got.isEmpty()) intent.clipData?.let { c -> (0 until c.itemCount).mapNotNullTo(got) { c.getItemAt(it).uri } }
        intent.action = null  // поворот / возврат не загружает второй раз
        // Читать — в фоне (фото из WhatsApp — по нескольку мегабайт).
        val uris = got.distinct()
        Thread { val list = uris.mapNotNull(::read); runOnUiThread { incoming.addAll(list) } }.start()
    }

    private fun read(uri: Uri): Picked? = readPicked(contentResolver, uri, java.io.File(super.getCacheDir(), INCOMING))

    /** Когда снято — из EXIF (DateTimeOriginal, иначе DateTime); не фото или нет даты — null. */
    private fun takenOf(bytes: ByteArray): Long? = runCatching {
        val exif = androidx.exifinterface.media.ExifInterface(java.io.ByteArrayInputStream(bytes))
        exif.dateTimeOriginal ?: exif.dateTime
    }.getOrNull()

    // ---------- Host ----------

    override fun takePhotos(dir: File) {
        shooting = dir
        camera.launch(dir.absolutePath)
    }

    override suspend fun afterResume(): Shot? {
        // Заход в приложение камеры телефона (ультраширик), пока «Осмотр» был выгружен системой, — забрать снятое.
        if (SystemCamera.session(this) != null) SystemCamera.collect(this)?.takeIf { it.count > 0 }?.let { return Shot(it.dir, it.count) }
        return shot?.also { shot = null }?.takeIf { it.count > 0 }
    }

    /** Можно ли писать в корень памяти: Android 11+ — «доступ ко всем файлам», 8–10 — запись. */
    override fun canWrite(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Environment.isExternalStorageManager()
        else ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED

    override fun requestStorage() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            runCatching { startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:$packageName"))) }
                .onFailure { startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)) }
        } else legacyStorage.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
    }

    override val canPickGallery: Boolean get() = true

    override fun pickGallery(got: (List<Picked>) -> Unit) {
        gotGallery = got
        gallery.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }

    override val canPickFiles: Boolean get() = true

    override fun pickFiles(got: (List<Picked>) -> Unit) {
        gotFiles = got
        files.launch(arrayOf("*/*"))
    }

    override suspend fun pdfOpen(file: File): kg.osmotr.ui.PdfOpen = PdfDocs.open(file)
    override suspend fun pdfRender(file: File, page: Int, scale: Float, x: Int, y: Int, w: Int, h: Int, quarters: Int) = PdfDocs.render(file, page, scale, x, y, w, h, quarters)
    override fun pdfClose(file: File) = PdfDocs.close(file)

    override fun openExternal(file: File, mime: String) {
        val uri = FileProvider.getUriForFile(this, "$packageName.files", java.io.File(file.path))
        val i = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        runCatching { startActivity(Intent.createChooser(i, "Открыть в приложении")) }.onFailure { toast("Нет приложения, чтобы открыть файл", false) }
    }

    override fun pickBooks(multiple: Boolean, got: (List<Picked>) -> Unit) {
        gotBooks = got
        val types = arrayOf("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/octet-stream")
        if (multiple) openMany.launch(types) else openOne.launch(types)
    }

    override fun share(files: List<File>, mime: String, title: String) {
        if (files.isEmpty()) return
        val uris = ArrayList(files.map { FileProvider.getUriForFile(this, "$packageName.files", java.io.File(it.path)) })
        val intent = (if (uris.size == 1) Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uris[0])
            else Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)).setType(mime)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        intent.clipData = ClipData.newRawUri(null, uris[0]).apply { uris.drop(1).forEach { addItem(ClipData.Item(it)) } }
        startActivity(Intent.createChooser(intent, title))
    }

    /** Видео — своим проигрывателем внутри приложения (PlayerActivity). */
    override fun openVideo(file: File) = startActivity(PlayerActivity.intent(this, file.path))

    override fun toast(text: String, long: Boolean) = Toast.makeText(this, text, if (long) Toast.LENGTH_LONG else Toast.LENGTH_SHORT).show()

    override val pickPhone: ((got: (String, String) -> Unit) -> Unit) = { got -> gotPhone = got; phone.launch(Unit) }

    override val cacheDir: File get() = File(super.getCacheDir().absolutePath)
    // Выгрузки — в «Загрузки/Осмотр»: видны в «Файлах» и по USB, переживают переустановку; нет доступа к памяти — у себя.
    override val exportsDir: File get() =
        if (canWrite()) File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).absolutePath + "/Осмотр")
        else File(filesDir.absolutePath + "/exports")
    override val exportsPlace: String get() = if (canWrite()) "в «Загрузки › Осмотр»" else "в приложении"
    override fun freeBytes(dir: File): Long = runCatching {
        var d = java.io.File(dir.path); while (!d.exists()) d = d.parentFile ?: return@runCatching -1L
        android.os.StatFs(d.path).availableBytes
    }.getOrDefault(-1L)

    // ---------- Диктофон ----------
    // AAC, моно, 64 кбит/с: голос разборчив, минута — около полумегабайта.

    private var recorder: android.media.MediaRecorder? = null
    private var recordingTo: File? = null
    private var player: android.media.MediaPlayer? = null
    private var playDone: (() -> Unit)? = null
    private val microphone = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private var located: ((String?) -> Unit)? = null
    private val location = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { got ->
        val done = located; located = null
        if (done != null) { if (got.values.any { it }) fix(done) else done(null) }
    }
    override val canLocate get() = true

    override fun locate(done: (String?) -> Unit) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) fix(done)
        else { located = done; location.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) }
    }

    /** Текущее место: спутники, иначе сеть; не ответили за 15 с — последнее известное. Сети приложению не нужно. */
    @android.annotation.SuppressLint("MissingPermission")
    private fun fix(done: (String?) -> Unit) {
        val lm = getSystemService(android.location.LocationManager::class.java)
        val text = { l: android.location.Location? -> l?.let { String.format(java.util.Locale.US, "%.5f, %.5f", it.latitude, it.longitude) } }
        val last = { lm.getProviders(true).mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }.maxByOrNull { it.time } }
        val provider = listOf(android.location.LocationManager.GPS_PROVIDER, android.location.LocationManager.NETWORK_PROVIDER)
            .firstOrNull { lm.isProviderEnabled(it) }
        if (provider == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) { done(text(last())); return }
        val stop = android.os.CancellationSignal()
        val main = android.os.Handler(mainLooper)
        var answered = false
        val answer = { l: android.location.Location? -> if (!answered) { answered = true; done(text(l ?: last())) } }
        main.postDelayed({ stop.cancel(); answer(null) }, 15_000)
        lm.getCurrentLocation(provider, stop, mainExecutor) { answer(it) }
    }

    override fun startRecording(file: File): Boolean {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            microphone.launch(Manifest.permission.RECORD_AUDIO); return false
        }
        stopPlaying()
        val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) android.media.MediaRecorder(this) else @Suppress("DEPRECATION") android.media.MediaRecorder()
        return runCatching {
            r.setAudioSource(android.media.MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(android.media.MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(android.media.MediaRecorder.AudioEncoder.AAC)
            r.setAudioChannels(1); r.setAudioSamplingRate(44_100); r.setAudioEncodingBitRate(64_000)
            r.setOutputFile(file.path)
            r.prepare(); r.start()
            recorder = r; recordingTo = file
        }.onFailure { r.release() }.isSuccess
    }

    override fun stopRecording(): Boolean {
        val r = recorder ?: return false
        recorder = null; recordingTo = null
        val ok = runCatching { r.stop() }.isSuccess  // слишком короткая запись — stop() бросает
        r.release()
        return ok
    }

    override fun recordingLevel(): Float = (recorder?.let { runCatching { it.maxAmplitude }.getOrDefault(0) } ?: 0) / 32_767f

    override fun play(file: File, done: () -> Unit) {
        stopPlaying()
        val p = android.media.MediaPlayer()
        runCatching {
            p.setDataSource(file.path)
            p.setOnCompletionListener { stopPlaying() }
            p.prepare(); p.start()
            player = p; playDone = done
        }.onFailure { p.release(); done() }
    }

    override fun stopPlaying() {
        player?.let { runCatching { it.stop() }; it.release() }
        player = null
        playDone?.let { playDone = null; it() }
    }

    override fun duration(file: File): Long {
        val m = android.media.MediaMetadataRetriever()  // AutoCloseable — только с Android 10
        return try {
            m.setDataSource(file.path)
            m.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        } catch (_: Exception) { 0L } finally { runCatching { m.release() } }
    }

    override fun onStop() {
        super.onStop()
        // Свернули во время записи — записанное сохранить, а не потерять.
        if (recorder != null) { val f = recordingTo; if (stopRecording() && f != null) Store.voiceSaved(f) }
        stopPlaying()
    }
}

/** Выбрать номер из телефонной книги: доступ только к выбранному, без разрешения на все контакты. */
private object PickPhone : ActivityResultContract<Unit, Uri?>() {
    override fun createIntent(context: android.content.Context, input: Unit) =
        Intent(Intent.ACTION_PICK).setType(ContactsContract.CommonDataKinds.Phone.CONTENT_TYPE)
    override fun parseResult(resultCode: Int, intent: Intent?): Uri? = intent?.data
}
