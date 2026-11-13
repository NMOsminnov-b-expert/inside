@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)

package kg.osmotr.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import coil3.compose.AsyncImage
import kg.osmotr.core.Background
import kg.osmotr.core.File
import kg.osmotr.core.Objects
import kg.osmotr.core.Platform
import kg.osmotr.core.Store
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okio.Path.Companion.toPath

/**
 * Массовая подгрузка в объект (автор, 29.10.2026: «Надо сделать возможной массовую подгрузку с предпросмотром
 * и ручным распределением что куда прямо в приложении»). Выбранные снимки и PDF — сеткой; отмечаешь
 * несколько, «Куда…» — место объекта (документы, участок, помещения или фасад литера, ТС; новый литер или ТС —
 * тут же), «Разложить» — пишет. Глаз на плитке — посмотреть целиком (PDF — постранично). PDF — только туда,
 * где ему место ([Objects.Place.pdf]). Не разложенное остаётся на экране; уйти с ним — спросит.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SortScreen(obj: File, files: List<Picked>, view: (File, String) -> Unit, close: () -> Unit) {
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    // Всё — во временных файлах: предпросмотр (Coil, PdfRenderer) читает с диска, в памяти ничего не держится.
    val items = remember { mutableStateListOf<Picked>() }
    val ready by produceState(false) {
        val all = withContext(Background) { files.filter { it.isPhoto || it.isDoc }.map(::onDisk) }
        items.addAll(all); value = true
    }
    val where = remember { mutableStateMapOf<Picked, File>() }
    val selected = remember { mutableStateListOf<Picked>() }
    var version by remember { mutableStateOf(0) }
    val places by produceState(emptyList<Objects.Place>(), obj, version) { value = withContext(Background) { Objects.places(obj) } }
    val titles = places.associate { it.dir to it.title }
    var choosing by remember { mutableStateOf(false) }
    var leaving by remember { mutableStateOf(false) }
    var looking by remember { mutableStateOf<Picked?>(null) }
    var writing by remember { mutableStateOf(false) }
    val leave = { if (items.isEmpty()) close() else leaving = true }
    androidx.compose.ui.backhandler.BackHandler(enabled = items.isNotEmpty()) { leaving = true }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Разобрать: ${obj.name}", maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (ready) Text("Разложено ${where.size} из ${items.size}", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                navigationIcon = { IconButton(onClick = leave) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } },
                actions = {
                    val rest = items.filter { it !in where }
                    if (selected.isNotEmpty()) TextButton(onClick = { selected.clear() }) { Text("Снять") }
                    else if (rest.isNotEmpty()) TextButton(onClick = { selected.addAll(rest) }) { Text("Все неразложенные") }
                },
            )
        },
        bottomBar = {
            Surface(tonalElevation = 3.dp) {
                Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = { choosing = true }, enabled = selected.isNotEmpty() && !writing,
                        modifier = Modifier.weight(1f).testTag("куда")) { Text(if (selected.isEmpty()) "Куда…" else "Куда (${selected.size})…") }
                    Button(onClick = {
                        val batch = where.toMap()
                        writing = true
                        scope.launch {
                            val n = runCatching { withContext(Background) { placeSorted(batch) } }
                                .onFailure { kg.osmotr.core.Telemetry.error("разбор файлов", it) }.getOrNull()
                            writing = false
                            if (n == null) { host.toast("Не удалось разложить — попробуйте ещё раз"); return@launch }
                            items.removeAll(batch.keys); batch.keys.forEach(where::remove); selected.removeAll(batch.keys)
                            host.toast("Разложено: $n")
                            if (items.isEmpty()) close()
                        }
                    }, enabled = where.isNotEmpty() && !writing, modifier = Modifier.weight(1f).testTag("разложить")) {
                        Text(if (where.isEmpty()) "Разложить" else "Разложить (${where.size})")
                    }
                }
            }
        },
    ) { inner ->
        if (!ready) Box(Modifier.fillMaxSize().padding(inner), Alignment.Center) { androidx.compose.material3.CircularProgressIndicator() }
        else LazyVerticalGrid(GridCells.Adaptive(108.dp), Modifier.fillMaxSize().padding(inner).testTag("разбор"),
            contentPadding = PaddingValues(8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(items, key = { it.file?.path ?: it.name }) { p ->
                SortCell(p, p in selected, where[p]?.let { titles[it] ?: it.name },
                    toggle = { if (p in selected) selected.remove(p) else selected.add(p) },
                    look = { if (p.isPdf) view(p.file!!, p.name) else if (p.isPhoto) looking = p })
            }
        }
    }

    if (choosing) {
        val pdfs = selected.count { it.isDoc }
        SortPlaceDialog(places, pdfs, onPick = { place ->
            choosing = false
            // PDF — только туда, где ему место; снимки — куда угодно.
            selected.filter { !it.isDoc || place.pdf }.forEach { where[it] = place.dir }
            selected.removeAll { where[it] == place.dir }
            if (selected.isNotEmpty()) host.toast("PDF и Excel сюда нельзя — в «${Objects.DOCS}» или к ТС; они остались отмечены")
        }, onAdded = { version++ }, onCancel = { choosing = false }, obj = obj)
    }
    if (leaving) AlertDialog(
        onDismissRequest = { leaving = false },
        title = { Text("Уйти? Файлов на экране: ${items.size}") },
        text = { Text(if (where.isEmpty()) "Выбранные файлы не попадут в объект." else "Отмеченные местами, но не разложенные тоже не попадут в объект — нажмите «Разложить».") },
        confirmButton = { TextButton(onClick = { leaving = false; items.forEach { it.file?.delete() }; items.clear(); close() }) { Text("Бросить") } },
        dismissButton = { TextButton(onClick = { leaving = false }) { Text("Остаться") } },
    )
    looking?.let { p ->
        Dialog(onDismissRequest = { looking = null }) {
            AsyncImage(p.file!!.path.toPath(), p.name, Modifier.fillMaxWidth().clickable { looking = null }, contentScale = ContentScale.Fit)
        }
    }
}

/** Выбранное — во временный файл (из памяти), чтобы предпросмотр и запись шли с диска. */
private fun onDisk(p: Picked): Picked {
    if (p.file != null) return p
    val dir = File(Store.cacheDir, "разбор").also { it.mkdirs() }
    val f = File(dir, "${Platform.nowMs()}-${p.name.hashCode().toUInt()}-${p.name.takeLast(40).replace('/', ' ')}")
    val bytes = p.bytes
    Store.writeDurably(f, bytes)
    return Picked.ofFile(p.name, f, p.takenMs, bytes.copyOf(minOf(16, bytes.size)))
}

@Composable
private fun SortCell(p: Picked, selected: Boolean, place: String?, toggle: () -> Unit, look: () -> Unit) {
    val host = LocalHost.current
    Box(Modifier.aspectRatio(1f).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.surfaceVariant)
        .clickable(onClick = toggle).testTag(if (p.isPdf) "разбор pdf" else if (p.isList) "разбор перечень" else if (p.isPhoto) "разбор снимок" else "разбор документа")) {
        if (p.isDoc) {
            // Первая страница — если платформа умеет; нет — значок с именем.
            val page by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, p) { value = if (!p.isPdf) null else withContext(Background) { pdfThumb(host, p.file!!, 320) } }
            page?.let { androidx.compose.foundation.Image(it, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
                ?: Column(Modifier.fillMaxSize().padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Icon(if (p.isPdf) AppIcons.PictureAsPdf else AppIcons.TableChart, null, tint = if (p.isPdf) MaterialTheme.colorScheme.error else DONE_GREEN, modifier = Modifier.size(32.dp))
                }
            Text(p.name, Modifier.align(Alignment.TopCenter).fillMaxWidth().background(Color.Black.copy(alpha = 0.55f)).padding(4.dp, 2.dp),
                color = Color.White, style = MaterialTheme.typography.labelSmall, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
        } else AsyncImage(p.file!!.path.toPath(), p.name, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        if (place != null) Text(place, Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(MaterialTheme.colorScheme.primary.copy(alpha = 0.9f))
            .padding(4.dp, 3.dp).testTag("место"), color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelSmall,
            maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
        if (p.isPdf || p.isPhoto) IconButton(onClick = look, modifier = Modifier.align(Alignment.TopStart).size(40.dp).testTag("посмотреть")) {
            Icon(Icons.Default.Search, "Посмотреть", Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.5f)).padding(4.dp), tint = Color.White)
        }
        if (selected) {
            Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.primary.copy(alpha = 0.3f))
                .border(3.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(6.dp)))
            Icon(Icons.Default.CheckCircle, "Отмечено", Modifier.align(Alignment.TopEnd).padding(4.dp), tint = MaterialTheme.colorScheme.primary)
        }
    }
}

/**
 * Куда разложить отмеченное — места объекта; для PDF — только «Документы» и ТС (остальные приглушены с
 * пояснением). Новый литер или ТС — тут же, и он сразу в списке.
 */
@Composable
fun SortPlaceDialog(places: List<Objects.Place>, pdfs: Int, onPick: (Objects.Place) -> Unit, onAdded: () -> Unit, onCancel: () -> Unit, obj: File) {
    var newBuilding by remember { mutableStateOf(false) }
    var newVehicle by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text("Куда?") },
        text = { DialogBody { SortPlaces(places, pdfs, onPick, addBuilding = { newBuilding = true }, addVehicle = { newVehicle = true }) } },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onCancel) { Text("Отмена") } },
    )
    if (newBuilding) NewBuildingDialog(obj, made = { newBuilding = false; onAdded() }, onCancel = { newBuilding = false })
    if (newVehicle) NewVehicleDialog(obj, made = { newVehicle = false; onAdded() }, onCancel = { newVehicle = false })
}

/** Список мест — отдельно от окна (в тестах экранов проверяется сам по себе, как PlaceFolderChooser). */
@Composable
fun SortPlaces(places: List<Objects.Place>, pdfs: Int, onPick: (Objects.Place) -> Unit, addBuilding: () -> Unit, addVehicle: () -> Unit) {
    Column {
        if (pdfs > 0) Text("Документы — в «${Objects.DOCS}» или к ТС" + (if (pdfs > 1) " ($pdfs)" else ""),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 6.dp))
        LazyColumn(Modifier.heightIn(max = 380.dp)) {
            items(places.size) { k ->
                val pl = places[k]
                // PDF среди отмеченного и место не для PDF — снимки лягут, PDF останутся отмеченными.
                val dim = pdfs > 0 && !pl.pdf
                Text(pl.title, Modifier.fillMaxWidth().clickable { onPick(pl) }.padding(vertical = 12.dp, horizontal = 4.dp).testTag("место: ${pl.title}"),
                    fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis,
                    color = if (dim) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
            }
        }
        TextButton(onClick = addBuilding) { Text("+ Литера или найденное") }
        TextButton(onClick = addVehicle) { Text("+ ТС по госномеру") }
    }
}
