package kg.osmotr.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kg.osmotr.core.Background
import kg.osmotr.core.Estate
import kg.osmotr.core.EstateCadRequest
import kg.osmotr.core.EstateCadRow
import kg.osmotr.core.File
import kg.osmotr.core.ScanPdf
import kg.osmotr.core.Store
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/*
 * Запросы документов из кадастра (решения пользователя 06.11.2026): отдельный экран, кнопка «Запросы документов N» — на
 * «Сегодня» под полосой дня, пока есть строки без ответа. Открытые запросы — карточками, закрытые — свёрнутым разделом ниже.
 * Строка: документ, объект, ЕНИ, учреждение, ответ и разбор ЦОД. Ответ — диалогом (как «Осмотр не состоялся»): «Получен» —
 * съёмка документа камерой ([DocScan], PDF), «Нет в кадастре» и «Отказ» — с комментарием. Ответ можно поправить в любой момент.
 * Практики: цель касания не меньше 44 dp, подписи в одну-две строки с многоточием, без модальных окон сверх диалога ответа.
 */

/** Кнопка под полосой дня: «Запросы документов» и число строк без ответа. */
@Composable
fun CadastreButton(count: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(14.dp)
    Row(modifier.fillMaxWidth().heightIn(min = 48.dp).panel(shape).clickable(role = Role.Button, onClick = onClick)
        .semantics { contentDescription = "Запросы документов, без ответа: $count" }.testTag("кнопка запросы документов").padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(AppIcons.Assignment, null, Modifier.size(24.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Запросы документов", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Badge { Text(if (count > 99) "99+" else count.toString()) }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** ДД.ММ.ГГГГ из ГГГГ-ММ-ДД; не дата — как есть. */
private fun dotted(iso: String): String = if (iso.length >= 10 && iso[4] == '-') "${iso.substring(8, 10)}.${iso.substring(5, 7)}.${iso.substring(0, 4)}" else iso

/** ГГГГ-ММ-ДД из «ДД.ММ.ГГГГ»; пусто — пусто (дату сам не подставляем), не дата — null. */
private fun isoOf(text: String): String? {
    val t = text.trim()
    if (t.isEmpty()) return ""
    // «06.11.2026» и «06112026» (цифровая клавиатура без точки).
    val m = (Regex("""^(\d{1,2})\.(\d{1,2})\.(\d{4})$""").find(t) ?: Regex("""^(\d{2})(\d{2})(\d{4})$""").find(t)) ?: return null
    val (d, mo, y) = m.destructured
    if (d.toInt() !in 1..31 || mo.toInt() !in 1..12) return null
    return "$y-${mo.padStart(2, '0')}-${d.padStart(2, '0')}"
}

/** Разбор ЦОД словами: ждёт, принят, вернули и отклонили — с причиной. */
private fun reviewLabel(r: EstateCadRow): String? = when (r.review) {
    "wait" -> "Ждёт разбора ЦОД"
    "accepted" -> "Принят ЦОД"
    "returned" -> "Вернули" + r.note.takeIf { it.isNotBlank() }?.let { ": $it" }.orEmpty()
    "rejected" -> "Отклонили" + r.note.takeIf { it.isNotBlank() }?.let { ": $it" }.orEmpty()
    else -> null
}

@Composable
fun CadastreScreen(close: () -> Unit) {
    val requests by Estate.cadastre.collectAsStateWithLifecycle()
    var loaded by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    var version by remember { mutableStateOf(0) }
    var showClosed by remember { mutableStateOf(false) }
    var answering by remember { mutableStateOf<Pair<EstateCadRequest, EstateCadRow>?>(null) }
    LaunchedEffect(version) {
        failed = false
        failed = !withContext(Background) { Estate.refreshCadastre() }
        loaded = true
    }
    DayScaffold("Запросы документов", close) { pad ->
        val open = requests.filter { !it.closed }
        val closed = requests.filter { it.closed }
        when {
            !loaded && requests.isEmpty() -> Loading()
            requests.isEmpty() && failed -> NoLink { loaded = false; version++ }
            requests.isEmpty() -> Box(Modifier.padding(pad).fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                Text("Запросов документов нет", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> androidx.compose.foundation.lazy.LazyColumn(Modifier.padding(pad).fillMaxSize().testTag("запросы документов"),
                contentPadding = PaddingValues(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (open.isEmpty()) item(key = "none-open") {
                    Text("Открытых запросов нет", Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                items(open, key = { "o" + it.id }) { r -> RequestCard(r) { row -> answering = r to row } }
                if (closed.isNotEmpty()) item(key = "closed-head") {
                    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp)).clickable { showClosed = !showClosed }.padding(horizontal = 8.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Закрытые · ${closed.size}", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Icon(if (showClosed) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown, if (showClosed) "Свернуть" else "Развернуть",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (showClosed) items(closed, key = { "c" + it.id }) { r -> RequestCard(r) { row -> answering = r to row } }
            }
        }
    }
    answering?.let { (req, row) -> CadAnswerDialog(req, row, onClose = { answering = null }) }
}

@Composable
private fun RequestCard(r: EstateCadRequest, answer: (EstateCadRow) -> Unit) {
    Column(Modifier.fillMaxWidth().panel().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("№ ${r.number}" + r.kind.takeIf { it.isNotBlank() }?.let { " · $it" }.orEmpty(), Modifier.weight(1f), style = MaterialTheme.typography.titleSmall,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (r.due.isNotBlank()) Text("срок до ${shortDate(r.due)}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
        if (r.note.isNotBlank()) Text(r.note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        r.rows.forEachIndexed { i, row ->
            if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            RowItem(row) { answer(row) }
        }
    }
}

@Composable
private fun RowItem(row: EstateCadRow, answer: () -> Unit) {
    Column(Modifier.fillMaxWidth().testTag("строка запроса"), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(row.doc.ifBlank { "Документ" }, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        val where = listOf(row.title, row.eni.takeIf { it.isNotBlank() }?.let { "ЕНИ $it" }.orEmpty(), row.inst).filter { it.isNotBlank() }
        if (where.isNotEmpty()) Text(where.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 3, overflow = TextOverflow.Ellipsis)
        val answered = row.result.isNotEmpty()
        val tail = listOfNotNull(row.scanDate.takeIf { it.isNotBlank() }?.let { "скан от ${dotted(it)}" }, row.answer.takeIf { it.isNotBlank() })
        Text("Ответ: " + row.resultLabel.ifBlank { if (answered) row.result else "Ждёт" } + tail.joinToString("") { " · $it" },
            style = MaterialTheme.typography.bodySmall, color = if (answered) MaterialTheme.colorScheme.onSurface else REPAIR_AMBER, maxLines = 3, overflow = TextOverflow.Ellipsis)
        reviewLabel(row)?.let {
            val bad = row.review == "returned" || row.review == "rejected"
            Text(it, style = MaterialTheme.typography.bodySmall, fontWeight = if (bad) FontWeight.SemiBold else FontWeight.Normal,
                color = if (bad) REPAIR_AMBER else if (row.review == "accepted") DONE_GREEN else MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 4, overflow = TextOverflow.Ellipsis)
        }
        OutlinedButton(onClick = answer, Modifier.heightIn(min = 44.dp).testTag("ответить")) { Text(if (answered) "Изменить ответ" else "Ответить") }
    }
}

/**
 * Ответ по строке: результат, дата сканирования (необязательно, сама не подставляется), комментарий; «Получен» — со съёмкой
 * документа камерой: страницы собираются в один PDF и уходят в систему.
 */
@Composable
private fun CadAnswerDialog(req: EstateCadRequest, row: EstateCadRow, onClose: () -> Unit) {
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    var result by remember { mutableStateOf(row.result.takeIf { it in listOf("got", "none", "refused") }) }
    var date by remember { mutableStateOf(dotted(row.scanDate)) }
    var note by remember { mutableStateOf(row.answer) }
    var busy by remember { mutableStateOf(false) }
    val iso = isoOf(date)
    val bad = result == "got" && iso == null
    val options = listOf("got" to "Получен", "none" to "Нет в кадастре", "refused" to "Отказ")
    // Имя файла в системе — «ЕНИ + название документа» (как у ответов в макете).
    val fileName = remember(row) { Store.cleanName(listOf(row.eni, row.doc).filter { it.isNotBlank() }.joinToString(" ")).ifBlank { "документ" } + ".pdf" }
    AlertDialog(onDismissRequest = { if (!busy) onClose() }, title = { Text("Ответ на запрос") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(listOf(row.doc, row.title, row.eni.takeIf { it.isNotBlank() }?.let { "ЕНИ $it" }.orEmpty()).filter { it.isNotBlank() }.joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
                options.forEach { (k, label) ->
                    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(8.dp)).clickable { result = k }, verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(result == k, { result = k }); Text(label)
                    }
                }
                if (result == "got") {
                    OutlinedTextField(date, { date = it.filter { c -> c.isDigit() || c == '.' }.take(10) }, Modifier.fillMaxWidth(), singleLine = true,
                        label = { Text("Дата сканирования, ДД.ММ.ГГГГ") }, supportingText = { Text(if (bad) "Дата в виде ДД.ММ.ГГГГ или пусто" else "Необязательно") }, isError = bad,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text))
                }
                OutlinedTextField(note, { note = it }, Modifier.fillMaxWidth(), label = { Text("Комментарий") }, minLines = 2)
                if (result == "got") Text("Документ снимается камерой, страницы собираются в один PDF «$fileName».", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (row.review == "accepted") Text("Документ уже принят ЦОД: новый файл ляжет новой редакцией.", style = MaterialTheme.typography.bodySmall, color = REPAIR_AMBER)
            }
        },
        confirmButton = { Button(onClick = {
            val res = result ?: return@Button
            val comment = note.trim()
            if (res == "got") {
                val day = iso ?: return@Button
                onClose()
                // Страницы ложатся в PDF и уходят сразу; не вышло (нет связи) — документ снимается заново.
                DocScan.start(host) { pages ->
                    val pdf = File(Store.root, ".скан/ответ-${kg.osmotr.core.Platform.nanoTime()}.pdf")
                    try {
                        Store.writeDurably(pdf) { ScanPdf.write(pages, it) }
                        val saved = Estate.cadAnswer(req.id, row.id, "got", day, comment, fileName, pdf)
                        if (saved.ok) "Ответ отправлен: ${row.doc.ifBlank { "документ" }}" else "Ответ не отправлен: ${saved.why}. Снимите документ ещё раз"
                    } finally { pdf.delete() }
                }
            } else {
                busy = true
                scope.launch {
                    val saved = withContext(Background) { Estate.cadAnswer(req.id, row.id, res, "", comment, "", null) }
                    busy = false
                    host.toast(if (saved.ok) "Ответ отправлен" else "Не отправлено: ${saved.why}", long = !saved.ok)
                    if (saved.ok) onClose()
                }
            }
        }, enabled = !busy && result != null && !bad, modifier = Modifier.heightIn(min = 44.dp).testTag("ответ отправить")) {
            Text(if (result == "got") "Снять документ" else "Отправить")
        } },
        dismissButton = { TextButton(onClick = onClose, Modifier.heightIn(min = 44.dp)) { Text("Отмена") } })
}
