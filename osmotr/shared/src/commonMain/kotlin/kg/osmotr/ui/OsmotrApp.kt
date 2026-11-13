@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)

package kg.osmotr.ui

import kg.osmotr.core.Background

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kg.osmotr.core.File
import kg.osmotr.core.Inventory
import kg.osmotr.core.Params
import kg.osmotr.core.Store
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** Короткие сообщения, которые показывает само приложение (там, где у платформы своих нет). */
object ToastBus {
    val messages = kotlinx.coroutines.flow.MutableSharedFlow<String>(extraBufferCapacity = 8)
    fun show(text: String) { messages.tryEmit(text) }
}

/** Экраны приложения — стеком: «назад» снимает верхний. */
sealed interface Screen {
    data class Browser(val dir: File) : Screen
    data class Viewer(val dir: File, val start: File) : Screen
    /** Просмотр PDF (документы объекта и ТС). */
    data class Pdf(val file: File, val title: String? = null) : Screen
    /** Массовая подгрузка в объект: предпросмотр и раскладка руками (автор, 29.10.2026). */
    data class Sort(val obj: File, val files: List<Picked>) : Screen
    /** Перечень Excel — просмотр и поиск (автор, 29.10.2026). */
    data class Spreadsheet(val file: File, val query: String = "") : Screen
    /** Параметры осмотра литера или участка (автор, 29.10.2026). */
    data class Params(val dir: File, val form: kg.osmotr.core.Params.Form) : Screen
    /** [place] — присланные фото: найти, куда положить (папка, предмет описи, новая папка). */
    data class Search(val here: File, val query: String? = null, val place: List<Picked>? = null) : Screen
    data class Contacts(val dir: File) : Screen
    /** Все документы объекта. */
    data class Docs(val obj: File) : Screen
    /** Контакты, присланные через «Поделиться», — спросить объект. */
    data class ContactsTo(val people: List<Store.Contact>) : Screen
    /** Выгрузки: собранные архивы — отправить, частями, удалить. */
    data object Exports : Screen
    /** Отчёты об ошибках: падения и сбои со слов системы — прочитать, отправить. */
    data object Reports : Screen
    /** [place] — присланные фото («Поделиться» из WhatsApp): выбрать папку, куда их положить. */
    /** [here] — последняя открытая из дерева папка: вернулись — дерево раскрыто до неё; [query] — поиск. */
    data class Tree(val here: File, val place: List<Picked>? = null, val query: String = "") : Screen
    /** [into] — набираем предметы в эту папку (касание — добавить/убрать). */
    data class Inventory(val obj: File, val into: File? = null, val query: String? = null) : Screen
    /** Инструкции по осмотрам: список с поиском; [query] помнится, пока экран в стеке. */
    data class Instructions(val query: String = "") : Screen
    /** Одна инструкция; [block] — куда прокрутить (из поиска), [query] — что подсветить. */
    data class Instruction(val id: String, val block: Int? = null, val query: String? = null) : Screen
    /** Памятка и фото инструкции на весь экран, с [start]-й картинки. */
    data class InstructionImages(val id: String, val start: Int) : Screen
    /** Карта назначенных объектов (в системе E•state). */
    data object Map : Screen
    /** День осмотрщика в системе E•state (план 06.11.2026): планы, уведомления, отчёт дня. */
    data object Plans : Screen
    data object Notes : Screen
    data object DayReport : Screen
    /** Запросы документов из кадастра (06.11.2026). */
    data object Cadastre : Screen
}

/**
 * Всё приложение — одно на Android и iPhone. Платформа даёт [host] (камера, файлы,
 * «Поделиться») и [incoming] — описи, присланные через «Поделиться» / «Открыть с помощью».
 */
@Composable
fun OsmotrApp(host: Host, incoming: SnapshotStateList<Picked>, start: List<Screen> = emptyList()) {
    androidx.compose.runtime.SideEffect { Params.locator = if (host.canLocate) { done -> host.locate(done) } else null }
    OsmotrTheme {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            // В системе E•state — сначала вход, с ним сверка назначений и отправка снятого (EstateUi.kt).
            CompositionLocalProvider(LocalHost provides host) { EstateGate(host) { Body(host, incoming, start) } }
        }
    }
}

@Composable
private fun Body(host: Host, incoming: SnapshotStateList<Picked>, start: List<Screen>) {
    var canWrite by remember { mutableStateOf(host.canWrite()) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { canWrite = host.canWrite() }
    if (!canWrite) {
        StorageGate(host)
        return
    }
    Store.ensureRoot()

    val stack = remember { mutableStateListOf<Screen>(Screen.Browser(Store.root)).apply { addAll(start) } }
    // Разобранное сообщение о выезде — ждёт «Завести» (BriefDialog).
    val briefs = remember { mutableStateOf<List<kg.osmotr.core.Brief.Item>?>(null) }
    val scope = rememberCoroutineScope()
    // Присланные описи — на главный, загрузка с окном прогресса.
    LaunchedEffect(incoming.size) {
        if (incoming.isEmpty()) return@LaunchedEffect
        val got = incoming.toList(); incoming.clear()
        while (stack.size > 1) stack.removeAt(stack.lastIndex)
        // Фото (WhatsApp, галерея через «Поделиться») — спросить папку; книги — описями.
        // Сообщение о выезде — окно с разобранным (объект из него); остальное — как прежде.
        got.filter { it.name == kg.osmotr.core.Brief.SHARED }.forEach { t ->
            val items = kg.osmotr.core.Brief.parse(t.bytes.decodeToString())
            if (items.isEmpty()) host.toast("Не похоже на сообщение о выезде: ни кода, ни учреждения, ни адреса")
            else briefs.value = items
        }
        val (cards, rest) = got.filter { it.name != kg.osmotr.core.Brief.SHARED }.partition { kg.osmotr.core.Vcard.isVcard(it.name, it.bytes.take(64).toByteArray().decodeToString()) }
        val people = cards.flatMap { kg.osmotr.core.Vcard.parse(it.bytes.decodeToString()) }
        if (cards.isNotEmpty()) { if (people.isEmpty()) host.toast("В карточке нет контакта") else stack.add(Screen.ContactsTo(people)) }
        val (photos, books) = rest.partition { it.isPhoto }
        if (books.isNotEmpty()) InventoryImport.ask(books, null, kinds = true) { stack.add(Screen.Inventory(it)) }
        if (photos.isNotEmpty()) stack.add(Screen.Search(Store.root, place = photos))
    }
    briefs.value?.let { items ->
        BriefDialog(items, onDone = {
            briefs.value = null
            scope.launch {
                val made = withContext(Background) { items.map { kg.osmotr.core.Brief.apply(it) } }
                made.firstOrNull()?.let { (obj, _) -> stack.add(Screen.Browser(obj)) }
                val n = made.count { it.second }
                host.toast(when { n == made.size -> "Заведено: ${plural(n, "объект", "объекта", "объектов")}"
                    n == 0 -> "Обновлено: ${plural(made.size, "объект", "объекта", "объектов")}"
                    else -> "Заведено ${n}, обновлено ${made.size - n}" })
            }
        }, onCancel = { briefs.value = null })
    }
    if (InventoryImport.jobs.isNotEmpty()) ImportDialog(InventoryImport.jobs, onClose = { InventoryImport.jobs.clear() })
    // Новая опись — в выбранный объект, в его «Механизмы и оборудование» (автор: «Всегда спрашивать объект»).
    InventoryImport.pending.value?.let { p ->
        ObjectChoiceDialog(p.books.size, p.preferred, kinds = p.kinds, onPick = { obj, asList ->
            InventoryImport.pending.value = null
            if (!asList) InventoryImport.start(host, scope, p.books, File(obj, kg.osmotr.core.Objects.MACHINES), p.open)
            // Перечень (здания и прочее) — в «Документы» объекта как есть, и сразу открыть: просмотр и поиск.
            else scope.launch {
                val put = withContext(Background) {
                    p.books.map { b -> addDocument(File(obj, kg.osmotr.core.Objects.DOCS), b).first.also { b.file?.delete() } }
                }
                put.firstOrNull()?.let { stack.add(Screen.Spreadsheet(it)) }
                host.toast("${plural(put.size, "перечень", "перечня", "перечней")} → ${Store.title(File(obj, kg.osmotr.core.Objects.DOCS))}")
            }
        }, onCancel = { InventoryImport.pending.value = null })
    }
    val snackbar = remember { SnackbarHostState() }
    // Плашка про снятое — всегда про последний предмет: прежняя (и ждущая очереди) снимается.
    val shotBanner = remember { LatestBanner() }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        // Папки могли поменять с компьютера, пока приложение было в фоне: перечитать, а
        // исчезнувшую — сменить ближайшей существующей.
        Store.changed()
        // Описи кучей в одной папке или прямо в корне (прежние версии, файлы по USB) — по своим папкам.
        // Прежде всего — разовый перенос прежнего в «Осмотрено ранее (старая версия)» (Objects, 29.10.2026).
        scope.launch(Background) {
            runCatching { kg.osmotr.core.Objects.migrateOnce() }.onFailure { kg.osmotr.core.Telemetry.error("перенос в «Осмотрено ранее»", it) }
            runCatching { Inventory.migrate() }.onFailure { kg.osmotr.core.Telemetry.error("перенос описей", it) }
        }
        // Отчёты, которые не успели собраться до закрытия, — собрать (отчёт в папке держим свежим).
        scope.launch(Background) { runCatching { Inventory.resumeReports() }.onFailure { kg.osmotr.core.Telemetry.error("отчёты при запуске", it) } }
        // Базовая папка без содержимого на диске есть только на экране — её не закрывать (Objects.present).
        while (stack.size > 1 && stack.last().let { it is Screen.Browser && !kg.osmotr.core.Objects.present(it.dir) }) stack.removeAt(stack.lastIndex)
        (stack.last() as? Screen.Browser)?.let { top ->
            if (!kg.osmotr.core.Objects.present(top.dir)) stack[stack.lastIndex] = Screen.Browser(generateSequence(top.dir) { it.parentFile }.first { it.isDirectory || it == Store.root })
        }
        // Вернулись из камеры — снятое уже в папке, папка на экране.
        scope.launch {
            val got = host.afterResume() ?: return@launch
            // Съёмка документа (пересъёмка, ответ на запрос кадастра, акт): страницы — в PDF, экран остаётся прежним.
            if (DocScan.owns(got.dir)) {
                withContext(Background) { DocScan.finish() }?.let { host.toast(it, long = true) }
                return@launch
            }
            // Снятое по описи — отчёт «осмотрено / нет» обновляется сам.
            if (got.count > 0) launch(Background) { Inventory.refreshReportSoon(got.dir) }
            // Снимали из списка описи — остаться в нём (следующая бирка), а что легло — плашкой с «Открыть».
            if (ShootFrom.list == got.dir) {
                ShootFrom.list = null
                // Ушли в камеру из списка и ничего не сняли — заведённая под это папка пуста.
                if (got.count == 0) launch(Background) { runCatching { Store.pruneEmpty(got.dir) } }
                if (got.count > 0) {
                    // Прежняя плашка (прошлый предмет) — прочь, и та, что ждала очереди, тоже: снимали
                    // быстро 1–5, а плашка показывала второй, и «Открыть» уводило в него (отзыв
                    // 15.10.2026: «хочу через уведомление быстро зайти в 5, а там ещё только 2 висит»).
                    // Без срока плашка с действием висела до нажатия — теперь уходит сама, смахивается,
                    // с крестиком.
                    shotBanner.show(scope, snackbar, "${got.dir.name}: +${plural(got.count, "снимок", "снимка", "снимков")}", "Открыть") {
                        stack.add(Screen.Browser(got.dir))
                    }
                }
                return@launch
            }
            ShootFrom.list = null
            val top = stack.last()
            if (top !is Screen.Browser || top.dir != got.dir) stack.add(Screen.Browser(got.dir))
        }
    }
    // Сообщения от платформы (iPhone: своих всплывающих нет) — той же плашкой внизу.
    LaunchedEffect(Unit) { ToastBus.messages.collect { snackbar.showSnackbar(it) } }
    val failed by Undo.failed.collectAsStateWithLifecycle()
    LaunchedEffect(failed) { if (failed > 0) snackbar.showSnackbar("Не удалось удалить") }
    // Удалено — «Вернуть» внизу: ошибка пальца не стоит снимков.
    val undo by Undo.last.collectAsStateWithLifecycle()
    LaunchedEffect(undo) {
        val t = undo ?: return@LaunchedEffect
        val what = listOfNotNull(
            t.folders.takeIf { it > 0 }?.let { plural(it, "папка", "папки", "папок") },
            t.photos.takeIf { it > 0 || t.folders == 0 }?.let { plural(it, "снимок", "снимка", "снимков") },
        ).joinToString(", ")
        val r = snackbar.showSnackbar("Удалено: $what", actionLabel = "Вернуть", duration = SnackbarDuration.Long)
        if (r == SnackbarResult.ActionPerformed) Undo.restore(t)
        if (Undo.last.value === t) Undo.last.value = null
    }
    // Папка предмета, которую открыли и покинули пустой (зашли в карточку и вышли, ничего не
    // сняв), — прочь, как только её нет ни в одном экране стека (автор, 13.10.2026: «Если папка
    // остаётся пустой, её надо удалить»). Пока она под другим экраном (набор из описи, просмотр),
    // она на месте. Заведённая человеком папка без привязки к предмету так не убирается — её имя
    // он набрал сам; убирается, когда из неё удалили последнее (Store.pruneEmpty).
    val held = remember { HashSet<File>() }
    val inStack = stack.mapNotNull { (it as? Screen.Browser)?.dir ?: (it as? Screen.Inventory)?.into }.toSet()
    LaunchedEffect(inStack) {
        val left = held - inStack
        held.clear(); held += inStack
        if (left.isNotEmpty()) launch(Background) {
            left.forEach { d -> runCatching { if (File(d, Inventory.MEMBERS).isFile) Store.pruneEmpty(d) } }
        }
    }
    // «Осмотрено ранее (старая версия)» — напоминание на каждом запуске, с объёмом (автор, 29.10.2026:
    // «напоминаем каждый раз экспортировать эти данные и после стереть с телефона»). Перенос делается
    // при запуске в фоне — подождать его.
    // Пустые базовые папки объектов — с диска (на экране они остаются): на телефоне только то, где что-то есть.
    LaunchedEffect(Unit) { withContext(Background) { runCatching { kg.osmotr.core.Layout.migrate() } } }
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(1500)
        val bytes = withContext(Background) { kg.osmotr.core.Objects.oldBytes() }
        if (bytes <= 0L) return@LaunchedEffect
        val r = snackbar.showSnackbar(Notice("Осмотрено ранее: ${megabytes(bytes)}. Выгрузите и сотрите с телефона", actionLabel = "Открыть"))
        if (r == SnackbarResult.ActionPerformed) stack.add(Screen.Browser(kg.osmotr.core.Objects.old()))
    }
    // Телеметрия: какой экран открыт (вид, без имён) и падение в прошлый раз — предложить отправить.
    val topName = stack.lastOrNull()?.let(::screenName)
    LaunchedEffect(topName, stack.size) { topName?.let { kg.osmotr.core.Telemetry.event("экран", "$it (глубина ${stack.size})") } }
    LaunchedEffect(Unit) {
        val crashed = withContext(Background) { kg.osmotr.core.Telemetry.unsentCrashes() }
        if (crashed.isEmpty()) return@LaunchedEffect
        val r = snackbar.showSnackbar("В прошлый раз «Осмотр» закрылся с ошибкой", actionLabel = "Открыть", duration = SnackbarDuration.Long)
        if (r == SnackbarResult.ActionPerformed) stack.add(Screen.Reports)
    }
    fun push(s: Screen) { stack.add(s) }
    fun pop() { if (stack.size > 1) stack.removeAt(stack.lastIndex) }
    fun replaceTop(s: Screen) { stack[stack.lastIndex] = s }
    BackHandler(enabled = stack.size > 1) { pop() }

    val bannerShown = remember { androidx.compose.runtime.derivedStateOf { snackbar.currentSnackbarData != null } }
    val bannerHeight = remember { mutableStateOf(0.dp) }
    val barHeight = remember { mutableStateOf(0.dp) }
    val density = androidx.compose.ui.platform.LocalDensity.current
    Box(Modifier.fillMaxSize()) {
      CompositionLocalProvider(LocalBannerShown provides bannerShown, LocalBannerHeight provides bannerHeight, LocalBarHeight provides barHeight) {
        when (val top = stack.last()) {
            is Screen.Browser -> BrowserScreen(
                dir = top.dir,
                open = { push(Screen.Browser(it)) },
                goTo = { dir -> // переход по пути — стек обрезается до этой папки
                    val i = stack.indexOfLast { it is Screen.Browser && it.dir == dir }
                    if (i >= 0) while (stack.size > i + 1) stack.removeAt(stack.lastIndex) else replaceTop(Screen.Browser(dir))
                },
                camera = { dir -> host.takePhotos(dir) },
                search = { push(Screen.Search(top.dir)) },
                contacts = { push(Screen.Contacts(top.dir)) },
                exports = { push(Screen.Exports) },
                reports = { push(Screen.Reports) },
                instructions = { id -> push(if (id == null) Screen.Instructions() else Screen.Instruction(id)) },
                tree = { push(Screen.Tree(top.dir)) },
                inventory = { push(Screen.Inventory(it)) },
                pickItems = { obj -> push(Screen.Inventory(obj, into = top.dir)) },
                view = { photo -> push(Screen.Viewer(top.dir, photo)) },
                viewPdf = { push(Screen.Pdf(it)) },
                allDocs = { push(Screen.Docs(it)) },
                sortFiles = { obj, files -> push(Screen.Sort(obj, files)) },
                viewList = { push(Screen.Spreadsheet(it)) },
                params = { d, f -> push(Screen.Params(d, f)) },
                renamed = { replaceTop(Screen.Browser(it)) },
                back = if (stack.size > 1) ({ pop() }) else null,
                map = { push(Screen.Map) },
                plans = { push(Screen.Plans) },
                notes = { push(Screen.Notes) },
                dayReport = { push(Screen.DayReport) },
                cadastre = { push(Screen.Cadastre) },
            )
            // Найденное открывается вместо поиска: «назад» — туда, откуда искали.
            is Screen.Search -> {
                val place = top.place
                // Присланное кладётся один раз (см. TreeScreen): второе касание, пока пишутся снимки, клало их дважды.
                val placed = remember(place) { booleanArrayOf(false) }
                SearchScreen(here = top.here, initial = top.query.orEmpty(), close = { pop() }, place = place?.size,
                    openList = { f, q -> push(Screen.Spreadsheet(f, q)) },
                    // Дерево — поверх поиска: «назад» из него возвращает к поиску, а не на главный
                    // (отзыв 15.10.2026: «возврат ведёт на главную, а не в предыдущее меню»).
                    tree = place?.let { p -> { push(Screen.Tree(Store.root, place = p)) } },
                    open = { dir ->
                        if (place == null) replaceTop(Screen.Browser(dir))
                        // Присланные фото — в найденную папку снимками; папка открывается сразу, снимки
                        // появляются в ней по мере записи (а не через секунды стоящего экрана).
                        else if (!placed[0]) scope.launch {
                            placed[0] = true
                            replaceTop(Screen.Browser(dir))
                            val n = withContext(Background) {
                                placePhotos(dir, place)
                            }
                            // Куда легло — плашкой с полным путём, надолго (а не короткой подсказкой).
                            snackbar.showSnackbar("${plural(n, "фото", "фото", "фото")} → ${Store.title(dir)}", duration = SnackbarDuration.Long)
                        }
                    })
            }
            // Свой экран на каждый файл: из одного PDF в другой (стек, «назад») — без кадра с чужими страницами.
            is Screen.Pdf -> androidx.compose.runtime.key(top.file.path) { PdfScreen(top.file, top.title, back = { pop() }) }
            is Screen.Params -> ParamsScreen(top.dir, top.form, close = { pop() })
            is Screen.Spreadsheet -> ListScreen(top.file, top.query, back = { pop() })
            is Screen.Sort -> SortScreen(top.obj, top.files, view = { f, name -> push(Screen.Pdf(f, name)) }, close = { pop() })
            is Screen.Inventory -> InventoryScreen(obj = top.obj, into = top.into, initialQuery = top.query, openFolder = { push(Screen.Browser(it)) },
                folders = { push(Screen.Browser(it)) }, close = { pop() },
                // Папка после набора могла переименоваться — вернуться в неё по новому имени.
                picked = { dir -> pop(); replaceTop(Screen.Browser(dir)) },
                contacts = { push(Screen.Contacts(it)) })
            is Screen.Tree -> {
                val placed = remember(top.place) { booleanArrayOf(false) }
                TreeScreen(current = top.here, place = top.place, open = { d ->
                    val place = top.place
                    // Разложили присланное — дерево и поиск под ним своё отработали: в папку, а «назад»
                    // из неё — туда, откуда начинали, не обратно к раскладке. Снимки пишутся здесь, в
                    // области приложения, — один раз.
                    if (place != null) {
                        if (placed[0]) return@TreeScreen
                        placed[0] = true
                        pop(); if ((stack.last() as? Screen.Search)?.place != null) pop(); push(Screen.Browser(d))
                        scope.launch {
                            val n = withContext(Background) { placePhotos(d, place) }
                            snackbar.showSnackbar("${plural(n, "фото", "фото", "фото")} → ${Store.title(d)}", duration = SnackbarDuration.Long, withDismissAction = true)
                        }
                    } else {
                        // Путь помнится (автор, 15.10.2026: «выход из папки тоже возвращает на главную,
                        // даже если я из дерева заходил… Путь надо помнить»): папка — поверх дерева, а
                        // дерево запоминает её — «назад» вернёт в дерево, раскрытое до неё и с ней на виду.
                        stack[stack.lastIndex] = top.copy(here = d)
                        push(Screen.Browser(d))
                    }
                }, close = { pop() }, query = top.query, onQuery = { q -> stack[stack.lastIndex] = top.copy(query = q) })
            }
            is Screen.Contacts -> ContactsScreen(dir = top.dir, close = { pop() })
            is Screen.Docs -> DocsScreen(top.obj, open = { f ->
                push(when {
                    Store.isPdf(f) -> Screen.Pdf(f)
                    f.extension.lowercase() in setOf("xlsx", "xls") -> Screen.Spreadsheet(f)
                    Store.isPhoto(f) -> Screen.Viewer(f.parentFile!!, f)
                    else -> { host.openExternal(f, docMime(f)); stack.last() }
                })
            }, close = { pop() })
            is Screen.ContactsTo -> ContactsToScreen(top.people, opened = { replaceTop(Screen.Contacts(it)) }, close = { pop() })
            is Screen.Exports -> ExportsScreen(close = { pop() })
            is Screen.Reports -> ReportsScreen(close = { pop() })
            is Screen.Viewer -> ViewerScreen(dir = top.dir, start = top.start, close = { pop() })
            is Screen.Instructions -> InstructionsScreen(initial = top.query, onQuery = { q -> stack[stack.lastIndex] = top.copy(query = q) },
                open = { id, block, q -> push(Screen.Instruction(id, block, q)) }, close = { pop() })
            is Screen.Instruction -> InstructionScreen(top.id, top.block, top.query, viewImage = { push(Screen.InstructionImages(top.id, it)) },
                openDoc = { push(Screen.Instruction(it)) }, close = { pop() })
            is Screen.InstructionImages -> InstructionImagesScreen(top.id, top.start, close = { pop() })
            is Screen.Plans -> PlansScreen(close = { pop() }, open = { push(Screen.Browser(it)) })
            is Screen.Notes -> NotesScreen(close = { pop() }, open = { push(Screen.Browser(it)) })
            is Screen.DayReport -> DayReportScreen(close = { pop() })
            is Screen.Cadastre -> CadastreScreen(close = { pop() })
            is Screen.Map -> MapScreen(close = { pop() }, open = { push(Screen.Browser(it)) })
        }
      }
        // Над клавиатурой: вернулись из камеры в список — клавиатура уже открыта под следующую бирку.
        val keys = androidx.compose.foundation.layout.WindowInsets.ime.getBottom(androidx.compose.ui.platform.LocalDensity.current) > 0
        // Над нижней панелью и «Снимать» (88 dp). На широком экране (лёжа, планшет) — слева, не шире 560 и у
        // самого низа: кнопки там справа, а на 88 dp от низа плашка ложилась на подписи плиток (лёжа, 29.10.2026).
        androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize()) {
            val wide = maxWidth >= 600.dp
            // Над панелью действий; экраны без неё (просмотр снимка, PDF) держат свои кнопки внизу — плашка выше них:
            // иначе она ложилась на «Повернуть», и первое касание уходило в плашку.
            val overBar = if (barHeight.value > 0.dp) Modifier.padding(bottom = barHeight.value + 8.dp)
                else Modifier.navigationBarsPadding().padding(bottom = 88.dp)
            Banners(snackbar, if (wide) Modifier.align(Alignment.BottomStart).imePadding().then(overBar)
                    .padding(start = 8.dp).widthIn(max = minOf(560.dp, maxWidth - 240.dp))
                else Modifier.align(Alignment.BottomCenter).imePadding().then(if (keys) Modifier.padding(bottom = 8.dp) else overBar)
                    .onSizeChanged { bannerHeight.value = with(density) { it.height.toDp() } })
        }
    }
}

/** Без доступа к памяти работать нельзя: снимки ложатся в «Осмотры» в памяти телефона. */
@Composable
private fun StorageGate(host: Host) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Нужен доступ к памяти", style = MaterialTheme.typography.headlineSmall)
        Text("Снимки хранятся в папке «Осмотры» в памяти телефона.",
            Modifier.padding(top = 12.dp, bottom = 24.dp), style = MaterialTheme.typography.bodyLarge)
        Button(onClick = { host.requestStorage() }) { Text("Разрешить") }
    }
}
