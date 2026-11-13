@file:androidx.annotation.OptIn(androidx.camera.camera2.interop.ExperimentalCamera2Interop::class)

package kg.osmotr

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.FocusMeteringAction
import androidx.camera.extensions.ExtensionMode
import androidx.camera.extensions.ExtensionsManager
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.content.ContextCompat
import androidx.camera.core.AspectRatio
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.camera2.interop.Camera2CameraControl
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.CaptureRequestOptions
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraMetadata
import android.hardware.camera2.CaptureRequest
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import kg.osmotr.core.Kadr
import kg.osmotr.core.Telemetry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import java.util.concurrent.Executors

/**
 * Камера приложения — не экрана (автор, 19.10.2026: «не даёт выйти и делать другие фото, пока идёт
 * обработка текущих. Пусть всё дообрабатывается в фоне… чтобы не было конфликтов, если 3–4
 * параллельные очереди»).
 *
 * **Снимок — в момент нажатия** (автор, 19.10.2026: «фотает с задержкой… человек зафотает 20 фото за
 * раз, а потом в карман оно дальше по очереди будет фотать»): съёмка без задержки затвора (ZSL —
 * кадр берётся из последних в памяти, как в штатной камере), где телефон её даёт, иначе — наименьшая
 * задержка. Режимы «максимальное качество» и обработки производителя (HDR / ночь) собирали снимок из
 * нескольких кадров и брали следующий только после этого — нажатия копились; от них отказались.
 * Нажатие, пока камера не взяла прошлый кадр, не копится ([Shot.BUSY]).
 *
 * Камерой владеет этот объект со своим жизненным циклом: «Готово» закрывает экран сразу, снятое
 * дописывается, камера закрывается, когда лёг последний кадр. Экран, открытый снова, берёт ту же
 * камеру. Каждый кадр несёт своё место ([Kadr.Slot]) — заходы и папки не путаются; имена держит
 * Store на всё приложение.
 *
 * Потоки: CameraX пишет кадры на [writer] (два потока); проверка и регистрация — на [processing]
 * (две очереди); всё, что трогает CameraX и жизненный цикл, — на главном.
 */
object CameraWork : LifecycleOwner {
    private val main = Handler(Looper.getMainLooper())
    private val registry by lazy { LifecycleRegistry(this).also { it.currentState = Lifecycle.State.RESUMED } }
    override val lifecycle: Lifecycle get() = registry

    private val writer = Executors.newFixedThreadPool(2)
    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    private val processing = CoroutineScope(SupervisorJob() + Dispatchers.IO.limitedParallelism(2))

    /** Снято, но ещё не легло в папку — по всему приложению. */
    private val _inFlight = MutableStateFlow(0)
    val inFlight = _inFlight.asStateFlow()

    /** Кадр лёг (файл) или нет (причина) — экранам съёмки, если открыты. */
    class Landed(val dir: String, val file: File?, val error: String?)
    private val _landed = MutableSharedFlow<Landed>(extraBufferCapacity = 64)
    val landed = _landed.asSharedFlow()

    private var provider: ProcessCameraProvider? = null
    private var capture: ImageCapture? = null
    private var preview: Preview? = null
    var camera: Camera? = null
        private set
    /** Сколько экранов съёмки сейчас открыто (видно человеку). */
    private var screens = 0
    /** Съёмка без задержки затвора на этом телефоне. */
    var zsl = false
        private set

    /** Формат кадра: снимок и видоискатель — одного соотношения сторон (что видно, то и снято). */
    enum class Aspect(val label: String, val ratio: Int, val portrait: Float) {
        R4_3("4:3", AspectRatio.RATIO_4_3, 3f / 4f), R16_9("16:9", AspectRatio.RATIO_16_9, 9f / 16f)
    }

    enum class Mode { PHOTO, VIDEO }

    /** Обработка производителя: «HDR» и «Ночь» — снимают из нескольких кадров, снимок медленнее (по просьбе автора, 20.10.2026). */
    object Ext { const val NONE = ExtensionMode.NONE; const val HDR = ExtensionMode.HDR; const val NIGHT = ExtensionMode.NIGHT }

    /**
     * Что умеет открытая камера — показываем только это (автор, 20.10.2026: «подтягиваем системные
     * настройки камеры. Все»). Зум — от основного объектива (1×).
     */
    data class Caps(
        val zoomMin: Float, val zoomMax: Float, val stops: List<Float>,
        val ev: IntRange?, val evStep: Float,
        val shutter: List<Long>, val iso: List<Int>,
        val minFocus: Float, val flash: Boolean, val extensions: List<Int>,
    )
    private val _caps = MutableStateFlow<Caps?>(null)
    val caps = _caps.asStateFlow()

    // Что человек выбрал; применяется при attach / reconfigure.
    var aspect = Aspect.R4_3
    var mode = Mode.PHOTO
    var ext = Ext.NONE
    /**
     * «Ярче в темноте»: нижняя граница частоты кадров ниже — автоэкспозиция держит выдержку дольше.
     * Цена — кадр медленнее (эмулятор: 790 мс против 300), поэтому по умолчанию выключено.
     */
    var lowLight = false

    private data class Key(val aspect: Aspect, val mode: Mode, val ext: Int, val lowLight: Boolean, val lens: Float)
    private var bound: Key? = null
    private fun want(zoom: Float): Key =
        Key(aspect, mode, if (mode == Mode.PHOTO) ext else Ext.NONE, lowLight,
            if (lenses.isEmpty()) 1f else CameraMath.pickLens(zoom, listOf(1f) + lenses.map { it.first }))

    /** Увеличение объектива, на котором открыта камера (1 — основной). */
    private var lens = 1f
    /** Отдельные задние камеры со своим увеличением (0.6, 3…) — где телефон не сводит их в одну. */
    private var lenses: List<Pair<Float, androidx.camera.core.CameraInfo>> = emptyList()
    /** Основная задняя камера — с самым широким зумом (CameraMath.pickBase); null — по умолчанию. */
    private var baseInfo: androidx.camera.core.CameraInfo? = null
    private var extensions: ExtensionsManager? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private lateinit var appContext: Context
    private var recording: Recording? = null
    /** Идёт запись видео: сколько миллисекунд записано; −1 — не пишется. */
    private val _recordedMs = MutableStateFlow(-1L)
    val recordedMs = _recordedMs.asStateFlow()

    /** Экран съёмки на виду: камера — открыть или взять уже открытую; изображение — на [surface]. */
    suspend fun attach(context: Context, surface: Preview.SurfaceProvider, flashMode: Int, rotation: Int, zoom: Float = 1f): Boolean {
        check(Looper.myLooper() == Looper.getMainLooper())
        screens++
        appContext = context.applicationContext
        val p = provider ?: kotlinx.coroutines.withContext(Dispatchers.IO) { ProcessCameraProvider.getInstance(context.applicationContext).get() }.also { provider = it }
        if (baseInfo == null) baseInfo = pickBase(p)
        if (lenses.isEmpty()) lenses = separateLenses(p)
        if (extensions == null) extensions = runCatching {
            kotlinx.coroutines.withContext(Dispatchers.IO) { ExtensionsManager.getInstanceAsync(context.applicationContext, p).get() }
        }.getOrNull()
        val k = want(zoom)
        if (bound == k && (capture != null || videoCapture != null)) {
            // Камера ещё открыта (дописываются прежние кадры) — только вернуть изображение.
            preview?.let { p.unbind(it) }
            val pv = preview(p, surface)
            preview = pv
            camera = p.bindToLifecycle(this, selector(p, k), *useCases(pv))
            capture?.let { it.flashMode = flashMode; it.targetRotation = rotation }
            return true
        }
        bind(p, surface, flashMode, rotation, k)
        setZoom(zoom)
        return true
    }

    /**
     * Сменить формат, режим, обработку или объектив на ходу. Пока камера не отдала кадр или идёт
     * запись — нельзя (оборвалось бы): false, экран держит переключатели приглушёнными.
     */
    fun reconfigure(surface: Preview.SurfaceProvider, flashMode: Int, rotation: Int, zoom: Float): Boolean {
        check(Looper.myLooper() == Looper.getMainLooper())
        val p = provider ?: return false
        if (bound == null || !_ready.value || recording != null) return false
        val k = want(zoom)
        if (k != bound) bind(p, surface, flashMode, rotation, k)
        setZoom(zoom)
        return true
    }

    private fun useCases(pv: Preview): Array<androidx.camera.core.UseCase> =
        if (mode == Mode.VIDEO) arrayOf(pv, videoCapture!!) else arrayOf(pv, capture!!)

    private fun selector(p: ProcessCameraProvider, k: Key): CameraSelector {
        val base = if (k.lens == 1f) (baseInfo?.cameraSelector ?: CameraSelector.DEFAULT_BACK_CAMERA) else lenses.first { it.first == k.lens }.second.cameraSelector
        val m = extensions
        return if (k.ext != Ext.NONE && m != null && m.isExtensionAvailable(base, k.ext)) m.getExtensionEnabledCameraSelector(base, k.ext) else base
    }

    private fun zoomFloor(info: androidx.camera.core.CameraInfo): Float = runCatching {
        Camera2CameraInfo.from(info).getCameraCharacteristic(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE)?.lower
    }.getOrNull() ?: 1f

    private fun pixels(info: androidx.camera.core.CameraInfo): Long = runCatching {
        Camera2CameraInfo.from(info).getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE)?.let { it.width.toLong() * it.height }
    }.getOrNull() ?: 0L

    /**
     * Камеры, которых нет в списке для приложений, но которые телефон, может быть, откроет по номеру
     * (Xiaomi прячет ультраширик). Только смотрим и пишем в журнал — что есть, какой фокус и матрица.
     */
    private fun probeHidden() = runCatching {
        val cm = appContext.getSystemService(android.hardware.camera2.CameraManager::class.java)
        val listed = cm.cameraIdList.toSet()
        val out = (0..9).map(Int::toString).filter { it !in listed }.mapNotNull { id ->
            runCatching {
                val c = cm.getCameraCharacteristics(id)
                val face = if (c.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK) "задн" else "др"
                val f = c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.firstOrNull()
                val w = c.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE)?.width
                "$id:$face f=$f w=$w"
            }.getOrNull()
        }
        val msg = "в списке ${listed.joinToString(",")}; скрытые по номеру: " + out.joinToString("; ").ifEmpty { "нет" }
        android.util.Log.i("osmotr-camera", msg)
        Telemetry.event("камера: скрытые", msg)
    }

    private fun pickBase(p: ProcessCameraProvider): androidx.camera.core.CameraInfo? {
        val backs = p.availableCameraInfos.filter { it.lensFacing == CameraSelector.LENS_FACING_BACK }
        val def = runCatching { p.getCameraInfo(CameraSelector.DEFAULT_BACK_CAMERA) }.getOrNull()
        val i = CameraMath.pickBase(backs.mapIndexed { n, c -> n to zoomFloor(c) }, backs.indexOf(def).coerceAtLeast(0))
        val chosen = backs.getOrNull(i) ?: def
        probeHidden()
        Telemetry.event("камера", "задних камер ${backs.size}, нижние границы зума " + backs.joinToString(" ") { CameraMath.zoomLabel(zoomFloor(it)) } +
            ", основная — " + (if (chosen == def) "по умолчанию" else "сведённая, от ${CameraMath.zoomLabel(zoomFloor(chosen!!))}×"))
        return chosen
    }

    /** Задние камеры, которые телефон не сводит в одну (у сведённой 0.6 и телевик — внутри её зума). */
    private fun separateLenses(p: ProcessCameraProvider): List<Pair<Float, androidx.camera.core.CameraInfo>> {
        val main = baseInfo ?: runCatching { p.getCameraInfo(CameraSelector.DEFAULT_BACK_CAMERA) }.getOrNull() ?: return emptyList()
        val floor = zoomFloor(main)
        val def = runCatching { p.getCameraInfo(CameraSelector.DEFAULT_BACK_CAMERA) }.getOrNull()
        return p.availableCameraInfos.asSequence()
            .filter { it.lensFacing == CameraSelector.LENS_FACING_BACK && it != main && it != def }
            // Ширик уже внутри зума сведённой камеры — отдельной камерой его не открывать.
            .filter { floor >= 0.95f || it.intrinsicZoomRatio >= 1f }
            .filter { CameraMath.usefulLens(it.intrinsicZoomRatio, pixels(it), pixels(main)) }
            .map { it.intrinsicZoomRatio to it }
            .filter { (z, _) -> z != androidx.camera.core.CameraInfo.INTRINSIC_ZOOM_RATIO_UNKNOWN && kotlin.math.abs(z - 1f) > 0.05f }
            .distinctBy { (z, _) -> (z * 10).toInt() }
            .sortedBy { it.first }.toList()
    }

    private fun preview(p: ProcessCameraProvider, surface: Preview.SurfaceProvider): Preview {
        val info = runCatching { p.getCameraInfo(selector(p, bound ?: want(1f))) }.getOrNull()
        val fps = if (!lowLight) null else info?.supportedFrameRateRanges?.map { it.lower to it.upper }?.let(CameraMath::lowLightFps)
        return Preview.Builder().setResolutionSelector(ratio(aspect))
            .apply { fps?.let { setTargetFrameRate(android.util.Range(it.first, it.second)) } }
            .build().also { it.surfaceProvider = surface }
    }

    private fun ratio(aspect: Aspect) = ResolutionSelector.Builder()
        .setAspectRatioStrategy(AspectRatioStrategy(aspect.ratio, AspectRatioStrategy.FALLBACK_RULE_AUTO)).build()

    @androidx.annotation.OptIn(androidx.camera.core.ExperimentalZeroShutterLag::class)
    private fun bind(p: ProcessCameraProvider, surface: Preview.SurfaceProvider, flashMode: Int, rotation: Int, k: Key) {
        lens = k.lens
        val sel = selector(p, k)
        val info = p.getCameraInfo(sel)
        zsl = k.ext == Ext.NONE && runCatching { info.isZslSupported }.getOrDefault(false)
        p.unbindAll()
        bound = k
        if (k.mode == Mode.VIDEO) {
            capture = null
            videoCapture = VideoCapture.withOutput(Recorder.Builder()
                .setQualitySelector(QualitySelector.from(Quality.FHD, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD))).build())
        } else {
            videoCapture = null
            capture = ImageCapture.Builder()
                .setCaptureMode(if (zsl) ImageCapture.CAPTURE_MODE_ZERO_SHUTTER_LAG else ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                .setResolutionSelector(ratio(aspect))
                .setFlashMode(flashMode)
                .setJpegQuality(95)
                .setTargetRotation(rotation)
                .build()
        }
        val pv = preview(p, surface)
        preview = pv
        camera = p.bindToLifecycle(this, sel, *useCases(pv))
        manual = Manual()
        _caps.value = capsOf(camera!!)
        Telemetry.event("камера", k.mode.name.lowercase() + ", " + (if (zsl) "ZSL" else "наименьшая задержка") +
            ", ${aspect.label}, ${CameraMath.zoomLabel(lens)}×" + (if (k.ext != Ext.NONE) ", обработка производителя" else "") + (if (lowLight) ", ярче в темноте" else ""))
    }

    /**
     * Касание — фокус и замер в точке (AF + AE + баланс белого); [lock] — долгое касание держит их,
     * пока не коснутся снова. [done] — получилось ли (рамка на экране меняет цвет).
     */
    fun focusAt(point: androidx.camera.core.MeteringPoint, lock: Boolean, done: (Boolean) -> Unit) {
        val c = camera ?: return done(false)
        val action = FocusMeteringAction.Builder(point,
            FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE or FocusMeteringAction.FLAG_AWB)
            .apply { if (lock) disableAutoCancel() else setAutoCancelDuration(5, java.util.concurrent.TimeUnit.SECONDS) }
            .build()
        if (!c.cameraInfo.isFocusMeteringSupported(action)) return done(false)
        // Ручной фокус отменяется касанием: возвращаем автофокус.
        if (manual.focusDiopters != null) setManual(manual.copy(focusDiopters = null))
        val f = c.cameraControl.startFocusAndMetering(action)
        f.addListener({ done(runCatching { f.get().isFocusSuccessful }.getOrDefault(false)) }, ContextCompat.getMainExecutor(appContext))
    }

    private fun capsOf(c: androidx.camera.core.Camera): Caps {
        val info = c.cameraInfo
        val ch = runCatching { Camera2CameraInfo.from(info) }.getOrNull()
        fun <T> char(k: CameraCharacteristics.Key<T>): T? = runCatching { ch?.getCameraCharacteristic(k) }.getOrNull()
        val zs = info.zoomState.value
        val camMin = zs?.minZoomRatio ?: 1f; val camMax = zs?.maxZoomRatio ?: 1f
        // Зум всей камеры — от основного объектива: сведённая — свой диапазон; отдельные — от самого широкого до предела самого длинного.
        val min = if (lenses.isEmpty()) camMin else minOf(lenses.first().first, 1f)
        val max = if (lenses.isEmpty()) camMax else maxOf(camMax * lens, (lenses.last().first) * 2f)
        val optical = if (lenses.isEmpty()) runCatching { info.physicalCameraInfos.map { it.intrinsicZoomRatio } }.getOrDefault(emptySet())
            .filter { it != androidx.camera.core.CameraInfo.INTRINSIC_ZOOM_RATIO_UNKNOWN }
        else lenses.map { it.first }
        val ex = info.exposureState
        val manualSensor = char(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES)?.contains(CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR) == true
        val time = char(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE)
        val iso = char(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE)
        val minFocus = char(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE) ?: 0f
        return Caps(
            zoomMin = min, zoomMax = max, stops = CameraMath.zoomStops(min, max, optical),
            ev = if (ex.isExposureCompensationSupported) ex.exposureCompensationRange.lower..ex.exposureCompensationRange.upper else null,
            evStep = ex.exposureCompensationStep.toFloat(),
            shutter = if (manualSensor && time != null) CameraMath.shutterSteps(time.lower, time.upper) else emptyList(),
            iso = if (manualSensor && iso != null) CameraMath.isoSteps(iso.lower, iso.upper) else emptyList(),
            minFocus = if (manualSensor) minFocus else 0f,
            flash = info.hasFlashUnit(),
            extensions = runCatching {
                val base = selector(provider!!, bound!!.copy(ext = Ext.NONE))
                listOf(Ext.HDR, Ext.NIGHT).filter { e -> extensions?.isExtensionAvailable(base, e) == true }
            }.getOrDefault(emptyList()),
        )
    }

    /** Зум от основного объектива (0.6, 1, 3…): на отдельной камере — её собственный, в её пределах. */
    fun setZoom(global: Float) {
        val c = camera ?: return
        val zs = c.cameraInfo.zoomState.value ?: return
        c.cameraControl.setZoomRatio((global / lens).coerceIn(zs.minZoomRatio, zs.maxZoomRatio))
    }

    /** Нынешний зум от основного объектива. */
    fun zoom(): Float = (camera?.cameraInfo?.zoomState?.value?.zoomRatio ?: 1f) * lens

    /** Ручная выдержка, ISO и фокус: null — автоматически. */
    data class Manual(val exposureNs: Long? = null, val iso: Int? = null, val focusDiopters: Float? = null)
    var manual = Manual()
        private set

    fun setManual(m: Manual) {
        manual = m
        val c = camera ?: return
        val o = CaptureRequestOptions.Builder()
        if (m.exposureNs != null && m.iso != null) {
            o.setCaptureRequestOption(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_OFF)
            o.setCaptureRequestOption(CaptureRequest.SENSOR_EXPOSURE_TIME, m.exposureNs)
            o.setCaptureRequestOption(CaptureRequest.SENSOR_SENSITIVITY, m.iso)
            o.setCaptureRequestOption(CaptureRequest.SENSOR_FRAME_DURATION, maxOf(m.exposureNs, 33_333_333L))
        }
        if (m.focusDiopters != null) {
            o.setCaptureRequestOption(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_OFF)
            o.setCaptureRequestOption(CaptureRequest.LENS_FOCUS_DISTANCE, m.focusDiopters)
        }
        runCatching { Camera2CameraControl.from(c.cameraControl).setCaptureRequestOptions(o.build()) }  // заменяет все прежние — пустой набор возвращает автомат
            .onFailure { Telemetry.error("камера: ручные настройки", it) }
    }

    fun setExposureIndex(i: Int) { camera?.cameraControl?.setExposureCompensationIndex(i) }

    /** Экран съёмки ушёл (Готово, назад, «Домой»): изображение — прочь; камера — когда допишется всё. */
    fun detach() {
        check(Looper.myLooper() == Looper.getMainLooper())
        screens = (screens - 1).coerceAtLeast(0)
        if (screens == 0) {
            preview?.let { provider?.unbind(it) }
            preview = null
            closeIfIdle()
        }
    }

    private fun closeIfIdle() {
        if (screens == 0 && _inFlight.value == 0) {
            provider?.unbindAll()
            capture = null; videoCapture = null; bound = null; camera = null; _ready.value = true; _caps.value = null
        }
    }

    /** Нажатие: снято; камера ещё не отдала прошлый кадр (нажатие не копится); камера не готова. */
    enum class Shot { TAKEN, BUSY, NOT_READY }

    /**
     * Камера готова взять кадр. CameraX снимает строго по одному: следующий запрос уходит, только
     * когда прошлый кадр отдан целиком, — нажатия, пришедшие раньше, встали бы в очередь и сняли бы
     * уже карман. Поэтому, пока кадр не отдан, нажатие не принимается (как кнопка штатной камеры —
     * у Apple то же правило: AVCapturePhotoOutputReadinessCoordinator).
     */
    private val _ready = MutableStateFlow(true)
    val ready = _ready.asStateFlow()

    /** Снять кадр в [kadr]: кадр — в момент нажатия; файл, поворот и регистрация — в фоне. */
    fun shoot(context: Context, kadr: Kadr): Shot {
        check(Looper.myLooper() == Looper.getMainLooper())
        val ic = capture ?: return Shot.NOT_READY
        if (!_ready.value) return Shot.BUSY
        _ready.value = false
        val slot = kadr.reserve()
        _inFlight.value++
        val t0 = System.nanoTime()
        android.util.Log.i("osmotr-camera", "нажатие")
        val app = context.applicationContext
        // Кадр — в память и сразу назад камере (конвейер свободен для следующего снимка); запись на
        // диск, поворот и регистрация — в фоне, не задерживая съёмку.
        ic.takePicture(writer, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureStarted() {
                android.util.Log.i("osmotr-camera", "старт ${(System.nanoTime() - t0) / 1_000_000} мс")
            }
            override fun onCaptureSuccess(image: androidx.camera.core.ImageProxy) {
                val t1 = System.nanoTime()
                val bytes: ByteArray
                val rotation: Int
                try {
                    val buf = image.planes[0].buffer
                    bytes = ByteArray(buf.remaining()).also { buf.get(it) }
                    rotation = image.imageInfo.rotationDegrees
                } finally {
                    image.close()
                }
                main.post { _ready.value = true }
                android.util.Log.i("osmotr-camera", "кадр отдан ${(t1 - t0) / 1_000_000} мс")
                processing.launch {
                    val res = runCatching {
                        java.io.File(slot.tmp.path).writeBytes(bytes)
                        orient(java.io.File(slot.tmp.path), rotation)
                    }.fold({ kadr.finish(slot) }, { kadr.abort(slot); Result.failure(it) })
                    val t2 = System.nanoTime()
                    Telemetry.event("камера: кадр", "снят за ${(t1 - t0) / 1_000_000} мс, в папку ${(t2 - t1) / 1_000_000} мс" +
                        (if (zsl) ", ZSL" else "") + (res.exceptionOrNull()?.let { " — не лёг: ${it.message}" } ?: ""))
                    done(app, slot.target.parentFile!!.path, res.getOrNull()?.let { File(it.path) }, res.exceptionOrNull()?.message)
                }
            }
            override fun onError(e: ImageCaptureException) {
                main.post { _ready.value = true }
                kadr.abort(slot)
                Telemetry.error("камера: снимок", e)
                done(app, slot.target.parentFile!!.path, null, e.message ?: "ошибка камеры")
            }
        })
        return Shot.TAKEN
    }

    /** Поворот кадра — в EXIF (кадр из памяти не повёрнут; галерея и отчёты читают ориентацию). */
    private fun orient(f: java.io.File, degrees: Int) {
        val o = when (degrees) {
            90 -> androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_90
            180 -> androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_180
            270 -> androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_270
            else -> androidx.exifinterface.media.ExifInterface.ORIENTATION_NORMAL
        }
        val exif = androidx.exifinterface.media.ExifInterface(f)
        exif.setAttribute(androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION, o.toString())
        exif.saveAttributes()
    }

    private fun done(app: Context, dir: String, file: File?, error: String?) = main.post {
        _inFlight.value--
        _landed.tryEmit(Landed(dir, file, error))
        // Экрана съёмки уже нет — о потере кадра сказать всё равно.
        if (error != null && screens == 0) Toast.makeText(app, "Кадр не сохранился: $error", Toast.LENGTH_LONG).show()
        closeIfIdle()
    }


    /**
     * Запись видео в папку [dir] (автор, 20.10.2026: «видео — как фото, счёт отдельно»): пишется во
     * временный `.имя.rec`, лёг целиком — получает своё имя (общий резерв, как у снимков) и регистрируется.
     * «Готово» запись останавливает, дописывается в фоне, как кадры.
     */
    fun startVideo(dir: kg.osmotr.core.File): Boolean {
        check(Looper.myLooper() == Looper.getMainLooper())
        val vc = videoCapture ?: return false
        if (recording != null) return false
        val target = kg.osmotr.core.Store.newPhotoFile(dir, "mp4")
        val tmp = File(target.parentFile!!.path, "." + target.name + ".rec")
        val audio = androidx.core.content.ContextCompat.checkSelfPermission(appContext, android.Manifest.permission.RECORD_AUDIO) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
        _inFlight.value++
        val pending = vc.output.prepareRecording(appContext, androidx.camera.video.FileOutputOptions.Builder(tmp).build())
            .let { if (audio) it.withAudioEnabled() else it }
        recording = pending.start(ContextCompat.getMainExecutor(appContext)) { e ->
            when (e) {
                is VideoRecordEvent.Status -> _recordedMs.value = e.recordingStats.recordedDurationNanos / 1_000_000
                is VideoRecordEvent.Finalize -> {
                    recording = null; _recordedMs.value = -1
                    val ok = !e.hasError() && tmp.length() > 0 && tmp.renameTo(File(target.path))
                    if (!ok) { tmp.delete(); Telemetry.event("камера: видео", "не легло, код ${e.error}") }
                    kg.osmotr.core.Store.releasePhotoName(target)
                    if (ok) processing.launch { kg.osmotr.core.Store.videoSaved(target) }
                    done(appContext, dir.path, if (ok) File(target.path) else null, if (ok) null else "видео не записалось")
                }
            }
        }
        _recordedMs.value = 0
        return true
    }

    fun stopVideo() { recording?.stop() }

    fun setFlash(mode: Int) { capture?.flashMode = mode; camera?.takeIf { mode != ImageCapture.FLASH_MODE_OFF || it.cameraInfo.hasFlashUnit() }?.let { if (this.mode == Mode.VIDEO) it.cameraControl.enableTorch(mode == ImageCapture.FLASH_MODE_ON) } }
    fun setRotation(r: Int) { capture?.targetRotation = r }
}
