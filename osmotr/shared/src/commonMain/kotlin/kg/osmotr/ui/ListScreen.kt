@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)

package kg.osmotr.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kg.osmotr.core.Background
import kg.osmotr.core.File
import kg.osmotr.core.Lists
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/**
 * Перечень Excel — просмотр и поиск (автор, 29.10.2026: «присылают excel файлы. Надо предусмотреть их просмотр
 * и поиск по ним. Там перечни зданий. Структура каждого файла своя»). Пустой запрос — лист как в Excel
 * (листы — переключателями, угаданная шапка выделена); запрос — найденные строки со всех листов карточками
 * «шапка: значение»; касание карточки — лист на этой строке, подсвеченной, и «к найденному» обратно.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListScreen(file: File, initialQuery: String = "", back: () -> Unit) {
    val host = LocalHost.current
    val book by produceState<Lists.Book?>(null, file) { value = withContext(Background) { Lists.open(file) } }
    var query by remember { mutableStateOf(initialQuery) }
    var sheet by remember { mutableStateOf(0) }
    // Пришли к строке из найденного: лист и строка; null — смотрим лист или список найденного.
    var at by remember { mutableStateOf<Lists.Hit?>(null) }
    val hits by produceState(emptyList<Lists.Hit>(), book, query) {
        val b = book ?: return@produceState
        if (query.isBlank()) { value = emptyList(); return@produceState }
        delay(150)   // печатают — не искать на каждой букве
        value = withContext(Background) { Lists.search(b, query) }
    }
    androidx.compose.ui.backhandler.BackHandler(enabled = at != null) { at = null }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(file.name.substringBeforeLast('.'), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        book?.let { b ->
                            Text("${plural(b.sheets.size, "лист", "листа", "листов")} · ${plural(b.sheets.sumOf { it.rows.size }, "строка", "строки", "строк")}",
                                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                },
                navigationIcon = { IconButton(onClick = { if (at != null) at = null else back() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } },
                actions = {
                    IconButton(onClick = { host.share(listOf(file), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") }) {
                        Icon(Icons.Default.Share, "Отправить")
                    }
                },
            )
        },
    ) { inner ->
        Column(Modifier.fillMaxSize().padding(inner)) {
            val b = book
            if (b == null) { Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }; return@Column }
            if (b.sheets.isEmpty()) {
                Text(if (b.tooBig) "Книга слишком большая для просмотра на телефоне — откройте её в Excel (кнопка «Отправить»)"
                    else "Книга не читается — файл повреждён, защищён паролем или это не Excel", Modifier.padding(24.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                return@Column
            }
            OutlinedTextField(query, { query = it; at = null }, Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).testTag("поиск в перечне"),
                singleLine = true, placeholder = { Text("Найти: адрес, название, номер…") },
                leadingIcon = { Icon(Icons.Default.Search, null) },
                trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { query = ""; at = null }) { Icon(Icons.Default.Clear, "Очистить") } },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search))
            val showHits = query.isNotBlank() && at == null
            if (showHits) Hits(b, hits, onPick = { h -> sheet = h.sheet; at = h })
            else {
                val here = at
                if (here != null) AssistChip(onClick = { at = null }, label = { Text("К найденному: ${hits.size}") },
                    leadingIcon = { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) }, modifier = Modifier.padding(horizontal = 12.dp).testTag("к найденному"))
                if (b.sheets.size > 1) Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    b.sheets.forEachIndexed { i, s ->
                        FilterChip(selected = i == sheet, onClick = { sheet = i; at = null }, label = { Text(s.name, maxLines = 1) },
                            modifier = Modifier.widthIn(max = 220.dp).testTag("лист ${s.name}"))
                    }
                }
                val s = b.sheets[sheet.coerceIn(0, b.sheets.lastIndex)]
                val head = b.headers.getOrNull(sheet)
                val state = rememberLazyListState()
                LaunchedEffect(here, sheet) { state.scrollToItem(((here?.row ?: 0) - 2).coerceAtLeast(0)) }
                androidx.compose.runtime.key(sheet) {
                    SheetGrid(s, usedWidth(s), rememberScrollState(), selected = null, modifier = Modifier.weight(1f),
                        look = { r -> if (r == head) RowLook.HEADER else if (head != null && r < head) RowLook.ABOVE else RowLook.ITEM },
                        onColumn = {}, state = state, marked = here?.takeIf { it.sheet == sheet }?.row)
                }
            }
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.ColumnScope.Hits(book: Lists.Book, hits: List<Lists.Hit>, onPick: (Lists.Hit) -> Unit) {
    LazyColumn(Modifier.weight(1f).fillMaxWidth().testTag("найденное в перечне"), contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Text(if (hits.isEmpty()) "Ничего не нашлось" else "Найдено: ${hits.size}" + (if (hits.size >= 300) " (первые 300 — уточните запрос)" else ""),
                style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        items(hits, key = { "${it.sheet}:${it.row}" }) { h ->
            Card(Modifier.fillMaxWidth().clickable { onPick(h) }.testTag("строка перечня"),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text((if (book.sheets.size > 1) "${book.sheets[h.sheet].name} · " else "") + "строка ${h.row + 1}",
                        style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    for ((label, value) in h.cells) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(label, Modifier.widthIn(max = 140.dp), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                    }
                }
            }
        }
    }
}
