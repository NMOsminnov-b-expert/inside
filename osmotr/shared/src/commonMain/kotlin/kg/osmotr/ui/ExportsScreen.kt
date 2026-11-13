@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.ui.ExperimentalComposeUiApi::class)

package kg.osmotr.ui

import kg.osmotr.core.Background

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kg.osmotr.core.File
import kg.osmotr.core.Platform
import kg.osmotr.core.Store
import kg.osmotr.core.Telemetry
import kg.osmotr.core.ZipSplit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Куда и сколько можно отправить одним файлом. Пределы — с запасом: у мессенджера предел на файл,
 * а при отправке он считает и служебное (почта — ещё и кодирование вложения, +⅓). Сверено 21.10.2026.
 */
enum class Channel(val title: String, val note: String, val limitMb: Int) {
    WHATSAPP("WhatsApp", "до 2 ГБ", 1900),
    TELEGRAM("Telegram", "до 2 ГБ", 1900),
    VIBER("Viber", "до 50 МБ", 45),
    MAIL("Почта", "до 25 МБ", 18),
}

/** Папка частей архива: рядом с архивами, у каждого — своя. */
private fun partsDir(host: Host, zip: File) = File(File(host.exportsDir, "Части"), zip.nameWithoutExtension)

private fun partsOf(host: Host, zip: File): List<File> =
    partsDir(host, zip).listFiles()?.filter { it.isFile && it.name.endsWith(".zip") && !it.name.startsWith(".") }
        ?.sortedWith(compareBy(Store.NATURAL) { it.name }).orEmpty()

/**
 * «Выгрузки» (автор, 21.10.2026, по вопросу осмотрщика «архив где-нибудь сохраняется?» и «не смогла
 * отправить, много весит»): все собранные архивы — сколько весят и когда собраны; отправить целиком,
 * отправить частями под мессенджер, удалить, чтобы освободить память.
 *
 * Части — самостоятельные архивы с теми же путями внутри: распакованные в одну папку, они сами
 * складываются в исходную структуру (опись → папки предметов → снимки).
 */
@Composable
fun ExportsScreen(close: () -> Unit) {
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    var version by remember { mutableIntStateOf(0) }
    val zips by produceState<List<File>?>(null, version) {
        value = withContext(Background) {
            host.exportsDir.listFiles()?.filter { it.isFile && it.name.endsWith(".zip") && !it.name.startsWith(".") }
                ?.sortedByDescending { it.lastModified() }.orEmpty()
        }
    }
    val used by produceState(0L, version) {
        value = withContext(Background) { host.exportsDir.walkTopDown().filter { it.isFile }.sumOf { it.length() } }
    }
    val free = remember(version) { host.freeBytes(host.exportsDir) }
    var splitting by remember { mutableStateOf<File?>(null) }
    var deleting by remember { mutableStateOf<List<File>?>(null) }
    var busy by remember { mutableStateOf<Pair<String, Float>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var menu by remember { mutableStateOf(false) }
    BackHandler(onBack = close)

    Scaffold(topBar = {
        TopAppBar(title = { Text("Выгрузки") },
            navigationIcon = { IconButton(onClick = close) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } },
            actions = {
                if (!zips.isNullOrEmpty()) {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, "Ещё") }
                    DropdownMenu(menu, { menu = false }) {
                        DropdownMenuItem({ Text("Удалить все") }, leadingIcon = { Icon(Icons.Default.Delete, null) },
                            onClick = { menu = false; deleting = zips })
                    }
                }
            })
    }) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            Text(listOfNotNull("Лежат ${host.exportsPlace}", "занято ${megabytes(used)}",
                free.takeIf { it >= 0 }?.let { "свободно ${megabytes(it)}" }).joinToString(" · "),
                Modifier.padding(16.dp, 8.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            busy?.let { (what, p) ->
                Column(Modifier.fillMaxWidth().padding(16.dp, 4.dp)) {
                    Text(what, style = MaterialTheme.typography.bodyMedium)
                    LinearProgressIndicator(progress = { p }, Modifier.fillMaxWidth().padding(top = 6.dp))
                }
            }
            val list = zips
            if (list != null && list.isEmpty()) Text("Выгрузок нет. Архивы появляются здесь после «Отправить архивом» и выгрузки описи.",
                Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            LazyColumn(Modifier.fillMaxSize().testTag("выгрузки")) {
                items(list.orEmpty(), key = { it.path }) { zip ->
                    val parts = remember(zip.path, version) { partsOf(host, zip) }
                    Column(Modifier.fillMaxWidth().padding(16.dp, 10.dp)) {
                        Text(zip.nameWithoutExtension, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyLarge)
                        Text(megabytes(zip.length()) + " · " + Platform.format(zip.lastModified(), "dd.MM.yyyy HH:mm") +
                            (if (parts.isNotEmpty()) " · частей: ${parts.size}" else ""),
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TextButton(enabled = busy == null, onClick = { host.share(listOf(zip), "application/zip", "Отправить архив") },
                                modifier = Modifier.testTag("отправить")) { Text("Отправить") }
                            TextButton(enabled = busy == null, onClick = { splitting = zip }, modifier = Modifier.testTag("по частям")) { Text("По частям") }
                            if (parts.isNotEmpty()) TextButton(enabled = busy == null, onClick = { host.share(parts, "application/zip", "Отправить части") },
                                modifier = Modifier.testTag("отправить части")) { Text("Части") }
                            // Файлом туда, куда укажет человек (PWA: «Сохранить как» или «Сохранить в Файлы»).
                            if (host.canSaveAs) TextButton(enabled = busy == null, onClick = { host.saveAs(zip, "application/zip") },
                                modifier = Modifier.testTag("сохранить")) { Text("Сохранить") }
                            IconButton(enabled = busy == null, onClick = { deleting = listOf(zip) }, modifier = Modifier.testTag("удалить выгрузку")) {
                                Icon(Icons.Default.Delete, "Удалить")
                            }
                        }
                    }
                    HorizontalDivider()
                }
            }
        }
    }

    splitting?.let { zip ->
        var channel by remember { mutableStateOf(Channel.WHATSAPP) }
        var own by remember { mutableStateOf("") }
        val limitMb = own.toIntOrNull()?.takeIf { it > 0 } ?: channel.limitMb
        val count = ((zip.length() + limitMb * 1048576L - 1) / (limitMb * 1048576L)).coerceAtLeast(1)
        AlertDialog(onDismissRequest = { splitting = null }, title = { Text("Отправить частями") },
            text = { DialogBody {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Куда отправляете:", style = MaterialTheme.typography.bodyMedium)
                    Channel.entries.chunked(2).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            row.forEach { c ->
                                FilterChip(selected = own.isEmpty() && channel == c, onClick = { channel = c; own = "" },
                                    label = { Text("${c.title} · ${c.note}") }, modifier = Modifier.testTag("канал ${c.title}"))
                            }
                        }
                    }
                    OutlinedTextField(own, { v -> own = v.filter(Char::isDigit).take(5) }, singleLine = true,
                        label = { Text("Свой предел, МБ") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth().testTag("свой предел"))
                    Text(if (count <= 1) "Архив и так меньше ${limitMb} МБ — отправится целиком."
                        else "Около $count частей до $limitMb МБ. Распакуйте все части в одну папку — сложится та же структура.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } },
            confirmButton = { TextButton(onClick = {
                splitting = null
                if (count <= 1) { host.share(listOf(zip), "application/zip", "Отправить архив"); return@TextButton }
                scope.launch {
                    busy = "Делю на части…" to 0f
                    val res = withContext(Background) {
                        runCatching { kg.osmotr.core.withContent(zip) { ZipSplit.split(zip, limitMb * 1048576L, partsDir(host, zip)) { p -> busy = "Делю на части…" to p } } }
                    }
                    busy = null; version++
                    res.onSuccess { r ->
                        Store.scan(r.parts.map { it.file })
                        Telemetry.event("выгрузки", "частей ${r.parts.size} до $limitMb МБ" + (if (r.oversized.isNotEmpty()) ", крупнее предела ${r.oversized.size}" else ""))
                        if (r.oversized.isNotEmpty()) host.toast("Файлов крупнее $limitMb МБ: ${r.oversized.size} — они отдельными частями и могут не пройти", long = true)
                        host.share(r.parts.map { it.file }, "application/zip", "Отправить части")
                    }.onFailure { Telemetry.error("выгрузки: части", it); error = it.message ?: it::class.simpleName }
                }
            }, modifier = Modifier.testTag("разбить")) { Text(if (count <= 1) "Отправить" else "Разбить и отправить") } },
            dismissButton = { TextButton(onClick = { splitting = null }) { Text("Отмена") } })
    }

    deleting?.let { del ->
        val size = remember(del) { del.sumOf { it.length() + partsOf(host, it).sumOf { p -> p.length() } } }
        AlertDialog(onDismissRequest = { deleting = null },
            title = { Text(if (del.size == 1) "Удалить архив?" else "Удалить все выгрузки?") },
            text = { DialogBody { Text((if (del.size == 1) del[0].nameWithoutExtension else plural(del.size, "архив", "архива", "архивов")) +
                " — освободится ${megabytes(size)}. Снимки в «Осмотрах» не трогаются.") } },
            confirmButton = { TextButton(onClick = {
                deleting = null
                scope.launch {
                    withContext(Background) {
                        del.forEach { z -> partsDir(host, z).deleteRecursively(); z.delete() }
                        Store.scan(del)
                    }
                    version++
                    host.toast("Освобождено ${megabytes(size)}")
                }
            }, modifier = Modifier.testTag("подтвердить удаление")) { Text("Удалить") } },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("Отмена") } })
    }

    error?.let { e ->
        AlertDialog(onDismissRequest = { error = null }, title = { Text("Не получилось") },
            text = { DialogBody { Text(e) } }, confirmButton = { TextButton(onClick = { error = null }) { Text("Понятно") } })
    }
}
