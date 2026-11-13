package kg.osmotr

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.media.MediaActionSound
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.OrientationEventListener
import android.view.ScaleGestureDetector
import android.view.Surface
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.ui.text.font.FontWeight
import kg.osmotr.core.Store
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.ui.geometry.Offset
import kotlin.math.roundToInt
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import kg.osmotr.core.Kadr
import kg.osmotr.core.Telemetry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.Executors
import kg.osmotr.core.File as KFile

/**
 * Своя камера «Осмотра» (автор, 19.10.2026: «камера наша», «без переоткрывания камеры»,
 * «обработку подтягиваем от системы»).
 *
 * Серия — не выходя из камеры: спуск сколько угодно раз, «Готово» — назад в папку. Кадр пишется
 * сразу в папку предмета ([Kadr]: временный файл рядом → проверка → своё имя → регистрация);
 * галерея о нём узнаёт последней. Возможности — те, что даёт телефон и что не задерживает снимок:
 * формат (4:3 по умолчанию), сетка, ступени зума (0.6 / 1 / телевик), экспозиция, ручные выдержка,
 * ISO и фокус. Режимы производителя (HDR, ночь) не включаются (CameraWork).
 */
class CameraActivity : ComponentActivity() {
    companion object {
        const val DIR = "dir"
        const val COUNT = "count"
    }

    /** Открыть камеру на папку; в ответ — сколько кадров легло. */
    object Shoot : ActivityResultContract<String, Int>() {
        override fun createIntent(context: Context, input: String) = Intent(context, CameraActivity::class.java).putExtra(DIR, input)
        override fun parseResult(resultCode: Int, intent: Intent?) = intent?.getIntExtra(COUNT, 0) ?: 0
    }

    private var count = 0
    private var shutter: (() -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val dir = intent.getStringExtra(DIR) ?: return finish()
        val kadr = Kadr(KFile(dir))
        Telemetry.event("камера", "открыта")
        setContent {
            MaterialTheme {
                Box(Modifier.semantics { @OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class) testTagsAsResourceId = true }) {
                    CameraScreen(kadr, onShot = { count++ ; setResult(RESULT_OK, Intent().putExtra(COUNT, count)) },
                        bindShutter = { shutter = it }, done = ::done)
                }
            }
        }
        setResult(RESULT_OK, Intent().putExtra(COUNT, 0))
    }

    private fun done() {
        android.util.Log.i("osmotr-camera", "готово")
        setResult(RESULT_OK, Intent().putExtra(COUNT, count))
        finish()
    }

    // Клавиши громкости — спуск (как в штатной камере).
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_CAMERA) {
            if (event?.repeatCount == 0) shutter?.invoke()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}

/** Тёмная подложка подписей поверх кадра. */
private val Scrim = Color(0x99000000)

/**
 * Вспышка. По умолчанию — выключена: со вспышкой «авто» и «вкл» съёмка без задержки затвора не
 * работает (кадр снимается после замера вспышки), а осмотр — серия снимков подряд. В видео —
 * фонарь: выкл / вкл.
 */
private enum class Flash(val mode: Int, val label: String) {
    OFF(ImageCapture.FLASH_MODE_OFF, "⚡ выкл"),
    AUTO(ImageCapture.FLASH_MODE_AUTO, "⚡ авто"),
    ON(ImageCapture.FLASH_MODE_ON, "⚡ вкл"),
}

private val Gold = Color(0xFFFFD60A)

/** Кнопка-чип поверх кадра: тёмная плашка, включённое — жёлтым; подпись короткая, без пояснений. */
@Composable
private fun Chip(text: String, on: Boolean = false, enabled: Boolean = true, tag: String, onClick: () -> Unit) {
    Text(text, color = if (on) Gold else Color.White.copy(alpha = if (enabled) 1f else 0.45f), fontSize = 15.sp, maxLines = 1,
        modifier = Modifier.background(Scrim, RoundedCornerShape(20.dp)).clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 9.dp).testTag(tag))
}

/** Рамка фокуса: где коснулись, чем кончилось (ищет — белая, поймал — жёлтая, нет — красная). */
private class FocusMark(val x: Float, val y: Float, val locked: Boolean, val result: Boolean?, val at: Long)

@Composable
private fun CameraScreen(kadr: Kadr, onShot: () -> Unit, bindShutter: ((() -> Unit)?) -> Unit, done: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val owner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    var allowed by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var asked by remember { mutableStateOf(false) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { allowed = it; asked = true }
    LaunchedEffect(Unit) { if (!allowed) ask.launch(Manifest.permission.CAMERA) }
    // «Назад» — как «Готово»: снятое дописывается в фоне (CameraWork), ждать не нужно.
    BackHandler(onBack = done)

    if (!allowed) {
        Column(Modifier.fillMaxSize().background(Color.Black).padding(24.dp), verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Нужен доступ к камере — снимки пишутся сразу в папку осмотра.", color = Color.White, fontSize = 18.sp)
            if (asked) Button(onClick = {
                context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)))
            }, Modifier.padding(top = 16.dp)) { Text("Открыть настройки") }
            TextButton(onClick = done, Modifier.padding(top = 8.dp)) { Text("Назад", color = Color.White) }
        }
        return
    }

    val preview = remember { PreviewView(context).apply { scaleType = PreviewView.ScaleType.FILL_CENTER; implementationMode = PreviewView.ImplementationMode.COMPATIBLE } }
    var ready by remember { mutableStateOf(false) }
    var flash by remember { mutableStateOf(Flash.OFF) }
    var taken by remember { mutableIntStateOf(0) }
    var films by remember { mutableIntStateOf(0) }
    val inFlight by CameraWork.inFlight.collectAsState()
    val canShoot by CameraWork.ready.collectAsState()
    val recorded by CameraWork.recordedMs.collectAsState()
    val recording = recorded >= 0
    var last by remember { mutableStateOf<ImageBitmap?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    // Настройки помнятся между заходами, как в штатной камере; формат по умолчанию — 4:3 (автор, 20.10.2026).
    val prefs = remember { context.getSharedPreferences("camera", Context.MODE_PRIVATE) }
    var aspect by remember { mutableStateOf(CameraWork.Aspect.entries.firstOrNull { it.name == prefs.getString("aspect", null) } ?: CameraWork.Aspect.R4_3) }
    var mode by remember { mutableStateOf(CameraWork.Mode.entries.firstOrNull { it.name == prefs.getString("mode", null) } ?: CameraWork.Mode.PHOTO) }
    var ext by remember { mutableIntStateOf(prefs.getInt("ext", CameraWork.Ext.NONE)) }
    var grid by remember { mutableStateOf(prefs.getBoolean("grid", false)) }
    var dark by remember { mutableStateOf(prefs.getBoolean("dark", false)) }
    var zoom by remember { mutableStateOf(1f) }
    var panel by remember { mutableStateOf(false) }
    var ev by remember { mutableIntStateOf(0) }
    var man by remember { mutableStateOf(CameraWork.Manual()) }
    var mark by remember { mutableStateOf<FocusMark?>(null) }
    var touched by remember { mutableStateOf(0L) }
    val caps by CameraWork.caps.collectAsState()
    var rotation by remember { mutableIntStateOf(Surface.ROTATION_0) }
    val blink = remember { Animatable(0f) }
    val sound = remember { MediaActionSound().apply { load(MediaActionSound.SHUTTER_CLICK) } }
    val haptics = androidx.compose.ui.platform.LocalHapticFeedback.current

    fun push() { CameraWork.aspect = aspect; CameraWork.mode = mode; CameraWork.ext = ext; CameraWork.lowLight = dark }
    // Документ (шильдик, табличка): сканер документов Google — сам находит края и выравнивает; страницы — снимками в папку.
    val scanner = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { r ->
        val pages = com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult.fromActivityResultIntent(r.data)?.pages.orEmpty()
        if (pages.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch {
            val files = withContext(Dispatchers.IO) {
                pages.mapIndexedNotNull { i, pg ->
                    runCatching {
                        val tmp = java.io.File(context.cacheDir, "scan-${System.nanoTime()}-$i.jpg")
                        context.contentResolver.openInputStream(pg.imageUri)!!.use { src -> tmp.outputStream().use { src.copyTo(it) } }
                        Triple("scan.jpg", KFile(tmp.path), System.currentTimeMillis() as Long?)
                    }.getOrNull()
                }.let { Store.addPhotoFiles(KFile(kadr.dirPath), it) }
            }
            files.forEach { onShot() }
            taken += files.size
            files.lastOrNull()?.let { f -> decodeThumbAsync(File(f.path))?.let { last = it } }
            Telemetry.event("камера: документ", "страниц ${files.size}")
            if (files.size < pages.size) message = "Не сохранилось страниц: ${pages.size - files.size}"
        }
    }
    // Ультраширик, спрятанный телефоном от приложений (Xiaomi), — приложение камеры телефона целиком, со
    // всеми его настройками (автор, 21.10.2026: «открываем приложение камеры с полными её настройками и
    // заставляем класть по нужному адресу фото»): снимать сколько угодно, по возвращении снятое за заход
    // переносится из DCIM в папку предмета (SystemCamera — механизм 3.8 с его исправлениями).
    val systemCam = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        scope.launch {
            val got = SystemCamera.collect(context) ?: return@launch
            if (got.count > 0) {
                taken += got.count; repeat(got.count) { onShot() }
                withContext(Dispatchers.IO) { Store.photosIn(got.dir).firstOrNull() }?.let { f -> decodeThumbAsync(File(f.path))?.let { last = it } }
            }
            Telemetry.event("камера", "приложение камеры телефона: снимков ${got.count}")
        }
    }
    fun systemCamera() = runCatching {
        SystemCamera.begin(context, KFile(kadr.dirPath))
        systemCam.launch(SystemCamera.intent())
    }.onFailure { e -> SystemCamera.cancel(context); Telemetry.error("камера: приложение камеры", e); message = "Приложение камеры не открылось" }

    fun scanDocument() = runCatching {
        val opt = com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(false).setPageLimit(10)
            .setResultFormats(com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setScannerMode(com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.SCANNER_MODE_FULL).build()
        val activity = context as android.app.Activity
        com.google.mlkit.vision.documentscanner.GmsDocumentScanning.getClient(opt).getStartScanIntent(activity)
            .addOnSuccessListener { scanner.launch(androidx.activity.result.IntentSenderRequest.Builder(it).build()) }
            .addOnFailureListener { Telemetry.error("камера: сканер", it); message = "Сканер документов недоступен на этом телефоне" }
        Unit
    }.onFailure { Telemetry.error("камера: сканер", it); message = "Сканер документов недоступен на этом телефоне" }
    // Формат, режим, обработка, объектив — на ходу; пока камера занята (кадр не отдан, идёт запись) — нельзя.
    fun reconfigure(): Boolean { push(); return CameraWork.reconfigure(preview.surfaceProvider, flash.mode, rotation, zoom) }
    fun pick(newMode: CameraWork.Mode) {
        if (newMode == mode || recorded >= 0 || !canShoot) return
        val before = mode
        mode = newMode; if (newMode == CameraWork.Mode.VIDEO && flash == Flash.AUTO) flash = Flash.OFF
        if (reconfigure()) prefs.edit().putString("mode", mode.name).apply() else mode = before
        mark = null
    }

    // Поворот телефона — в поворот кадра (EXIF), экран камеры при этом не вращается.
    androidx.compose.runtime.DisposableEffect(Unit) {
        val l = object : OrientationEventListener(context) {
            override fun onOrientationChanged(o: Int) {
                if (o == ORIENTATION_UNKNOWN) return
                rotation = when (o) { in 45..134 -> Surface.ROTATION_270; in 135..224 -> Surface.ROTATION_180; in 225..314 -> Surface.ROTATION_90; else -> Surface.ROTATION_0 }
                CameraWork.setRotation(rotation)
            }
        }
        l.enable()
        onDispose { l.disable(); sound.release() }
    }

    // Камера приложения: экран на виду — подключиться (или взять ещё открытую), ушёл — отключиться;
    // недописанные кадры CameraWork доделает сама.
    androidx.compose.runtime.DisposableEffect(owner) {
        var attached = false
        val obs = androidx.lifecycle.LifecycleEventObserver { _, e ->
            when (e) {
                androidx.lifecycle.Lifecycle.Event.ON_START -> scope.launch {
                    push()
                    runCatching { CameraWork.attach(context, preview.surfaceProvider, flash.mode, rotation, zoom) }
                        .onSuccess { attached = true; ready = true }
                        .onFailure { Telemetry.error("камера: запуск", it); message = "Камера не открылась: ${it.message ?: it::class.simpleName}" }
                }
                androidx.lifecycle.Lifecycle.Event.ON_STOP -> if (attached) { attached = false; ready = false; CameraWork.stopVideo(); CameraWork.detach() }
                else -> Unit
            }
        }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs); if (attached) { CameraWork.stopVideo(); CameraWork.detach() } }
    }

    // Легло — счётчик и миниатюра; не легло — сказать.
    LaunchedEffect(Unit) {
        val mine = kadr.dirPath
        CameraWork.landed.collect { l ->
            if (l.dir != mine) return@collect
            if (l.file != null) {
                if (l.file.extension.lowercase() in Store.VIDEO_EXT) films++ else taken++
                decodeThumbAsync(l.file)?.let { last = it }
            } else message = "Не сохранилось: ${l.error}"
        }
    }

    // Рамка гаснет, когда с ней перестали работать: через 2 с после последнего касания или сдвига
    // яркости (пока тянут яркость, не пропадает); закреплённая — остаётся до следующего касания.
    LaunchedEffect(mark, touched) {
        val m = mark ?: return@LaunchedEffect
        if (m.result != null && !m.locked) { kotlinx.coroutines.delay(2000); if (mark === m && System.currentTimeMillis() - touched >= 1900) mark = null }
    }

    val shoot: () -> Unit = shoot@{
        if (!ready) return@shoot
        if (mode == CameraWork.Mode.VIDEO) {
            if (recording) { CameraWork.stopVideo(); return@shoot }
            if (!canShoot) return@shoot
            if (CameraWork.startVideo(KFile(kadr.dirPath))) { panel = false; onShot(); haptics.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress) }
            return@shoot
        }
        when (CameraWork.shoot(context, kadr)) {
            CameraWork.Shot.TAKEN -> Unit
            // Камера ещё не взяла прошлый кадр — нажатие не копится (иначе снимала бы уже карман).
            CameraWork.Shot.BUSY -> { haptics.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.Reject); return@shoot }
            CameraWork.Shot.NOT_READY -> return@shoot
        }
        onShot()
        scope.launch { blink.snapTo(0.7f); blink.animateTo(0f, tween(180)) }
        runCatching { sound.play(MediaActionSound.SHUTTER_CLICK) }
    }
    LaunchedEffect(shoot) { bindShutter(shoot) }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        Box(Modifier.align(Alignment.Center).fillMaxWidth().aspectRatio(aspect.portrait)) {
            AndroidView({ preview }, Modifier.fillMaxSize().testTag("camera-preview"))
            // Жесты ставятся один раз: прежде их пересоздавала каждая перерисовка (а регулировка яркости
            // перерисовывает на каждый шаг) — и жест сбрасывался на ходу, шёл в одну сторону, обрывался.
            remember(preview) {
                val g = object { var dragging = false; var evBase = 0; var accY = 0f }
                val scale = ScaleGestureDetector(preview.context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
                    override fun onScale(d: ScaleGestureDetector): Boolean {
                        zoom = (CameraWork.zoom() * d.scaleFactor).coerceIn(caps?.zoomMin ?: 1f, caps?.zoomMax ?: 1f)
                        CameraWork.setZoom(zoom)
                        touched = System.currentTimeMillis()
                        return true
                    }
                })
                fun focus(x: Float, y: Float, lock: Boolean) {
                    val t0 = System.currentTimeMillis()
                    val m = FocusMark(x, y, lock, null, t0)
                    mark = m; touched = t0
                    ev = 0; CameraWork.setExposureIndex(0)
                    CameraWork.focusAt(preview.meteringPointFactory.createPoint(x, y), lock) { ok ->
                        if (mark === m) mark = FocusMark(x, y, lock, ok, t0)
                        if (lock) haptics.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
                    }
                }
                val tap = android.view.GestureDetector(preview.context, object : android.view.GestureDetector.SimpleOnGestureListener() {
                    override fun onDown(e: MotionEvent) = true
                    override fun onSingleTapUp(e: MotionEvent): Boolean { if (panel) panel = false else focus(e.x, e.y, false); return true }
                    override fun onLongPress(e: MotionEvent) { if (!panel) focus(e.x, e.y, true) }
                    override fun onScroll(a: MotionEvent?, b: MotionEvent, dx: Float, dy: Float): Boolean {
                        val r = caps?.ev ?: return false
                        if (mark == null || scale.isInProgress || (!g.dragging && kotlin.math.abs(dy) < kotlin.math.abs(dx))) return false
                        if (!g.dragging) { g.dragging = true; g.evBase = ev; g.accY = 0f }
                        g.accY += dy
                        touched = System.currentTimeMillis()
                        // Вверх — светлее, вниз — темнее. Весь диапазон — на треть высоты кадра: от края до края
                        // за один проход, без повторных захватов.
                        val span = (preview.height / 3f).coerceAtLeast(1f)
                        ev = (g.evBase + (g.accY / span * (r.last - r.first)).roundToInt()).coerceIn(r.first, r.last)
                        CameraWork.setExposureIndex(ev)
                        return true
                    }
                    override fun onFling(a: MotionEvent?, b: MotionEvent, vx: Float, vy: Float): Boolean {
                        if (g.dragging || scale.isInProgress || kotlin.math.abs(vx) < 1200f || kotlin.math.abs(vx) < 2 * kotlin.math.abs(vy)) return false
                        pick(if (vx < 0) CameraWork.Mode.VIDEO else CameraWork.Mode.PHOTO)
                        return true
                    }
                })
                preview.setOnTouchListener { view, e ->
                    scale.onTouchEvent(e)
                    tap.onTouchEvent(e)
                    if (e.action == MotionEvent.ACTION_UP || e.action == MotionEvent.ACTION_CANCEL) { g.dragging = false; touched = System.currentTimeMillis(); view.performClick() }
                    true
                }
                true
            }
            if (grid) Canvas(Modifier.fillMaxSize().testTag("camera-grid")) {
                val c = Color.White.copy(alpha = 0.55f)
                for (i in 1..2) {
                    drawLine(c, Offset(size.width * i / 3, 0f), Offset(size.width * i / 3, size.height), 1.5f)
                    drawLine(c, Offset(0f, size.height * i / 3), Offset(size.width, size.height * i / 3), 1.5f)
                }
            }
            mark?.let { m ->
                Canvas(Modifier.fillMaxSize().testTag("camera-focus")) {
                    val color = when (m.result) { null -> Color.White; true -> Gold; false -> Color(0xFFFF453A) }
                    val half = 36.dp.toPx()
                    drawRoundRect(color, Offset(m.x - half, m.y - half), androidx.compose.ui.geometry.Size(half * 2, half * 2),
                        androidx.compose.ui.geometry.CornerRadius(8.dp.toPx()), style = androidx.compose.ui.graphics.drawscope.Stroke(2.dp.toPx()))
                    if (m.locked) drawCircle(color, 3.dp.toPx(), Offset(m.x, m.y))
                    // Метка экспозиции — справа от рамки: солнце на высоте, по которой видно сдвиг.
                    val sx = (m.x + half + 14.dp.toPx()).coerceAtMost(size.width - 12.dp.toPx())
                    drawLine(color.copy(alpha = 0.6f), Offset(sx, m.y - half), Offset(sx, m.y + half), 1.5f)
                    val r = caps?.ev
                    val k = if (r == null || r.last == r.first) 0f else (ev - (r.first + r.last) / 2f) / ((r.last - r.first) / 2f)
                    drawCircle(color, 5.dp.toPx(), Offset(sx, m.y - k * half))
                }
                if (ev != 0) Text("%+.1f".format(ev * (caps?.evStep ?: 0f)), color = Gold, fontSize = 13.sp,
                    modifier = Modifier.offset { androidx.compose.ui.unit.IntOffset((m.x + 36.dp.toPx() + 22.dp.toPx()).toInt().coerceAtMost((preview.width - 56.dp.toPx()).toInt()), (m.y - 8.dp.toPx()).toInt()) }
                        .background(Scrim, RoundedCornerShape(8.dp)).padding(horizontal = 6.dp, vertical = 2.dp))
            }
        }
        // Окно настроек закрывается касанием вне него.
        if (panel) Box(Modifier.fillMaxSize().clickable(interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }, indication = null) { panel = false }
            .testTag("camera-panel-outside"))
        Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = blink.value)))

        Column(Modifier.fillMaxWidth().statusBarsPadding().padding(12.dp)) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (caps?.flash != false) Chip(if (mode == CameraWork.Mode.VIDEO) (if (flash == Flash.ON) "Фонарь ✓" else "Фонарь") else flash.label, flash != Flash.OFF, !recording, "camera-flash") {
                    flash = if (mode == CameraWork.Mode.VIDEO) (if (flash == Flash.ON) Flash.OFF else Flash.ON)
                            else Flash.entries[(flash.ordinal + 1) % Flash.entries.size]
                    CameraWork.setFlash(flash.mode)
                }
                Chip(aspect.label, false, canShoot && !recording, "camera-aspect") {
                    val before = aspect
                    aspect = CameraWork.Aspect.entries[(aspect.ordinal + 1) % CameraWork.Aspect.entries.size]
                    if (reconfigure()) prefs.edit().putString("aspect", aspect.name).apply() else aspect = before
                }
                if (mode == CameraWork.Mode.PHOTO) caps?.extensions?.forEach { e ->
                    val name = if (e == CameraWork.Ext.HDR) "HDR" else "Ночь"
                    Chip(name, ext == e, canShoot, "camera-ext-$name") {
                        val before = ext
                        ext = if (ext == e) CameraWork.Ext.NONE else e
                        if (reconfigure()) prefs.edit().putInt("ext", ext).apply() else ext = before
                    }
                }
                Chip("Сетка", grid, true, "camera-grid-toggle") { grid = !grid; prefs.edit().putBoolean("grid", grid).apply() }
                Chip("⚙", panel, true, "camera-settings") { panel = !panel }
            }
            Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                // Подписи — на тёмной плашке: белое на небе или светлой стене не читалось (эмулятор, 19.10.2026).
                if (recording) Text("● " + CameraMath.clock(recorded), color = Color(0xFFFF453A), fontSize = 16.sp,
                    modifier = Modifier.background(Scrim, RoundedCornerShape(20.dp)).padding(horizontal = 14.dp, vertical = 8.dp).testTag("camera-clock"))
                if (taken + films > 0) Text(listOfNotNull(taken.takeIf { it > 0 }?.let { "Снято: $it" }, films.takeIf { it > 0 }?.let { "видео: $it" }).joinToString(" · "),
                    color = Color.White, fontSize = 16.sp,
                    modifier = Modifier.background(Scrim, RoundedCornerShape(20.dp)).padding(horizontal = 14.dp, vertical = 8.dp).testTag("camera-count"))
                // Пишутся в фоне — снимать дальше и выходить можно.
                if (inFlight > 0) Text("Дописывается: $inFlight", color = Color.White, fontSize = 13.sp,
                    modifier = Modifier.background(Scrim, RoundedCornerShape(16.dp)).padding(horizontal = 12.dp, vertical = 6.dp).testTag("camera-inflight"))
            }
        }

        message?.let {
            Text(it, color = Color.White, modifier = Modifier.align(Alignment.Center).background(Color(0xCC000000), RoundedCornerShape(12.dp))
                .padding(16.dp).clickable { message = null })
        }

        Column(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 112.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            val cp = caps
            if (panel && cp != null) Column(Modifier.padding(horizontal = 16.dp).background(Color(0xCC000000), RoundedCornerShape(16.dp))
                .clickable(interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }, indication = null) {}
                .padding(12.dp).testTag("camera-panel")) {
                cp.ev?.let { r -> if (r.last > r.first) {
                    Text("Экспозиция  ${"%+.1f".format(ev * cp.evStep)}", color = Color.White, fontSize = 13.sp)
                    Slider(ev.toFloat(), { ev = it.roundToInt(); CameraWork.setExposureIndex(ev) }, valueRange = r.first.toFloat()..r.last.toFloat(), steps = r.last - r.first - 1)
                } }
                if (cp.shutter.isNotEmpty() && cp.iso.isNotEmpty()) {
                    val manual = man.exposureNs != null
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Выдержка и ISO", color = Color.White, fontSize = 13.sp, modifier = Modifier.weight(1f))
                        Switch(manual, { on ->
                            man = if (on) man.copy(exposureNs = cp.shutter.firstOrNull { it >= 8_000_000L } ?: cp.shutter.first(), iso = cp.iso.firstOrNull { it >= 200 } ?: cp.iso.first())
                                  else man.copy(exposureNs = null, iso = null)
                            CameraWork.setManual(man)
                        })
                    }
                    if (manual) {
                        val si = cp.shutter.indexOf(man.exposureNs).coerceAtLeast(0)
                        Text(CameraMath.shutterLabel(man.exposureNs!!), color = Color.White, fontSize = 13.sp)
                        Slider(si.toFloat(), { man = man.copy(exposureNs = cp.shutter[it.roundToInt()]); CameraWork.setManual(man) },
                            valueRange = 0f..(cp.shutter.size - 1).toFloat(), steps = (cp.shutter.size - 2).coerceAtLeast(0))
                        val ii = cp.iso.indexOf(man.iso).coerceAtLeast(0)
                        Text("ISO ${man.iso}", color = Color.White, fontSize = 13.sp)
                        Slider(ii.toFloat(), { man = man.copy(iso = cp.iso[it.roundToInt()]); CameraWork.setManual(man) },
                            valueRange = 0f..(cp.iso.size - 1).toFloat(), steps = (cp.iso.size - 2).coerceAtLeast(0))
                    }
                }
                if (cp.minFocus > 0f) {
                    val manual = man.focusDiopters != null
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Фокус", color = Color.White, fontSize = 13.sp, modifier = Modifier.weight(1f))
                        Switch(manual, { on -> man = man.copy(focusDiopters = if (on) 0f else null); CameraWork.setManual(man) })
                    }
                    if (manual) {
                        val d = man.focusDiopters ?: 0f
                        Text(CameraMath.focusLabel(d), color = Color.White, fontSize = 13.sp)
                        Slider(d / cp.minFocus, { man = man.copy(focusDiopters = CameraMath.focusDiopters(it, cp.minFocus)); CameraWork.setManual(man) })
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Ярче в темноте", color = Color.White, fontSize = 13.sp, modifier = Modifier.weight(1f))
                    Switch(dark, { on ->
                        val before = dark
                        dark = on
                        if (reconfigure()) prefs.edit().putBoolean("dark", on).apply() else dark = before
                    }, modifier = Modifier.testTag("camera-dark"))
                }
            }
            // Ступени увеличения: широкий угол, основной, телевик — оптика, пока возможно, дальше цифровой зум.
            if (cp != null && (cp.stops.size > 1 || cp.zoomMin >= 0.95f)) Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // Ширика нет среди камер, открытых приложениям (Xiaomi его прячет), — 0.6 через системную камеру.
                if (cp.zoomMin >= 0.95f) Text("0.6↗", color = Color.White, fontSize = 15.sp,
                    modifier = Modifier.size(width = 52.dp, height = 40.dp).background(Scrim, CircleShape).clickable(enabled = !recording) { systemCamera() }
                        .wrapContentSize().testTag("camera-system"))
                cp.stops.forEach { st ->
                    val on = kotlin.math.abs(zoom - st) < 0.05f
                    Text(CameraMath.zoomLabel(st) + (if (on) "×" else ""), color = if (on) Gold else Color.White, fontSize = 15.sp,
                        modifier = Modifier.size(40.dp).background(Scrim, CircleShape).clickable(enabled = canShoot && !recording) { zoom = st; reconfigure() }
                            .wrapContentSize().testTag("camera-zoom-" + CameraMath.zoomLabel(st)))
                }
            }
            // Режимы: фото — видео (и смахнуть вбок по кадру).
            Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                listOf<Pair<CameraWork.Mode?, String>>(CameraWork.Mode.PHOTO to "ФОТО", CameraWork.Mode.VIDEO to "ВИДЕО", null to "ДОКУМЕНТ").forEach { (m, label) ->
                    Text(label, color = if (m != null && mode == m) Gold else Color.White.copy(alpha = if (recording) 0.4f else 0.85f), fontSize = 14.sp,
                        fontWeight = if (m != null && mode == m) FontWeight.Bold else FontWeight.Normal,
                        modifier = Modifier.clickable(enabled = !recording) { if (m == null) scanDocument() else pick(m) }.padding(8.dp)
                            .testTag("camera-mode-" + (m?.name?.lowercase() ?: "doc")))
                }
            }
        }
        Row(Modifier.fillMaxWidth().align(Alignment.BottomCenter).navigationBarsPadding().padding(horizontal = 20.dp, vertical = 24.dp),
            horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            val turn = when (rotation) { Surface.ROTATION_90 -> 90f; Surface.ROTATION_270 -> -90f; Surface.ROTATION_180 -> 180f; else -> 0f }
            Box(Modifier.size(64.dp).rotate(turn).clip(RoundedCornerShape(12.dp)).background(Color.DarkGray)) {
                last?.let { Image(it, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
            }
            val video = mode == CameraWork.Mode.VIDEO
            Box(Modifier.size(84.dp).clip(CircleShape).border(5.dp, Color.White, CircleShape).padding(8.dp).clip(if (recording) RoundedCornerShape(10.dp) else CircleShape)
                // Камера ещё не отдала прошлый кадр — спуск приглушён (нажатие не копится).
                .background(when {
                    !ready -> Color.Gray
                    video -> Color(0xFFFF453A).copy(alpha = if (canShoot || recording) 1f else 0.55f)
                    canShoot -> Color.White
                    else -> Color.White.copy(alpha = 0.55f)
                })
                .clickable(enabled = ready, onClick = shoot)
                .testTag("camera-shutter").semantics { contentDescription = if (video) (if (recording) "Остановить" else "Записать") else "Снять" })
            TextButton(onClick = done,
                modifier = Modifier.size(width = 104.dp, height = 56.dp).background(Scrim, RoundedCornerShape(28.dp)).testTag("camera-done")) {
                Text("Готово", color = Color.White, fontSize = 18.sp)
            }
        }
    }
}

/** Миниатюра — в фоне (кадр 12+ Мп), на экран — готовая. */
private suspend fun decodeThumbAsync(f: File): ImageBitmap? = withContext(Dispatchers.Default) { decodeThumb(f) }

/** Миниатюра последнего кадра — уменьшенная при чтении (кадр — 12+ Мп). */
private fun decodeThumb(f: File): ImageBitmap? = runCatching {
    if (f.extension.lowercase() in kg.osmotr.core.Store.VIDEO_EXT) {
        val r = android.media.MediaMetadataRetriever()
        try { r.setDataSource(f.path); return@runCatching r.getFrameAtTime(0)?.let { android.graphics.Bitmap.createScaledBitmap(it, 256, 256 * it.height / it.width, true) }?.asImageBitmap() }
        finally { r.release() }
    }
    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(f.path, o)
    var s = 1
    while (o.outWidth / s > 256 || o.outHeight / s > 256) s *= 2
    BitmapFactory.decodeFile(f.path, BitmapFactory.Options().apply { inSampleSize = s })?.asImageBitmap()
}.getOrNull()
