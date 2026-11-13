package kg.osmotr.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.foundation.BorderStroke
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kg.osmotr.core.Background
import kg.osmotr.core.Estate
import kg.osmotr.core.File
import kg.osmotr.core.Params
import kg.osmotr.core.Store
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * Параметры осмотра литера или участка (автор, 29.10.2026: «Помимо папок добавляем пункт заполнения параметров.
 * Внутри — указание параметров, заполняемых на осмотре»): разделы и поля — как на экране осмотрщика в `inside`
 * (Params). Выбор — окном со списком, несколько — галочками, число и текст — полем. Сохраняется само, через
 * мгновение после правки, файлом в папке.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ParamsScreen(dir: File, form: Params.Form, close: () -> Unit) {
    val values = remember { mutableStateMapOf<String, Any>() }
    var loaded by remember { mutableStateOf(false) }
    var edits by remember { mutableStateOf(0) }
    LaunchedEffect(dir) {
        values.putAll(withContext(Background) { Params.load(dir) })
        // Госномер вводится при заведении ТС — повторно его не набирают.
        if (form == Params.Form.VEHICLE && Params.PLATE !in values) { values[Params.PLATE] = dir.name; edits++ }
        loaded = true
    }
    // Сохранение — через 400 мс после последней правки (набор числа или текста не пишет файл на каждую букву).
    LaunchedEffect(edits) {
        if (edits == 0) return@LaunchedEffect
        delay(400)
        val snapshot = values.toMap()
        withContext(Background) { Params.save(dir, snapshot) }
    }
    fun set(key: String, v: Any?) {
        if (v == null || (v is String && v.isBlank()) || (v is List<*> && v.isEmpty())) values.remove(key) else values[key] = v
        edits++
    }
    var choosing by remember { mutableStateOf<Params.Field?>(null) }
    var recording by remember { mutableStateOf(false) }
    val version by Store.version.collectAsStateWithLifecycle()
    val voices = rememberLoaded("записи|${dir.path}", version) { if (dir.isDirectory) Store.voiceNotes(dir) else emptyList() } ?: emptyList()
    val host = LocalHost.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    // Сеть у основного участка — сразу в файл и копией в литеры объекта (как в `inside`): литеры со своим
    // значением — с согласия. Потом значения экрана перечитываются: участок запомнил, что перенёс.
    val obj = remember(dir) { Params.objectOfLand(dir) }
    var asking by remember { mutableStateOf<Triple<String, String, List<Pair<File, String>>>?>(null) }
    fun carry(key: String, value: String, replaceOwn: Boolean) = scope.launch {
        val n = withContext(Background) { Params.carryFromLand(dir, key, value, replaceOwn) }
        values.clear(); values.putAll(withContext(Background) { Params.load(dir) })
        if (n > 0) host.toast("${if (value.isEmpty()) "Снято" else "Перенесено"} в литерах: $n")
    }
    fun setNet(key: String, v: Any?) {
        val value = v as? String ?: ""
        if (value.isEmpty()) values.remove(key) else values[key] = value
        scope.launch {
            val snapshot = values.toMap()
            val own = withContext(Background) { Params.save(dir, snapshot); Params.ownValues(obj!!, dir, key, value) }
            if (own.isNotEmpty() && value.isNotEmpty()) asking = Triple(key, value, own) else carry(key, value, replaceOwn = false)
        }
    }
    val needPhoto = form == Params.Form.VEHICLE && (rememberLoaded("нужен снимок|${dir.path}", version) { Estate.needsPhoto(dir) } == true)
    val p = Params.progress(form, values)

    Scaffold(topBar = {
        TopAppBar(
            title = {
                Column {
                    Text("Параметры осмотра", maxLines = 1)
                    Text("${dir.name} · ${p.filled} из ${p.total}" + (if (p.requiredLeft > 0) " · обязательных: ${p.requiredLeft}" else ""),
                        style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            },
            navigationIcon = { IconButton(onClick = close) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } },
        )
    }) { inner ->
        if (!loaded) return@Scaffold
        // Под клавиатурой — место: окно от края до края не ужимается само, и комментарий уходил под неё (автор, 03.11.2026).
        LazyColumn(Modifier.fillMaxSize().padding(inner).consumeWindowInsets(inner).imePadding().testTag("параметры"), contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)) {
            // Выявленное на месте ТС без снимка в систему не уходит (автор, 06.11.2026).
            if (needPhoto) item(key = "нужен снимок") {
                Text("Нужен хотя бы один снимок ТС", Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(NOTICE).padding(12.dp).testTag("нужен снимок ТС"),
                    color = ON_NOTICE, fontWeight = FontWeight.SemiBold)
            }
            for (section in Params.sections(form)) {
                val fields = section.fields.filter { it.visible(values) }
                if (fields.isEmpty()) continue
                // Раздел из одного поля с тем же названием («Тип ОИ», «Санузел») — без заголовка: подпись поля
                // и так его называет, повтор только занимает место.
                if (!(fields.size == 1 && fields[0].label == section.title)) item(key = "h:" + section.key) {
                    Text(section.title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(top = 8.dp, bottom = 2.dp))
                }
                // Короткие поля — парами в строку: форма вдвое ниже, и пробег стоит рядом со своей единицей.
                var i = 0
                while (i < fields.size) {
                    val f = fields[i]
                    val next = fields.getOrNull(i + 1)?.takeIf { f.half && it.half }
                    fun row(x: Params.Field, m: Modifier) = @Composable {
                        ParamRow(x, values[x.key], x.required(values), m, onPick = { choosing = x }, onText = { set(x.key, it) }, onVoice = { recording = true },
                            onGeo = { host.locate { place -> if (place != null) set(x.key, place) else host.toast("Геометка не получена: нет разрешения или спутников") } })
                    }
                    item(key = f.key) {
                        if (next == null) row(f, Modifier.fillMaxWidth())()
                        else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { row(f, Modifier.weight(1f))(); row(next, Modifier.weight(1f))() }
                    }
                    i += if (next == null) 1 else 2
                }
            }
            if (voices.isNotEmpty()) item(key = "голос") { VoiceNotesCard(voices) }
        }
    }
    if (recording) VoiceRecorderDialog(dir, onClose = { recording = false }, autoStart = true)
    choosing?.let { f ->
        ParamChoiceDialog(f, values[f.key], onDone = { v ->
            if (obj != null && f.key in Params.NET_KEYS) setNet(f.key, v) else set(f.key, v)
            choosing = null
        }, onCancel = { choosing = null })
    }
    asking?.let { (key, value, own) ->
        ReplaceOwnDialog(value, own, onReplace = { asking = null; carry(key, value, replaceOwn = true) },
            onKeep = { asking = null; carry(key, value, replaceOwn = false) })
    }
}

/** Строка поля: подпись (со звёздочкой у обязательного) и значение; выбор — касанием, число и текст — полем. */
@Composable
internal fun ParamRow(f: Params.Field, value: Any?, required: Boolean, modifier: Modifier, onPick: () -> Unit = {}, onText: (String) -> Unit = {}, onGeo: () -> Unit = {}, onVoice: () -> Unit = {}) {
    val label = f.label + if (required) " *" else ""
    when (f.kind) {
        Params.Kind.NUMBER, Params.Kind.TEXT -> {
            val host = LocalHost.current
            var text by remember(f.key, value) { mutableStateOf(value as? String ?: "") }
            val mic = f.voice && host.canRecord
            Box(modifier) {
                OutlinedTextField(text, { text = if (f.kind == Params.Kind.NUMBER) it.filter { c -> c.isDigit() || c == ',' || c == '.' } else it; onText(text) },
                    Modifier.fillMaxWidth().testTag("поле: ${f.key}"), label = { Text(label) },
                    supportingText = if (f.hint.isNotEmpty()) ({ Text(f.hint) }) else null,
                    // Пустое место справа — чтобы текст не заходил под плашку микрофона.
                    trailingIcon = when {
                        f.geo && host.canLocate -> ({ IconButton(onGeo) { Icon(Icons.Default.Place, "Прикрепить геометку") } })
                        mic -> ({ Spacer(Modifier.width(48.dp)) })
                        else -> null
                    },
                    singleLine = f.kind == Params.Kind.NUMBER, minLines = if (mic) 3 else 1,
                    keyboardOptions = if (f.kind == Params.Kind.NUMBER) KeyboardOptions(keyboardType = KeyboardType.Number) else KeyboardOptions.Default)
                if (mic) Box(Modifier.align(Alignment.TopEnd).padding(top = 14.dp, end = 8.dp).size(44.dp).clip(MaterialTheme.shapes.small)
                    .background(MaterialTheme.colorScheme.primaryContainer).clickable(onClick = onVoice).testTag("голосовой комментарий")
                    .voiceLabel("Записать голосовой комментарий"), contentAlignment = Alignment.Center) {
                    Icon(AppIcons.Mic, null, Modifier.size(22.dp), tint = MaterialTheme.colorScheme.primary)
                }
            }
        }
        else -> {
            // Выбор выглядит так же, как ввод: то же обведённое поле, стрелка вниз говорит, что откроется список.
            // Касание — поверх поля: поле только для чтения клавиатуру не поднимает, но касание забирает себе.
            val shown = when (value) { is List<*> -> value.joinToString(", "); is String -> value; else -> "" }
            val empty = required && shown.isEmpty()
            Box(modifier) {
                OutlinedTextField(shown.ifEmpty { "не заполнено" }, {}, Modifier.fillMaxWidth(), readOnly = true, label = { Text(label) },
                    singleLine = true, trailingIcon = { Icon(Icons.Default.ArrowDropDown, null) },
                    colors = if (empty) OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = NOTICE, unfocusedContainerColor = NOTICE, focusedBorderColor = ON_NOTICE, unfocusedBorderColor = ON_NOTICE,
                        focusedLabelColor = ON_NOTICE, unfocusedLabelColor = ON_NOTICE, focusedTextColor = ON_NOTICE, unfocusedTextColor = ON_NOTICE,
                        focusedTrailingIconColor = ON_NOTICE, unfocusedTrailingIconColor = ON_NOTICE)
                    else if (shown.isEmpty()) OutlinedTextFieldDefaults.colors(focusedTextColor = MaterialTheme.colorScheme.onSurfaceVariant, unfocusedTextColor = MaterialTheme.colorScheme.onSurfaceVariant)
                    else OutlinedTextFieldDefaults.colors())
                Box(Modifier.matchParentSize().clickable(onClick = onPick).testTag("поле: ${f.key}").voiceLabel("$label: ${shown.ifEmpty { "не заполнено" }}"))
            }
        }
    }
}

/** «Заменить у литеров со своим значением?» — у кого своё, со значением; «Оставить своё» — перенести только в остальные. */
@Composable
fun ReplaceOwnDialog(value: String, own: List<Pair<File, String>>, onReplace: () -> Unit, onKeep: () -> Unit) {
    AlertDialog(
        onDismissRequest = onKeep,
        title = { Text("Заменить у литеров со своим значением?") },
        text = { DialogBody { Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Поставить «$value» и у них:", style = MaterialTheme.typography.bodyMedium)
            own.forEach { (b, v) -> Text("${b.name} — $v", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } } },
        confirmButton = { TextButton(onClick = onReplace, modifier = Modifier.testTag("заменить у всех")) { Text("Заменить у всех") } },
        dismissButton = { TextButton(onClick = onKeep) { Text("Оставить своё") } },
    )
}

private val NET_NAMES = mapOf("electricity" to "Электроснабжение", "centralWater" to "Водоснабжение", "sewerage" to "Канализация",
    "gasification" to "Газификация", "centralHeating" to "Отопление")

/**
 * «Инженерные сети — для всех литеров» в «Недвижимом» объекта (в `inside` 16.10.2026: «можем заполнить для всех
 * разом, однако внутри каждой карточки… всё ещё можно поменять отдельно»): у каждой сети — общее значение или
 * «Разные»; выбор ставится всем, своё другое значение литера — с согласия.
 */
@Composable
fun NetsForAllCard(obj: File) {
    val host = LocalHost.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val version by Store.version.collectAsStateWithLifecycle()
    val state by androidx.compose.runtime.produceState<Pair<Int, Map<String, String?>>?>(null, obj, version) {
        value = withContext(Background) { kg.osmotr.core.Objects.buildings(obj).size to Params.NET_KEYS.associateWith { Params.commonValue(obj, it) } }
    }
    val (count, common) = state ?: return
    if (count == 0) return
    val fields = remember { Params.sections(Params.Form.BUILDING).first { it.key == "nets" }.fields }
    var choosing by remember { mutableStateOf<Params.Field?>(null) }
    var asking by remember { mutableStateOf<Pair<String, String>?>(null) }
    fun apply(key: String, value: String, replaceOwn: Boolean) = scope.launch {
        val n = withContext(Background) { Params.setForAll(obj, key, value, replaceOwn) }
        host.toast("Поставлено в литерах: $n из $count")
    }
    // Одна тихая строка (автор, 02.11.2026: «Очень страшно эта вещь выглядит… Не нужен отвлекающий шум»):
    // пять сетей и пояснение занимали экран над литерами. Сети — только когда их открыли.
    var open by remember { mutableStateOf(false) }
    val set = fields.count { !common[it.key].isNullOrEmpty() }
    Column(Modifier.fillMaxWidth().testTag("сети для всех")) {
        Row(Modifier.fillMaxWidth().clickable { open = !open }.padding(horizontal = 4.dp, vertical = 10.dp).testTag("сети для всех: открыть"),
            verticalAlignment = Alignment.CenterVertically) {
            Text("Сети для всех литеров", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            Text("$set из ${fields.size}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Icon(if (open) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown, if (open) "Свернуть" else "Развернуть",
                Modifier.padding(start = 4.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (open) fields.forEach { f ->
            val v = common[f.key]
            Row(Modifier.fillMaxWidth().clickable { choosing = f }.padding(horizontal = 4.dp, vertical = 8.dp).testTag("для всех: ${f.key}"),
                verticalAlignment = Alignment.CenterVertically) {
                Text(NET_NAMES[f.key] ?: f.label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                Text(when { v == null -> "Разные"; v.isEmpty() -> "—"; else -> v }, style = MaterialTheme.typography.bodyMedium,
                    color = if (v.isNullOrEmpty()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary)
            }
        }
    }
    choosing?.let { f ->
        ParamChoiceDialog(f, common[f.key], onDone = { v ->
            choosing = null
            val value = v as? String ?: ""
            scope.launch {
                val differs = withContext(Background) { kg.osmotr.core.Objects.buildings(obj).any { (Params.load(it)[f.key] as? String ?: "").let { x -> x.isNotEmpty() && x != value } } }
                if (differs && value.isNotEmpty()) asking = f.key to value else apply(f.key, value, replaceOwn = true)
            }
        }, onCancel = { choosing = null })
    }
    asking?.let { (key, value) ->
        val own = kg.osmotr.core.Objects.buildings(obj).mapNotNull { b -> (Params.load(b)[key] as? String)?.takeIf { it.isNotEmpty() && it != value }?.let { b to it } }
        ReplaceOwnDialog(value, own, onReplace = { asking = null; apply(key, value, replaceOwn = true) },
            onKeep = { asking = null; apply(key, value, replaceOwn = false) })
    }
}

/** Выбор значения — окно со списком: один вариант (кружок) или несколько (галочки); «Очистить» — снять. */
@Composable
fun ParamChoiceDialog(f: Params.Field, value: Any?, onDone: (Any?) -> Unit, onCancel: () -> Unit) {
    val multi = f.kind == Params.Kind.MULTI
    val picked = remember { mutableStateMapOf<String, Boolean>().apply { (value as? List<*>)?.forEach { put(it.toString(), true) } } }
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(f.label) },
        text = { DialogBody { ParamOptions(f, value, picked, onPick = { if (!multi) onDone(it) }) } },
        confirmButton = { if (multi) TextButton(onClick = { onDone(f.options.filter { picked[it] == true }) }, modifier = Modifier.testTag("готово")) { Text("Готово") } },
        dismissButton = { TextButton(onClick = { onDone(null) }) { Text("Очистить") } },
    )
}

/** Варианты окна выбора — отдельно (тесты экранов проверяют их без окна). */
@Composable
fun ParamOptions(f: Params.Field, value: Any?, picked: MutableMap<String, Boolean>, onPick: (String) -> Unit) {
    val multi = f.kind == Params.Kind.MULTI
    LazyColumn(Modifier.heightIn(max = 420.dp)) {
        items(f.options.size) { k ->
            val o = f.options[k]
            Row(Modifier.fillMaxWidth().clickable { if (multi) picked[o] = picked[o] != true else onPick(o) }.padding(vertical = 2.dp).testTag("вариант: $o"),
                verticalAlignment = Alignment.CenterVertically) {
                if (multi) Checkbox(picked[o] == true, { picked[o] = it }) else RadioButton(value == o, { onPick(o) })
                Text(o, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

/**
 * Верх папки литера, участка или ТС — одна полоса из двух кнопок (автор, 03.11.2026: «Надо качественно пересмотреть
 * навигацию. Сейчас половина экрана в никуда»; выбрано «две короткие кнопки в один ряд»): «Параметры» — жёлтая с рамкой,
 * пока обязательное пусто, зелёная — когда заполнено (02.11.2026), с типом ОИ у литера; «Как снимать» — подходящая
 * инструкция (Instructions.forPlace): одна — сразу, несколько или тип не выбран — список снизу и «Все инструкции».
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaceBar(dir: File, form: Params.Form, openParams: () -> Unit, openInstruction: (String?) -> Unit) {
    val version by Store.version.collectAsStateWithLifecycle()
    val state by androidx.compose.runtime.produceState<Triple<Params.Progress, String?, kg.osmotr.core.Instructions.Advice>?>(null, dir, version) {
        value = withContext(Background) {
            val v = Params.load(dir)
            val obj = kg.osmotr.core.Objects.of(dir)
            val house = obj != null && kg.osmotr.core.Objects.buildings(obj).any { Params.oiType(it) == Params.HOUSE }
            Triple(Params.progress(form, v), v[Params.OBJ_KIND] as? String, kg.osmotr.core.Instructions.forPlace(form, v, house))
        }
    }
    val entries by androidx.compose.runtime.produceState(emptyMap<String, kg.osmotr.core.Instructions.Entry>()) {
        value = withContext(Background) { runCatching { InstructionLibrary.index().associateBy { it.id } }.getOrDefault(emptyMap()) }
    }
    var choosing by remember { mutableStateOf(false) }
    val s = state
    Row(Modifier.fillMaxWidth().height(androidx.compose.foundation.layout.IntrinsicSize.Min).heightIn(min = 64.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (s == null) return@Row
        val (p, oiType, advice) = s
        val ready = p.requiredLeft == 0 && p.filled > 0
        val ink = if (ready) DONE_GREEN else ON_NOTICE
        val status = if (p.requiredLeft > 0) "обязательных: ${p.requiredLeft}" else "${p.filled} из ${p.total}"
        BarButton(Modifier.weight(1f).testTag("карточка параметров")
            .voiceLabel(if (ready) "Параметры осмотра заполнены" else "Параметры осмотра не заполнены"),
            icon = if (form == Params.Form.BUILDING) AppIcons.oiType(oiType) ?: AppIcons.Folder else AppIcons.Checklist,
            title = "Параметры", line = listOfNotNull(if (form == Params.Form.BUILDING) oiType ?: "тип ОИ не указан" else null, status).joinToString("\n"),
            ink = ink, container = if (ready) DONE_GREEN.copy(alpha = 0.12f) else NOTICE, border = ink, lineTag = "тип ОИ литера".takeIf { form == Params.Form.BUILDING },
            onClick = openParams)
        BarButton(Modifier.weight(1f).testTag("как снимать"), icon = AppIcons.MenuBook, title = "Как снимать",
            line = advice.best?.let { entries[it]?.short } ?: "выберите вид",
            ink = MaterialTheme.colorScheme.onSurface, container = MaterialTheme.colorScheme.surfaceVariant, border = null,
            onClick = { val only = advice.best?.takeIf { advice.more.isEmpty() }; if (only != null) openInstruction(only) else choosing = true })
        if (choosing) androidx.compose.material3.ModalBottomSheet(onDismissRequest = { choosing = false }) {
            Column(Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
                Text(if (advice.best == null) "Укажите тип ОИ в параметрах — подскажем точнее. Пока — все по недвижимости:" else "Как снимать",
                    style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
                advice.all.forEach { id -> entries[id]?.let { e ->
                    Row(Modifier.fillMaxWidth().clickable { choosing = false; openInstruction(id) }.padding(horizontal = 20.dp, vertical = 14.dp)
                        .testTag("подсказка: $id"), verticalAlignment = Alignment.CenterVertically) {
                        Icon(AppIcons.MenuBook, null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.padding(end = 14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(e.title, style = MaterialTheme.typography.bodyLarge)
                            if (id == advice.best) Text("подходит лучше всего", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                } }
                androidx.compose.material3.HorizontalDivider(Modifier.padding(vertical = 4.dp))
                Row(Modifier.fillMaxWidth().clickable { choosing = false; openInstruction(null) }.padding(horizontal = 20.dp, vertical = 14.dp)
                    .testTag("подсказка: все инструкции"), verticalAlignment = Alignment.CenterVertically) {
                    Icon(AppIcons.MenuBook, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(end = 14.dp))
                    Text("Все инструкции", style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
    }
}

/** Кнопка полосы: значок, название, строка состояния; низкая, на половину ширины. */
@Composable
private fun BarButton(modifier: Modifier, icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, line: String,
                      ink: androidx.compose.ui.graphics.Color, container: androidx.compose.ui.graphics.Color, border: androidx.compose.ui.graphics.Color?,
                      lineTag: String? = null, onClick: () -> Unit) {
    Card(modifier.fillMaxHeight().clickable(onClick = onClick), colors = CardDefaults.cardColors(containerColor = container),
        border = border?.let { BorderStroke(2.dp, it) }) {
        Row(Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, Modifier.padding(end = 10.dp).size(24.dp), tint = ink)
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.Bold, color = ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(line, style = MaterialTheme.typography.bodySmall, color = ink, maxLines = 2, overflow = TextOverflow.Ellipsis,
                    modifier = if (lineTag != null) Modifier.testTag(lineTag) else Modifier)
            }
        }
    }
}
