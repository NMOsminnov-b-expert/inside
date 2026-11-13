package kg.osmotr.ui

import androidx.compose.animation.core.AnimationState
import androidx.compose.animation.core.animateDecay
import androidx.compose.animation.core.animateTo
import androidx.compose.animation.core.exponentialDecay
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kg.osmotr.core.Background
import kg.osmotr.core.File
import kg.osmotr.core.PdfLayout
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.roundToInt

/** Где остановились в каждом PDF: вышел посмотреть другое, вернулся — на той же странице и увеличении. */
private object PdfPlaces { val at = HashMap<String, Triple<Float, Float, Float>>() }

/**
 * Поворот страниц скана четвертями по часовой — запоминается рядом с файлом скрытым `.имя.поворот` (сам PDF не меняется:
 * он документ, а не наша копия). Строка: «страница:четверти» через запятую.
 */
private object PdfTurns {
    private fun mark(f: File) = File(f.parentFile!!, ".${f.name}.поворот")
    fun load(f: File): Map<Int, Int> = runCatching {
        mark(f).takeIf { it.isFile }?.readText().orEmpty().split(',').filter { ':' in it }.associate { it.substringBefore(':').toInt() to it.substringAfter(':').toInt() }
    }.getOrDefault(emptyMap())
    fun save(f: File, turns: Map<Int, Int>) = runCatching { mark(f).writeText(turns.entries.joinToString(",") { "${it.key}:${it.value}" }) }
}

/**
 * Просмотр PDF (автор, 29.10.2026: «Обязателен просмотр подгружаемых пдф документов»; 30.10.2026 — «Нужно
 * доработать просмотр pdf»). Страницы лентой по ширине экрана; увеличение пальцами и двойным касанием —
 * мелкий текст техпаспорта читается: после остановки видимая часть перерисовывается в полном разрешении.
 * Номер страницы внизу — касанием переход к любой. Пароль, повреждённый файл, платформа без своей
 * отрисовки — так и сказано, и есть «Открыть в другом приложении».
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PdfScreen(file: File, title: String? = null, back: () -> Unit) {
    val host = LocalHost.current
    val opened by produceState<PdfOpen?>(null, file) { value = withContext(Background) { host.pdfOpen(file) } }
    DisposableEffect(file) { onDispose { host.pdfClose(file) } }
    val external = { host.openExternal(file, "application/pdf") }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title ?: file.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } },
                actions = {
                    IconButton(onClick = external) { Icon(AppIcons.OpenInNew, "Открыть в другом приложении") }
                    IconButton(onClick = { host.share(listOf(file), "application/pdf") }) { Icon(Icons.Default.Share, "Отправить") }
                },
            )
        },
    ) { inner ->
        Box(Modifier.fillMaxSize().padding(inner).background(MaterialTheme.colorScheme.surfaceVariant)) {
            when (val o = opened) {
                null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                is PdfOpen.Pages -> PdfView(file, o.sizes)
                PdfOpen.Locked -> PdfProblem("PDF защищён паролем", "Здесь его не открыть — откройте в другом приложении, оно спросит пароль.", external)
                PdfOpen.Broken -> PdfProblem("PDF не открывается", "Файл повреждён или это не PDF. Можно попробовать другим приложением.", external)
                PdfOpen.Unsupported -> PdfProblem("PDF откроется в другом приложении", "На этом устройстве «Осмотр» не показывает PDF сам.", external)
            }
        }
    }
}

@Composable
private fun PdfProblem(head: String, text: String, external: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp).testTag("pdf не показан"), verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(AppIcons.PictureAsPdf, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(head, Modifier.padding(top = 12.dp), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Text(text, Modifier.padding(top = 6.dp, bottom = 16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        Button(onClick = external) { Text("Открыть в другом приложении") }
    }
}

/** Отрисованное: целая страница по ширине экрана (основа) и чёткий кусок видимого при увеличении. */
private class Sharp(val image: ImageBitmap, val zoom: Float, val x: Float, val y: Float, val at: Offset)

@Composable
private fun PdfView(file: File, sizes0: List<Pair<Float, Float>>) {
    val host = LocalHost.current
    var turns by remember(file) { mutableStateOf(PdfTurns.load(file)) }
    // Страница на боку — её размеры меняются местами: лента строится по повёрнутым.
    val sizes = remember(sizes0, turns) { sizes0.mapIndexed { i, s -> if ((turns[i] ?: 0) % 2 == 1) s.second to s.first else s } }
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val gapPx = with(density) { 8.dp.toPx() }
    val slop = LocalViewConfiguration.current.touchSlop
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val w = constraints.maxWidth.toFloat(); val h = constraints.maxHeight.toFloat()
        // Новая ширина (поворот) — новая лента, на прежнем месте в долях.
        // Лента — по ширине: высота экрана меняется (окно, клавиатура) без пересборки и без перерисовки страниц.
        val layout = remember(sizes, w) {
            PdfLayout(sizes, w, h, gapPx).also { l -> PdfPlaces.at[file.path]?.let(l::restore) }
        }
        if (layout.viewH != h) layout.viewH = h
        var keepOn by remember { mutableStateOf<Int?>(null) }
        // Повёрнутая страница стала низкой, и середина экрана — уже на следующей: пока не листали, текущая — повёрнутая.
        var turned by remember { mutableStateOf<Int?>(null) }
        var tick by remember { mutableIntStateOf(0) }
        fun changed() { tick++; PdfPlaces.at[file.path] = layout.relative() }
        val base = remember(layout) { mutableStateMapOf<Int, ImageBitmap>() }
        val sharp = remember(layout) { mutableStateMapOf<Int, Sharp>() }
        var moving by remember { mutableStateOf(false) }
        var jump by remember { mutableStateOf(false) }

        LaunchedEffect(layout) { keepOn?.let { layout.goTo(it); keepOn = null; changed() } }
        // Основа: видимые страницы и по одной рядом, не больше восьми в памяти.
        val visible = run { tick; layout.visible() }
        val want = (visible.first - 1).coerceAtLeast(0)..(visible.last + 1).coerceAtMost(sizes.lastIndex)
        LaunchedEffect(layout, want) {
            for (p in want) if (p !in base) {
                val img = withContext(Background) {
                    host.pdfRender(file, p, layout.scaleOf(p) / layout.zoom, 0, 0, w.toInt(), ceil(layout.heights[p]).toInt(), turns[p] ?: 0)
                }
                if (img != null) base[p] = img
            }
            base.keys.filter { it !in want && abs(it - visible.first) > 3 }.forEach { base.remove(it) }
        }
        // Чётко: увеличили и отпустили — видимая часть каждой страницы в полном разрешении.
        LaunchedEffect(layout, tick, moving) {
            if (moving || layout.zoom < 1.1f) { if (layout.zoom < 1.1f) sharp.clear(); return@LaunchedEffect }
            delay(150)
            val z = layout.zoom; val lx = layout.x; val ly = layout.y
            for (p in layout.visible()) {
                val part = layout.visiblePart(p) ?: continue
                val img = withContext(Background) {
                    host.pdfRender(file, p, layout.scaleOf(p), part.x.toInt(), part.y.toInt(), ceil(part.w).toInt(), ceil(part.h).toInt(), turns[p] ?: 0)
                } ?: continue
                sharp[p] = Sharp(img, z, lx, ly, Offset(part.screenX, part.screenY))
            }
            // Ушедшие с экрана — прочь: кусок размером с экран, и по длинному документу их набирались сотни мегабайт.
            val shown = layout.visible()
            sharp.keys.filter { it !in shown }.forEach { sharp.remove(it) }
        }

        var fling: Job? by remember { mutableStateOf(null) }
        val gestures = Modifier
            .pointerInput(layout) {
                detectTapGestures(onDoubleTap = { at ->
                    // Двойное касание: увеличить в этой точке, ещё раз — обратно по ширине.
                    fling?.cancel()
                    val from = layout.zoom; val to = if (from > 1.5f) 1f else 2.5f
                    fling = scope.launch {
                        moving = true
                        AnimationState(from).animateTo(to, tween(220)) { layout.zoomAt(value / layout.zoom, at.x, at.y); changed() }
                        moving = false
                    }
                })
            }
            .pointerInput(layout) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    fling?.cancel()
                    val tracker = VelocityTracker().apply { addPosition(down.uptimeMillis, down.position) }
                    var past = false; var drag = Offset.Zero; var scale = 1f
                    do {
                        val e = awaitPointerEvent()
                        val zoom = e.calculateZoom(); val pan = e.calculatePan()
                        if (!past) {
                            drag += pan; scale *= zoom
                            past = drag.getDistance() > slop || abs(1f - scale) > 0.02f
                            if (past) { moving = true; turned = null }
                        }
                        if (past) {
                            val c = e.calculateCentroid(useCurrent = true)
                            if (zoom != 1f && c != Offset.Unspecified) layout.zoomAt(zoom, c.x, c.y)
                            layout.panBy(pan.x, pan.y)
                            changed()
                            e.changes.forEach { if (it.positionChanged()) it.consume() }
                        }
                        e.changes.firstOrNull()?.let { tracker.addPosition(it.uptimeMillis, it.position) }
                    } while (e.changes.any { it.pressed })
                    if (!past) return@awaitEachGesture
                    val v = tracker.calculateVelocity()
                    // Инерция: лента едет дальше и плавно встаёт.
                    fling = scope.launch {
                        var lastX = 0f; var lastY = 0f
                        val vx = v.x; val vy = v.y
                        if (abs(vx) + abs(vy) > 300f) launch {
                            AnimationState(0f, vx).animateDecay(exponentialDecay()) { layout.panBy(value - lastX, 0f); lastX = value; changed() }
                        }
                        if (abs(vy) > 300f) AnimationState(0f, vy).animateDecay(exponentialDecay()) { layout.panBy(0f, value - lastY); lastY = value; changed() }
                        moving = false
                    }
                }
            }

        val current = run { tick; turned ?: layout.current() }
        Canvas(Modifier.fillMaxSize().testTag("страницы pdf").then(gestures)
            .semantics { contentDescription = "Страница ${current + 1} из ${sizes.size}" }) {
            tick
            for (p in layout.visible()) {
                val r = layout.screenRect(p)
                val dst = IntOffset(r[0].toInt(), r[1].toInt()); val dsize = IntSize((r[2] - r[0]).toInt(), (r[3] - r[1]).toInt())
                drawRect(Color.White, Offset(r[0], r[1]), Size(r[2] - r[0], r[3] - r[1]))
                base[p]?.let { img -> drawImage(img, IntOffset.Zero, IntSize(img.width, img.height), dst, dsize, filterQuality = FilterQuality.Medium) }
                sharp[p]?.takeIf { it.zoom == layout.zoom && it.x == layout.x && it.y == layout.y }?.let { s ->
                    drawImage(s.image, IntOffset(s.at.x.toInt(), s.at.y.toInt()))
                }
            }
        }
        if (base.isEmpty()) CircularProgressIndicator(Modifier.align(Alignment.Center))

        // Номер страницы; касание — перейти к любой.
        // Над плашкой внизу («Осмотрено ранее…», «+2 снимка»): лёжа она слева у низа и закрывала номер целиком.
        val lift = bannerLift()
        Surface(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 16.dp + lift).testTag("номер страницы")
            .clickable { jump = !jump }, shape = RoundedCornerShape(50), color = Color.Black.copy(alpha = 0.6f)) {
            Text("${current + 1} / ${sizes.size}", Modifier.padding(horizontal = 14.dp, vertical = 6.dp), color = Color.White,
                style = MaterialTheme.typography.labelLarge)
        }
        // Переход: панель внизу с ползунком по страницам — без окна и клавиатуры, номер виден сразу.
        if (jump) PageBar(file, turns, current, sizes.size, Modifier.align(Alignment.BottomCenter).padding(bottom = lift),
            go = { n -> fling?.cancel(); turned = null; layout.goTo(n); changed() }, close = { jump = false })
        // Повернуть текущую страницу — скан часто лежит на боку.
        Surface(Modifier.align(Alignment.TopEnd).padding(8.dp), shape = RoundedCornerShape(50), color = Color.Black.copy(alpha = 0.6f)) {
            IconButton(onClick = {
                val p = turned ?: layout.current()
                turns = turns + (p to (((turns[p] ?: 0) + 1) % 4))
                PdfTurns.save(file, turns)
                keepOn = p   // лента перестроится: остаться на этой странице, а не там, куда сдвинулись доли
                turned = p
            }, Modifier.testTag("повернуть страницу")) { Icon(AppIcons.RotateRight, "Повернуть страницу", tint = Color.White) }
        }
    }
}

@Composable
private fun PageBar(file: File, turns: Map<Int, Int>, current: Int, total: Int, modifier: Modifier, go: (Int) -> Unit, close: () -> Unit) {
    var page by remember { mutableStateOf(current.toFloat()) }
    val last = (total - 1).coerceAtLeast(0).toFloat()
    Surface(modifier.fillMaxWidth().navigationBarsPadding().testTag("переход по страницам"), tonalElevation = 6.dp, shadowElevation = 6.dp) {
        Column(Modifier.padding(16.dp, 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Страница ${page.toInt() + 1} из $total", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                TextButton(onClick = close) { Text("Закрыть") }
            }
            // Миниатюры — переход по многостраничному файлу глазами: найти лист по виду, а не по номеру.
            if (total > 1) androidx.compose.foundation.lazy.LazyRow(Modifier.fillMaxWidth().testTag("миниатюры"),
                state = androidx.compose.foundation.lazy.rememberLazyListState(current.coerceAtLeast(0)),
                horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(total) { n -> PageThumb(file, n, turns[n] ?: 0, n == page.toInt()) { page = n.toFloat(); go(n) } }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { page = (page - 1).coerceAtLeast(0f); go(page.toInt()) }, enabled = page >= 1f) { Icon(AppIcons.Remove, "Предыдущая страница") }
                // Ползунок — сразу листает: ведёшь пальцем и видишь страницы под ним.
                Slider(page, { v -> page = v.roundToInt().toFloat().coerceAtMost(last); go(page.toInt()) }, Modifier.weight(1f).testTag("ползунок страниц"),
                    valueRange = 0f..(total - 1).coerceAtLeast(1).toFloat(), steps = (total - 2).coerceIn(0, 998))
                IconButton(onClick = { page = (page + 1).coerceAtMost(total - 1f); go(page.toInt()) }, enabled = page < total - 1) { Icon(Icons.Default.Add, "Следующая страница") }
            }
        }
    }
}

/** Миниатюра страницы: рисуется, только когда попала на экран. */
@Composable
private fun PageThumb(file: File, n: Int, quarters: Int, current: Boolean, click: () -> Unit) {
    val host = LocalHost.current
    val image by produceState<ImageBitmap?>(null, file.path, n, quarters) {
        value = withContext(Background) { pdfPageThumb(host, file, n, quarters) }
    }
    Box(Modifier.size(56.dp, 76.dp).background(Color.White, RoundedCornerShape(4.dp))
        .then(if (current) Modifier.border(2.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(4.dp)) else Modifier)
        .clickable(onClick = click).testTag("миниатюра ${n + 1}").semantics { contentDescription = "Страница ${n + 1}" }, contentAlignment = Alignment.Center) {
        image?.let { androidx.compose.foundation.Image(it, null, Modifier.fillMaxSize()) } ?: Text("${n + 1}", style = MaterialTheme.typography.labelSmall, color = Color.Gray)
    }
}

private suspend fun pdfPageThumb(host: Host, file: File, n: Int, quarters: Int): ImageBitmap? {
    val o = host.pdfOpen(file) as? PdfOpen.Pages ?: return null
    val (pw, ph) = o.sizes.getOrNull(n) ?: return null
    val (w, h) = if (quarters % 2 == 1) ph to pw else pw to ph
    val scale = 140f / w.coerceAtLeast(1f)
    return host.pdfRender(file, n, scale, 0, 0, 140, ceil(h * scale).toInt(), quarters)
}

/** Первые страницы PDF уменьшенными — для плиток; одна и та же не рисуется дважды. */
private object PdfThumbs {
    private val cache = LinkedHashMap<String, ImageBitmap>()
    fun get(key: String): ImageBitmap? = cache.remove(key)?.also { cache[key] = it }  // свежие — в конец
    fun put(key: String, img: ImageBitmap) { cache[key] = img; while (cache.size > 48) cache.remove(cache.keys.first()) }
}

/** Первая страница PDF шириной [widthPx] (плитка папки, экран разбора). Не PDF или не рисуется — null. */
suspend fun pdfThumb(host: Host, file: File, widthPx: Int): ImageBitmap? {
    val key = "${file.path}|${file.length()}|${file.lastModified()}|$widthPx"
    PdfThumbs.get(key)?.let { return it }
    val o = host.pdfOpen(file) as? PdfOpen.Pages ?: return null
    val (pw, ph) = o.sizes.first()
    val scale = widthPx / pw.coerceAtLeast(1f)
    return host.pdfRender(file, 0, scale, 0, 0, widthPx, ceil(ph * scale).toInt())?.also { PdfThumbs.put(key, it) }
}

/** Насколько поднять то, что стоит у низа экрана по центру, чтобы плашка его не закрыла (и стоя, и лёжа). */
@Composable
private fun bannerLift(): androidx.compose.ui.unit.Dp {
    val shown by LocalBannerShown.current
    val height by LocalBannerHeight.current
    return androidx.compose.animation.core.animateDpAsState(if (shown) height + 12.dp else 0.dp, motion()).value
}
