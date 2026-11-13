package kg.osmotr.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kg.osmotr.core.Background
import kg.osmotr.core.Estate
import kg.osmotr.core.EstateDayReport
import kg.osmotr.core.EstateObject
import kg.osmotr.core.EstatePartial
import kg.osmotr.core.EstatePlanItem
import kg.osmotr.core.EstateTrip
import kg.osmotr.core.File
import kg.osmotr.core.Platform
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/*
 * День осмотрщика в системе E•state (план пользователя 06.11.2026): полоса из четырёх кнопок над списком, «Планы»,
 * «Уведомления», «Отчёт», взять на день и перенос. Вид — тот же, что у приложения: панели [panel], экраны с верхней
 * панелью и «Назад», выбор — диалогом (как «Осмотр не состоялся»). Практики: цель касания не меньше 44 dp, короткие
 * подписи — одна строка с многоточием, у числа на кнопке — подпись для чтения с экрана («Уведомления, 3 непрочитанных»).
 */

// ---------- Даты ----------

/** Даты «ГГГГ-ММ-ДД» без платформенных календарей: день недели, сдвиг, подписи. */
object Days {
    private val NAMES = listOf("пн", "вт", "ср", "чт", "пт", "сб", "вс")

    fun today(): String = Platform.format(Platform.nowMs(), "yyyy-MM-dd")

    private fun epoch(iso: String): Long? {
        val y = iso.take(4).toIntOrNull() ?: return null
        val m = iso.drop(5).take(2).toIntOrNull() ?: return null
        val d = iso.drop(8).take(2).toIntOrNull() ?: return null
        val yy = if (m <= 2) y - 1 else y
        val era = (if (yy >= 0) yy else yy - 399) / 400
        val yoe = yy - era * 400
        val doy = (153 * (m + (if (m > 2) -3 else 9)) + 2) / 5 + d - 1
        val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146097L + doe - 719468
    }

    private fun iso(epochDay: Long): String {
        val z = epochDay + 719468
        val era = (if (z >= 0) z else z - 146096) / 146097
        val doe = z - era * 146097
        val yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
        val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        val mp = (5 * doy + 2) / 153
        val d = doy - (153 * mp + 2) / 5 + 1
        val m = if (mp < 10) mp + 3 else mp - 9
        val y = yoe + era * 400 + (if (m <= 2) 1 else 0)
        fun two(v: Long) = v.toString().padStart(2, '0')
        return "$y-${two(m)}-${two(d)}"
    }

    /** Дата через [n] дней (назад — отрицательное). */
    fun add(iso: String, n: Int): String = epoch(iso)?.let { iso(it + n) } ?: iso

    /** День недели словом: «пн»…«вс». */
    fun name(iso: String): String = epoch(iso)?.let { NAMES[(((it + 3) % 7 + 7) % 7).toInt()] } ?: ""

    /** «пн 09.11» — на кнопке выбора дня. */
    fun chip(iso: String): String = "${name(iso)} ${shortDate(iso)}".trim()

    /** «Сегодня · пт, 06.11» — заголовок дня. */
    fun head(iso: String, today: String): String {
        val base = "${name(iso)}, ${shortDate(iso)}"
        return when (iso) { today -> "Сегодня · $base"; add(today, 1) -> "Завтра · $base"; else -> base }
    }

    /** Момент ISO «ГГГГ-ММ-ДДTЧЧ:ММ…Z» (UTC) → «ДД.ММ ЧЧ:ММ» местного времени; не разобрался — только дата. */
    fun stamp(iso: String): String {
        val day = epoch(iso) ?: return iso
        val h = iso.drop(11).take(2).toLongOrNull() ?: return shortDate(iso)
        val m = iso.drop(14).take(2).toLongOrNull() ?: return shortDate(iso)
        val utc = iso.endsWith("Z") || iso.length <= 19
        val ms = ((day * 24 + h) * 60 + m) * 60_000L
        return if (utc) Platform.format(ms, "dd.MM HH:mm") else "${shortDate(iso)} ${iso.drop(11).take(5)}"
    }

    /** Только «ЧЧ:ММ» момента (местное время). */
    fun clock(iso: String): String = stamp(iso).takeLast(5)
}

/** Папка объекта по номеру объекта системы; нет на устройстве — null. */
suspend fun estateDirOf(objectId: String): File? = withContext(Background) { Estate.bound().firstOrNull { it.second.id == objectId }?.first }

// ---------- Полоса кнопок ----------

/**
 * Четыре кнопки под плашкой E•state: «Сегодня N», «Планы», «Уведомления N», «Отчёт». Значок над подписью, число — на значке:
 * подпись остаётся короткой и не обрезается на узком экране; число читается с экрана вместе с названием.
 */
@Composable
fun EstateDayStrip(todayCount: Int, unread: Int, onToday: () -> Unit, onPlans: () -> Unit, onNotes: () -> Unit, onReport: () -> Unit,
                   modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().testTag("день осмотрщика"), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        StripButton("Сегодня", AppIcons.Today, todayCount, "Сегодня, задач: $todayCount", true, onToday, Modifier.weight(1f).testTag("кнопка сегодня"))
        StripButton("Планы", AppIcons.CalendarMonth, 0, "Планы", false, onPlans, Modifier.weight(1f).testTag("кнопка планы"))
        StripButton("Уведомления", AppIcons.Bell, unread, if (unread > 0) "Уведомления, $unread непрочитанных" else "Уведомления, новых нет", false,
            onNotes, Modifier.weight(1f).testTag("кнопка уведомления"))
        StripButton("Отчёт", AppIcons.Assignment, 0, "Отчёт дня", false, onReport, Modifier.weight(1f).testTag("кнопка отчёт"))
    }
}

@Composable
private fun StripButton(label: String, icon: ImageVector, count: Int, description: String, here: Boolean, onClick: () -> Unit, modifier: Modifier) {
    val shape = RoundedCornerShape(14.dp)
    Column(modifier.heightIn(min = 56.dp).panel(shape, if (here) MaterialTheme.colorScheme.primaryContainer else null)
        .clickable(role = Role.Button, onClick = onClick).semantics { contentDescription = description }
        .padding(horizontal = 2.dp, vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        BadgedBox(badge = { if (count > 0) Badge { Text(if (count > 99) "99+" else count.toString()) } }) {
            Icon(icon, null, Modifier.size(24.dp), tint = if (here) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(label, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
            color = if (here) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface)
    }
}

/** Заголовок группы на главном: «Сегодня · 3». */
@Composable
fun EstateGroupHeader(text: String, count: Int, modifier: Modifier = Modifier) {
    Text("$text · $count", modifier.fillMaxWidth().padding(start = 8.dp, end = 8.dp, top = 12.dp, bottom = 2.dp), style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

/** Объекты главного по группам (план 06.11.2026): сегодня, не сделано раньше, без даты, позже, законченное и снятое раньше. */
class EstateGroups<T>(val today: List<T>, val earlier: List<T>, val noDate: List<T>, val later: List<T>, val over: List<T>) {
    /** Число на кнопке «Сегодня»: сегодня и не сделанное раньше; снятое регионалом не считается. */
    fun count(of: (T) -> EstateObject?): Int = today.count { of(it)?.removed == false } + earlier.size

    companion object {
        fun <T> of(all: List<T>, today: String, bound: (T) -> EstateObject?): EstateGroups<T> {
            fun removedToday(b: EstateObject) = b.removed && b.removedAt.orEmpty().startsWith(today)
            val live = all.filter { t -> bound(t)?.let { it.state != "done" && !it.removed } == true }
            val gone = all.filter { t -> bound(t)?.let(::removedToday) == true }
            return EstateGroups(
                today = live.filter { bound(it)?.plannedAt == today } + gone,
                earlier = live.filter { bound(it)?.plannedAt.orEmpty().let { d -> d.isNotEmpty() && d < today } },
                noDate = live.filter { bound(it)?.plannedAt.isNullOrEmpty() },
                later = live.filter { bound(it)?.plannedAt.orEmpty() > today },
                over = all.filter { t -> bound(t)?.let { (it.state == "done" || it.removed) && !removedToday(it) } == true },
            )
        }
    }
}

// ---------- Выбор дня ----------

/** Дни подряд кнопками в одну строку с прокруткой: [from] — первый день, [count] дней; выбранный подсвечен. */
@Composable
fun DayChips(from: String, count: Int, selected: String?, onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (i in 0 until count) {
            val d = Days.add(from, i)
            FilterChip(d == selected, { onSelect(d) }, { Text(Days.chip(d), maxLines = 1, softWrap = false) }, Modifier.heightIn(min = 44.dp).testTag("день $d"))
        }
    }
}

/** «Взять на день»: задача без даты — на любой из ближайших 28 дней, не только на сегодня (автор, 06.11.2026). */
@Composable
fun TakeDialog(objectId: String, title: String, onClose: (taken: Boolean) -> Unit) {
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    val today = remember { Days.today() }
    var date by remember { mutableStateOf(today) }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(onDismissRequest = { if (!busy) onClose(false) }, title = { Text("Взять на день") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(title, style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
                DayChips(today, 28, date, { date = it })
                Text(Days.head(date, today), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = { Button(onClick = {
            busy = true
            scope.launch {
                val ok = withContext(Background) { Estate.take(objectId, date) }
                busy = false
                host.toast(if (ok) "Взято на ${shortDate(date)}" else "Нет связи с E•state — повторите позже", long = !ok)
                if (ok) onClose(true)
            }
        }, enabled = !busy, modifier = Modifier.heightIn(min = 44.dp)) { Text("Взять") } },
        dismissButton = { TextButton(onClick = { onClose(false) }, Modifier.heightIn(min = 44.dp)) { Text("Отмена") } })
}

/** Запрос переноса: дата, причина из справочника системы, комментарий; решает регионал. */
@Composable
fun MoveDialog(objectId: String, title: String, onClose: () -> Unit) {
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    val today = remember { Days.today() }
    val reasons by produceState<List<String>?>(null) { value = withContext(Background) { Estate.moveReasons() } }
    var date by remember { mutableStateOf<String?>(null) }
    var reason by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(onDismissRequest = { if (!busy) onClose() }, title = { Text("Перенести задачу") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(title, style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
                Text("На какой день", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                DayChips(Days.add(today, 1), 28, date, { date = it })
                Text("Причина", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                val list = reasons
                if (list == null) CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
                else list.forEach { r ->
                    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(8.dp)).clickable { reason = r }, verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(reason == r, { reason = r }); Text(r)
                    }
                }
                OutlinedTextField(note, { note = it }, Modifier.fillMaxWidth(), label = { Text("Комментарий") }, minLines = 2)
            }
        },
        confirmButton = { Button(onClick = {
            val d = date ?: return@Button
            val r = reason ?: return@Button
            busy = true
            scope.launch {
                val ok = withContext(Background) { Estate.move(objectId, d, r, note.trim()) }
                busy = false
                host.toast(if (ok) "Запрос отправлен регионалу: перенос на ${shortDate(d)}" else "Нет связи с E•state — повторите позже", long = !ok)
                if (ok) onClose()
            }
        }, enabled = !busy && date != null && reason != null, modifier = Modifier.heightIn(min = 44.dp).testTag("перенос отправить")) { Text("Отправить") } },
        dismissButton = { TextButton(onClick = onClose, Modifier.heightIn(min = 44.dp)) { Text("Отмена") } })
}

/** Метки переноса в карточке задачи: запрошен и ждёт решения; отклонён — со словами регионала. */
@Composable
fun MoveMarks(b: EstateObject) {
    b.moveReq?.let { r ->
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.primaryContainer).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Запрошен перенос на ${shortDate(r.date)}", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onPrimaryContainer)
            val why = listOf(r.reason, r.note).filter { it.isNotBlank() }.joinToString(" — ")
            if (why.isNotEmpty()) Text(why, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
        }
    }
    if (b.moveReq == null) b.moveRefused?.let { r ->
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(NOTICE).padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Перенос отклонён", fontWeight = FontWeight.SemiBold, color = ON_NOTICE)
            if (r.why.isNotBlank()) Text(r.why, style = MaterialTheme.typography.bodySmall, color = ON_NOTICE)
        }
    }
}

// ---------- Общее для экранов ----------

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun DayScaffold(title: String, close: () -> Unit, actions: @Composable () -> Unit = {}, content: @Composable (PaddingValues) -> Unit) {
    Scaffold(topBar = {
        TopAppBar(title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            navigationIcon = { IconButton(onClick = close) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад к списку") } },
            actions = { actions() })
    }, content = content)
}

@Composable
internal fun NoLink(retry: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Нет связи с E•state", style = MaterialTheme.typography.titleMedium)
        OutlinedButton(onClick = retry, Modifier.padding(top = 16.dp).heightIn(min = 44.dp)) { Text("Повторить") }
    }
}

@Composable
internal fun Loading() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

// ---------- Планы ----------

/** Планы: 28 дней вперёд — область, отсутствие, выезды; внизу — задачи без даты с «Взять на день». */
@Composable
fun PlansScreen(close: () -> Unit, open: (File) -> Unit) {
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    var version by remember { mutableStateOf(0) }
    var loaded by remember { mutableStateOf(false) }
    val plans by produceState<kg.osmotr.core.EstatePlans?>(null, version) { value = withContext(Background) { Estate.plans(28) }; loaded = true }
    var taking by remember { mutableStateOf<EstatePlanItem?>(null) }
    val today = remember { Days.today() }
    fun openItem(i: EstatePlanItem) { scope.launch { estateDirOf(i.objectId)?.let(open) ?: host.toast("Объекта нет на устройстве — обновите список") } }

    DayScaffold("Планы", close) { pad ->
        val p = plans
        when {
            p == null && !loaded -> Loading()
            p == null -> NoLink { loaded = false; version++ }
            else -> LazyColumn(Modifier.padding(pad).fillMaxSize().testTag("планы"), contentPadding = PaddingValues(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (p.overdue.isNotEmpty()) {
                    item(key = "overdue") { EstateGroupHeader("Не сделано раньше", p.overdue.size) }
                    items(p.overdue, key = { "o|" + it.objectId }) { PlanRow(it, "с ${shortDate(it.date)}", { openItem(it) }, null) }
                }
                items(p.days, key = { "d|" + it.date }) { day ->
                    Column(Modifier.fillMaxWidth().panel().padding(12.dp).alpha(if (day.workday) 1f else 0.6f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(Days.head(day.date, today), Modifier.weight(1f), fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (!day.workday) Text("Нерабочий", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                        }
                        if (day.region.isNotBlank()) Text(day.region, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2, overflow = TextOverflow.Ellipsis)
                        if (day.absence.isNotBlank()) Text(day.absence, Modifier.clip(RoundedCornerShape(8.dp)).background(REPAIR_AMBER.copy(alpha = 0.14f))
                            .padding(horizontal = 8.dp, vertical = 3.dp), style = MaterialTheme.typography.labelMedium, color = REPAIR_AMBER, fontWeight = FontWeight.SemiBold)
                        day.items.forEach { PlanRow(it, "", { openItem(it) }, null, bare = true) }
                    }
                }
                if (p.noDate.isNotEmpty()) {
                    item(key = "nodate") { EstateGroupHeader("Без даты", p.noDate.size) }
                    items(p.noDate, key = { "n|" + it.objectId }) { PlanRow(it, "", { openItem(it) }, { taking = it }) }
                }
            }
        }
    }
    taking?.let { t -> TakeDialog(t.objectId, t.title, onClose = { ok -> taking = null; if (ok) version++ }) }
}

/** Выезд в плане: название, состояние, запрос переноса; [take] — «Взять на день» (у задач без даты). [bare] — без панели, внутри дня. */
@Composable
private fun PlanRow(i: EstatePlanItem, since: String, onClick: () -> Unit, take: (() -> Unit)?, bare: Boolean = false) {
    Row((if (bare) Modifier.fillMaxWidth() else Modifier.fillMaxWidth().panel()).clickable(onClick = onClick).heightIn(min = 44.dp).padding(horizontal = if (bare) 0.dp else 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.weight(1f)) {
            Text(i.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val sub = listOf(since, i.moveReq?.let { "Запрошен перенос на ${shortDate(it.date)}" }.orEmpty()).filter { it.isNotEmpty() }.joinToString(" · ")
            if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (take != null) TextButton(onClick = take, Modifier.heightIn(min = 44.dp).testTag("взять на день")) { Text("Взять на день", maxLines = 1) }
        else Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ---------- Уведомления ----------

/**
 * Уведомления: лента за 14 дней, новые сверху; непрочитанные выделены. Прочитанным всё становится при открытии экрана
 * (номера хранятся на устройстве), выделение при этом остаётся до выхода. Нажатие — открыть объект.
 */
@Composable
fun NotesScreen(close: () -> Unit, open: (File) -> Unit) {
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    val notes by Estate.notes.collectAsStateWithLifecycle()
    var seen by remember { mutableStateOf<Set<String>?>(null) }
    var version by remember { mutableStateOf(0) }
    LaunchedEffect(version) {
        withContext(Background) { Estate.refreshNotes() }
        if (seen == null) {
            seen = Estate.read.value.orEmpty()
            withContext(Background) { Estate.markRead(Estate.notes.value.map { it.id }) }
        }
    }
    DayScaffold("Уведомления", close) { pad ->
        val was = seen
        when {
            was == null -> Loading()
            notes.isEmpty() -> Box(Modifier.padding(pad).fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                Text("За две недели уведомлений нет", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> LazyColumn(Modifier.padding(pad).fillMaxSize().testTag("уведомления"), contentPadding = PaddingValues(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(notes, key = { it.id }) { n ->
                    val fresh = n.id !in was
                    Row(Modifier.fillMaxWidth().panel(tint = if (fresh) MaterialTheme.colorScheme.primaryContainer else null)
                        .clickable(enabled = n.objectId.isNotEmpty()) {
                            scope.launch { estateDirOf(n.objectId)?.let(open) ?: host.toast("Объекта нет на устройстве") }
                        }.heightIn(min = 56.dp).padding(12.dp)
                        .semantics { contentDescription = (if (fresh) "Новое. " else "") + n.label + (if (n.text.isNotBlank()) ". " + n.text else "") },
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(n.label, Modifier.weight(1f), fontWeight = if (fresh) FontWeight.Bold else FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(Days.stamp(n.at), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                            }
                            if (n.text.isNotBlank()) Text(n.text, style = MaterialTheme.typography.bodySmall, maxLines = 4, overflow = TextOverflow.Ellipsis,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (n.objectId.isNotEmpty()) Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

// ---------- Отчёт дня ----------

private fun JsonObject?.str(key: String): String = (this?.get(key) as? JsonPrimitive)?.contentOrNull.orEmpty()
private fun JsonObject?.ids(key: String): Set<String> = (this?.get(key) as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }?.toSet().orEmpty()
private fun JsonObject?.partial(): Map<String, String> = ((this?.get("partial") as? JsonArray) ?: JsonArray(emptyList()))
    .mapNotNull { (it as? JsonObject)?.let { o -> o.str("assignId") to o.str("reason") } }.toMap()

private fun km(v: Double): String = (kotlin.math.round(v * 10) / 10).toString().removeSuffix(".0")

private enum class TripResult { NONE, DONE, PARTIAL, FAILED }

/**
 * Отчёт дня: переключатель дня (сегодня и назад), утро — «Начал день» с одометром, вечер — пробег по дорогам (подставлен,
 * можно поправить), выезды дня с исходом, комментарий. «Не состоялся» уходит тем же исходом, что в карточке объекта.
 */
@Composable
fun DayReportScreen(close: () -> Unit) {
    val today = remember { Days.today() }
    var date by remember { mutableStateOf(today) }
    var version by remember { mutableStateOf(0) }
    var loaded by remember { mutableStateOf(false) }
    val report by produceState<EstateDayReport?>(null, date, version) { loaded = false; value = null; value = withContext(Background) { Estate.report(date) }; loaded = true }
    DayScaffold("Отчёт", close) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { date = Days.add(date, -1) }, Modifier.size(48.dp).testTag("день назад")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Предыдущий день") }
                Text(Days.head(date, today), Modifier.weight(1f), fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                IconButton(onClick = { date = Days.add(date, 1) }, enabled = date < today, modifier = Modifier.size(48.dp).testTag("день вперёд")) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "Следующий день")
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            val r = report
            when {
                r == null && !loaded -> Loading()
                r == null -> NoLink { version++ }
                else -> androidx.compose.runtime.key(r.date, version) { ReportBody(r) { version++ } }
            }
        }
    }
}

@Composable
private fun ReportBody(r: EstateDayReport, reload: () -> Unit) {
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    val savedMorning = r.morning
    val savedEvening = r.evening
    val open = r.canFile
    var busy by remember { mutableStateOf(false) }

    var odometer by remember { mutableStateOf(savedMorning.str("odometer")) }
    var noOdometer by remember { mutableStateOf(savedMorning.str("noOdometer") == "true") }

    val routeText = r.routeKm?.let(::km).orEmpty()
    var kmText by remember { mutableStateOf(savedEvening.str("km").ifEmpty { routeText }) }
    var note by remember { mutableStateOf(savedEvening.str("note")) }
    val doneIds = savedEvening.ids("done")
    val partialSaved = savedEvening.partial()
    val result = remember { mutableStateMapOf<String, TripResult>().apply {
        r.trips.forEach { t -> this[t.assignId] = when {
            t.assignId in doneIds -> TripResult.DONE
            t.assignId in partialSaved -> TripResult.PARTIAL
            savedEvening == null && t.state == "done" -> TripResult.DONE
            else -> TripResult.NONE
        } }
    } }
    val reasonOf = remember { mutableStateMapOf<String, String>().apply { partialSaved.forEach { (k, v) -> this[k] = v } } }
    val failReason = remember { mutableStateMapOf<String, String>() }
    var tried by remember { mutableStateOf(false) }

    fun short(t: String) = t.ifBlank { "Объект" }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(8.dp).testTag("отчёт дня"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!open) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(NOTICE).padding(12.dp)) {
            Text("Срок сдачи отчёта за этот день прошёл", fontWeight = FontWeight.SemiBold, color = ON_NOTICE)
        }
        if (!r.workday) Text("Нерабочий день", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 4.dp))

        // Утро
        Column(Modifier.fillMaxWidth().panel().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Утро", style = MaterialTheme.typography.titleSmall)
            if (savedMorning != null) Text("День начат в ${Days.clock(savedMorning.str("at"))}", style = MaterialTheme.typography.bodyMedium, color = DONE_GREEN)
            OutlinedTextField(odometer, { odometer = it }, Modifier.fillMaxWidth(), label = { Text("Одометр, км (необязательно)") }, singleLine = true,
                enabled = open && !noOdometer, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
            Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(8.dp)).clickable(enabled = open) { noOdometer = !noOdometer },
                verticalAlignment = Alignment.CenterVertically) {
                Checkbox(noOdometer, { noOdometer = it }, enabled = open); Text("Одометра нет")
            }
            Button(onClick = {
                busy = true
                scope.launch {
                    val ans = withContext(Background) { Estate.saveMorning(r.date, odometer.trim(), noOdometer) }
                    busy = false
                    host.toast(if (ans.ok) "День начат" else ans.why, long = !ans.ok)
                    if (ans.ok) reload()
                }
            }, enabled = open && !busy, modifier = Modifier.fillMaxWidth().height(52.dp).testTag("начал день")) { Text(if (savedMorning == null) "Начал день" else "Обновить") }
        }

        // Вечер
        Column(Modifier.fillMaxWidth().panel().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Вечер", style = MaterialTheme.typography.titleSmall)
            if (savedEvening != null) Text("Отчёт сдан в ${Days.clock(savedEvening.str("at"))}", style = MaterialTheme.typography.bodyMedium, color = DONE_GREEN)
            OutlinedTextField(kmText, { kmText = it }, Modifier.fillMaxWidth().testTag("пробег"), label = { Text("Пробег, км") }, singleLine = true, enabled = open,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                supportingText = { Text(if (routeText.isNotEmpty()) "По дорогам (OSM): $routeText км — можно поправить" else "Маршрут по дорогам не посчитан — введите вручную") })

            Text("Выезды дня", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (r.trips.isEmpty()) Text("Выездов на этот день нет", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            r.trips.forEach { t ->
                val res = result[t.assignId] ?: TripResult.NONE
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)).padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(short(t.title), fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(TripResult.DONE to "Осмотрен", TripResult.PARTIAL to "Частично", TripResult.FAILED to "Не состоялся").forEach { (v, label) ->
                            FilterChip(res == v, { result[t.assignId] = if (res == v) TripResult.NONE else v }, { Text(label, maxLines = 1, softWrap = false) },
                                Modifier.heightIn(min = 44.dp), enabled = open)
                        }
                    }
                    if (res == TripResult.PARTIAL) OutlinedTextField(reasonOf[t.assignId].orEmpty(), { reasonOf[t.assignId] = it }, Modifier.fillMaxWidth(),
                        label = { Text("Причина (обязательна)") }, enabled = open, isError = tried && reasonOf[t.assignId].orEmpty().isBlank(), minLines = 2)
                    if (res == TripResult.FAILED) Column {
                        Text("Причина", style = MaterialTheme.typography.labelMedium, color = if (tried && failReason[t.assignId] == null) MaterialTheme.colorScheme.error
                            else MaterialTheme.colorScheme.onSurfaceVariant)
                        Estate.OUTCOMES.forEach { o ->
                            Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(8.dp)).clickable(enabled = open) { failReason[t.assignId] = o },
                                verticalAlignment = Alignment.CenterVertically) {
                                RadioButton(failReason[t.assignId] == o, { failReason[t.assignId] = o }, enabled = open); Text(o)
                            }
                        }
                    }
                }
            }
            OutlinedTextField(note, { note = it }, Modifier.fillMaxWidth(), label = { Text("Комментарий") }, minLines = 2, enabled = open)
            Button(onClick = {
                tried = true
                val bad = r.trips.any { t -> when (result[t.assignId]) {
                    TripResult.PARTIAL -> reasonOf[t.assignId].orEmpty().isBlank()
                    TripResult.FAILED -> failReason[t.assignId] == null
                    else -> false
                } }
                if (bad) { host.toast("Укажите причину у частично осмотренных и несостоявшихся", long = true); return@Button }
                busy = true
                scope.launch {
                    withContext(Background) {
                        r.trips.filter { result[it.assignId] == TripResult.FAILED }.forEach { t ->
                            runCatching { Estate.link?.outcome(t.objectId, failReason[t.assignId].orEmpty(), "") }
                        }
                    }
                    val ans = withContext(Background) {
                        Estate.saveEvening(r.date, kmText.trim(), kmText.trim().isNotEmpty() && kmText.trim() == routeText,
                            r.trips.filter { result[it.assignId] == TripResult.DONE }.map { it.assignId },
                            r.trips.filter { result[it.assignId] == TripResult.PARTIAL }.map { EstatePartial(it.assignId, reasonOf[it.assignId].orEmpty().trim()) },
                            note.trim())
                    }
                    busy = false
                    host.toast(if (ans.ok) "Отчёт сдан" else ans.why, long = !ans.ok)
                    if (ans.ok) reload()
                }
            }, enabled = open && !busy, modifier = Modifier.fillMaxWidth().height(52.dp).testTag("сдать отчёт")) {
                Text(if (savedEvening == null) "Сдать вечерний отчёт" else "Обновить отчёт")
            }
        }
    }
}
