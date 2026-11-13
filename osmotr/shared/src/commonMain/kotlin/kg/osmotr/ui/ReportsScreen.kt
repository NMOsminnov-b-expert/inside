@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.ui.ExperimentalComposeUiApi::class)

package kg.osmotr.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kg.osmotr.core.Background
import kg.osmotr.core.File
import kg.osmotr.core.Telemetry
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Отчёты об ошибках (автор, 27.10.2026: «версию, которая сохраняет отчёты об ошибках. Все отчёты. Даже от
 * системы. Чтобы можно было открыть в отдельном экране и отправить»): падения Kotlin и сбои со слов
 * системы — списком, новые сверху; отчёт — целиком, текст можно выделить; отправить один или все.
 */
@Composable
fun ReportsScreen(close: () -> Unit) {
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf<File?>(null) }
    var version by remember { mutableStateOf(0) }   // отправили — перечитать: пометки «не отправлен» уходят
    val reports by produceState<List<Telemetry.Report>?>(null, version) { value = withContext(Background) { Telemetry.reports() } }
    BackHandler(enabled = open != null) { open = null }

    fun send(files: List<File>) = scope.launch {
        val out = withContext(Background) { runCatching { Telemetry.exportReports(files, host.cacheDir) }.getOrNull() }
        if (out.isNullOrEmpty()) { host.toast("Отчёты не собрались", long = true); return@launch }
        Telemetry.event("отчёты об ошибках", "отправлено ${out.size}")
        host.share(out, "text/plain", "Отчёты об ошибках «Осмотра»")
        withContext(Background) { Telemetry.markSent() }
        version++
    }

    val shown = open
    if (shown != null) {
        val text by produceState("") { value = withContext(Background) { runCatching { Telemetry.cleanReport(shown.readText()) }.getOrDefault("Отчёт не читается") } }
        Scaffold(topBar = {
            TopAppBar(title = { Text(reports?.firstOrNull { it.file == shown }?.title ?: "Отчёт") },
                navigationIcon = { IconButton(onClick = { open = null }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } },
                actions = { IconButton(onClick = { send(listOf(shown)) }, Modifier.testTag("отчёт отправить")) { Icon(Icons.Default.Share, "Отправить отчёт") } })
        }) { pad ->
            SelectionContainer(Modifier.padding(pad).fillMaxSize()) {
                Text(text, Modifier.verticalScroll(rememberScrollState()).horizontalScroll(rememberScrollState()).padding(16.dp),
                    fontFamily = FontFamily.Monospace, fontSize = 12.sp, lineHeight = 16.sp)
            }
        }
        return
    }

    Scaffold(topBar = {
        TopAppBar(title = { Text("Отчёты об ошибках") },
            navigationIcon = { IconButton(onClick = close) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } },
            actions = {
                if (!reports.isNullOrEmpty()) TextButton(onClick = { send(reports!!.map { it.file }) }, Modifier.testTag("отчёты отправить все")) { Text("Отправить все") }
            })
    }) { pad ->
        val list = reports
        when {
            list == null -> Box(Modifier.padding(pad).fillMaxSize())
            list.isEmpty() -> Box(Modifier.padding(pad).fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                Text("Ошибок не было. Если «Осмотр» закроется сам, отчёт появится здесь при следующем запуске.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> LazyColumn(Modifier.padding(pad).fillMaxSize()) {
                items(list, key = { it.file.path }) { r ->
                    Column(Modifier.fillMaxWidth().clickable { open = r.file }.padding(16.dp, 12.dp).testTag("отчёт"),
                        verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(r.title, fontWeight = FontWeight.SemiBold)
                        Text(r.whenText + if (r.sent) "" else " · не отправлен", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (r.summary.isNotEmpty()) Text(r.summary, style = MaterialTheme.typography.bodySmall, maxLines = 2)
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}
