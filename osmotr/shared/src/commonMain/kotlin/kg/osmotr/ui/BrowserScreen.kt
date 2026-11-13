@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)

package kg.osmotr.ui

import kg.osmotr.core.Background

import kg.osmotr.core.File
import kg.osmotr.core.Inventory
import kg.osmotr.core.Platform
import kg.osmotr.core.Search
import kg.osmotr.core.Store
import kg.osmotr.core.Xlsx
import okio.Path.Companion.toPath

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.ui.composed
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import kotlinx.coroutines.delay
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.animateContentSize
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Папка: путь вверху (касание сегмента — туда), сетка — сначала вложенные папки с обложкой и
 * числом снимков, потом снимки. Долгое касание снимка — выбор нескольких. «Снимать» — камера
 * прямо в эту папку.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun BrowserScreen(
    dir: File,
    open: (File) -> Unit,
    goTo: (File) -> Unit,
    camera: (File) -> Unit,
    search: () -> Unit,
    contacts: () -> Unit,
    tree: () -> Unit,
    inventory: (File) -> Unit,
    view: (File) -> Unit,
    renamed: (File) -> Unit,
    pickItems: (File) -> Unit,
    /** Инструкции по осмотрам: null — список, иначе — эта инструкция. */
    instructions: (String?) -> Unit,
    back: (() -> Unit)?,
    exports: () -> Unit = {},
    reports: () -> Unit = {},
    /** Открыть PDF (документы объекта и ТС). */
    viewPdf: (File) -> Unit = {},
    /** Все документы объекта. */
    allDocs: (File) -> Unit = {},
    /** Разобрать выбранные файлы по местам объекта (массовая подгрузка). */
    sortFiles: (obj: File, files: List<Picked>) -> Unit = { _, _ -> },
    /** Открыть перечень Excel (просмотр и поиск). */
    viewList: (File) -> Unit = {},
    /** Параметры осмотра литера или участка. */
    params: (File, kg.osmotr.core.Params.Form) -> Unit = { _, _ -> },
    /** Карта назначенных объектов (в системе E•state). */
    map: () -> Unit = {},
    /** День осмотрщика (план 06.11.2026): планы, уведомления, отчёт дня. */
    plans: () -> Unit = {},
    notes: () -> Unit = {},
    dayReport: () -> Unit = {},
    /** Запросы документов из кадастра (06.11.2026): кнопка под полосой дня, пока есть открытые. */
    cadastre: () -> Unit = {},
) {
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    val version by Store.version.collectAsStateWithLifecycle()
    // Система E•state (core/Estate.kt): на главном — только назначенные объекты, у объекта — назначение.
    val signedIn by kg.osmotr.core.Estate.signedIn.collectAsStateWithLifecycle()
    val cadRequests by kg.osmotr.core.Estate.cadastre.collectAsStateWithLifecycle()
    val cadOpen = kg.osmotr.core.Estate.cadOpen(cadRequests)
    val estateOn = signedIn && host.estate != null
    val bindings = rememberLoaded("e-state|${dir.path}", version, estateOn) {
        if (!estateOn) emptyMap()
        else if (dir == Store.root) kg.osmotr.core.Estate.bound().toMap()
        else kg.osmotr.core.Estate.of(dir)?.takeIf { it.first == dir }?.let { mapOf(it) } ?: emptyMap()
    } ?: emptyMap()
    // Последнее содержимое папки — сразу, без пустого кадра; свежее подменит его по готовности.
    // Папку переименовывают (сменился состав) — старую не перечитывать: её уже нет, и экран
    // показал бы пустую сетку и «один предмет по имени», а через миг — новый состав.
    val loaded by produceState(Visited.listing[dir], dir, version) {
        withContext(Background) { withBase(dir, if (dir.isDirectory) Store.list(dir) else Store.Listing(emptyList(), emptyList())) }
            .let { value = it; Visited.listing[dir] = it }
    }
    // Удалённое — прочь с экрана сразу (Undo.gone), не дожидаясь пересчёта папки; обложка из удалённых — тоже.
    val gone = Undo.gone.toSet()
    val listing = remember(loaded, gone) {
        loaded?.let { l ->
            if (gone.isEmpty()) l else Store.Listing(
                l.folders.filter { it.dir.path !in gone }.map { t -> if (t.cover?.path in gone) t.copy(cover = null) else t },
                l.photos.filter { it.path !in gone }, l.videos.filter { it.path !in gone }, l.pdfs.filter { it.path !in gone }, l.lists.filter { it.path !in gone }, l.docs.filter { it.path !in gone })
        }
    }
    val selected: SnapshotStateList<File> = remember(dir) { emptyList<File>().toMutableStateList() }
    // Плитка показывает снимок так же, как просмотр: скан, повёрнутый там, не лежит здесь на боку.
    val turns by produceState(emptyMap<String, Int>(), dir, version) { value = withContext(Background) { Store.turnsIn(dir) } }
    // Убранные из папки — прячутся сразу по касанию (уезжают анимацией), не дожидаясь диска;
    // без ключа по папке: она переименуется, а пометка должна дожить до нового состава.
    val leaving = remember { mutableStateListOf<String>() }
    var menu by remember { mutableStateOf(false) }
    var newFolder by remember { mutableStateOf(false) }
    // Объекты (core/Objects): где мы — от этого кнопки «Новый объект», «Литер или найденное», «Добавить ТС».
    val objectHere = dir.parentFile?.let { kg.osmotr.core.Objects.isObject(it) } == true
    val inReal = objectHere && dir.name == kg.osmotr.core.Objects.REAL
    // Тип ОИ литеров — значком и подписью на плитке (автор, 03.11.2026: «Плитки литеров по типу»).
    val oiTypes = rememberLoaded("типы ОИ|${dir.path}", version) {
        if (!inReal) emptyMap() else kg.osmotr.core.Objects.buildings(dir.parentFile!!).associateWith { kg.osmotr.core.Params.oiType(it) }
    } ?: emptyMap()
    val inMovable = objectHere && dir.name == kg.osmotr.core.Objects.MOVABLE
    val inMachines = objectHere && dir.name == kg.osmotr.core.Objects.MACHINES
    // PDF — к объекту (его «Документы») и к ТС (папка госномера); автор: «У недвижки к обьекту, у ТС к госномеру».
    // И документы недвижимости — «Недвижимое/Документы» (автор, 30.10.2026).
    // Сущность объекта (core/Objects.Entity): объект-ТС — сам машина, у него камера и документы прямо в объекте.
    val entity = remember(dir, version) { if (kg.osmotr.core.Objects.isObject(dir)) kg.osmotr.core.Objects.entity(dir) else null }
    val vehicleObject = entity == kg.osmotr.core.Objects.Entity.VEHICLE
    // Объект системы E•state: своих категорий, папок у объекта и описей вне назначения нет (автор, 03.11.2026: «Запретить»).
    val estateHere = estateOn && remember(dir, version) { kg.osmotr.core.Estate.of(dir) != null }
    val inVehicle = vehicleObject || dir.parentFile?.let { it.name == kg.osmotr.core.Objects.MOVABLE && it.parentFile?.let(kg.osmotr.core.Objects::isObject) == true } == true
    val inDocs = objectHere && dir.name == kg.osmotr.core.Objects.DOCS ||
        dir.name == kg.osmotr.core.Objects.DOCS && dir.parentFile?.name == kg.osmotr.core.Objects.REAL &&
        dir.parentFile?.parentFile?.let(kg.osmotr.core.Objects::isObject) == true ||
        dir.name == kg.osmotr.core.Objects.DOCS && dir.parentFile?.parentFile?.let { it.name == kg.osmotr.core.Objects.MOVABLE } == true
    // «Добавить документ» (автор, 02.11.2026): любой формат — PDF, Excel, Word, скан jpg. У ТС — в его «Документы»:
    // скан не смешивается со снимками ТС.
    val addDoc = {
        host.pickFiles { got ->
            if (got.isNotEmpty()) scope.launch {
                val put = withContext(Background) {
                    val into = if (inVehicle) kg.osmotr.core.Objects.vehicleDocs(dir) else dir
                    got.map { p -> addDocument(into, p).second.also { p.file?.delete() } }
                }
                val fresh = put.count { it }; val same = put.size - fresh
                host.toast(listOfNotNull(fresh.takeIf { it > 0 }?.let { "Добавлено: ${plural(it, "документ", "документа", "документов")}" },
                    same.takeIf { it > 0 }?.let { "уже лежит: $it" }).joinToString(", "))
            }
        }
    }
    var newObject by remember { mutableStateOf(false) }
    var newBuilding by remember { mutableStateOf(false) }
    var newVehicle by remember { mutableStateOf(false) }
    var newCategory by remember { mutableStateOf(false) }
    var rename by remember { mutableStateOf(false) }
    var deleteFolder by remember { mutableStateOf(false) }
    val base = remember(dir) { kg.osmotr.core.Objects.isBase(dir) }
    // Где можно завести обычную папку (Layout): в документах, «Недвижимом», «Движимом», «Механизмах» и в корне — нет.
    val canFolder = remember(dir) { kg.osmotr.core.Layout.canCreateFolder(dir) }
    var moving by remember { mutableStateOf(false) }
    var movingFolder by remember { mutableStateOf(false) }
    var editingNote by remember { mutableStateOf(false) }
    var recording by remember { mutableStateOf(false) }
    // Записи, комментарий и контакты папки — с прежним сразу (подгружаясь следом, толкали плитки вниз).
    val voices = rememberLoaded("записи|${dir.path}", version) { if (dir.isDirectory) Store.voiceNotes(dir) else emptyList() } ?: emptyList()
    val note = rememberLoaded("комментарий|${dir.path}", version) { if (dir.isDirectory) Store.note(dir) else null }
    val people = rememberLoaded("контакты|${dir.path}", version) { if (dir.isDirectory) Store.contacts(dir) else emptyList() } ?: emptyList()
    // Опись объекта (если она в этой папке) и предметы описи, лежащие в этой папке; прошлое — сразу.
    val card by produceState(Visited.card[dir], dir, version) {
        withContext(Background) { if (dir.isDirectory) cardOf(dir) else null }?.let { value = it; Visited.card[dir] = it }
    }
    LaunchedEffect(card) { card?.items?.map { Inventory.key(Inventory.id(it)) }?.toSet()?.let { here -> leaving.retainAll(here) } }
    var zipping by remember { mutableStateOf<Float?>(null) }
    var diagnostics by remember { mutableStateOf(false) }
    var zipError by remember { mutableStateOf<String?>(null) }
    // Новые описи: сразу несколько файлов, каждый — своя опись, без вопросов (та же загрузка,
    // что из «Поделиться» в мессенджере — InventoryImport).
    // Новая опись — в объект, который человек выберет (InventoryImport.ask; автор: «Всегда спрашивать объект»).
    val pickInventory = { host.pickBooks(true) { InventoryImport.ask(it, kg.osmotr.core.Objects.of(dir), open = inventory) } }
    // Прикрепить опись к папке, начатой без неё.
    val attachInventory = {
        host.pickBooks(false) { got ->
            val book = got.firstOrNull() ?: return@pickBooks
            scope.launch {
                withContext(Background) { runCatching { Inventory.attachBook(book.bytes, book.name, dir) } }
                    .onSuccess { inventory(dir) }.onFailure { zipError = "${book.name} — ${it.message}" }
            }
        }
    }
    // Прогресс описей у папок (на главном — описи карточками).
    // Сначала — какие папки описи (быстро, чтобы не прыгали из плиток в строки), потом — сколько осмотрено.
    val progress by produceState(ScreenCache.get<Map<File, Pair<Int, Int>?>>("прогресс|${dir.path}") ?: emptyMap(), listing) {
        val l = listing ?: return@produceState
        // Пока пересчитывается — прежние цифры, а не «Открываем…» у всех строк (список не мигает).
        val was = value
        value = withContext(Background) { l.folders.filter { Inventory.fileIn(it.dir) != null }.associate { it.dir to was[it.dir] } }
        value = withContext(Background) {
            l.folders.mapNotNull { t -> kotlinx.coroutines.yield(); Inventory.fileIn(t.dir)?.let { f -> runCatching {
                val st = Inventory.status(t.dir); val items = Inventory.parse(f).items
                t.dir to (items.count(st::inspected) to items.size)
            }.getOrNull() } }.toMap()
        }
        ScreenCache.put("прогресс|${dir.path}", value)
    }
    val selecting = selected.isNotEmpty()
    // Законченные назначения на главном — свёрнуты, пока не раскрыли.
    var showDone by remember { mutableStateOf(false) }
    // Порядок на экране — папки, затем снимки: по нему выбор протяжкой отмечает диапазон.
    // Описи — первыми, строками во всю ширину; потом папки плитками.
    val inventories = listing?.folders.orEmpty().filter { it.dir in progress }
    val plain = listing?.folders.orEmpty().filter { it.dir !in progress }.let { all ->
        // В системе — только назначенные (автор, 03.11.2026: «Только назначенные»): срочное первым.
        if (!estateOn || dir != Store.root) all
        else all.filter { it.dir in bindings || !kg.osmotr.core.Objects.isObject(it.dir) }
            .sortedBy { bindings[it.dir]?.let(kg.osmotr.core.Estate::rank) ?: "5" }
    }
    // Группы назначенных на главном: сегодня, не сделано раньше, без даты, позже, законченное (EstateDay.kt).
    val estateGroups = EstateGroups.of(plain.filter { it.dir in bindings }, Days.today()) { bindings[it.dir] }
    var taking by remember { mutableStateOf<kg.osmotr.core.EstateObject?>(null) }
    val order = remember(listing, progress.keys) { listing?.let { l -> (inventories + plain).map { it.dir } + l.photos + l.pdfs + l.lists + l.videos }.orEmpty() }
    // Положение в папке помнится: вышел во вложенную или в просмотр, вернулся — на том же месте
    // (автор, 08.10.2026: «запоминание положения при входе/выходе из папки»).
    val grid = remember(dir) { Visited.position[dir].let { LazyGridState(it?.first ?: 0, it?.second ?: 0) } }
    DisposableEffect(dir) { onDispose { Visited.position[dir] = grid.firstVisibleItemIndex to grid.firstVisibleItemScrollOffset } }
    val afterLongPress = remember { AfterLongPress() }
    fun tap(action: () -> Unit) { if (afterLongPress.skip) afterLongPress.skip = false else action() }
    BackHandler(enabled = selecting) { selected.clear() }
    fun toggle(f: File) { if (f in selected) selected.remove(f) else selected.add(f) }

    Scaffold(
        topBar = {
            if (selecting) TopAppBar(
                navigationIcon = { IconButton(onClick = { selected.clear() }) { Icon(Icons.Default.Close, "Снять выбор") } },
                title = { Text(what(selected), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium) },
                actions = {
                    IconButton(onClick = { selected.clear(); selected.addAll(order) }) { Icon(AppIcons.SelectAll, "Выбрать все") }
                    IconButton(onClick = { moving = true }) { Icon(AppIcons.DriveFileMove, "Переместить") }
                    IconButton(onClick = {
                        val items = selected.toList()
                        // С папками — одним архивом со вложенностью; только снимки — как есть.
                        if (items.none { it.isDirectory }) sharePhotos(host, items)
                        else scope.launch {
                            zipping = 0f
                            val zip = runCatching { zipItems(host, items, dir, Store.title(dir)) { zipping = it } }
                            zipping = null
                            zip.onSuccess { shareChecked(host, it) }.onFailure { zipError = it.message ?: "архив не собрался" }
                        }
                    }) { Icon(Icons.Default.Share, "Отправить") }
                    // Базовые папки в выделении не удаляются — очищаются.
                    IconButton(onClick = { Undo.trash(selected.flatMap { if (kg.osmotr.core.Objects.isBase(it)) contentOf(it) else listOf(it) }); selected.clear() }) {
                        Icon(Icons.Default.Delete, "Удалить")
                    }
                },
            ) else TopAppBar(
                navigationIcon = { if (back != null) IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") } },
                // Папка предмета — заголовок сам предмет и его опись (касание — в опись), а не обрывок пути.
                title = {
                    val items = card?.items.orEmpty()
                    val obj = card?.obj
                    if (items.isNotEmpty() && obj != null) Column(Modifier.clip(RoundedCornerShape(8.dp)).clickable { inventory(obj) }.padding(horizontal = 2.dp)) {
                        Text(items.first().inventory.ifEmpty { "№ ${items.first().number}" } + if (items.size > 1) " +${items.size - 1} шт" else "",
                            style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("Опись «${obj.name}»", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                    } else Breadcrumbs(dir, goTo)
                },
                actions = {
                    val itemFolder = !card?.items.isNullOrEmpty()
                    // На главном — инструкции на виду: к ним идут перед осмотром и посреди него.
                    if (dir == Store.root) IconButton(onClick = { instructions(null) }, Modifier.testTag("значок инструкции")) { Icon(AppIcons.MenuBook, "Инструкции") }
                    IconButton(onClick = search) { Icon(Icons.Default.Search, "Поиск") }
                    if (!itemFolder) IconButton(onClick = tree) { Icon(AppIcons.AccountTree, "Структура") }
                    if (!itemFolder && canFolder && !(estateOn && dir == Store.root) && !(estateHere && kg.osmotr.core.Objects.isObject(dir)))
                        IconButton(onClick = { newFolder = true }) { Icon(AppIcons.CreateNewFolder, "Новая папка") }
                    Box {
                        IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, "Ещё") }
                        DropdownMenu(menu, { menu = false }) {
                            // Опись — только где она есть (на главном описи — строками и «Новая опись»).
                            if (dir != Store.root) Inventory.objectOf(dir)?.let { obj ->
                                DropdownMenuItem({ Text("Опись") }, leadingIcon = { Icon(AppIcons.Checklist, null) },
                                    onClick = { menu = false; inventory(obj) })
                            }
                            // Папка без описи — прикрепить (начали снимать без неё, опись прислали потом).
                            if (dir != Store.root && Inventory.objectOf(dir) == null) DropdownMenuItem({ Text("Прикрепить опись") },
                                leadingIcon = { Icon(AppIcons.UploadFile, null) },
                                onClick = { menu = false; attachInventory() })
                            // Папка внутри описи — отметить, какие предметы в ней лежат.
                            Inventory.objectOf(dir)?.takeIf { it != dir }?.let { obj ->
                                DropdownMenuItem({ Text("Предметы из описи") }, leadingIcon = { Icon(Icons.Default.Add, null) },
                                    onClick = { menu = false; pickItems(obj) })
                            }
                            // В папке предмета значков меньше — новая папка и структура здесь.
                            if (!card?.items.isNullOrEmpty()) {
                                DropdownMenuItem({ Text("Новая папка") }, leadingIcon = { Icon(AppIcons.CreateNewFolder, null) }, onClick = { menu = false; newFolder = true })
                                DropdownMenuItem({ Text("Структура") }, leadingIcon = { Icon(AppIcons.AccountTree, null) }, onClick = { menu = false; tree() })
                            }
                            if (dir == Store.root && estateOn) {
                                DropdownMenuItem({ Text("Вернуться в E•state") }, leadingIcon = { Icon(AppIcons.OpenInNew, null) },
                                    onClick = { menu = false; host.estate?.exit() })
                                if (Navigators.saved() != null) DropdownMenuItem({ Text("Навигатор: ${Navigators.saved()?.title} — сменить") },
                                    leadingIcon = { Icon(AppIcons.Directions, null) },
                                    onClick = { menu = false; Navigators.save(null); host.toast("Навигатор спросим при следующем маршруте") })
                                DropdownMenuItem({ Text("Выйти из учётной записи") }, leadingIcon = { Icon(AppIcons.Logout, null) },
                                    onClick = { menu = false; kg.osmotr.core.Estate.signOut() }, modifier = Modifier.testTag("выйти"))
                            }
                            // Журнал работы и отчёты о сбоях — для разбора ошибок, без личного (Diagnostics.kt).
                            if (dir == Store.root) DropdownMenuItem({ Text("Диагностика") }, leadingIcon = { Icon(Icons.Default.Info, null) },
                                onClick = { menu = false; diagnostics = true })
                            if (dir == Store.root) DropdownMenuItem({ Text("Отчёты об ошибках") }, leadingIcon = { Icon(Icons.Default.Warning, null) },
                                onClick = { menu = false; reports() }, modifier = Modifier.testTag("меню отчёты"))
                            if (dir != Store.root) DropdownMenuItem({ Text("Инструкции") }, leadingIcon = { Icon(AppIcons.MenuBook, null) },
                                onClick = { menu = false; instructions(null) })
                            DropdownMenuItem({ Text("Выгрузки") }, leadingIcon = { Icon(AppIcons.UploadFile, null) }, onClick = { menu = false; exports() },
                                modifier = Modifier.testTag("меню выгрузки"))
                            DropdownMenuItem({ Text("Отправить архивом") }, leadingIcon = { Icon(Icons.Default.Share, null) }, onClick = {
                                menu = false
                                scope.launch {
                                    zipping = 0f
                                    val zip = runCatching { zipFolder(host, dir) { zipping = it } }
                                    zipping = null
                                    zip.onSuccess { shareChecked(host, it) }.onFailure { zipError = it.message ?: "архив не собрался" }
                                }
                            })
                            if (dir != Store.root) {
                                DropdownMenuItem({ Text("Контакты") }, leadingIcon = { Icon(Icons.Default.Person, null) },
                                    onClick = { menu = false; contacts() })
                                DropdownMenuItem({ Text(if (note == null) "Добавить комментарий" else "Комментарий") },
                                    leadingIcon = { Icon(AppIcons.Notes, null) }, onClick = { menu = false; editingNote = true })
                                DropdownMenuItem({ Text("Диктофон") }, leadingIcon = { Icon(AppIcons.Mic, null) }, onClick = { menu = false; recording = true })
                                // Базовая папка — только очистить: ни перенести, ни переименовать, ни удалить (Objects.baseChildren).
                                if (!base) DropdownMenuItem({ Text("Переместить папку") }, leadingIcon = { Icon(AppIcons.DriveFileMove, null) },
                                    onClick = { menu = false; movingFolder = true })
                                if (!base) DropdownMenuItem({ Text("Переименовать") }, leadingIcon = { Icon(AppIcons.DriveFileRenameOutline, null) },
                                    onClick = { menu = false; rename = true })
                                DropdownMenuItem({ Text(if (base) "Очистить папку" else "Удалить папку") }, leadingIcon = { Icon(Icons.Default.Delete, null) },
                                    onClick = { menu = false; deleteFolder = true }, modifier = Modifier.testTag(if (base) "очистить папку" else "удалить папку"))
                            }
                        }
                    }
                },
            )
        },
        bottomBar = {
            if (!selecting) ActionBar(when {
                // В системе объекты не заводятся — их назначают; главное действие — карта.
                dir == Store.root && estateOn -> listOf(BarAction("Карта", AppIcons.Map, "кнопка карта", main = true) { map() })
                dir == Store.root -> listOf(
                    BarAction("Новый объект", AppIcons.CreateNewFolder, "кнопка новый объект", main = true) { newObject = true },
                    BarAction("Новая опись", AppIcons.Checklist) { pickInventory() })
                inDocs -> if (host.canPickFiles) listOf(BarAction("Добавить документ", AppIcons.UploadFile, "добавить документ", main = true) { addDoc() }) else emptyList()
                inReal -> listOf(BarAction("Литера или найденное", AppIcons.CreateNewFolder, "кнопка категории", main = true) { newBuilding = true })
                inMovable -> listOf(BarAction("Добавить ТС", AppIcons.CreateNewFolder, "кнопка категории", main = true) { newVehicle = true })
                inMachines -> if (estateHere) emptyList() else listOf(BarAction("Новая опись", AppIcons.Checklist, "кнопка категории", main = true) { pickInventory() })
                // Контакты и документы — на виду, не в углу: до верхнего угла палец не тянется. Объект-ТС — снимается сам.
                kg.osmotr.core.Objects.isObject(dir) && !vehicleObject -> buildList {
                    add(BarAction("Контакты", Icons.Default.Person, "кнопка контакты", main = true) { contacts() })
                    if (!estateHere) add(BarAction("Категория", AppIcons.CreateNewFolder, "новая категория") { newCategory = true })
                }
                else -> buildList {
                    add(BarAction("Снимать", AppIcons.CameraAlt, "снимать", main = true) { camera(dir) })
                    if (host.canPickGallery) add(BarAction("Галерея", AppIcons.PhotoLibrary, "из галереи") {
                        host.pickGallery { got ->
                            if (got.isEmpty()) return@pickGallery
                            scope.launch {
                                val n = withContext(Background) { placePhotos(dir, got) }
                                host.toast("Добавлено из галереи: ${plural(n, "фото", "фото", "фото")}")
                            }
                        }
                    })
                    if (inVehicle && host.canPickFiles) add(BarAction("Документ", AppIcons.UploadFile, "добавить документ") { addDoc() })
                }
            })
        },
    ) { inner ->
        val l = listing
        Box(Modifier.fillMaxSize().padding(inner)) {
            // В папке предмета или с описью — карточки вместо «пусто».
            if (l != null && l.folders.isEmpty() && l.photos.isEmpty() && l.pdfs.isEmpty() && l.lists.isEmpty() && l.docs.isEmpty() && l.videos.isEmpty() && card?.items.isNullOrEmpty() && card?.progress == null && !estateOn) Empty(dir == Store.root)
            LazyVerticalGrid(
                columns = GridCells.Adaptive(104.dp),
                state = grid,
                // Зажал — отмечено; повёл, не отпуская, — отмечается всё по пути (снимки и папки).
                modifier = Modifier.fillMaxSize().dragToSelect(grid, order, selected, afterLongPress),
                contentPadding = PaddingValues(start = 8.dp, end = 8.dp, top = 4.dp, bottom = 96.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (dir == Store.root && estateOn) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "e-state", contentType = "e-state") { EstateBar() }
                    item(span = { GridItemSpan(maxLineSpan) }, key = "e-state-day", contentType = "e-state-day") {
                        val feed by kg.osmotr.core.Estate.notes.collectAsStateWithLifecycle()
                        val read by kg.osmotr.core.Estate.read.collectAsStateWithLifecycle()
                        EstateDayStrip(todayCount = estateGroups.count { bindings[it.dir] }, unread = kg.osmotr.core.Estate.unread(feed, read),
                            onToday = { scope.launch { grid.animateScrollToItem(0) } }, onPlans = plans, onNotes = notes, onReport = dayReport)
                    }
                    if (cadOpen > 0) item(span = { GridItemSpan(maxLineSpan) }, key = "e-state-cad", contentType = "e-state-cad") {
                        CadastreButton(cadOpen, cadastre)
                    }
                    if (bindings.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }, key = "e-state-empty", contentType = "e-state-empty") {
                        Column(Modifier.fillMaxWidth().padding(vertical = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(AppIcons.Folder, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("Назначенных объектов нет", Modifier.padding(top = 10.dp), color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
                if (dir == Store.root) item(span = { GridItemSpan(maxLineSpan) }, key = "old", contentType = "old") {
                    OldDataCard(open = { open(kg.osmotr.core.Objects.old()) }, export = {
                        scope.launch {
                            zipping = 0f
                            val zip = runCatching { zipFolder(host, kg.osmotr.core.Objects.old()) { zipping = it } }
                            zipping = null
                            zip.onSuccess { shareChecked(host, it) }.onFailure { zipError = it.message ?: "архив не собрался" }
                        }
                    })
                }
                if (kg.osmotr.core.Objects.isObject(dir)) item(span = { GridItemSpan(maxLineSpan) }, key = "object", contentType = "object") {
                    ObjectHeader(dir, sort = if (!host.canPickFiles) null else ({
                        host.pickFiles { got -> got.takeIf { it.isNotEmpty() }?.let { sortFiles(dir, it) } }
                    }), editable = bindings[dir] == null)
                }
                bindings[dir]?.let { b ->
                    item(span = { GridItemSpan(maxLineSpan) }, key = "assignment", contentType = "assignment") { AssignmentCard(dir, b) }
                }
                if (kg.osmotr.core.Layout.kindOf(dir).let { it == kg.osmotr.core.Layout.Kind.OBJECT || it == kg.osmotr.core.Layout.Kind.REAL || it == kg.osmotr.core.Layout.Kind.VEHICLE })
                    item(span = { GridItemSpan(maxLineSpan) }, key = "docs", contentType = "docs") { DocsSection(dir, openAll = { allDocs(dir) }, openFolder = open) }
                // Литер, найденное, участок — первой строкой «Параметры осмотра» (автор, 29.10.2026: «Помимо папок
                // добавляем пункт заполнения параметров»).
                // «Недвижимое» объекта — сети всем литерам разом.
                if (dir.name == kg.osmotr.core.Objects.REAL && dir.parentFile?.let(kg.osmotr.core.Objects::isObject) == true)
                    item(span = { GridItemSpan(maxLineSpan) }, key = "nets-all", contentType = "nets-all") { NetsForAllCard(dir.parentFile!!) }
                kg.osmotr.core.Params.formOf(dir)?.let { form ->
                    item(span = { GridItemSpan(maxLineSpan) }, key = "params", contentType = "params") { PlaceBar(dir, form, openParams = { params(dir, form) }, openInstruction = { instructions(it) }) }
                }
                if (kg.osmotr.core.Objects.isObject(dir)) item(span = { GridItemSpan(maxLineSpan) }, key = "sheet", contentType = "sheet") {
                    SheetCard(dir, openList = viewList)
                }
                note?.let { text ->
                    item(span = { GridItemSpan(maxLineSpan) }, key = "note", contentType = "note") {
                        Row(Modifier.fillMaxWidth().panel()
                            .clickable { editingNote = true }.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Icon(AppIcons.Notes, null, tint = MaterialTheme.colorScheme.secondary)
                            Text(text, style = MaterialTheme.typography.bodyMedium, maxLines = 6, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
                if (voices.isNotEmpty()) item(span = { GridItemSpan(maxLineSpan) }, key = "voice", contentType = "voice") {
                    VoiceNotesCard(voices)
                }
                card?.progress?.let { (done, total) ->
                    item(span = { GridItemSpan(maxLineSpan) }, key = "inventory", contentType = "inventory") {
                        Column(Modifier.fillMaxWidth().panel(tint = MaterialTheme.colorScheme.primaryContainer)
                            .clickable { inventory(dir) }.padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Icon(AppIcons.Checklist, null, tint = MaterialTheme.colorScheme.primary)
                                Text("Опись: осмотрено $done из $total", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null)
                            }
                            LinearProgressIndicator(progress = { if (total == 0) 0f else done.toFloat() / total }, Modifier.fillMaxWidth().padding(top = 8.dp))
                        }
                    }
                }
                card?.items?.takeIf { it.isNotEmpty() }?.let { items ->
                    item(span = { GridItemSpan(maxLineSpan) }, key = "item", contentType = "item") {
                        ItemCard(items, card?.similar.orEmpty(), pick = { Inventory.objectOf(dir.parentFile!!)?.let(pickItems) }, add = { more ->
                            scope.launch { withContext(Background) { Inventory.addTo(dir, more).also { warmFolder(it); Inventory.refreshReportSoon(it) } }.let(renamed) }
                        }, remove = { one ->
                            leaving += Inventory.key(Inventory.id(one))
                            scope.launch { withContext(Background) { Inventory.removeFrom(dir, one).also { warmFolder(it); Inventory.refreshReportSoon(it) } }.let(renamed) }
                        }, leaving = leaving,
                            // «Нерабочее» — только по снимкам: «осмотрено ранее» снимков не даёт.
                            shot = { (card?.status?.photosOf(it) ?: 0) > 0 }, broken = { card?.status?.broken(it) == true }, setBroken = { one, on ->
                            card?.obj?.let { o -> scope.launch { withContext(Background) { Inventory.setBroken(o, listOf(one), on); Inventory.refreshReportSoon(o) } } }
                        }, repair = { card?.status?.repair(it) == true }, setRepair = { one, on ->
                            card?.obj?.let { o -> scope.launch { withContext(Background) { Inventory.setRepair(o, listOf(one), on); Inventory.refreshReportSoon(o) } } }
                        }, reason = note.orEmpty(), repairWith = { one, text ->
                            // Причина — комментарием папки предмета (так и «что с предметом не так»), затем отметка.
                            card?.obj?.let { o -> scope.launch { withContext(Background) { Store.setNote(dir, text); Inventory.setRepair(o, listOf(one), true); Inventory.refreshReportSoon(o) } } }
                        }, earlier = { card?.status?.earlier(it) == true }, setEarlier = { one, on ->
                            card?.obj?.let { o -> scope.launch { withContext(Background) { Inventory.setEarlier(o, listOf(one), on); Inventory.refreshReportSoon(o) } } }
                        })
                    }
                }
                // Как снимать этот предмет — инструкция по названию из описи (трансформатор, насос, ПК…).
                card?.items?.takeIf { it.isNotEmpty() }?.let { items ->
                    item(span = { GridItemSpan(maxLineSpan) }, key = "how", contentType = "how") {
                        InstructionHint(items.map { it.name }) { instructions(it) }
                    }
                }
                if (people.isNotEmpty()) item(span = { GridItemSpan(maxLineSpan) }, key = "people", contentType = "people") {
                    Row(Modifier.fillMaxWidth().panel()
                        .clickable(onClick = contacts).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Person, null, tint = MaterialTheme.colorScheme.secondary)
                        Text(people.first().let { listOf(it.name, it.phone).filter(String::isNotBlank).joinToString(" · ") } +
                            if (people.size > 1) " · ещё ${people.size - 1}" else "",
                            style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                if (l != null) {
                    items(inventories, key = { keyOf(it.dir) }, span = { GridItemSpan(maxLineSpan) }, contentType = { "inventory-folder" }) { tile ->
                        Box(Modifier.animateItem(fadeInSpec = motion(), placementSpec = motion(), fadeOutSpec = motion())) {
                            InventoryRow(tile, tile.dir in selected, progress[tile.dir], onClick = { tap { if (selecting) toggle(tile.dir) else inventory(tile.dir) } })
                        }
                    }
                    // В системе на главном — строками: текущие, затем свёрнутые «Закончено» (EstateUi.kt).
                    if (estateOn && dir == Store.root) {
                        val half: androidx.compose.foundation.lazy.grid.LazyGridItemSpanScope.(Int, Store.FolderTile) -> GridItemSpan =
                            { i, _ -> GridItemSpan(if (maxLineSpan < 8) maxLineSpan else if (i % 2 == 0) (maxLineSpan + 1) / 2 else maxLineSpan / 2) }
                        val g = estateGroups
                        // Группы главного (план 06.11.2026): сегодня, не сделано раньше, без даты (с «Взять на день»), позже.
                        listOf(Triple("Сегодня", g.today, "e-g-today"), Triple("Не сделано раньше", g.earlier, "e-g-earlier"),
                            Triple("Без даты", g.noDate, "e-g-nodate"), Triple("Позже", g.later, "e-g-later")).forEach { (title, list, tag) ->
                            if (list.isNotEmpty()) {
                                item(span = { GridItemSpan(maxLineSpan) }, key = tag, contentType = "e-state-group") { EstateGroupHeader(title, list.size) }
                                itemsIndexed(list, key = { _, t -> keyOf(t.dir) }, span = half, contentType = { _, _ -> "e-state-object" }) { _, tile ->
                                    bindings[tile.dir]?.let { b -> EstateObjectRow(b, onClick = { open(tile.dir) }, since = tag == "e-g-earlier",
                                        onTake = if (tag == "e-g-nodate") ({ taking = b }) else null) }
                                }
                            }
                        }
                        val over = g.over
                        if (over.isNotEmpty()) item(span = { GridItemSpan(maxLineSpan) }, key = "e-state-done", contentType = "e-state-done") {
                            EstateDoneHeader(over.size, showDone) { showDone = !showDone }
                        }
                        if (showDone) itemsIndexed(over, key = { _, t -> keyOf(t.dir) }, span = half, contentType = { _, _ -> "e-state-object" }) { _, tile ->
                            bindings[tile.dir]?.let { b -> EstateObjectRow(b, onClick = { open(tile.dir) }) }
                        }
                    }
                    items(if (estateOn && dir == Store.root) plain.filter { it.dir !in bindings } else plain, key = { keyOf(it.dir) }, contentType = { "folder" }) { tile ->
                        Box(Modifier.animateItem(fadeInSpec = motion(), placementSpec = motion(), fadeOutSpec = motion())) {
                            FolderCard(tile, tile.dir in selected, oiTypes[tile.dir], status = bindings[tile.dir]?.takeIf { dir == Store.root }?.let { estateTileLine(it) },
                                onClick = { tap { if (selecting) toggle(tile.dir) else open(tile.dir) } })
                        }
                    }
                    if (l.pdfs.isNotEmpty()) {
                        item(span = { GridItemSpan(maxLineSpan) }, contentType = "header") {
                            Text("Документы: ${l.pdfs.size}", Modifier.padding(4.dp, 10.dp, 4.dp, 2.dp),
                                style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        items(l.pdfs, key = { keyOf(it) }, contentType = { "pdf" }) { pdf ->
                            PdfCell(pdf, pdf in selected, Modifier.animateItem(fadeInSpec = motion(), placementSpec = motion(), fadeOutSpec = motion())
                                .clickable { tap { if (selecting) toggle(pdf) else viewPdf(pdf) } })
                        }
                    }
                    if (l.lists.isNotEmpty()) {
                        item(span = { GridItemSpan(maxLineSpan) }, contentType = "header") {
                            Text("Перечни Excel: ${l.lists.size}", Modifier.padding(4.dp, 10.dp, 4.dp, 2.dp),
                                style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        items(l.lists, key = { keyOf(it) }, contentType = { "list" }) { book ->
                            PdfCell(book, book in selected, Modifier.animateItem(fadeInSpec = motion(), placementSpec = motion(), fadeOutSpec = motion())
                                .clickable { tap { if (selecting) toggle(book) else viewList(book) } },
                                icon = AppIcons.TableChart, tint = DONE_GREEN, tag = "перечень")
                        }
                    }
                    if (l.docs.isNotEmpty()) {
                        item(span = { GridItemSpan(maxLineSpan) }, contentType = "header") {
                            Text("Другие документы: ${l.docs.size}", Modifier.padding(4.dp, 10.dp, 4.dp, 2.dp),
                                style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        items(l.docs, key = { keyOf(it) }, contentType = { "doc" }) { doc ->
                            PdfCell(doc, doc in selected, Modifier.animateItem(fadeInSpec = motion(), placementSpec = motion(), fadeOutSpec = motion())
                                .clickable { tap { if (selecting) toggle(doc) else host.openExternal(doc, docMime(doc)) } },
                                icon = AppIcons.UploadFile, tint = MaterialTheme.colorScheme.secondary, tag = "документ")
                        }
                    }
                    if (l.folders.isNotEmpty() && l.photos.isNotEmpty()) item(span = { GridItemSpan(maxLineSpan) }, contentType = "header") {
                        Text(plural(l.photos.size, "снимок", "снимка", "снимков"), Modifier.padding(4.dp, 10.dp, 4.dp, 2.dp),
                            style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    items(l.photos, key = { keyOf(it) }, contentType = { "photo" }) { photo ->
                        PhotoCell(photo, photo in selected, turn = turns[photo.name] ?: 0, modifier = Modifier.animateItem(fadeInSpec = motion(), placementSpec = motion(), fadeOutSpec = motion())
                            .clickable { tap { if (selecting) toggle(photo) else view(photo) } })
                    }
                    if (l.videos.isNotEmpty()) {
                        if (l.photos.isNotEmpty() || l.folders.isNotEmpty()) item(span = { GridItemSpan(maxLineSpan) }, contentType = "header") {
                            Text("Видео: ${l.videos.size}", Modifier.padding(4.dp, 10.dp, 4.dp, 2.dp),
                                style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        items(l.videos, key = { keyOf(it) }, contentType = { "video" }) { video ->
                            PhotoCell(video, video in selected, Modifier.animateItem(fadeInSpec = motion(), placementSpec = motion(), fadeOutSpec = motion())
                                .clickable { tap { if (selecting) toggle(video) else host.openVideo(video) } }, video = true)
                        }
                    }
                }
            }
            zipping?.let { p ->
                Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(16.dp).navigationBarsPadding()) {
                    Text("Собираю архив…")
                    LinearProgressIndicator(progress = { p }, Modifier.fillMaxWidth().padding(top = 8.dp))
                }
            }
        }
    }

    if (diagnostics) DiagnosticsDialog(onClose = { diagnostics = false })
    taking?.let { t -> TakeDialog(t.id, t.title, onClose = { taking = null }) }
    zipError?.let { e ->
        AlertDialog(onDismissRequest = { zipError = null }, title = { Text("Архив не отправлен") },
            text = { DialogBody { Text("Сборка не удалась: $e. Проверьте свободную память телефона.") } },
            confirmButton = { TextButton(onClick = { zipError = null }) { Text("Понятно") } })
    }
    if (newObject) ObjectInfoDialog("Новый объект", "Создать", askName = true,
        onDone = { name, info -> newObject = false; open(kg.osmotr.core.Objects.create(name, info)) }, onCancel = { newObject = false })
    // Литер — «А», «Б»… или найденное, которого нет в техпаспорте («Навес»); внутри — помещения и фасад.
    if (newBuilding) NewBuildingDialog(dir.parentFile!!, made = { newBuilding = false; open(it) }, onCancel = { newBuilding = false })
    if (newVehicle) NewVehicleDialog(dir.parentFile!!, made = { newVehicle = false; open(it) }, onCancel = { newVehicle = false })
    if (newCategory) NameDialog("Новая категория в объекте", hint = "Например, Сооружения", onDone = { name ->
        val made = Store.createFolder(dir, name)
        if (made == null) host.toast("Такая уже есть") else { newCategory = false; open(made) }
    }, onCancel = { newCategory = false })
    if (newFolder) NameDialog("Новая папка в «${Store.title(dir)}»", hint = kg.osmotr.core.Layout.nameHint(dir), onDone = { name ->
        newFolder = false
        Store.createFolder(dir, name)?.let(open)
    }, onCancel = { newFolder = false })
    if (rename) NameDialog("Переименовать", initial = dir.name, confirm = "Готово", onDone = { name ->
        rename = false
        Store.renameFolder(dir, name)?.let(renamed)
    }, onCancel = { rename = false })
    if (deleteFolder) {
        val count = remember(dir) { Store.photoTree(dir).size }
        AlertDialog(
            onDismissRequest = { deleteFolder = false },
            title = { Text(if (base) "Очистить «${dir.name}»?" else "Удалить «${dir.name}»?") },
            text = { DialogBody { Text((if (base) "Папка останется, удалится содержимое: " else "Вместе со всем содержимым: ") +
                "${plural(count, "снимок", "снимка", "снимков")}.") } },
            confirmButton = { TextButton(onClick = {
                deleteFolder = false
                if (base) {
                    Undo.trash(contentOf(dir))
                    kg.osmotr.core.Objects.of(dir)?.let { obj -> scope.launch { withContext(Background) { kg.osmotr.core.Objects.prune(obj) } } }
                }
                else { val parent = dir.parentFile ?: Store.root; Undo.trash(listOf(dir)); goTo(parent) }
            }, modifier = Modifier.testTag("подтвердить удаление")) { Text(if (base) "Очистить" else "Удалить", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { deleteFolder = false }) { Text("Отмена") } },
        )
    }
    if (recording) VoiceRecorderDialog(dir, onClose = { recording = false })
    if (editingNote) NoteDialog(note.orEmpty(), onDone = { editingNote = false; Store.setNote(dir, it) }, onCancel = { editingNote = false })
    if (movingFolder) FolderPicker("Переместить «${dir.name}»", dir.parentFile ?: Store.root, "Сюда",
        onPick = { to -> movingFolder = false; Store.moveFolder(dir, to)?.let(renamed) },
        onCancel = { movingFolder = false }, moving = listOf(dir))
    if (moving) FolderPicker("Переместить: ${what(selected)}", dir, "Сюда",
        onPick = { to ->
            moving = false
            if (to != dir) {
                val (folders, photos) = selected.filterNot { kg.osmotr.core.Objects.isBase(it) }.partition { it.isDirectory }
                if (selected.any { kg.osmotr.core.Objects.isBase(it) }) host.toast("Базовые папки не переносятся")
                Store.move(photos, to)
                folders.forEach { Store.moveFolder(it, to) }  // в саму себя и во вложенную — не перенесётся
                selected.clear()
            }
        },
        onCancel = { moving = false }, moving = selected.toList())
}

@Composable
private fun Breadcrumbs(dir: File, goTo: (File) -> Unit) {
    val chain = generateSequence(dir) { if (it == Store.root) null else it.parentFile }.toList().reversed()
    // Путь длиннее строки — видна его конечная часть: текущая папка.
    val scroll = rememberScrollState()
    LaunchedEffect(dir, scroll.maxValue) { scroll.scrollTo(scroll.maxValue) }
    // Обрезанное слева — растворяется, а не рубится посреди слова.
    val fade = Modifier.graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }.drawWithContent {
        drawContent()
        if (scroll.value > 0) drawRect(Brush.horizontalGradient(0f to Color.Transparent, 32.dp.toPx() / size.width to Color.Black), blendMode = BlendMode.DstIn)
    }
    Row(fade.horizontalScroll(scroll), verticalAlignment = Alignment.CenterVertically) {
        chain.forEachIndexed { i, d ->
            if (i > 0) Text(" › ", color = MaterialTheme.colorScheme.onSurfaceVariant)
            val last = i == chain.lastIndex
            Text(
                if (d == Store.root) "Осмотры" else d.name,
                // Зона касания — не меньше 40: при 28 по высоте пальцем мимо (матрица PWA, «МЕЛКО»).
                Modifier.clip(RoundedCornerShape(6.dp)).clickable(enabled = !last) { goTo(d) }.padding(horizontal = 4.dp, vertical = 10.dp),
                style = if (last) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleSmall,
                color = if (last) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.primary,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun FolderCard(tile: Store.FolderTile, selected: Boolean, oiType: String? = null, status: Pair<String, Color>? = null, onClick: () -> Unit) {
    val typeIcon = AppIcons.oiType(oiType)
    // Снимок сверху, подпись под ним: имя поверх пёстрой обложки не читалось.
    val shape = RoundedCornerShape(16.dp)
    Column(Modifier.testTag("плитка").panel(shape, tint = if (selected) MaterialTheme.colorScheme.primaryContainer else null).clickable(onClick = onClick)) {
        Box(Modifier.fillMaxWidth().aspectRatio(1.25f).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
            tile.cover?.let { cover ->
                AsyncImage(thumbRequest(cover), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } ?: Icon(typeIcon ?: AppIcons.Folder, null, Modifier.size(36.dp), tint = MaterialTheme.colorScheme.secondary)
            // Обложка закрыла значок — тип плашкой в углу.
            if (tile.cover != null && typeIcon != null) Icon(typeIcon, null, Modifier.align(Alignment.BottomStart).padding(6.dp)
                .clip(RoundedCornerShape(8.dp)).background(Color.Black.copy(alpha = 0.45f)).padding(3.dp).size(18.dp), tint = Color.White)
            if (tile.note != null) Icon(AppIcons.Notes, "Есть комментарий", Modifier.align(Alignment.TopStart).padding(6.dp)
                .clip(RoundedCornerShape(8.dp)).background(Color.Black.copy(alpha = 0.45f)).padding(3.dp).size(16.dp), tint = Color.White)
            if (selected) Icon(Icons.Default.CheckCircle, null, Modifier.align(Alignment.TopEnd).padding(4.dp), tint = MaterialTheme.colorScheme.primary)
        }
        Column(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp)) {
            // С типом имя — строкой, тип — второй: плитки остаются одной высоты. Объект системы — имя (адрес) в две
            // строки и под ним состояние назначения: на главном все плитки такие.
            val one = oiType != null && status == null
            Text(tile.dir.name, fontWeight = FontWeight.SemiBold, maxLines = if (one) 1 else 2, overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall, minLines = if (one) 1 else 2)
            if (status != null) Text(status.first, color = status.second, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.testTag("состояние: ${status.first}"))
            else if (oiType != null) Text(oiType, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.testTag("тип ОИ: $oiType"))
            Text(listOfNotNull(plural(tile.photos, "фото", "фото", "фото"), tile.videos.takeIf { it > 0 }?.let { "видео: $it" }, tile.folders.takeIf { it > 0 }?.let { plural(it, "папка", "папки", "папок") })
                .joinToString(" · "), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall, maxLines = 1)
        }
    }
}

/** Опись — строкой во всю ширину: название, сколько осмотрено, полоса; касание — сразу в опись. */
@Composable
private fun InventoryRow(tile: Store.FolderTile, selected: Boolean, progress: Pair<Int, Int>?, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().panel(tint = if (selected) MaterialTheme.colorScheme.primaryContainer else null)
        .clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(if (selected) Icons.Default.CheckCircle else AppIcons.Checklist, null, Modifier.size(28.dp), tint = MaterialTheme.colorScheme.primary)
        Column(Modifier.weight(1f)) {
            Text(tile.dir.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (progress == null) ParseProgress(tile.dir, compact = true)  // опись ещё читается — шкала, а не тишина
            else {
                val (done, total) = progress
                Text("осмотрено $done из $total · " + plural(tile.photos, "фото", "фото", "фото"),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                LinearProgressIndicator(progress = { if (total == 0) 0f else done.toFloat() / total }, Modifier.fillMaxWidth().padding(top = 6.dp),
                    color = DONE_GREEN)
            }
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/**
 * Отпускание пальца после зажатия касанием не считается: зажатие ставит отметку ([dragToSelect]),
 * а плитка видела бы в том же отпускании касание и тут же снимала бы её — выбрать простым
 * зажатием было нельзя (автор, 08.10.2026: «выбор на зажатии на 1 не работает»).
 * Плитка спрашивает [skip] перед своим касанием; сетка ставит его на зажатии и снимает,
 * когда жест кончился (плитка своё отпускание к тому времени уже обработала).
 */
private class AfterLongPress { var skip = false }

/**
 * Предмет описи в его папке: инвентарник, наименование, стоимость, приоритет; в папке
 * нескольких — все, с «убрать». «Ещё такие же в описи» — одним касанием сюда же.
 */
@Composable
private fun ItemCard(items: List<Inventory.Item>, similar: List<Inventory.Item>, pick: () -> Unit, add: (List<Inventory.Item>) -> Unit, remove: (Inventory.Item) -> Unit,
                     leaving: List<String>, shot: (Inventory.Item) -> Boolean, broken: (Inventory.Item) -> Boolean, setBroken: (Inventory.Item, Boolean) -> Unit,
                     earlier: (Inventory.Item) -> Boolean = { false }, setEarlier: (Inventory.Item, Boolean) -> Unit = { _, _ -> },
                     repair: (Inventory.Item) -> Boolean = { false }, setRepair: (Inventory.Item, Boolean) -> Unit = { _, _ -> },
                     reason: String = "", repairWith: (Inventory.Item, String) -> Unit = { _, _ -> }) {
    // «В ремонте» — с причиной (автор, 06.11.2026: как в форме механизма в макете): без причины не сохраняется, ошибка у поля.
    var asking by remember { mutableStateOf<String?>(null) }
    var why by remember { mutableStateOf("") }
    var whyError by remember { mutableStateOf(false) }
    // Состав меняется плавно: карточка растёт и сжимается, убранный уезжает, а не пропадает.
    Column(Modifier.fillMaxWidth().testTag("карточка предмета").panel()
        .animateContentSize(motion()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Последний оставшийся — без «убрать»: папка без предмета не бывает.
        val staying = items.count { Inventory.key(Inventory.id(it)) !in leaving }
        items.forEach { i -> key(Inventory.key(Inventory.id(i))) {
          AnimatedVisibility(Inventory.key(Inventory.id(i)) !in leaving, enter = fadeIn(motion()) + expandVertically(motion()),
              exit = fadeOut(motion()) + shrinkVertically(motion())) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("${i.inventory}  ·  № ${i.number}" + if (i.priority.isNotEmpty()) "  ·  П${i.priority}" else "",
                        fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                    Text(i.name + (i.qty.toIntOrNull()?.takeIf { it > 1 }?.let { " · $it шт" } ?: ""), style = MaterialTheme.typography.bodyMedium,
                        maxLines = 2, overflow = TextOverflow.Ellipsis)
                    val where = listOfNotNull(i.place.ifEmpty { null }, i.year.ifEmpty { null }?.let { "$it г." }).joinToString(" · ")
                    if (where.isNotEmpty()) Text(where, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
                    val cost = listOfNotNull(i.initial?.let { "первонач. ${money(it)}" }, i.sum?.takeIf { it != i.initial }?.let { "сумма ${money(it)}" })
                    if (cost.isNotEmpty()) Text(cost.joinToString(" · "), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    // Состояние — одно из двух, одним касанием, тут же и снять; только после снимков.
                    // «Требуется ремонт» — неисправно сейчас, но не на списание (автор, 15.10.2026).
                    val off = broken(i); val can = shot(i) && !Inventory.foreign(i); val fix = repair(i)
                    val haptic = LocalHapticFeedback.current
                    // Позиция другого осмотрщика — только чтение: отметок нет, видно, кто осматривает (автор, 06.11.2026).
                    if (Inventory.foreign(i)) Text("Осматривает: ${i.inspector}", Modifier.testTag("осматривает"), style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    else {
                    if (!off) FilterChip(fix, {
                        haptic.performHapticFeedback(if (fix) HapticFeedbackType.ToggleOff else HapticFeedbackType.ToggleOn)
                        if (fix) setRepair(i, false) else { asking = Inventory.key(Inventory.id(i)); why = reason; whyError = false }
                    }, {
                        Text(when { fix -> "В ремонте"; can -> "Отметить: в ремонте"; else -> "Ремонт — сначала снимки" },
                            color = if (fix) REPAIR_AMBER else Color.Unspecified)
                    }, Modifier.testTag("чип ремонт").animateContentSize(motion()), enabled = can || fix,
                        leadingIcon = { Icon(AppIcons.Build, null, Modifier.size(18.dp), tint = if (fix) REPAIR_AMBER else MaterialTheme.colorScheme.onSurfaceVariant) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = REPAIR_AMBER.copy(alpha = 0.18f)))
                    if (!fix) FilterChip(off, { haptic.performHapticFeedback(if (off) HapticFeedbackType.ToggleOff else HapticFeedbackType.ToggleOn); setBroken(i, !off) }, {
                        Text(when { off -> "Нерабочее, на списание"; can -> "Отметить: нерабочее"; else -> "Нерабочее — сначала снимки" },
                            color = if (off) BROKEN_RED else Color.Unspecified)
                    }, Modifier.testTag("чип нерабочее").animateContentSize(motion()), enabled = can || off,
                        leadingIcon = { Icon(AppIcons.Block, null, Modifier.size(18.dp), tint = if (off) BROKEN_RED else MaterialTheme.colorScheme.onSurfaceVariant) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = BROKEN_RED.copy(alpha = 0.18f)))
                    val itemKey = Inventory.key(Inventory.id(i))
                    if (asking == itemKey && !fix) Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                        OutlinedTextField(why, { why = it; whyError = false }, Modifier.fillMaxWidth().testTag("причина ремонта"), label = { Text("Причина ремонта") },
                            isError = whyError, supportingText = if (whyError) ({ Text("Укажите причину — без неё отметка не сохранится") }) else null, minLines = 2)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { if (why.isBlank()) whyError = true else { repairWith(i, why.trim()); asking = null } }) { Text("Отметить") }
                            TextButton(onClick = { asking = null }) { Text("Отмена") }
                        }
                    }
                    // Осмотрено без снимков (импорт или вручную, автор: «отметить как осмотренное — нужна»):
                    // отметить и тут же снять, если зря. Со снимками предмет осмотрен и так.
                    val mark = earlier(i)
                    if (mark || !can) FilterChip(mark, { haptic.performHapticFeedback(if (mark) HapticFeedbackType.ToggleOff else HapticFeedbackType.ToggleOn); setEarlier(i, !mark) }, {
                        Text(if (mark) "Осмотрено — снять отметку" else "Отметить осмотренным", color = if (mark) DONE_GREEN else Color.Unspecified)
                    }, Modifier.testTag("чип осмотрено").animateContentSize(motion()), leadingIcon = { Icon(if (mark) Icons.Default.Close else Icons.Default.Check, null, Modifier.size(18.dp),
                        tint = if (mark) DONE_GREEN else MaterialTheme.colorScheme.onSurfaceVariant) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = DONE_GREEN.copy(alpha = 0.16f)))
                    }
                }
                if (staying > 1) IconButton(onClick = { remove(i) }) { Icon(Icons.Default.Close, "Убрать из папки", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
          }
        } }
        if (similar.isNotEmpty()) TextButton(onClick = { add(similar) }) {
            Icon(Icons.Default.Add, null); Text("  Такие же в описи: ${similar.size} — добавить сюда")
        }
        // Вручную — по всему списку описи: отметить, что ещё лежит в этой папке.
        TextButton(onClick = pick) { Icon(AppIcons.Checklist, null); Text("  Добавить из описи") }
    }
}

/** Где был в каждой папке и что в ней лежало — пока приложение открыто. */
private object Visited {
    val position = HashMap<File, Pair<Int, Int>>()
    val listing = HashMap<File, Store.Listing>()
    val card = HashMap<File, Card>()
}

/** Опись объекта (если она в этой папке) и предметы описи, лежащие в этой папке. */
private data class Card(val progress: Pair<Int, Int>?, val items: List<Inventory.Item>, val similar: List<Inventory.Item>,
                        val obj: File? = null, val status: Inventory.Status? = null)

private fun cardOf(dir: File): Card? = runCatching {
    val own = if (dir == Store.root) emptyList() else Inventory.filesIn(dir)  // в корне описей не бывает
    val progress = if (own.isEmpty()) null else {
        val st = Inventory.status(dir); val all = own.flatMap { Inventory.parse(it).items }
        all.count(st::inspected) to all.size
    }
    val items = if (dir == Store.root) emptyList() else Inventory.itemsIn(dir)
    val obj = if (items.isEmpty()) null else Inventory.objectOf(dir.parentFile!!)
    val st = obj?.let(Inventory::status)
    val similar = if (obj == null || st == null) emptyList() else Inventory.similar(obj, items, st)
    Card(progress, items, similar, obj, st)
}.getOrNull()

/**
 * Папку переименовали (состав предметов поменялся) — содержимое и карточку прочитать до перехода:
 * иначе под новым именем она открывалась пустой, а заполнялась кадром позже. Вызывать в фоне.
 */
fun warmFolder(dir: File) {
    runCatching { Visited.listing[dir] = withBase(dir, Store.list(dir)) }
    cardOf(dir)?.let { Visited.card[dir] = it }
}

/**
 * Ключ в сетке — по имени, не по пути и без обращения к диску: папку переименовали (сменился
 * состав) — снимки в ней те же, и сетка не перерисовывает их как новые.
 */
private fun keyOf(f: File) = if (f.extension.lowercase() in PHOTO_KEYS) f.name else "d:" + f.name
private val PHOTO_KEYS = setOf("jpg", "jpeg", "heic", "heif")

/** «2 папки, 15 снимков». */
/** Базовые папки этого места, которых ещё нет на диске, — пустыми плитками: видны всегда (Objects.baseChildren). */
private fun withBase(dir: File, l: Store.Listing): Store.Listing {
    val have = l.folders.mapTo(HashSet()) { it.dir.name }
    val extra = kg.osmotr.core.Objects.baseChildren(dir).filter { it !in have }.map { Store.FolderTile(File(dir, it), 0, 0, null, null) }
    // Документы — разделом над плитками (DocsSection), не плиткой.
    val folders = (l.folders + extra).filterNot { kg.osmotr.core.Layout.isDocs(it.dir) }
    return if (extra.isEmpty() && folders.size == l.folders.size) l else l.copy(folders = folders.sortedWith(compareBy(Store.NATURAL_FILES) { it.dir }))
}

/** Что лежит в папке (без служебного) — очистка базовой папки. */
private fun contentOf(dir: File): List<File> = (dir.listFiles() ?: emptyArray()).filter { !it.name.startsWith(".") }

private fun what(items: List<File>): String {
    val folders = items.count { it.isDirectory }; val docs = items.count { !it.isDirectory && !Store.isPhoto(it) }
    val photos = items.size - folders - docs
    return listOfNotNull(
        folders.takeIf { it > 0 }?.let { plural(it, "папка", "папки", "папок") },
        docs.takeIf { it > 0 }?.let { plural(it, "документ", "документа", "документов") },
        photos.takeIf { it > 0 || items.isEmpty() }?.let { plural(it, "снимок", "снимка", "снимков") },
    ).joinToString(", ")
}

/**
 * Выбор зажатием с протяжкой, как в галерее: долгое касание отмечает элемент, движение пальца,
 * не отпуская, — диапазон от него до элемента под пальцем; у края сетка прокручивается сама.
 */
private fun Modifier.dragToSelect(grid: LazyGridState, order: List<File>, selected: SnapshotStateList<File>, after: AfterLongPress): Modifier =
    composed {
        val haptic = LocalHapticFeedback.current
        var scrollSpeed by remember { mutableFloatStateOf(0f) }
        LaunchedEffect(scrollSpeed) {
            while (scrollSpeed != 0f) { grid.scrollBy(scrollSpeed); delay(10) }
        }
        val edge = with(LocalDensity.current) { 56.dp.toPx() }
        pointerInput(order) {
            fun at(p: Offset): Int? {
                val key = grid.layoutInfo.visibleItemsInfo.firstOrNull { item ->
                    p.x >= item.offset.x && p.x < item.offset.x + item.size.width &&
                        p.y >= item.offset.y && p.y < item.offset.y + item.size.height
                }?.key ?: return null
                return order.indexOfFirst { keyOf(it) == key }.takeIf { it >= 0 }
            }
            var start: Int? = null
            var before: Set<File> = emptySet()
            detectDragGesturesAfterLongPress(
                onDragStart = { p ->
                    at(p)?.let { i ->
                        after.skip = true
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        before = selected.toSet()
                        start = i
                        if (order[i] in selected) selected.remove(order[i]) else selected.add(order[i])
                    }
                },
                onDrag = { change, _ ->
                    val s0 = start ?: return@detectDragGesturesAfterLongPress
                    val y = change.position.y
                    scrollSpeed = when { y < edge -> -(edge - y) / 4f; y > size.height - edge -> (y - (size.height - edge)) / 4f; else -> 0f }
                    at(change.position)?.let { i ->
                        val range = order.subList(minOf(s0, i), maxOf(s0, i) + 1).toSet()
                        val want = before + range
                        selected.removeAll { it !in want }
                        want.forEach { if (it !in selected) selected.add(it) }
                    }
                },
                onDragEnd = { start = null; scrollSpeed = 0f; after.skip = false },
                onDragCancel = { start = null; scrollSpeed = 0f; after.skip = false },
            )
        }
    }

@Composable
private fun PdfCell(pdf: File, selected: Boolean, modifier: Modifier, icon: androidx.compose.ui.graphics.vector.ImageVector = AppIcons.PictureAsPdf,
                    tint: Color = MaterialTheme.colorScheme.error, tag: String = "pdf") {
    val host = LocalHost.current
    // PDF — первой страницей (узнаётся техпаспорт, СТС, договор), перечень Excel — значком.
    val thumb by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, pdf.path) {
        if (icon == AppIcons.PictureAsPdf) value = withContext(Background) { pdfThumb(host, pdf, 240) }
    }
    Box(modifier.aspectRatio(1f).testTag(tag)) {
        Column(Modifier.fillMaxSize().panel().padding(6.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            val t = thumb
            if (t != null) androidx.compose.foundation.Image(t, null, Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(4.dp)),
                contentScale = ContentScale.Crop, alignment = Alignment.TopCenter)
            else Icon(icon, null, tint = tint, modifier = Modifier.size(36.dp))
            Text(pdf.name.substringBeforeLast('.'), Modifier.padding(top = 4.dp), style = MaterialTheme.typography.bodySmall,
                maxLines = if (t != null) 1 else 3, overflow = TextOverflow.Ellipsis, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
        if (selected) SelectedMark()
    }
}

/** Заголовок выделения: «2 снимка», но если среди отмеченного есть документ или папка — «Выбрано: 2». */
/**
 * Отметка выделения — поверх плитки, одна на снимки и документы (автор, 02.11.2026: «такое ощущение, что документ
 * всё ещё стоит сзади»): у документа цвет шёл фоном под его страницей, и он не выглядел выбранным.
 */
@Composable
private fun androidx.compose.foundation.layout.BoxScope.SelectedMark() {
    Box(Modifier.matchParentSize().clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.3f))
        .border(3.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(6.dp)))
    Icon(Icons.Default.CheckCircle, null, Modifier.align(Alignment.TopEnd).padding(4.dp), tint = MaterialTheme.colorScheme.primary)
}

@Composable
private fun PhotoCell(photo: File, selected: Boolean, modifier: Modifier, turn: Int = 0, video: Boolean = false) {
    val host = LocalHost.current
    Box(modifier.testTag("снимок").aspectRatio(1f).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
        AsyncImage(
            thumbRequest(photo),
            contentDescription = photo.name, contentScale = ContentScale.Crop, modifier = androidx.compose.ui.Modifier.graphicsLayer { rotationZ = turn * 90f }.then(Modifier.fillMaxSize()),
        )
        if (video) Icon(Icons.Default.PlayArrow, "Видео", Modifier.align(Alignment.Center).clip(CircleShape).background(Color.Black.copy(alpha = 0.5f)).padding(6.dp).size(28.dp), tint = Color.White)
        if (selected) SelectedMark()
    }
}

@Composable
private fun Empty(root: Boolean) {
    Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(AppIcons.CreateNewFolder, null, Modifier.size(56.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            if (root) "Создайте папку" else "Пусто",
            Modifier.padding(top = 12.dp), color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodyLarge,
        )
    }
}

/** Загрузка одного файла описи: имя, что с ним, разбираемый файл (для шкалы), итог. */
class ImportJob(val name: String) {
    enum class State { WAITING, WORKING, DONE, FAILED }
    var state by mutableStateOf(State.WAITING)
    var file by mutableStateOf<File?>(null)
    var dir: File? = null
    var items by mutableStateOf(0)
    var error by mutableStateOf("")
}

/**
 * Загрузка описей — из «Новая опись» и из «Поделиться» (WhatsApp, Telegram, почта, файлы):
 * каждый файл — своя опись; по две разом (5–6 тыс. строк каждая, память телефона не
 * резиновая), остальные в очереди; окно — строкой на файл (шкала, итог или причина).
 */
object InventoryImport {
    val jobs = androidx.compose.runtime.mutableStateListOf<ImportJob>()

    /**
     * Книги, ждущие выбора объекта: новая опись — всегда в «Механизмы и оборудование» объекта, и объект
     * спрашивается каждый раз (автор, 29.10.2026: «Всегда спрашивать объект»). [preferred] — объект, из
     * которого начали: выбран заранее, но спрашиваем всё равно.
     */
    /** [kinds] — спросить, опись это или перечень (книга пришла «Поделиться» / «Открыть с помощью»: присылают и то и другое). */
    class Pending(val books: List<Picked>, val preferred: File?, val open: (File) -> Unit, val kinds: Boolean = false)
    val pending = androidx.compose.runtime.mutableStateOf<Pending?>(null)

    fun ask(books: List<Picked>, preferred: File?, kinds: Boolean = false, open: (File) -> Unit) {
        if (books.isNotEmpty()) pending.value = Pending(books, preferred, open, kinds)
    }

    fun start(host: Host, scope: kotlinx.coroutines.CoroutineScope, books: List<Picked>, home: File, open: (File) -> Unit) {
        if (books.isEmpty()) return
        jobs.clear()
        val mine = books.map { ImportJob(it.name) }
        jobs.addAll(mine)
        scope.launch {
            val gate = kotlinx.coroutines.sync.Semaphore(2)
            books.zip(mine).map { (book, job) ->
                launch {
                    gate.acquire()
                    try {
                        job.state = ImportJob.State.WORKING
                        val t0 = kg.osmotr.core.Platform.nowMs()
                        withContext(Background) { runCatching { Inventory.importBook(book.bytes, book.name, home) { job.file = it } } }
                            .onSuccess { job.items = it.items.size; job.dir = job.file?.parentFile; job.state = ImportJob.State.DONE }
                            .onFailure { job.error = it.message ?: "не получилось"; job.state = ImportJob.State.FAILED }
                        // Причина отказа — текст приложения (без имён); имя файла — нет.
                        kg.osmotr.core.Telemetry.event("загрузка описи", if (job.state == ImportJob.State.DONE)
                            "${job.items} предметов, ${book.bytes.size / 1024} КБ, ${kg.osmotr.core.Platform.nowMs() - t0} мс"
                            else "отказ — ${job.error.substringBefore("«")}")
                    } finally { gate.release() }
                }
            }.forEach { it.join() }
            // Одна и без ошибок — сразу в неё; несколько — окно закроется само, если всё хорошо.
            if (mine.all { it.state == ImportJob.State.DONE }) {
                jobs.clear()
                if (mine.size == 1) mine.single().dir?.let(open)
                else host.toast("Добавлено: ${plural(mine.size, "опись", "описи", "описей")}")
            }
        }
    }
}

/** Окно загрузки описей: каждый файл — строкой со своей шкалой; закрыть — когда всё кончилось. */
@Composable
fun ImportDialog(jobs: List<ImportJob>, onClose: () -> Unit) {
    val finished = jobs.all { it.state == ImportJob.State.DONE || it.state == ImportJob.State.FAILED }
    AlertDialog(
        onDismissRequest = { if (finished) onClose() },
        title = {
            val ok = jobs.count { it.state == ImportJob.State.DONE }
            Text(when {
                !finished -> "Добавляем ${plural(jobs.size, "опись", "описи", "описей")}"
                ok == jobs.size -> "Описи добавлены"
                ok == 0 -> if (jobs.size == 1) "Опись не добавлена" else "Описи не добавлены"
                else -> "Добавлено $ok из ${jobs.size}"
            })
        },
        text = {
            androidx.compose.foundation.lazy.LazyColumn {
                items(jobs.size) { k ->
                    val j = jobs[k]
                    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                        Text(j.name.ifEmpty { "Файл без имени" }, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        when (j.state) {
                            ImportJob.State.WAITING -> Text("в очереди", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            ImportJob.State.WORKING -> ParseProgress(null, compact = true, file = j.file ?: File("/нет"))
                            // Книга читается, а список сам не нашёлся — опись заведена, столбцы укажут в ней.
                            ImportJob.State.DONE -> if (j.items == 0) Text("Список сам не нашёлся — откройте опись и укажите столбцы",
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                            else Text("✓ ${plural(j.items, "предмет", "предмета", "предметов")}", style = MaterialTheme.typography.bodySmall, color = DONE_GREEN)
                            ImportJob.State.FAILED -> Text("✗ ${j.error}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        },
        confirmButton = { if (finished) TextButton(onClick = onClose) { Text("Готово") } },
    )
}

/**
 * Миниатюра — с ключом памяти по имени снимка: после переименования папки путь другой, а
 * картинка та же — берётся из памяти сразу, без пустого квадрата и повторной загрузки.
 */
@Composable
private fun thumbRequest(photo: File) = ImageRequest.Builder(coil3.compose.LocalPlatformContext.current)
    .data(Store.thumbOrPhoto(photo).path.toPath()).size(Store.THUMB_PX)
    .memoryCacheKey("thumb:" + photo.name).placeholderMemoryCacheKey("thumb:" + photo.name).build()
