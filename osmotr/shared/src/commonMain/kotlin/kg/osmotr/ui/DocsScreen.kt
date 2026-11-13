package kg.osmotr.ui

import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import kotlinx.coroutines.launch
import androidx.compose.runtime.setValue
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kg.osmotr.core.Background
import kg.osmotr.core.File
import kg.osmotr.core.Objects
import kg.osmotr.core.Store
import kotlinx.coroutines.withContext

/** Тип файла для «Открыть в другом приложении». */
fun docMime(f: File): String = when (f.extension.lowercase()) {
    "pdf" -> "application/pdf"
    "doc" -> "application/msword"
    "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    "xls" -> "application/vnd.ms-excel"
    "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    "odt" -> "application/vnd.oasis.opendocument.text"
    "ods" -> "application/vnd.oasis.opendocument.spreadsheet"
    "rtf" -> "application/rtf"
    "ppt" -> "application/vnd.ms-powerpoint"
    "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    "txt" -> "text/plain"
    "csv" -> "text/csv"
    "tif", "tiff" -> "image/tiff"
    "bmp" -> "image/bmp"
    "zip" -> "application/zip"
    else -> "*/*"
}

/** Все прикреплённые документы объекта по местам; касание открывает документ тем же просмотром, что и в папке. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DocsScreen(obj: File, open: (File) -> Unit, close: () -> Unit) {
    val version by Store.version.collectAsStateWithLifecycle()
    val groups by produceState<List<Objects.DocGroup>?>(null, obj, version) { value = withContext(Background) { Objects.documents(obj) } }
    val host = LocalHost.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    // «Добавить документ» в разделе — сначала к чему он относится: объект, недвижимость или ТС (на телефоне —
    // в «Документы» того места, как прежде).
    var picked by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<List<Picked>?>(null) }
    Scaffold(topBar = {
        TopAppBar(title = { Text("Документы объекта", maxLines = 1) },
            navigationIcon = { IconButton(onClick = close) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } })
    }, bottomBar = {
        if (host.canPickFiles) ActionBar(listOf(BarAction("Добавить документ", AppIcons.UploadFile, "добавить документ", main = true) {
            host.pickFiles { got -> if (got.isNotEmpty()) picked = got }
        }))
    }) { inner ->
        val g = groups ?: return@Scaffold
        Box(Modifier.fillMaxSize().padding(inner)) {
            if (g.isEmpty()) Text("Документов пока нет", Modifier.align(Alignment.Center), style = MaterialTheme.typography.titleMedium)
            LazyColumn(Modifier.testTag("все документы: список"), contentPadding = PaddingValues(12.dp)) {
                for (group in g) {
                    item(key = "h:" + group.title) {
                        Text(group.title, Modifier.padding(top = 12.dp, bottom = 4.dp), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                    }
                    items(group.files, key = { it.path }) { f ->
                        Row(Modifier.fillMaxWidth().clickable { open(f) }.padding(vertical = 12.dp).testTag("документ: ${f.name}"),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Icon(AppIcons.PictureAsPdf, null, Modifier.size(24.dp), tint = MaterialTheme.colorScheme.secondary)
                            Text(f.name, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
    }

    picked?.let { got ->
        val places = androidx.compose.runtime.remember(obj) {
            listOf("Объект" to File(obj, Objects.DOCS), "Недвижимость" to Objects.realDocs(obj)) +
                Objects.vehicles(obj).map { "ТС ${it.name}" to Objects.vehicleDocs(it) }
        }
        androidx.compose.material3.AlertDialog(onDismissRequest = { got.forEach { it.file?.delete() }; picked = null },
            title = { Text(if (got.size == 1) "К чему документ?" else "К чему документы (${got.size})?") },
            text = { DialogBody { androidx.compose.foundation.layout.Column {
                places.forEach { (title, into) ->
                    Text(title, Modifier.fillMaxWidth().clickable {
                        picked = null
                        scope.launch {
                            val put = withContext(Background) { got.map { p -> addDocument(into, p).second.also { p.file?.delete() } } }
                            val fresh = put.count { it }
                            host.toast(if (fresh > 0) "Добавлено: ${plural(fresh, "документ", "документа", "документов")} — $title" else "Уже лежит")
                        }
                    }.padding(vertical = 14.dp).testTag("куда: $title"), style = MaterialTheme.typography.bodyLarge)
                }
            } } },
            confirmButton = {},
            dismissButton = { androidx.compose.material3.TextButton(onClick = { got.forEach { it.file?.delete() }; picked = null }) { Text("Отмена") } })
    }
}

/**
 * Документы — разделом, а не папкой (автор, 03.11.2026: «Документы из папки переделываем в раздел»; «Давай и то и то»):
 * в объекте — все его документы (по местам), в «Недвижимом» и у ТС — свои. На телефоне файлы лежат как прежде.
 */
@Composable
fun DocsSection(dir: File, openAll: () -> Unit, openFolder: (File) -> Unit) {
    val version by Store.version.collectAsStateWithLifecycle()
    val kind = androidx.compose.runtime.remember(dir) { kg.osmotr.core.Layout.kindOf(dir) }
    val (title, folder) = when (kind) {
        kg.osmotr.core.Layout.Kind.OBJECT -> "Документы" to null
        kg.osmotr.core.Layout.Kind.REAL -> "Документы недвижимости" to Objects.realDocs(dir.parentFile!!)
        kg.osmotr.core.Layout.Kind.VEHICLE -> "Документы ТС" to Objects.vehicleDocs(dir)
        else -> return
    }
    val count by produceState(-1, dir, version) {
        value = withContext(Background) {
            if (folder == null) Objects.documents(dir).sumOf { it.files.size }
            else (Store.pdfsIn(folder) + kg.osmotr.core.Lists.listsIn(folder) + Store.docsIn(folder) + Store.photosIn(folder)).size
        }
    }
    Row(Modifier.fillMaxWidth().panel().clickable { if (folder == null) openAll() else openFolder(folder) }.padding(horizontal = 14.dp, vertical = 12.dp)
        .testTag("раздел документы"), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(AppIcons.PictureAsPdf, null, Modifier.size(24.dp), tint = MaterialTheme.colorScheme.secondary)
        Text(title, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
        if (count >= 0) Text(if (count == 0) "пусто" else count.toString(), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Контакт из «Поделиться»: выбрать объект, контакт ложится в его «Контакты». */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContactsToScreen(people: List<Store.Contact>, opened: (File) -> Unit, close: () -> Unit) {
    val objects by produceState(emptyList<File>()) { value = withContext(Background) { Objects.all() } }
    Scaffold(topBar = {
        TopAppBar(title = { Text("Куда положить контакт", maxLines = 1) },
            navigationIcon = { IconButton(onClick = close) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } })
    }) { inner ->
        LazyColumn(Modifier.fillMaxSize().padding(inner).testTag("контакт: куда"), contentPadding = PaddingValues(12.dp)) {
            item { Text(people.joinToString(", ") { it.name.ifBlank { it.phone } }, Modifier.padding(bottom = 8.dp), style = MaterialTheme.typography.titleMedium) }
            items(objects, key = { it.path }) { o ->
                Text(o.name, Modifier.fillMaxWidth().clickable {
                    Store.setContacts(o, Store.contacts(o) + people); opened(o)
                }.padding(vertical = 14.dp).testTag("объект: ${o.name}"))
            }
        }
    }
}
