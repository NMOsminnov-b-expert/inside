@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.ui.ExperimentalComposeUiApi::class)

package kg.osmotr.ui

import kg.osmotr.core.Background
import kg.osmotr.core.File
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kg.osmotr.core.Instructions
import kg.osmotr.core.Store
import kg.osmotr.core.Instructions.Block
import kg.osmotr.core.Telemetry
import kg.osmotr.ui.res.Res

import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okio.Path.Companion.toPath

/**
 * Инструкции из ресурсов приложения. Картинки и PDF при первом открытии ложатся в кэш
 * приложения файлами: так их показывает тот же просмотр с увеличением, что и снимки, и
 * PDF уходит в «Отправить». Файл в кэше другого размера (обновили приложение) — переписывается.
 */
object InstructionLibrary {
    private const val ROOT = "files/instructions"
    private var entries: List<Instructions.Entry>? = null
    private val docs = HashMap<String, Instructions.Doc>()
    private val unpacked = HashSet<String>()
    private val lock = Mutex()

    suspend fun index(): List<Instructions.Entry> = lock.withLock {
        entries ?: Instructions.parseIndex(Res.readBytes("$ROOT/index.json").decodeToString()).also { entries = it }
    }

    suspend fun doc(id: String): Instructions.Doc? {
        val e = index().firstOrNull { it.id == id } ?: return null
        return lock.withLock { docs.getOrPut(id) { Instructions.parseDoc(e, Res.readBytes("$ROOT/$id/doc.json").decodeToString()) } }
    }

    suspend fun all(): List<Instructions.Doc> = index().mapNotNull { doc(it.id) }

    fun place(host: Host, id: String, name: String) = File(File(File(host.cacheDir, "instructions"), id), name)

    /** Файл инструкции в кэше; вызывается вне главного потока. */
    suspend fun file(host: Host, id: String, name: String): File {
        val f = place(host, id, name)
        val key = "$id/$name"
        if (key in unpacked && f.isFile) return f
        val bytes = Res.readBytes("$ROOT/$key")
        if (!f.isFile || f.length() != bytes.size.toLong()) {
            f.parentFile?.mkdirs()
            val tmp = File(f.parentFile!!, ".$name.part")
            tmp.writeBytes(bytes)
            tmp.renameTo(f)
        }
        lock.withLock { unpacked += key }
        return f
    }

    /** Все картинки документа — в кэш (первое открытие; дальше — сразу). */
    suspend fun unpack(host: Host, d: Instructions.Doc) = d.images.forEach { file(host, d.id, it.file) }
}

/** Где была прокрутка в каждой инструкции: вышел посмотреть фото, вернулся — на том же месте. */
private object InstructionPlace { val at = HashMap<String, Pair<Int, Int>>() }

/** Список инструкций: разделами, с поиском по тексту всех сразу. */
@Composable
fun InstructionsScreen(initial: String, onQuery: (String) -> Unit, open: (id: String, block: Int?, query: String?) -> Unit, close: () -> Unit) {
    BackHandler(onBack = close)
    var query by remember { mutableStateOf(initial) }
    val keyboard = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    val docs by produceState<List<Instructions.Doc>?>(null) {
        value = withContext(Background) { runCatching { InstructionLibrary.all() }.onFailure { Telemetry.error("инструкции", it) }.getOrDefault(emptyList()) }
    }
    val hits = remember(docs, query) { docs?.let { Instructions.search(it, query) }.orEmpty() }
    Scaffold(topBar = {
        TopAppBar(title = { Text("Инструкции") },
            navigationIcon = { IconButton(onClick = close) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } })
    }) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            OutlinedTextField(query, { query = it; onQuery(it) }, Modifier.fillMaxWidth().padding(16.dp, 4.dp).testTag("поиск по инструкциям"),
                placeholder = { Text("Поиск по инструкциям") }, singleLine = true,
                leadingIcon = { Icon(Icons.Default.Search, null) },
                trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { query = ""; onQuery("") }) { Icon(Icons.Default.Close, "Очистить") } },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSearch = { keyboard?.hide() }))
            val list = docs
            if (list == null) Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            else if (query.isBlank()) LazyColumn(Modifier.fillMaxSize().testTag("инструкции"), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp)) {
                list.groupBy { it.entry.group }.forEach { (group, inGroup) ->
                    item(key = "группа $group") {
                        Text(group, Modifier.padding(16.dp, 16.dp, 16.dp, 4.dp), style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                    }
                    itemsIndexed(inGroup, key = { _, d -> d.id }) { _, d ->
                        Row(Modifier.fillMaxWidth().clickable { open(d.id, null, null) }.padding(16.dp, 10.dp).testTag("инструкция: ${d.id}"),
                            verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(d.entry.short, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                                // Что внутри — разделами: видно, та ли это инструкция, не открывая её.
                                val inside = listOfNotNull("памятка".takeIf { d.memo != null }, (if (d.entry.id == "akt") "бланк для подписи" else "памятка").takeIf { d.pages.isNotEmpty() }) +
                                    d.sections.map { it.title.trimEnd(':') }
                                if (inside.isNotEmpty()) Text(inside.joinToString(" · "), style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            } else {
                Text(if (hits.isEmpty()) "Ничего не нашлось" else "Найдено: ${hits.size}", Modifier.padding(16.dp, 8.dp),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                LazyColumn(Modifier.fillMaxSize().testTag("найдено в инструкциях")) {
                    itemsIndexed(hits) { _, h ->
                        Column(Modifier.fillMaxWidth().clickable { open(h.doc.id, h.block.takeIf { it >= 0 }, query) }.padding(16.dp, 10.dp)) {
                            // Документ и раздел — отдельно: длинное имя документа не съедает раздел.
                            Text(h.doc.entry.short, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary,
                                maxLines = 1, overflow = TextOverflow.Ellipsis)
                            h.section?.let { Text(it.trimEnd(':'), style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                            Text(marked(h.snippet, query), style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
                        }
                        HorizontalDivider(Modifier.padding(horizontal = 16.dp))
                    }
                }
            }
        }
    }
}

/**
 * Инструкция: памятка, затем текст колонкой под экран — теми же словами, что в PDF. Сверху —
 * полоса разделов: показывает, где ты, и переносит к разделу касанием. [block] — куда прокрутить
 * (из поиска), [query] — что подсветить.
 */
@Composable
fun InstructionScreen(id: String, block: Int?, query: String?, viewImage: (index: Int) -> Unit, openDoc: (String) -> Unit, close: () -> Unit) {
    BackHandler(onBack = close)
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    val doc by produceState<Instructions.Doc?>(null, id) {
        value = withContext(Background) {
            runCatching { InstructionLibrary.doc(id)?.also { InstructionLibrary.unpack(host, it) } }
                .onFailure { Telemetry.error("инструкция $id", it) }.getOrNull()
        }
    }
    // Переход по ссылке в другую инструкцию — тот же экран с другим id, а produceState держит прежний
    // документ, пока грузится новый. В кадре с чужим текстом список цеплялся за чужой «блок N» (ключи
    // совпадали, а строк над текстом у документов разное число) и съезжал — «назад» возвращал не туда.
    // Документ — только свой, ключи строк — с id документа.
    val d = doc?.takeIf { it.id == id }
    Scaffold(topBar = {
        TopAppBar(title = { Text(d?.entry?.short ?: "", maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium) },
            navigationIcon = { IconButton(onClick = close) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } },
            actions = {
                if (d?.pdf != null) IconButton(onClick = { scope.launch { sharePdf(host, d) } }) { Icon(Icons.Default.Share, "Отправить PDF") }
            })
    }) { pad ->
        if (d == null) { Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) { CircularProgressIndicator() }; return@Scaffold }
        // Строки списка: памятка, страницы бланка, затем блоки — номер строки блока = lead + номер блока.
        val lead = (if (d.pdf != null) 1 else 0) + (if (d.memo != null) 1 else 0) + d.pages.size
        val saved = InstructionPlace.at[id]
        val list = remember(id) {
            // Из поиска — с заголовком раздела над находкой (если он близко) или со строкой перед ней:
            // находка в самом верху без начала раздела теряет, о чём она.
            val start = block?.let { b ->
                val head = d.sections.lastOrNull { it.block <= b }?.block
                if (head != null && b - head <= 6) head else (b - 1).coerceAtLeast(0)
            }
            LazyListState(start?.let { lead + it } ?: saved?.first ?: 0, if (block == null) saved?.second ?: 0 else 0)
        }
        LaunchedEffect(list) {
            snapshotFlow { list.firstVisibleItemIndex to list.firstVisibleItemScrollOffset }.collect { InstructionPlace.at[id] = it }
        }
        Column(Modifier.fillMaxSize().padding(pad)) {
            if (d.sections.size > 1) Sections(d, list, lead)
            // Лёжа и на планшете — колонкой не шире книжной страницы: строка во всю ширину не читается.
            // Отступ по бокам — внутри списка: листается и с полей.
            androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize()) {
            val side = maxOf(16.dp, (maxWidth - 680.dp) / 2)
            LazyColumn(Modifier.fillMaxSize().testTag("текст инструкции"), state = list,
                contentPadding = androidx.compose.foundation.layout.PaddingValues(side, 8.dp, side, 32.dp)) {
                // Документ для организации — отправить его заметно, словами, а не только значком сверху.
                if (d.pdf != null) item(key = "${d.id} отправить") {
                    androidx.compose.material3.FilledTonalButton(onClick = { scope.launch { sharePdf(host, d) } },
                        Modifier.fillMaxWidth().padding(bottom = 12.dp).testTag("отправить pdf")) {
                        Icon(Icons.Default.Share, null); Text("  Отправить PDF организации")
                    }
                }
                d.memo?.let { m ->
                    item(key = "${d.id} памятка") { Memo(host, d, m) { viewImage(0) } }
                }
                d.pages.forEachIndexed { i, p ->
                    item(key = "${d.id} страница $i") {
                        Column(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                            Picture(host, d.id, p, Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                                .background(Color.White).clickable { viewImage(d.images.indexOf(p)) }.testTag("страница бланка"))
                            Text("Страница ${i + 1} из ${d.pages.size} · коснитесь, чтобы увеличить", Modifier.padding(top = 4.dp),
                                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                val links = Links(go = { b -> scope.launch { list.animateScrollToItem(lead + b) } }, openDoc = openDoc)
                itemsIndexed(d.blocks, key = { i, _ -> "${d.id} блок $i" }) { i, b -> BlockView(host, d, b, query, viewImage, links, highlight = i == block) }
            }
            }
        }
    }
}

/** Полоса разделов: текущий отмечен, касание — прокрутка к нему. */
@Composable
private fun Sections(d: Instructions.Doc, list: LazyListState, lead: Int) {
    val scope = rememberCoroutineScope()
    val row = rememberLazyListState()
    val current by remember(d) {
        androidx.compose.runtime.derivedStateOf {
            val top = list.firstVisibleItemIndex - lead + if (list.firstVisibleItemScrollOffset > 0) 1 else 0
            d.sections.indexOfLast { it.block <= top }
        }
    }
    LaunchedEffect(current) { if (current >= 0) row.animateScrollToItem(current) }
    LazyRow(Modifier.fillMaxWidth().testTag("разделы"), state = row, horizontalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 2.dp)) {
        itemsIndexed(d.sections) { i, s ->
            FilterChip(i == current, onClick = { scope.launch { list.animateScrollToItem(lead + s.block) } },
                label = { Text(s.title.trimEnd(':'), maxLines = 1) }, modifier = Modifier.testTag("раздел: ${s.title}"))
        }
    }
    HorizontalDivider()
}

/** Памятка целиком в ширину; касание — на весь экран, с увеличением. */
@Composable
private fun Memo(host: Host, d: Instructions.Doc, m: Instructions.Image, open: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(12.dp))
        .background(MaterialTheme.colorScheme.surfaceVariant).clickable(onClick = open).testTag("памятка")) {
        Picture(host, d.id, m, Modifier.fillMaxWidth())
        Text("Памятка · коснитесь, чтобы увеличить", Modifier.padding(12.dp, 8.dp), style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Picture(host: Host, docId: String, img: Instructions.Image, modifier: Modifier) {
    val file = remember(docId, img.file) { InstructionLibrary.place(host, docId, img.file) }
    AsyncImage(ImageRequest.Builder(coil3.compose.LocalPlatformContext.current).data(file.path.toPath()).build(),
        contentDescription = Instructions.text(img.caption).ifEmpty { null }, contentScale = ContentScale.Fit,
        modifier = modifier.aspectRatio(img.width.toFloat() / img.height))
}

@Composable
private fun BlockView(host: Host, d: Instructions.Doc, b: Block, query: String?, viewImage: (Int) -> Unit, links: Links, highlight: Boolean) {
    val hl = if (highlight) Modifier.clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.6f)) else Modifier
    when (b) {
        is Block.Heading -> Text(styled(b.runs, query, d, links), (if (b.level == 1) Modifier.padding(top = 4.dp, bottom = 8.dp) else Modifier.padding(top = 20.dp, bottom = 6.dp)).then(hl),
            style = if (b.level == 1) MaterialTheme.typography.titleLarge else MaterialTheme.typography.titleMedium,
            color = if (b.level == 1) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.primary)
        is Block.Para -> {
            val t = Instructions.text(b.runs)
            // Те же слова — только в рамке: правила безопасности и «не делать лишних фото» не теряются в тексте.
            val safety = t.startsWith("Техника безопасности")
            val rule = !safety && b.runs.all { it.bold || it.text.isBlank() } && t.endsWith("!")
            if (safety || rule) Row(Modifier.fillMaxWidth().padding(vertical = 6.dp).clip(RoundedCornerShape(10.dp))
                .background(if (safety) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.tertiaryContainer).then(hl).padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(AppIcons.Warning, null, tint = if (safety) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.tertiary)
                Text(styled(b.runs, query, d, links), style = MaterialTheme.typography.bodyLarge,
                    color = if (safety) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onTertiaryContainer)
            } else Text(styled(b.runs, query, d, links), Modifier.padding(vertical = 4.dp).then(hl), style = MaterialTheme.typography.bodyLarge)
        }
        is Block.Item -> Row(Modifier.padding(start = 18.dp * (b.level - 1), top = 3.dp, bottom = 3.dp).then(hl)) {
            Text(markerOf(b.marker), Modifier.widthIn(min = 22.dp).padding(end = 6.dp), style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
            Text(styled(b.runs, query, d, links), style = MaterialTheme.typography.bodyLarge)
        }
        is Block.Images -> Column(Modifier.fillMaxWidth().padding(vertical = 8.dp).then(hl)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                b.items.forEach { img ->
                    Column(Modifier.weight(img.width.toFloat() / img.height)) {
                        Picture(host, d.id, img, Modifier.fillMaxWidth().heightIn(min = 40.dp).clip(RoundedCornerShape(8.dp))
                            .clickable { viewImage(d.images.indexOf(img)) }.testTag("фото инструкции"))
                        if (img.caption.isNotEmpty()) Text(styled(img.caption, query), Modifier.padding(top = 4.dp),
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            if (b.caption.isNotEmpty()) Text(styled(b.caption, query), Modifier.fillMaxWidth().padding(top = 4.dp),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}

/** Маркер списка — как в документе; «o» Word рисует кружком, «-» — тире. */
private fun markerOf(m: String) = when (m) { "o" -> "◦"; "-" -> "–"; else -> m }

/** Куда ведут ссылки в тексте: к разделу этого документа или в другую инструкцию. */
private class Links(val go: (block: Int) -> Unit, val openDoc: (String) -> Unit)

/**
 * Текст с жирным и курсивом документа; совпадения с запросом подсвечены. Перекрёстные ссылки
 * самого текста — «см. п. 4», «InfoPC.bat» — касанием ведут туда (слова те же, только нажимаются).
 */
@Composable
private fun styled(runs: List<Instructions.Run>, query: String?, d: Instructions.Doc? = null, links: Links? = null): AnnotatedString {
    val mark = MaterialTheme.colorScheme.tertiaryContainer
    val link = MaterialTheme.colorScheme.primary
    return remember(runs, query, mark, d, links) {
        buildAnnotatedString {
            runs.forEach { r ->
                pushStyle(SpanStyle(fontWeight = if (r.bold) FontWeight.Bold else null, fontStyle = if (r.italic) FontStyle.Italic else null))
                append(r.text)
                pop()
            }
            highlight(this, query, mark)
            if (d != null && links != null) Instructions.references(d, Instructions.text(runs)).forEach { ref ->
                addLink(androidx.compose.ui.text.LinkAnnotation.Clickable("ссылка ${ref.start}",
                    androidx.compose.ui.text.TextLinkStyles(SpanStyle(color = link, textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline))) {
                    ref.block?.let(links.go) ?: ref.doc?.let(links.openDoc)
                }, ref.start, ref.end)
            }
        }
    }
}

@Composable
private fun marked(text: String, query: String): AnnotatedString {
    val mark = MaterialTheme.colorScheme.tertiaryContainer
    return remember(text, query, mark) { buildAnnotatedString { append(text); highlight(this, query, mark) } }
}

private fun highlight(b: AnnotatedString.Builder, query: String?, color: Color) {
    val words = Instructions.fold(query.orEmpty()).split(' ', ',', '.').filter { it.length >= 2 }
    if (words.isEmpty()) return
    val f = Instructions.fold(b.toAnnotatedString().text)
    words.forEach { w ->
        var at = f.indexOf(w)
        while (at >= 0) { b.addStyle(SpanStyle(background = color), at, at + w.length); at = f.indexOf(w, at + w.length) }
    }
}

/** Картинки инструкции на весь экран: листание, увеличение, подпись внизу. */
@Composable
fun InstructionImagesScreen(id: String, start: Int, close: () -> Unit) {
    BackHandler(onBack = close)
    val host = LocalHost.current
    val doc by produceState<Instructions.Doc?>(null, id) { value = withContext(Background) { InstructionLibrary.doc(id) } }
    val d = doc?.takeIf { it.id == id } ?: return Box(Modifier.fillMaxSize().background(Color.Black))
    val images = d.images
    if (images.isEmpty()) { close(); return }
    val pager = rememberPagerState(initialPage = start.coerceIn(0, images.lastIndex)) { images.size }
    val current = images[pager.currentPage.coerceIn(0, images.lastIndex)]
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        HorizontalPager(pager, Modifier.fillMaxSize(), beyondViewportPageCount = 1) { page ->
            ZoomablePhoto(InstructionLibrary.place(host, d.id, images[page].file), Modifier.fillMaxSize())
        }
        Row(Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.45f)).statusBarsPadding().padding(4.dp),
            verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = close) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад", tint = Color.White) }
            Column(Modifier.weight(1f)) {
                Text(when (current) { d.memo -> "Памятка"; in d.pages -> "Страница ${d.pages.indexOf(current) + 1} из ${d.pages.size}"; else -> "Фото" },
                    color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${pager.currentPage + 1} из ${images.size} · ${d.entry.short}", color = Color.White.copy(alpha = 0.7f),
                    style = MaterialTheme.typography.labelSmall, maxLines = 1)
            }
        }
        val caption = Instructions.text(current.caption)
        if (caption.isNotEmpty()) Text(caption, Modifier.align(Alignment.BottomCenter).fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.55f)).navigationBarsPadding().padding(16.dp, 10.dp),
            color = Color.White, style = MaterialTheme.typography.bodyMedium, fontStyle = FontStyle.Italic)
    }
}

private suspend fun sharePdf(host: Host, d: Instructions.Doc) {
    val pdf = d.pdf ?: return
    val f = withContext(Background) { InstructionLibrary.file(host, d.id, pdf) }
    // Организации уходит сам документ, с его именем, а не «original.pdf».
    val named = File(f.parentFile!!, d.title + ".pdf")
    withContext(Background) { if (!named.isFile || named.length() != f.length()) named.writeBytes(f.readBytes()) }
    host.share(listOf(named), "application/pdf", "Отправить")
}

/** Подсказка в папке предмета: подходящая по названию инструкция — касанием. */
@Composable
fun InstructionHint(names: List<String>, open: (String) -> Unit) {
    val id = remember(names) { names.firstNotNullOfOrNull { Instructions.forItem(it) } } ?: return
    HintRow(id, open)
}

@Composable
private fun HintRow(id: String, open: (String) -> Unit) {
    val entry by produceState<Instructions.Entry?>(null, id) {
        value = withContext(Background) { runCatching { InstructionLibrary.index().firstOrNull { it.id == id } }.getOrNull() }
    }
    val e = entry ?: return
    Row(Modifier.fillMaxWidth().panel().clickable { open(e.id) }.padding(12.dp).testTag("подсказка инструкции"),
        horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(AppIcons.MenuBook, null, tint = MaterialTheme.colorScheme.secondary)
        Text("Как снимать: ${e.short}", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
