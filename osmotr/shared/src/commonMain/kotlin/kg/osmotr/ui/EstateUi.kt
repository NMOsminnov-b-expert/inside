package kg.osmotr.ui

import androidx.compose.ui.text.drawText
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kg.osmotr.core.Background
import kg.osmotr.core.Estate
import kg.osmotr.core.EstateObject
import kg.osmotr.core.File
import kg.osmotr.core.Store
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.log2
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sinh
import kotlin.math.tan

/*
 * Работа в системе E•state (ветка estate-integration; core/Estate.kt): вход, состояние отправки на главном,
 * назначение в объекте, карта назначенных объектов. Вид — тот же, что у приложения: панели [panel], нижняя
 * панель действий, Golos, свои оттенки темы (DONE_GREEN, REPAIR_AMBER, NOTICE).
 */

// ---------- Вход ----------

/**
 * Приложение в системе: сначала — кто вошёл в E•state и вход на устройстве, потом — само приложение, и с
 * ним сверка назначений и отправка снятого: по мере съёмки, а без связи — копится и уходит при следующей
 * попытке (раз в полминуты, по «Отправить», при «Обновить»). Вне системы — приложение как прежде.
 */
@Composable
fun EstateGate(host: Host, content: @Composable () -> Unit) {
    val link = host.estate
    if (link == null) { content(); return }
    remember(link) { Estate.link = link; true }
    var asked by remember { mutableStateOf(false) }
    var retry by remember { mutableStateOf(0) }
    LaunchedEffect(retry) { withContext(Background) { Store.ensureRoot(); Estate.start() }; asked = true }
    val user by Estate.user.collectAsStateWithLifecycle()
    val signed by Estate.signedIn.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val u = user
    when {
        !asked -> EstateWait("Вход через E•state…")
        u == null -> EstateNoSystem(retry = { asked = false; retry++ })
        !u.canInspect -> EstateMessage("Роль «${u.roleLabel.ifBlank { u.role }}» не осматривает объекты",
            "Войдите в E•state учётной записью осмотрщика.", "Вернуться в E•state") { link.exit() }
        !signed -> EstateLogin(u.person, u.roleLabel, enter = { Estate.signIn() }, back = { link.exit() })
        else -> {
            // Сверка назначений: при входе, по сообщению системы и раз в пять минут.
            LaunchedEffect(Unit) {
                link.onChanged { scope.launch { runCatching { withContext(Background) { Estate.pull() } } } }
                while (true) {
                    runCatching { withContext(Background) { Estate.pull() } }
                    delay(300_000)
                }
            }
            // Отправка — по мере съёмки (изменилось хранилище), без связи — повтор раз в полминуты.
            val version by Store.version.collectAsStateWithLifecycle()
            LaunchedEffect(version) {
                delay(1_500)
                withContext(Background) { Estate.recount(); Estate.sendAll() }
            }
            LaunchedEffect(Unit) {
                while (true) {
                    delay(30_000)
                    if (Estate.status.value.pending > 0) withContext(Background) { Estate.sendAll() }
                }
            }
            content()
        }
    }
}

@Composable
private fun EstateWait(text: String) {
    Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator()
        Text(text, Modifier.padding(top = 16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun EstateMessage(title: String, text: String, action: String, onAction: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        Text(text, Modifier.padding(top = 8.dp, bottom = 24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        OutlinedButton(onClick = onAction) { Text(action) }
    }
}

@Composable
private fun EstateNoSystem(retry: () -> Unit) =
    EstateMessage("Нет связи с E•state", "Вход на этом устройстве ещё не выполнялся — без связи войти нельзя.", "Повторить", retry)

/** Вход учётной записью E•state: человек — тот, кто вошёл в систему; на устройстве вход помнится. */
@Composable
private fun EstateLogin(person: String, role: String, enter: () -> Unit, back: () -> Unit) {
    Box(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 420.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Осмотр", style = MaterialTheme.typography.headlineSmall)
            Text("Вход через E•state", Modifier.padding(top = 4.dp, bottom = 24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Column(Modifier.fillMaxWidth().panel().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Initials(person, 56)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(person, style = MaterialTheme.typography.titleMedium)
                    if (role.isNotBlank()) Text(role, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Button(onClick = enter, Modifier.fillMaxWidth().height(52.dp).testTag("войти")) { Text("Войти как $person") }
                Text("Назначенные вам объекты появятся сами. Снятое уходит в E•state по мере съёмки, без связи — копится на устройстве.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            }
            TextButton(onClick = back, Modifier.padding(top = 12.dp)) { Text("Вернуться в E•state") }
        }
    }
}

@Composable
private fun Initials(person: String, size: Int) {
    val letters = person.split(' ', '.').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }
    Box(Modifier.size(size.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
        Text(letters, color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.SemiBold,
            style = if (size >= 48) MaterialTheme.typography.titleMedium else MaterialTheme.typography.labelLarge)
    }
}

// ---------- Маршрут ----------

/** Навигатор для «Маршрута» — на выбор человека (автор, 03.11.2026: «На выбор пользователя»); выбор помнится. */
object Navigators {
    class App(val key: String, val title: String, val url: (Double, Double) -> String)
    val ALL = listOf(
        App("google", "Google Карты") { la, lo -> "https://www.google.com/maps/dir/?api=1&destination=$la,$lo" },
        App("yandex", "Яндекс Карты") { la, lo -> "https://yandex.ru/maps/?rtext=~$la,$lo&rtt=auto" },
        App("2gis", "2ГИС") { la, lo -> "https://2gis.kg/routeSearch/rsType/car/to/$lo,$la" },
    )
    private const val PREF = ".навигатор"
    fun saved(): App? = runCatching { File(Store.root, PREF).readText().trim() }.getOrNull()?.let { k -> ALL.firstOrNull { it.key == k } }
    fun save(a: App?) { if (a == null) File(Store.root, PREF).delete() else Store.writeDurably(File(Store.root, PREF), a.key.encodeToByteArray()) }
}

/** «Маршрут» до точки: навигатор выбран — сразу в него, нет — спросить (с «Запомнить»). */
@Composable
fun RouteButton(lat: Double, lon: Double, modifier: Modifier = Modifier) {
    val host = LocalHost.current
    var choosing by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { Navigators.saved()?.let { host.openUrl(it.url(lat, lon)) } ?: run { choosing = true } }, modifier.testTag("маршрут")) {
        Icon(AppIcons.Directions, null, Modifier.size(18.dp)); Spacer(Modifier.size(6.dp)); Text("Маршрут")
    }
    if (choosing) {
        var keep by remember { mutableStateOf(true) }
        AlertDialog(onDismissRequest = { choosing = false }, title = { Text("Чем проложить маршрут") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Navigators.ALL.forEach { a ->
                        TextButton(onClick = { if (keep) Navigators.save(a); choosing = false; host.openUrl(a.url(lat, lon)) }, Modifier.fillMaxWidth()) {
                            Text(a.title, Modifier.fillMaxWidth())
                        }
                    }
                    Row(Modifier.clickable { keep = !keep }, verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(keep, { keep = it }); Text("Запомнить выбор", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            },
            confirmButton = {}, dismissButton = { TextButton(onClick = { choosing = false }) { Text("Отмена") } })
    }
}

// ---------- Состояние назначения ----------

/** Дата «ГГГГ-ММ-ДД…» → «ДД.ММ». */
fun shortDate(iso: String): String = iso.takeIf { it.length >= 10 }?.let { "${it.substring(8, 10)}.${it.substring(5, 7)}" } ?: iso

/** Состояние назначения словом и цветом — на плитке, в карточке объекта, на карте. */
@Composable
fun estateState(b: EstateObject): Pair<String, Color> = when {
    b.removed -> "Снято регионалом" to MaterialTheme.colorScheme.onSurfaceVariant
    b.state == "done" -> "Закончен" to DONE_GREEN
    b.isReturned -> "На доосмотр" to REPAIR_AMBER
    b.state == "progress" -> "В работе" to MaterialTheme.colorScheme.primary
    else -> "Назначено" to MaterialTheme.colorScheme.onSurface
}

/** Строка плитки: состояние и ближайшая дата (срок — для незаконченного). */
@Composable
fun estateTileLine(b: EstateObject): Pair<String, Color> {
    val (word, color) = estateState(b)
    val date = when {
        b.removed || b.state == "done" -> ""
        b.deadline.isNotEmpty() -> " · до ${shortDate(b.deadline)}"
        b.plannedAt.isNotEmpty() -> " · ${shortDate(b.plannedAt)}"
        else -> ""
    }
    return (word + date) to color
}

/** Цвета состояний, взятые из темы заранее, — для рисования (карта). */
private class StateTones(val done: Color, val returned: Color, val progress: Color, val muted: Color, val assigned: Color) {
    fun of(b: EstateObject): Color = when {
        b.removed -> muted
        b.state == "done" -> done
        b.isReturned -> returned
        b.state == "progress" -> progress
        else -> assigned
    }
}

@Composable
private fun StateChip(b: EstateObject) {
    val (word, color) = estateState(b)
    Text(word, Modifier.clip(RoundedCornerShape(8.dp)).background(color.copy(alpha = 0.12f)).padding(horizontal = 8.dp, vertical = 3.dp),
        color = color, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
}

/**
 * Главный в системе: кто вошёл и что с отправкой — одной строкой над объектами. «Обновить» — сверить
 * назначения и отправить ждущее; «Отправить» — когда есть ждущее.
 */
@Composable
fun EstateBar(modifier: Modifier = Modifier) {
    val user by Estate.user.collectAsStateWithLifecycle()
    val st by Estate.status.collectAsStateWithLifecycle()
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    val busy = st.sending || st.pulling
    val (line, tone, icon) = when {
        st.sending -> Triple("Отправляется… осталось ${st.pending}", MaterialTheme.colorScheme.primary, AppIcons.CloudUpload)
        st.pending > 0 && st.offline -> Triple("Нет связи · ждут отправки: ${st.pending}", REPAIR_AMBER, AppIcons.CloudOff)
        st.pending > 0 -> Triple("Ждут отправки: ${st.pending}", REPAIR_AMBER, AppIcons.CloudUpload)
        st.offline -> Triple("Нет связи с E•state", REPAIR_AMBER, AppIcons.CloudOff)
        else -> Triple("Всё отправлено в E•state", DONE_GREEN, AppIcons.CloudDone)
    }
    Row(modifier.fillMaxWidth().panel().padding(start = 12.dp, end = 4.dp, top = 10.dp, bottom = 10.dp).testTag("e-state"),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Initials(user?.person.orEmpty(), 40)
        Column(Modifier.weight(1f)) {
            Text(user?.person.orEmpty(), fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(icon, null, Modifier.size(16.dp), tint = tone)
                Text(line, style = MaterialTheme.typography.bodySmall, color = tone, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (st.pending > 0 && !busy) TextButton(onClick = { scope.launch { withContext(Background) { Estate.sendAll() } } }) { Text("Отправить") }
        Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
            if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
            else IconButton(onClick = {
                scope.launch {
                    val n = runCatching { withContext(Background) { Estate.pull() } }
                    withContext(Background) { Estate.sendAll() }
                    n.onSuccess { host.toast("Назначено: ${plural(it, "объект", "объекта", "объектов")}") }
                        .onFailure { host.toast("Нет связи с E•state — снятое уйдёт позже") }
                }
            }, Modifier.testTag("обновить")) { Icon(Icons.Default.Refresh, "Обновить") }
        }
    }
}

/**
 * Назначение в объекте: состояние, сроки, слово регионала, возврат на доосмотр, отправка и «Осмотр закончен».
 * Сведения приходят из системы — правятся там, не здесь.
 */
@Composable
fun AssignmentCard(obj: File, b: EstateObject, modifier: Modifier = Modifier) {
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    val version by Store.version.collectAsStateWithLifecycle()
    val st by Estate.status.collectAsStateWithLifecycle()
    val pending = rememberLoaded("ждут|${obj.path}", version, st.pending, st.sending) { Estate.pending(obj).size } ?: 0
    var asking by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var failing by remember { mutableStateOf(false) }
    var moving by remember { mutableStateOf(false) }
    var missing by remember { mutableStateOf<List<Pair<String, Int>>>(emptyList()) }
    Column(modifier.fillMaxWidth().panel().padding(16.dp).testTag("назначение"), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StateChip(b)
            Text(listOf(b.typeLabel, b.eni.takeIf { it.isNotBlank() }?.let { "ЕНИ $it" }).filterNotNull().filter { it.isNotBlank() }.joinToString(" · "),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        val dates = listOfNotNull(b.plannedAt.takeIf { it.isNotEmpty() }?.let { "план ${shortDate(it)}" },
            b.deadline.takeIf { it.isNotEmpty() }?.let { "срок до ${shortDate(it)}" })
        if (dates.isNotEmpty() || (b.lat != null && b.lon != null)) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(dates.joinToString(" · ").replaceFirstChar { it.uppercase() }, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            if (b.lat != null && b.lon != null) RouteButton(b.lat, b.lon)
        }
        // Перенос (план 06.11.2026): запрошен — ждёт регионала, отклонён — его слова.
        MoveMarks(b)
        if (b.note.isNotBlank()) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(AppIcons.Notes, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.secondary)
            Column {
                Text(b.note, style = MaterialTheme.typography.bodyMedium)
                if (b.by.isNotBlank()) Text(b.by, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        // Задача ТС (автор, 06.11.2026): сведения «подпись — значение» и контакты учреждения; телефон — нажатием звонок.
        if (b.facts.isNotEmpty()) Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            b.facts.filter { it.value.isNotBlank() }.forEach { f ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(f.label, Modifier.widthIn(min = 110.dp, max = 160.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(f.value, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        if (b.contacts.isNotEmpty()) {
            val links = androidx.compose.ui.platform.LocalUriHandler.current
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Контакты учреждения", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                b.contacts.forEach { c ->
                    Column {
                        Text(c.name.ifBlank { "Без имени" }, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                        if (c.role.isNotBlank()) Text(c.role, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (c.phone.isNotBlank()) Text(c.phone, Modifier.clickable { runCatching { links.openUri("tel:" + c.phone.filter { it.isDigit() || it == '+' }) } }
                            .padding(vertical = 4.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
        // Возврат на доосмотр — жёлтым, по ОИ с причиной (ЦОД вернул — что доснять).
        val back = b.ois.filter { it.review == "returned" }
        if (b.isReturned) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(NOTICE).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Вернули на доосмотр", fontWeight = FontWeight.SemiBold, color = ON_NOTICE)
            back.forEach { Text("${it.label}${if (it.reason.isNotBlank()) " — ${it.reason}" else ""}", style = MaterialTheme.typography.bodyMedium, color = ON_NOTICE) }
            if (back.isEmpty()) b.returned.lastOrNull()?.reason?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = ON_NOTICE) }
        }
        // Сканы на пересъёмку (06.11.2026): документ, страницы, причина; «Переснять» — камера, файл с тем же именем в «Документы» того же ОИ.
        if (b.retakes.isNotEmpty() && !b.removed) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(NOTICE).padding(12.dp).testTag("переснять"),
            verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Переснять", fontWeight = FontWeight.SemiBold, color = ON_NOTICE)
            b.retakes.forEach { r ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(r.title.ifBlank { "Документ" }, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = ON_NOTICE, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(if (r.pages.isEmpty()) "все страницы" else "стр. " + r.pages.joinToString(", "), style = MaterialTheme.typography.bodySmall, color = ON_NOTICE)
                        if (r.reason.isNotBlank()) Text(r.reason, style = MaterialTheme.typography.bodySmall, color = ON_NOTICE, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    }
                    OutlinedButton(onClick = {
                        DocScan.start(host) { pages ->
                            val f = Estate.retakeInto(obj, b, r, pages)
                            "Пересъёмка «${f.name}» снята (${plural(pages.size, "страница", "страницы", "страниц")}) — уйдёт в E•state"
                        }
                    }, Modifier.heightIn(min = 44.dp).testTag("переснять документ")) { Text("Переснять") }
                }
            }
        }
        // ТС, выявленное на месте, без снимка не уходит в систему (автор, 06.11.2026).
        val noPhoto = rememberLoaded("без снимка|${obj.path}", version) { Estate.foundWithoutPhoto(obj).map { it.name } } ?: emptyList()
        if (noPhoto.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(NOTICE).padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Нужен хотя бы один снимок ТС", fontWeight = FontWeight.SemiBold, color = ON_NOTICE)
            Text(noPhoto.joinToString(", "), style = MaterialTheme.typography.bodySmall, color = ON_NOTICE)
        }
        // Документы назначения, у которых в системе нет файла, — названием (знать, что он есть, но скана нет).
        val noFile = b.docs.filter { !it.file }
        if (noFile.isNotEmpty()) Text("В системе без файла: " + noFile.joinToString(", ") { it.name.ifBlank { it.type } },
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis)
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(if (pending > 0) AppIcons.CloudUpload else AppIcons.CloudDone, null, Modifier.size(18.dp), tint = if (pending > 0) REPAIR_AMBER else DONE_GREEN)
            Text(if (pending > 0) "Ждут отправки: $pending" else "Всё снятое — в E•state", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        }
        // Не принятое системой — с причиной: ничего не теряется молча.
        val refused = rememberLoaded("отказы|${obj.path}", version, st.failed, st.sending) { Estate.failed(obj) } ?: emptyMap()
        if (refused.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(NOTICE).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Система не приняла: ${refused.size}", fontWeight = FontWeight.SemiBold, color = ON_NOTICE)
            refused.entries.take(4).forEach { (path, why) ->
                Text("${path.substringAfterLast('/')} — $why", style = MaterialTheme.typography.bodySmall, color = ON_NOTICE, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (refused.size > 4) Text("и ещё ${refused.size - 4}", style = MaterialTheme.typography.bodySmall, color = ON_NOTICE)
        }
        if (!b.removed) {
            if (b.state != "done") {
                Button(onClick = { scope.launch { missing = withContext(Background) { Estate.missing(obj) }; asking = true } }, enabled = !busy,
                    modifier = Modifier.fillMaxWidth().height(52.dp).testTag("осмотр закончен")) {
                    if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary) else Text("Осмотр закончен")
                }
                if (b.moveReq == null) OutlinedButton(onClick = { moving = true }, Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("перенести")) { Text("Перенести") }
                TextButton(onClick = { failing = true }, Modifier.fillMaxWidth().testTag("не состоялся")) { Text("Осмотр не состоялся") }
            } else OutlinedButton(onClick = {
                scope.launch { busy = true; val ok = withContext(Background) { Estate.finish(obj, done = false) }; busy = false
                    host.toast(if (ok) "Объект снова в работе" else "Нет связи с E•state") }
            }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Вернуть в работу") }
        } else Text("Назначение снято или передано другому осмотрщику. Снятое на устройстве можно выгрузить архивом.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    // Обязательное заполнено не всё — предупредить и отправить «неполный» (автор, 03.11.2026: «Предупредить, «неполный»»).
    if (asking) AlertDialog(onDismissRequest = { asking = false },
        title = { Text(if (missing.isEmpty()) "Закончить осмотр?" else "Заполнено не всё обязательное") },
        text = { Text(if (missing.isEmpty()) "Снятое уйдёт в E•state, объект — на проверку ЦОД."
            else missing.joinToString("\n") { (oi, n) -> "$oi — не заполнено: $n" } + "\n\nОсмотр уйдёт с отметкой «неполный».") },
        confirmButton = { Button(onClick = {
            asking = false
            scope.launch {
                busy = true
                val ok = withContext(Background) { Estate.finish(obj, incomplete = missing.isNotEmpty()) }
                busy = false
                host.toast(if (ok) "Осмотр закончен — объект на проверке" else "Не всё отправлено: нет связи. Нажмите ещё раз, когда появится связь", long = !ok)
            }
        }) { Text(if (missing.isEmpty()) "Закончить" else "Закончить как неполный") } },
        dismissButton = { TextButton(onClick = { asking = false }) { Text(if (missing.isEmpty()) "Отмена" else "Дозаполнить") } })
    if (moving) MoveDialog(b.id, b.title, onClose = { moving = false })
    // Осмотр не состоялся — причина из перечня и пояснение, регионалу (автор, 03.11.2026: исходы «Нужны»).
    if (failing) {
        val reasons = Estate.OUTCOMES.filter { it != "Другое ТС" || b.entity == "vehicle" || b.ois.any { o -> o.kind == "vehicle" } }
        var reason by remember { mutableStateOf(reasons.first()) }
        var note by remember { mutableStateOf("") }
        AlertDialog(onDismissRequest = { failing = false }, title = { Text("Осмотр не состоялся") },
            text = {
                Column {
                    reasons.forEach { r ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable { reason = r }, verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(reason == r, { reason = r }); Text(r)
                        }
                    }
                    OutlinedTextField(note, { note = it }, Modifier.fillMaxWidth().padding(top = 8.dp), label = { Text("Пояснение") }, minLines = 2)
                }
            },
            confirmButton = { Button(onClick = {
                failing = false
                scope.launch {
                    val ok = withContext(Background) { Estate.outcome(obj, reason, note.trim()) }
                    host.toast(if (ok) "Отправлено регионалу: $reason" else "Нет связи с E•state — повторите позже", long = !ok)
                }
            }) { Text("Отправить") } },
            dismissButton = { TextButton(onClick = { failing = false }) { Text("Отмена") } })
    }
}

/** Значок вида объекта оценки — в строке назначения. */
private fun typeIcon(typeId: String) = when (typeId) {
    "residential-house" -> AppIcons.House
    "apartment" -> AppIcons.Apartment
    "civil", "production" -> AppIcons.Business
    "land-plot" -> AppIcons.Map
    "mechanisms" -> AppIcons.Warehouse
    "vehicle" -> AppIcons.Truck
    else -> AppIcons.Folder
}

/**
 * Назначенный объект на главном — строкой, а не плиткой (на плитке в 104 dp адрес и срок не читались): адрес в
 * две строки, учреждение, состояние со сроком, сколько ОИ. Касание — в объект.
 */
@Composable
fun EstateObjectRow(b: EstateObject, onClick: () -> Unit, modifier: Modifier = Modifier, since: Boolean = false, onTake: (() -> Unit)? = null) {
    val (_, color) = estateState(b)
    Row(modifier.fillMaxWidth().panel().clickable(onClick = onClick).padding(12.dp).testTag("назначенный объект"),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(color.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
            Icon(typeIcon(b.typeId), null, Modifier.size(24.dp), tint = color)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(b.title, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
            if (b.institution.isNotBlank()) Text(b.institution, maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StateChip(b)
                val date = when {
                    b.removed || b.state == "done" -> ""
                    b.deadline.isNotEmpty() -> "до ${shortDate(b.deadline)}"
                    b.plannedAt.isNotEmpty() -> (if (since) "с " else "") + shortDate(b.plannedAt)
                    else -> ""
                }
                Text(listOf(date, b.ois.size.takeIf { it > 0 }?.let { "$it ОИ" }.orEmpty()).filter { it.isNotEmpty() }.joinToString(" · "),
                    style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
            b.moveReq?.let { Text("Запрошен перенос на ${shortDate(it.date)}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary,
                maxLines = 1, overflow = TextOverflow.Ellipsis) }
            // Задача без даты — взять на любой день (план 06.11.2026).
            if (onTake != null) TextButton(onClick = onTake, Modifier.heightIn(min = 44.dp).testTag("взять на день")) { Text("Взять на день", maxLines = 1) }
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Заголовок раздела законченных на главном: свёрнут — не мешает текущим (автор: «не перегружать интерфейс»). */
@Composable
fun EstateDoneHeader(count: Int, open: Boolean, toggle: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = toggle).padding(horizontal = 8.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Закончено · $count", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Icon(if (open) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown, if (open) "Свернуть" else "Развернуть",
            tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ---------- Карта ----------

private const val TILE = 256.0
private fun worldX(lon: Double, zoom: Double) = (lon + 180.0) / 360.0 * TILE * 2.0.pow(zoom)
private fun worldY(lat: Double, zoom: Double): Double {
    val r = lat.coerceIn(-85.0, 85.0) * PI / 180.0
    return (1.0 - ln(tan(r) + 1.0 / cos(r)) / PI) / 2.0 * TILE * 2.0.pow(zoom)
}
private fun lonOf(x: Double, zoom: Double) = x / (TILE * 2.0.pow(zoom)) * 360.0 - 180.0
private fun latOf(y: Double, zoom: Double) = atan(sinh(PI * (1.0 - 2.0 * y / (TILE * 2.0.pow(zoom))))) * 180.0 / PI

private class MapPoint(val dir: File, val b: EstateObject, val lat: Double, val lon: Double) {
    /** Контур участка из Кадастра (широта, долгота) — рисуется при приближении. */
    val ring: List<Pair<Double, Double>> = b.contour.filter { it.size >= 2 }.map { it[1] to it[0] }
}

/**
 * Карта назначенных объектов: подложка OpenStreetMap, точки — цветом состояния, «я здесь», касание точки —
 * объект снизу: открыть или проложить маршрут в навигаторе. Двигается пальцем и колесом, «+» и «−».
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen(close: () -> Unit, open: (File) -> Unit) {
    val host = LocalHost.current
    val version by Store.version.collectAsStateWithLifecycle()
    // Законченные — по выбору (по умолчанию на карте только то, куда ещё ехать).
    var withDone by remember { mutableStateOf(false) }
    val all = rememberLoaded("карта|точки", version) {
        Estate.bound().filter { !it.second.removed }.mapNotNull { (d, b) -> if (b.lat != null && b.lon != null) MapPoint(d, b, b.lat, b.lon) else null }
    } ?: emptyList()
    val points = remember(all, withDone) { all.filter { withDone || it.b.state != "done" } }
    val total = rememberLoaded("карта|всего", version, withDone) { Estate.bound().count { !it.second.removed && (withDone || it.second.state != "done") } } ?: 0
    val doneCount = all.count { it.b.state == "done" }
    var size by remember { mutableStateOf(IntSize.Zero) }
    var zoom by remember { mutableStateOf(11.0) }
    var center by remember { mutableStateOf(42.8746 to 74.5698) } // Бишкек — пока нет точек
    // Человек сдвинул карту сам — больше не подгонять под все точки (до «Все объекты»).
    var moved by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<MapPoint?>(null) }
    // Объекты в одной точке (один дом) — одной меткой с числом; касание — перечень, из него выбирается объект
    // (аудит 03.11.2026, п. 34: точки ложились одна на другую, нужную было не нажать). Точка — до метра.
    var group by remember { mutableStateOf<List<MapPoint>?>(null) }
    val spotOf = { p: MapPoint -> kotlin.math.round(p.lat * 1e5).toLong() to kotlin.math.round(p.lon * 1e5).toLong() }
    val spots = remember(points) { points.groupBy(spotOf).values.map { ps -> ps.sortedBy { Estate.rank(it.b) } } }
    val measurer = androidx.compose.ui.text.rememberTextMeasurer()
    var me by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    val tiles = remember { mutableStateMapOf<String, ImageBitmap>() }
    val loading = remember { HashSet<String>() }
    val density = LocalDensity.current

    fun fit() {
        if (size.width == 0) return
        val pts = points.map { it.lat to it.lon } + listOfNotNull(me)
        if (pts.isEmpty()) return
        val (minLat, maxLat) = pts.minOf { it.first } to pts.maxOf { it.first }
        val (minLon, maxLon) = pts.minOf { it.second } to pts.maxOf { it.second }
        center = (minLat + maxLat) / 2 to (minLon + maxLon) / 2
        val pad = with(density) { 96.dp.toPx() }
        val dx = worldX(maxLon, 0.0) - worldX(minLon, 0.0)
        val dy = worldY(minLat, 0.0) - worldY(maxLat, 0.0)
        val zx = if (dx > 0) log2((size.width - pad) / dx) else 16.0
        val zy = if (dy > 0) log2((size.height - pad * 2) / dy) else 16.0
        zoom = min(min(zx, zy), 16.0).coerceIn(3.0, 18.0)
    }
    LaunchedEffect(points, size) { if (!moved && size.width > 0 && points.isNotEmpty()) fit() }

    // Сдвиг на [dx],[dy] пикселей и масштаб вокруг точки [at] экрана.
    fun move(dx: Float, dy: Float) {
        val cx = worldX(center.second, zoom) - dx; val cy = worldY(center.first, zoom) - dy
        center = latOf(cy, zoom) to lonOf(cx, zoom)
    }
    fun zoomAt(at: Offset, by: Double) {
        val nz = (zoom + by).coerceIn(3.0, 18.0)
        val cx = worldX(center.second, zoom); val cy = worldY(center.first, zoom)
        val px = cx + (at.x - size.width / 2.0); val py = cy + (at.y - size.height / 2.0)
        val k = 2.0.pow(nz - zoom)
        val ncx = px * k - (at.x - size.width / 2.0); val ncy = py * k - (at.y - size.height / 2.0)
        zoom = nz
        center = latOf(ncy, nz) to lonOf(ncx, nz)
    }
    fun screenOf(lat: Double, lon: Double): Offset {
        val cx = worldX(center.second, zoom); val cy = worldY(center.first, zoom)
        return Offset((worldX(lon, zoom) - cx + size.width / 2.0).toFloat(), (worldY(lat, zoom) - cy + size.height / 2.0).toFloat())
    }

    // Клетки на экране — загрузить недостающие (держим не больше 300: остальные — прочь).
    val z = floor(zoom).toInt().coerceIn(0, 19)
    val scale = 2.0.pow(zoom - z)
    val step = TILE * scale
    val left = worldX(center.second, zoom) - size.width / 2.0
    val top = worldY(center.first, zoom) - size.height / 2.0
    val need = if (size.width == 0) emptyList() else buildList {
        val n = 1 shl z
        for (ty in floor(top / step).toInt()..floor((top + size.height) / step).toInt()) {
            if (ty < 0 || ty >= n) continue
            for (tx in floor(left / step).toInt()..floor((left + size.width) / step).toInt()) add(Triple(tx, ty, ((tx % n) + n) % n))
        }
    }
    LaunchedEffect(z, need.size, need.firstOrNull(), need.lastOrNull()) {
        if (tiles.size > 300) tiles.keys.filter { k -> need.none { "$z/${it.third}/${it.second}" == k } }.take(tiles.size - 200).forEach { tiles.remove(it) }
        for ((_, ty, wx) in need) {
            val key = "$z/$wx/$ty"
            if (key in tiles || key in loading) continue
            loading += key
            launch { host.mapTile(z, wx, ty)?.let { tiles[key] = it }; loading -= key }
        }
    }

    Scaffold(topBar = {
        TopAppBar(navigationIcon = { IconButton(onClick = close) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } },
            title = { Column {
                Text("Карта", style = MaterialTheme.typography.titleMedium)
                Text(if (points.size == total) plural(total, "объект", "объекта", "объектов") else "${points.size} из $total на карте — у остальных нет координат",
                    style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } })
    }) { inner ->
        Box(Modifier.fillMaxSize().padding(inner).onSizeChanged { size = it }.testTag("карта")) {
            val surface = MaterialTheme.colorScheme.surface
            val primary = MaterialTheme.colorScheme.primary
            val tones = StateTones(DONE_GREEN, REPAIR_AMBER, primary, MaterialTheme.colorScheme.onSurfaceVariant, primary)
            Canvas(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant)
                .pointerInput(Unit) { detectTransformGestures { c, pan, k, _ -> moved = true; if (k != 1f) zoomAt(c, log2(k.toDouble())); move(pan.x, pan.y) } }
                .pointerInput(Unit) {
                    awaitPointerEventScope {
                        while (true) {
                            val e = awaitPointerEvent()
                            if (e.type == PointerEventType.Scroll) {
                                val ch = e.changes.first()
                                moved = true
                                zoomAt(ch.position, -ch.scrollDelta.y.toDouble() * 0.35)
                                e.changes.forEach { it.consume() }
                            }
                        }
                    }
                }
                .pointerInput(points) {
                    detectTapGestures { at ->
                        val r = 28.dp.toPx()
                        val hit = points.minByOrNull { (screenOf(it.lat, it.lon) - at).getDistance() }?.takeIf { (screenOf(it.lat, it.lon) - at).getDistance() <= r }
                        val same = hit?.let { h -> points.filter { spotOf(it) == spotOf(h) } }.orEmpty()
                        if (same.size > 1) { group = same.sortedBy { Estate.rank(it.b) }; selected = null } else { selected = hit; group = null }
                    }
                }) {
                for ((tx, ty, wx) in need) {
                    val img = tiles["$z/$wx/$ty"] ?: continue
                    val x = (tx * step - left).toInt(); val y = (ty * step - top).toInt()
                    val s = (step + 0.5).toInt()
                    drawImage(img, srcOffset = IntOffset.Zero, srcSize = IntSize(img.width, img.height), dstOffset = IntOffset(x, y), dstSize = IntSize(s, s))
                }
                me?.let { (la, lo) ->
                    val c = screenOf(la, lo)
                    drawCircle(primary.copy(alpha = 0.18f), 22.dp.toPx(), c)
                    drawCircle(Color.White, 9.dp.toPx(), c)
                    drawCircle(primary, 6.5.dp.toPx(), c)
                }
                // Участки по Кадастру (подтягиваются по ЕНИ) — контуром цветом состояния, когда видно двор, а не город.
                if (zoom >= 13.5) for (p in points) {
                    if (p.ring.size < 3) continue
                    val path = androidx.compose.ui.graphics.Path()
                    p.ring.forEachIndexed { i, (la, lo) -> val o = screenOf(la, lo); if (i == 0) path.moveTo(o.x, o.y) else path.lineTo(o.x, o.y) }
                    path.close()
                    val c = tones.of(p.b)
                    drawPath(path, c.copy(alpha = 0.16f))
                    drawPath(path, c, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2.dp.toPx()))
                }
                for (ps in spots) {
                    // Цвет метки группы — самого срочного объекта в ней (возвращённый, затем в работе).
                    val p = ps.first()
                    val c = screenOf(p.lat, p.lon)
                    val many = ps.size > 1
                    val big = selected in ps || group?.firstOrNull()?.let { it in ps } == true
                    val r = (if (big) 13.dp else if (many) 11.dp else 9.dp).toPx()
                    drawCircle(Color.Black.copy(alpha = 0.18f), r + 2.dp.toPx(), c + Offset(0f, 1.5.dp.toPx()))
                    drawCircle(surface, r + 2.5.dp.toPx(), c)
                    drawCircle(tones.of(p.b), r, c)
                    if (many) {
                        val t = measurer.measure(ps.size.toString(), androidx.compose.ui.text.TextStyle(color = Color.White,
                            fontSize = androidx.compose.ui.unit.TextUnit(11f, androidx.compose.ui.unit.TextUnitType.Sp), fontWeight = FontWeight.Bold))
                        drawText(t, topLeft = c - Offset(t.size.width / 2f, t.size.height / 2f))
                    } else if (big || (p.b.state == "progress" && !p.b.isReturned)) {
                        // «В работе» — с белой серединой: тот же синий, что «Назначено», но видно, что начат.
                        drawCircle(surface, r * 0.38f, c)
                    }
                }
            }
            // Масштаб и «где я» — справа, в зоне большого пальца.
            Column(Modifier.align(Alignment.CenterEnd).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalIconButton(onClick = { zoomAt(Offset(size.width / 2f, size.height / 2f), 1.0) }, Modifier.size(48.dp)) { Icon(Icons.Default.Add, "Крупнее") }
                FilledTonalIconButton(onClick = { zoomAt(Offset(size.width / 2f, size.height / 2f), -1.0) }, Modifier.size(48.dp)) { Icon(AppIcons.Remove, "Мельче") }
                Spacer(Modifier.height(4.dp))
                if (host.canLocate) FilledTonalIconButton(onClick = {
                    host.locate { s ->
                        val g = s?.split(',')?.mapNotNull { it.trim().toDoubleOrNull() }
                        if (g == null || g.size < 2) host.toast("Место не определилось") else { me = g[0] to g[1]; center = g[0] to g[1]; if (zoom < 14) zoom = 14.0 }
                    }
                }, Modifier.size(48.dp)) { Icon(AppIcons.MyLocation, "Где я") }
                FilledTonalIconButton(onClick = { moved = false; fit() }, Modifier.size(48.dp)) { Icon(AppIcons.ZoomOutMap, "Все объекты") }
            }
            // Над картой — на своей подложке с тенью (прозрачный чип сливался с подписями карты; замечание автора 03.11.2026).
            if (doneCount > 0) Surface(Modifier.align(Alignment.TopStart).padding(12.dp), shape = RoundedCornerShape(10.dp),
                color = MaterialTheme.colorScheme.surface, shadowElevation = 3.dp) {
                FilterChip(selected = withDone, onClick = { withDone = !withDone }, label = { Text("Законченные · $doneCount") },
                    leadingIcon = if (withDone) ({ Icon(Icons.Default.Check, null, Modifier.size(18.dp)) }) else null,
                    colors = FilterChipDefaults.filterChipColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.padding(horizontal = 4.dp).testTag("законченные на карте"))
            }
            Text("© OpenStreetMap", Modifier.align(Alignment.BottomStart).padding(6.dp).clip(RoundedCornerShape(6.dp))
                .background(surface.copy(alpha = 0.8f)).padding(horizontal = 6.dp, vertical = 2.dp),
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            selected?.let { p -> MapCard(p, open = { open(p.dir) }, close = { selected = null }, modifier = Modifier.align(Alignment.BottomCenter)) }
            group?.let { ps -> MapGroupCard(ps, pick = { selected = it; group = null }, close = { group = null }, modifier = Modifier.align(Alignment.BottomCenter)) }
            if (points.isEmpty()) Text(if (total == 0) "Назначенных объектов нет" else "У назначенных объектов нет координат",
                Modifier.align(Alignment.TopCenter).padding(12.dp).panel().padding(horizontal = 14.dp, vertical = 10.dp),
                style = MaterialTheme.typography.bodyMedium)
        }
    }
}

/** Объекты в одной точке карты — перечнем: состояние и название; касание строки — карточка объекта. */
@Composable
private fun MapGroupCard(ps: List<MapPoint>, pick: (MapPoint) -> Unit, close: () -> Unit, modifier: Modifier = Modifier) {
    Surface(modifier.navigationBarsPadding().padding(8.dp).widthIn(max = 560.dp).fillMaxWidth(),
        shape = RoundedCornerShape(18.dp), tonalElevation = 3.dp, shadowElevation = 6.dp) {
        Column(Modifier.padding(vertical = 8.dp)) {
            Row(Modifier.padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("В этой точке — ${ps.size}", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                IconButton(onClick = close, Modifier.size(40.dp)) { Icon(Icons.Default.Close, "Закрыть") }
            }
            Column(Modifier.heightIn(max = 320.dp).verticalScroll(rememberScrollState())) {
                ps.forEach { p ->
                    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable { pick(p) }.padding(horizontal = 16.dp, vertical = 8.dp).testTag("объект в точке"),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StateChip(p.b)
                        // Под названием — срок и число ОИ, учреждение: в одном доме у объектов часто один адрес.
                        Column(Modifier.weight(1f)) {
                            Text(p.b.title, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
                            val sub = listOf(estateTileLine(p.b).first.substringAfter(" · ", ""), p.b.institution).filter { it.isNotBlank() }.joinToString(" · ")
                            if (sub.isNotBlank()) Text(sub, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MapCard(p: MapPoint, open: () -> Unit, close: () -> Unit, modifier: Modifier = Modifier) {
    Surface(modifier.navigationBarsPadding().padding(8.dp).widthIn(max = 560.dp).fillMaxWidth().clickable(onClick = open),
        shape = RoundedCornerShape(18.dp), tonalElevation = 3.dp, shadowElevation = 6.dp) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StateChip(p.b)
                val (line, _) = estateTileLine(p.b)
                Text(line.substringAfter(" · ", ""), Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                IconButton(onClick = close, Modifier.size(36.dp)) { Icon(Icons.Default.Close, "Закрыть") }
            }
            Text(p.b.title, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (p.b.geoSrc.isNotBlank()) Text("Участок по ${p.b.geoSrc.lowercase().replaceFirstChar { it.uppercase() }.let { if (it == "Кадастр") "Кадастру" else it }}" +
                (if (p.b.eni.isNotBlank()) " · ЕНИ ${p.b.eni}" else "") + (if (p.ring.size >= 3) " · контур на карте" else ""),
                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (p.b.institution.isNotBlank()) Text(p.b.institution, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
            // Сведения участка по Кадастру — подпись слева, значение справа; длинный список прокручивается внутри карточки.
            if (p.b.parcel.isNotEmpty()) Column(Modifier.heightIn(max = 200.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                p.b.parcel.forEach { f ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(f.label, Modifier.widthIn(min = 110.dp, max = 160.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(f.value, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = open, Modifier.weight(1f).height(48.dp)) { Text("Открыть") }
                RouteButton(p.lat, p.lon, Modifier.weight(1f).height(48.dp))
            }
        }
    }
}
