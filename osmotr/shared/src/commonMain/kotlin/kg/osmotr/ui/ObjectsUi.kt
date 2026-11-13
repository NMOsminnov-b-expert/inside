package kg.osmotr.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kg.osmotr.core.Background
import kg.osmotr.core.File
import kg.osmotr.core.Objects
import kg.osmotr.core.Store
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/*
 * Экраны объектов (автор, 29.10.2026): объект — название, учреждение и адрес (заранее, от регионального
 * менеджера), контакты; три категории — недвижимое, движимое, механизмы и оборудование (описи).
 */

/** Новый объект или правка сведений: название (только при создании), учреждение, адрес. */
@Composable
fun ObjectInfoDialog(
    title: String, confirm: String, initial: Objects.Info = Objects.Info(), askName: Boolean,
    onDone: (name: String, info: Objects.Info) -> Unit, onCancel: () -> Unit,
) {
    val form = remember { ObjectForm(initial) }
    val ok = !askName || Store.cleanName(form.name).isNotEmpty()
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(title) },
        text = { DialogBody { ObjectInfoFields(form, askName, onSubmit = { if (ok) onDone(form.name, form.info()) }) } },
        confirmButton = { TextButton(onClick = { onDone(form.name, form.info()) }, enabled = ok) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onCancel) { Text("Отмена") } },
    )
}

/** Что набрано в окне объекта. */
class ObjectForm(initial: Objects.Info = Objects.Info()) {
    var name by mutableStateOf("")
    var institution by mutableStateOf(initial.institution)
    var address by mutableStateOf(initial.address)
    fun info() = Objects.Info(institution, address)
}

/**
 * Поля окна объекта — отдельно от окна: окно с полем ввода в тестах экранов (Robolectric) не «успокаивается»,
 * и содержимое проверяется само по себе (как PlaceFolderChooser).
 */
@Composable
fun ObjectInfoFields(form: ObjectForm, askName: Boolean, onSubmit: () -> Unit) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { if (DialogFocus.auto) focus.requestFocus() }
    val words = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Next)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (askName) OutlinedTextField(form.name, { form.name = it }, Modifier.fillMaxWidth().focusRequester(focus).testTag("объект: название"),
            singleLine = true, keyboardOptions = words, label = { Text("Название объекта") },
            placeholder = { Text("Например, Школа № 5") })
        OutlinedTextField(form.institution, { form.institution = it },
            (if (askName) Modifier else Modifier.focusRequester(focus)).fillMaxWidth().testTag("объект: учреждение"),
            singleLine = true, keyboardOptions = words, label = { Text("Учреждение") })
        OutlinedTextField(form.address, { form.address = it }, Modifier.fillMaxWidth().testTag("объект: адрес"),
            keyboardOptions = words.copy(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { onSubmit() }),
            label = { Text("Адрес") })
    }
}

/**
 * Куда ложится новая опись — в какой объект (автор, 29.10.2026: «Всегда спрашивать объект»). [preferred] —
 * объект, откуда начали, выбран заранее; «Новый объект…» — завести и выбрать.
 */
@Composable
fun ObjectChoiceDialog(books: Int, preferred: File?, kinds: Boolean = false, onPick: (obj: File, asList: Boolean) -> Unit, onCancel: () -> Unit) {
    var version by remember { mutableStateOf(0) }
    val objects by produceState(emptyList<Pair<File, Objects.Info>>(), version) {
        value = withContext(Background) { Objects.all().map { it to Objects.info(it) } }
    }
    var chosen by remember { mutableStateOf(preferred) }
    var creating by remember { mutableStateOf(false) }
    var asList by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(when { kinds -> if (books == 1) "Книга Excel — в какой объект?" else "Книги Excel ($books) — в какой объект?"
            books == 1 -> "В какой объект опись?"; else -> "В какой объект описи ($books)?" }) },
        text = { DialogBody {
            Column {
                // Присланная книга — опись (осматривать по ней) или перечень (зданий и прочего: смотреть и искать).
                if (kinds) {
                    BookKinds(asList) { asList = it }
                    androidx.compose.material3.HorizontalDivider(Modifier.padding(vertical = 6.dp))
                }
                if (objects.isEmpty()) Text("Объектов пока нет — заведите первый.", color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 8.dp))
                LazyColumn(Modifier.heightIn(max = 360.dp)) {
                    items(objects.size) { k ->
                        val (obj, info) = objects[k]
                        Row(Modifier.fillMaxWidth().clickable { chosen = obj }.padding(vertical = 6.dp).testTag("объект: ${obj.name}"),
                            verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = chosen == obj, onClick = { chosen = obj })
                            Column {
                                Text(obj.name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                val line = listOf(info.institution, info.address).filter { it.isNotBlank() }.joinToString(" · ")
                                if (line.isNotEmpty()) Text(line, style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
                Row(Modifier.fillMaxWidth().clickable { creating = true }.padding(vertical = 10.dp, horizontal = 6.dp).testTag("новый объект"),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Icon(AppIcons.CreateNewFolder, null, tint = MaterialTheme.colorScheme.primary)
                    Text("Новый объект…", color = MaterialTheme.colorScheme.primary)
                }
            }
        } },
        confirmButton = { TextButton(onClick = { chosen?.let { onPick(it, asList) } }, enabled = chosen?.isDirectory == true) { Text("Сюда") } },
        dismissButton = { TextButton(onClick = onCancel) { Text("Отмена") } },
    )
    if (creating) ObjectInfoDialog("Новый объект", "Создать", askName = true,
        onDone = { name, info -> creating = false; chosen = Objects.create(name, info); version++ },
        onCancel = { creating = false })
}

/** Опись или перечень — для присланной книги (отдельно от окна — проверяется в тестах экранов сама по себе). */
@Composable
fun BookKinds(asList: Boolean, set: (Boolean) -> Unit) {
    Column {
        for ((list, title, note) in listOf(Triple(false, "Опись", "осматривать по ней — в «${Objects.MACHINES}»"),
                                           Triple(true, "Перечень", "зданий и прочего — в «${Objects.DOCS}»: смотреть и искать"))) {
            Row(Modifier.fillMaxWidth().clickable { set(list) }.padding(vertical = 4.dp).testTag("вид: $title"), verticalAlignment = Alignment.CenterVertically) {
                RadioButton(selected = asList == list, onClick = { set(list) })
                Column {
                    Text(title, fontWeight = FontWeight.SemiBold)
                    Text(note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

/**
 * Сообщение о выезде, разобранное (Brief): что заведётся — объект с кодом и учреждением, адрес, лица и
 * телефоны; с тем же кодом объект уже есть — «обновит», не второй.
 */
@Composable
fun BriefDialog(items: List<kg.osmotr.core.Brief.Item>, onDone: () -> Unit, onCancel: () -> Unit) {
    val existing by produceState(emptyMap<String, String>(), items) {
        value = withContext(Background) {
            val all = Objects.all()
            items.mapNotNull { i -> if (i.code.isEmpty()) null else all.firstOrNull { it.name == i.code || it.name.startsWith(i.code + " ") }?.let { i.code to it.name } }.toMap()
        }
    }
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(if (items.size == 1) "Сообщение о выезде" else "Сообщение о выезде: ${items.size}") },
        text = { DialogBody { BriefItems(items, existing) } },
        confirmButton = { TextButton(onClick = onDone, modifier = Modifier.testTag("завести из сообщения")) {
            Text(if (existing.size == items.size) "Обновить" else "Завести") } },
        dismissButton = { TextButton(onClick = onCancel) { Text("Отмена") } },
    )
}

/** Содержимое окна сообщения — отдельно (тесты экранов проверяют его без окна). */
@Composable
fun BriefItems(items: List<kg.osmotr.core.Brief.Item>, existing: Map<String, String>) {
    LazyColumn(Modifier.heightIn(max = 420.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items(items.size) { k ->
            val i = items[k]
            Column(Modifier.fillMaxWidth().testTag("из сообщения"), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(i.folder.ifEmpty { "Объект" }, fontWeight = FontWeight.SemiBold)
                existing[i.code]?.let { Text("Уже есть — обновит «$it»", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
                if (i.address.isNotBlank()) Text(i.address, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                for (c in i.contacts) Text(listOf(c.name, c.role.takeIf { it.isNotEmpty() }?.let { "($it)" }.orEmpty(), c.phone).filter { it.isNotBlank() }.joinToString(" "),
                    style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

/**
 * Лист объекта в сводной книге (Sheet): по коду объекта — «Лист «32. …»: ТС 5, зданий 2, участков 3» и
 * «Завести папки» (выбор — галочками; уже заведённое не предлагается). Листа нет или всё заведено — карточки нет.
 */
@Composable
fun SheetCard(obj: File, openList: (File) -> Unit) {
    val version by Store.version.collectAsStateWithLifecycle()
    val state by produceState<Pair<kg.osmotr.core.Sheet.Found, List<kg.osmotr.core.Sheet.Proposal>>?>(null, obj, version) {
        value = withContext(Background) { kg.osmotr.core.Sheet.find(obj)?.let { f -> f to kg.osmotr.core.Sheet.proposals(obj, f) } }
    }
    val (found, all) = state ?: return
    val fresh = all.filter { !it.exists }
    if (fresh.isEmpty()) return
    var choosing by remember { mutableStateOf(false) }
    val host = LocalHost.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    Card(Modifier.fillMaxWidth().testTag("лист объекта"), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Лист «${found.name}» в «${found.book.name.substringBeforeLast('.')}»", fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSecondaryContainer)
            Text(sheetCounts(fresh), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSecondaryContainer)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = { choosing = true }, modifier = Modifier.testTag("завести из листа")) { Text("Завести папки") }
                TextButton(onClick = { openList(found.book) }) { Text("Открыть лист") }
            }
        }
    }
    if (choosing) {
        val picked = remember { androidx.compose.runtime.mutableStateListOf<kg.osmotr.core.Sheet.Proposal>().apply { addAll(fresh) } }
        AlertDialog(
            onDismissRequest = { choosing = false },
            title = { Text("Завести из листа") },
            text = { DialogBody { SheetChoice(fresh, picked) } },
            confirmButton = { TextButton(onClick = {
                choosing = false
                val chosen = picked.toList()
                scope.launch {
                    val n = withContext(Background) { kg.osmotr.core.Sheet.apply(obj, chosen) }
                    host.toast("Заведено папок: $n")
                }
            }, enabled = picked.isNotEmpty(), modifier = Modifier.testTag("завести выбранное")) { Text("Завести (${picked.size})") } },
            dismissButton = { TextButton(onClick = { choosing = false }) { Text("Отмена") } },
        )
    }
}

/** «ТС: 5 · зданий: 2 · участков: 3» — по видам. */
fun sheetCounts(list: List<kg.osmotr.core.Sheet.Proposal>): String {
    val by = list.groupingBy { it.kind }.eachCount()
    return listOfNotNull(
        by[kg.osmotr.core.Sheet.Kind.VEHICLE]?.let { "ТС: $it" },
        by[kg.osmotr.core.Sheet.Kind.BUILDING]?.let { "зданий: $it" },
        by[kg.osmotr.core.Sheet.Kind.LAND]?.let { "участков: $it" },
    ).joinToString(" · ")
}

/** Выбор галочками — по видам; содержимое окна отдельно (тесты экранов проверяют его без окна). */
@Composable
fun SheetChoice(all: List<kg.osmotr.core.Sheet.Proposal>, picked: MutableList<kg.osmotr.core.Sheet.Proposal>) {
    val titles = mapOf(kg.osmotr.core.Sheet.Kind.VEHICLE to "ТС → «${Objects.MOVABLE}»", kg.osmotr.core.Sheet.Kind.BUILDING to "Здания → «${Objects.REAL}»",
        kg.osmotr.core.Sheet.Kind.LAND to "Участки → «${Objects.LAND}»")
    LazyColumn(Modifier.heightIn(max = 420.dp)) {
        for (kind in kg.osmotr.core.Sheet.Kind.entries) {
            val group = all.filter { it.kind == kind }
            if (group.isEmpty()) continue
            item(key = "h$kind") {
                Text(titles.getValue(kind), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(top = 8.dp, bottom = 2.dp))
            }
            items(group.size, key = { "$kind${group[it].folder}" }) { k ->
                val p = group[k]
                Row(Modifier.fillMaxWidth().clickable { if (p in picked) picked.remove(p) else picked.add(p) }.testTag("из листа: ${p.folder}"),
                    verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.Checkbox(checked = p in picked, onCheckedChange = { if (it) picked.add(p) else picked.remove(p) })
                    Text(p.title, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

/** Новый литер или найденное («А», «Навес») в объекте [obj] — с помещениями и фасадом; заведённый — в [made]. */
@Composable
fun NewBuildingDialog(obj: File, made: (File) -> Unit, onCancel: () -> Unit) {
    val host = LocalHost.current
    NameDialog("Литера или найденное", hint = "Например, Литера А или Навес", onDone = { name ->
        Objects.addBuilding(obj, name)?.let(made) ?: host.toast("Такой уже есть — или это земельный участок")
    }, onCancel = onCancel)
}

/** Новое ТС по госномеру (руками, заглавными) в объекте [obj]; заведённое — в [made]. */
@Composable
fun NewVehicleDialog(obj: File, made: (File) -> Unit, onCancel: () -> Unit) {
    val host = LocalHost.current
    NameDialog("Госномер ТС", confirm = "Добавить", hint = "Например, 01KG 123 ABC",
        capitals = androidx.compose.ui.text.input.KeyboardCapitalization.Characters, onDone = { number ->
            Objects.addVehicle(obj, number)?.let(made) ?: host.toast("Такой госномер уже есть")
        }, onCancel = onCancel)
}

/** Шапка объекта: учреждение и адрес (заранее, от регионального менеджера), правка и контакты. */
@Composable
fun ObjectHeader(obj: File, sort: (() -> Unit)? = null, modifier: Modifier = Modifier, editable: Boolean = true) {
    var version by remember { mutableStateOf(0) }
    val info by produceState(Objects.Info(), obj, version) { value = withContext(Background) { Objects.info(obj) } }
    var editing by remember { mutableStateOf(false) }
    // Лёжа (экран ниже 500 dp) — одной строкой: сведения слева, действия справа. Столбиком шапка забирала почти
    // половину высоты, и плитки категорий уходили под край (матрица лёжа, 29.10.2026; правило площадей).
    val low = with(androidx.compose.ui.platform.LocalDensity.current) { androidx.compose.ui.platform.LocalWindowInfo.current.containerSize.height.toDp() } < 500.dp
    val info0 = info
    val lines: @Composable () -> Unit = {
        Text(info0.institution.ifBlank { "Учреждение не указано" }, fontWeight = FontWeight.SemiBold, maxLines = if (low) 1 else Int.MAX_VALUE,
            overflow = TextOverflow.Ellipsis,
            color = if (info0.institution.isBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
        Text(info0.address.ifBlank { if (info0.entity == Objects.Entity.VEHICLE) "Транспортное средство" else "Адрес не указан" }, style = MaterialTheme.typography.bodyMedium, maxLines = if (low) 1 else Int.MAX_VALUE,
            overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    val edit: @Composable () -> Unit = { TextButton(onClick = { editing = true }, modifier = Modifier.testTag("изменить сведения")) { Text("Изменить") } }
    Card(modifier.fillMaxWidth().testTag("шапка объекта"), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        if (low) Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.weight(1f)) { lines() }
            // Объект системы E•state: учреждение и адрес приходят оттуда и правятся там.
            if (editable) edit()
            // Массовая подгрузка — снимки, PDF и Excel разом, с раскладкой по местам объекта.
            if (sort != null) androidx.compose.material3.OutlinedButton(onClick = sort, modifier = Modifier.testTag("разобрать файлы")) { Text("Разобрать файлы") }
        } else Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            lines()
            if (editable) edit()
            // Массовая подгрузка — снимки, PDF и Excel разом, с раскладкой по местам объекта.
            if (sort != null) androidx.compose.material3.OutlinedButton(onClick = sort, modifier = Modifier.fillMaxWidth().testTag("разобрать файлы")) {
                Text("Разобрать файлы по местам")
            }
        }
    }
    if (editing) ObjectInfoDialog("Сведения об объекте", "Сохранить", info, askName = false,
        onDone = { _, i -> editing = false; Objects.setInfo(obj, i); version++ }, onCancel = { editing = false })
}

/**
 * «Осмотрено ранее (старая версия)» — что было до объектов (автор, 29.10.2026: «напоминаем каждый раз
 * экспортировать эти данные и после стереть с телефона, показывая занятый объём… этого раздела»).
 */
@Composable
fun OldDataCard(open: () -> Unit, export: () -> Unit, modifier: Modifier = Modifier) {
    // Версия хранилища — подпиской: `.value` у потока Compose не отслеживает, и объём, посчитанный посреди
    // переноса при первом запуске, так и оставался (на эмуляторе: карточка «0,0 МБ», плашка «0,1 МБ»).
    val version by Store.version.collectAsStateWithLifecycle()
    val bytes by produceState(-1L, version) { value = withContext(Background) { Objects.oldBytes() } }
    if (bytes <= 0L) return
    // Жёлтая, а не красная (автор, 29.10.2026: «сделай уведомление желтоватым. Не нервируем людей»); главное
    // действие — выгрузить (архив в «Загрузки/Осмотр» и «Поделиться»), стирают потом сами.
    Card(modifier.fillMaxWidth().clickable(onClick = open).testTag("осмотрено ранее"),
        colors = CardDefaults.cardColors(containerColor = NOTICE)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(Objects.OLD, fontWeight = FontWeight.SemiBold, color = ON_NOTICE)
            Text("Занимает ${megabytes(bytes)} на телефоне. Выгрузите эти данные и после сотрите с телефона.",
                style = MaterialTheme.typography.bodyMedium, color = ON_NOTICE)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                androidx.compose.material3.Button(onClick = export, modifier = Modifier.testTag("выгрузить прежнее")) { Text("Выгрузить") }
                TextButton(onClick = open) { Text("Открыть", color = ON_NOTICE) }
            }
        }
    }
}
