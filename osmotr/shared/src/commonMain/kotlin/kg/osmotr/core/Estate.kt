package kg.osmotr.core

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * Работа в системе E•state (ветка estate-integration; решения автора 03.11.2026): вход — учётной записью E•state
 * («Под записью estate»), объекты — только назначенные («Только назначенные»), отправка — «Есть связь - по мере
 * сьемки. Нет - храним в кеше с возможностью отправки позже. Выгрузку тоже поддерживаем».
 *
 * Концепция приложения не меняется: объект — папка, снимки — файлы, истина — файлы. Система добавляет к папке
 * объекта привязку ([BIND], скрытый файл: назначение, ОЦ, ОИ и пути их папок), отметки отправленного ([SENT]: путь →
 * размер и время изменения) и отказов ([FAILED]: файл, который система не приняла, и почему). Отправляется файл как
 * есть, по пути от папки объекта — ту же раскладку система разбирает из архива.
 *
 * Решения по аудиту (автор, 03.11.2026): три сущности — недвижимость, ТС, опись (вид объекта приходит из системы);
 * «Литера», «Транспортные средства»; участки — папкой по ЕНИ; документы — «Любые форматы куда угодно»; удаления —
 * «Система копит всё» (удалённое уходит пометкой); «Даже если осмотр закончен, пока есть то, что относится к
 * обьекту - отправляем»; незаполненное — предупредить и отправить «неполный»; исходы «осмотр не состоялся» — нужны;
 * папки ОИ из системы не переименовываются и не переносятся.
 *
 * Связь — [EstateLink] платформы: PWA в рамке системы — сообщениями окну (glue.js); на телефоне — позже, HTTP API
 * сервера с той же моделью.
 */
@Serializable
data class EstateUser(val person: String = "", val role: String = "", val roleLabel: String = "", val system: String = "E•state",
                      val canInspect: Boolean = true)

/**
 * Объект имущества назначения: папка [path] от объекта ([depth] — сколько в ней частей; 0 — объект и есть ОИ, как у
 * объекта-ТС); [review] — приёмка ЦОД («accepted», «returned»); [eni] — у участка.
 */
@Serializable
data class EstateOi(val id: String, val kind: String = "", val label: String = "", val path: String = "", val depth: Int = 0,
                    val review: String = "", val reason: String = "", val oiType: String = "", val eni: String = "")

/** Документ назначения; [oiId] — чей (пусто — объекта); [file] — есть ли у него файл (без файла — только название). */
@Serializable
data class EstateDoc(val id: String, val name: String = "", val type: String = "", val owner: String = "", val oiId: String = "",
                     val file: Boolean = false)

/** Опись назначения: [folder] — её папка в объекте («Механизмы и оборудование/<опись>»); [kind] — «inv» (опись учреждения) или «mech» (механизмы-ОИ). */
@Serializable
data class EstateInventory(val id: String, val kind: String = "inv", val title: String = "", val folder: String = "", val count: Int = 0)

/** Строка сведений «подпись — значение». */
@Serializable
data class EstateFact(val label: String = "", val value: String = "")

@Serializable
data class EstateContact(val name: String = "", val role: String = "", val phone: String = "")

/** Запрос переноса, ждущий решения регионала (06.11.2026): на [date], причина из справочника, [from] — прежняя дата. */
@Serializable
data class EstateMoveReq(val date: String = "", val reason: String = "", val note: String = "", val from: String = "")

/** Регионал отклонил перенос на [date]; [why] — его слова. */
@Serializable
data class EstateMoveRefused(val date: String = "", val why: String = "", val decidedAt: String = "")

/** Уведомление осмотрщика (лента за 14 дней): [kind], [label] — заголовок, [objectId] — объект (пусто — без объекта). */
@Serializable
data class EstateNote(val id: String = "", val kind: String = "", val label: String = "", val text: String = "", val at: String = "", val objectId: String = "")

/** Выезд в плане: объект, его заголовок, состояние и запрос переноса; [date] — у просроченных. */
@Serializable
data class EstatePlanItem(val objectId: String = "", val title: String = "", val state: String = "", val moveReq: EstateMoveReq? = null, val date: String = "")

/** День плана: область по плану месяца, отсутствие, выезды; [workday] false — нерабочий. */
@Serializable
data class EstatePlanDay(val date: String = "", val workday: Boolean = true, val region: String = "", val absence: String = "",
                         val items: List<EstatePlanItem> = emptyList())

@Serializable
data class EstatePlans(val days: List<EstatePlanDay> = emptyList(), val noDate: List<EstatePlanItem> = emptyList(), val overdue: List<EstatePlanItem> = emptyList())

/** Выезд дня в отчёте: [assignId] — назначение (по нему отчёт), [objectId] — объект для исхода. */
@Serializable
data class EstateTrip(val assignId: String = "", val objectId: String = "", val title: String = "", val state: String = "")

/**
 * Отчёт дня: сохранённые утренний и вечерний ([morning], [evening] — как в системе, null — не сдан), выезды, пробег по
 * дорогам, можно ли ещё сдать. Утро: odometer, noOdometer. Вечер: km, done [assignId], partial [{assignId, reason}], note, odometer.
 */
@Serializable
data class EstateDayReport(val date: String = "", val morning: JsonObject? = null, val evening: JsonObject? = null,
                           val trips: List<EstateTrip> = emptyList(), val routeKm: Double? = null, val workday: Boolean = true,
                           val canFile: Boolean = true, val lateDays: Int = 0)

/** Вечерний отчёт: выезд, сданный частично, и почему. */
data class EstatePartial(val assignId: String, val reason: String)

/** Ответ системы на сохранение: [ok] или отказ словами системы ([why]). */
data class EstateSaved(val ok: Boolean, val why: String = "")

/**
 * Скан, возвращённый ЦОД на пересъёмку (решение пользователя 06.11.2026): документ [title] (имя файла в системе),
 * ОИ [oiId] (пусто — объект), названные страницы [pages] (с 1; пусто — все), причина [reason].
 */
@Serializable
data class EstateRetake(val title: String = "", val oiId: String = "", val reason: String = "", val pages: List<Int> = emptyList(), val at: String = "")

/**
 * Строка запроса документов из кадастра: что просят и по какому объекту, ответ осмотрщика ([result]: пусто — ждёт, «got»,
 * «none», «refused»; [resultLabel] — словами системы) и разбор ЦОД ([review]: «wait», «accepted», «returned», «rejected»;
 * причина — [note]). [scanDate] — ГГГГ-ММ-ДД или пусто.
 */
@Serializable
data class EstateCadRow(val id: String = "", val doc: String = "", val title: String = "", val eni: String = "", val inst: String = "",
                        val result: String = "", val resultLabel: String = "", val answer: String = "", val scanDate: String = "",
                        val file: String = "", val review: String = "", val note: String = "", val answeredAt: String = "")

/** Запрос документов регионала: номер, вид, срок, его комментарий и строки; [closed] — закрыт. */
@Serializable
data class EstateCadRequest(val id: String = "", val no: kotlinx.serialization.json.JsonElement? = null, val kind: String = "", val due: String = "",
                            val note: String = "", val at: String = "", val closed: Boolean = false, val rows: List<EstateCadRow> = emptyList()) {
    /** Номер запроса — система присылает числом или строкой. */
    val number: String get() = (no as? kotlinx.serialization.json.JsonPrimitive)?.content.orEmpty()
    /** Строк без ответа. */
    val waiting: Int get() = rows.count { it.result.isEmpty() }
}

/** Возврат на доосмотр: какие ОИ и почему. */
@Serializable
data class EstateReturn(val oiIds: List<String> = emptyList(), val reason: String = "", val at: String = "", val by: String = "")

/**
 * Назначенный объект (объект оценки целиком: назначения одного осмотрщика на один ОЦ сведены). [entity] — сущность:
 * «real», «vehicle», «inventory»; [state] — «assigned», «progress», «done»; [removed] — назначение сняли или передали
 * другому (папка остаётся, снятое уходит).
 */
@Serializable
data class EstateObject(
    val id: String, val typeId: String = "", val ocId: String = "", val entity: String = "real", val typeLabel: String = "", val title: String = "",
    val state: String = "assigned", val plannedAt: String = "", val deadline: String = "", val note: String = "", val by: String = "",
    val eni: String = "", val address: String = "", val institution: String = "", val lat: Double? = null, val lon: Double? = null,
    val ois: List<EstateOi> = emptyList(), val docs: List<EstateDoc> = emptyList(), val contacts: List<EstateContact> = emptyList(),
    val returned: List<EstateReturn> = emptyList(), val removed: Boolean = false,
    val inventories: List<EstateInventory> = emptyList(),
    /** Контур участка из Кадастра по ЕНИ — [[долгота, широта]…]; [geoSrc] — откуда место («Кадастр»). */
    val contour: List<List<Double>> = emptyList(), val geoSrc: String = "",
    /** Сведения участка по Кадастру строками «подпись — значение» (назначение, вид использования, площадь по контуру, строения…). */
    val parcel: List<EstateFact> = emptyList(),
    /** Сведения задачи строками «подпись — значение»: у ТС — марка и модель, госномер, VIN; у объекта без адреса — учреждение (06.11.2026). */
    val facts: List<EstateFact> = emptyList(),
    /** Когда сняли (система присылает снятое сегодня — до конца дня с меткой «Снято регионалом», 06.11.2026). */
    val removedAt: String? = null,
    /** Запрос переноса, ждущий решения регионала; отказ — [moveRefused]. */
    val moveReq: EstateMoveReq? = null, val moveRefused: EstateMoveRefused? = null,
    /** Сканы на пересъёмку: какой документ, какие страницы, почему (06.11.2026). */
    val retakes: List<EstateRetake> = emptyList(),
) {
    /** Вернули на доосмотр и ещё не закончил заново. */
    val isReturned: Boolean get() = !removed && state != "done" && (returned.isNotEmpty() || ois.any { it.review == "returned" })

    val objectEntity: Objects.Entity get() = when (entity) { "vehicle" -> Objects.Entity.VEHICLE; "inventory" -> Objects.Entity.INVENTORY; else -> Objects.Entity.REAL }

    /** ОИ, к которому относится путь [rel] от объекта: самая длинная папка ОИ, в которой он лежит. */
    fun oiOf(rel: String): EstateOi? = ois.filter { it.path.isEmpty() || rel.startsWith(it.path + "/") }.maxByOrNull { it.depth }
}

/** Ответ системы на файл: [ok] — ответила (связь есть), [taken] — приняла; не приняла — [why]. */
data class SendResult(val ok: Boolean, val taken: Boolean = false, val why: String = "")

/** Связь с системой — у платформы (PWA: glue.js). Всё может не выйти: нет связи — исключение или false. */
interface EstateLink {
    /** Кто вошёл в систему; не ответила — null. */
    suspend fun hello(): EstateUser?
    /** Назначенные объекты. */
    suspend fun objects(): List<EstateObject>
    /** Файл документа — в [into]. */
    suspend fun doc(objectId: String, docId: String, into: File): Boolean
    /** Книга описи назначения (Excel); нет — null. */
    suspend fun inventory(objectId: String, invId: String): ByteArray?
    /**
     * Файл из папки объекта: [rel] — путь от неё, [oi] — чей (null — объекта или выявленного на месте); [items] — у
     * снимка в папке предмета описи — инвентарники предметов этой папки.
     */
    suspend fun send(objectId: String, rel: String, oi: EstateOi?, file: File, items: List<String> = emptyList()): SendResult
    /** Отправленный файл удалён на телефоне — в системе пометка. */
    suspend fun deleted(objectId: String, rel: String, oiId: String): Boolean
    /** «Осмотр закончен» ([done]; [incomplete] — обязательное заполнено не всё) или снова в работу. */
    suspend fun finish(objectId: String, done: Boolean, incomplete: Boolean): Boolean
    /** Осмотр не состоялся: [reason] из перечня, [note] — пояснение. */
    suspend fun outcome(objectId: String, reason: String, note: String): Boolean
    /** Причины переноса из справочника системы. */
    suspend fun moveReasons(): List<String> = emptyList()
    /** Лента уведомлений за 14 дней, новые сверху. */
    suspend fun notes(): List<EstateNote> = emptyList()
    /** Планы на [days] дней вперёд, задачи без даты и просроченные; нет связи — null. */
    suspend fun plans(days: Int): EstatePlans? = null
    /** Взять задачу на день [date] (ГГГГ-ММ-ДД). */
    suspend fun take(objectId: String, date: String): Boolean = false
    /** Запрос переноса на [date]; решает регионал. */
    suspend fun move(objectId: String, date: String, reason: String, note: String): Boolean = false
    /** Отчёт дня [date] (пусто — сегодня); нет связи — null. */
    suspend fun report(date: String): EstateDayReport? = null
    /** Утренний отчёт: «Начал день» и необязательный одометр. */
    suspend fun saveMorning(date: String, odometer: String, noOdometer: Boolean): EstateSaved = EstateSaved(false, "нет связи с E•state")
    /** Вечерний отчёт: пробег, осмотренные выезды ([done] — назначения), частичные, комментарий. */
    suspend fun saveEvening(date: String, km: String, kmByRoute: Boolean, done: List<String>, partial: List<EstatePartial>, note: String): EstateSaved =
        EstateSaved(false, "нет связи с E•state")
    /** Запросы документов (кадастр) этого осмотрщика, открытые и закрытые; нет связи — null. */
    suspend fun cadastre(): List<EstateCadRequest>? = null
    /**
     * Ответ по строке запроса: [result] «got» (с файлом [file], имя в системе — [fileName]), «none» или «refused»;
     * [scanDate] — ГГГГ-ММ-ДД или пусто. Отказ системы — словами системы.
     */
    suspend fun cadAnswer(reqId: String, rowId: String, result: String, scanDate: String, answer: String, fileName: String, file: File?): EstateSaved =
        EstateSaved(false, "нет связи с E•state")
    /** Назад в систему. */
    fun exit()
    /** Система сообщила, что назначения поменялись. */
    fun onChanged(f: () -> Unit)
    val online: Boolean
}

object Estate {
    const val BIND = ".estate.json"
    const val SENT = ".estate-sent.json"
    const val FAILED = ".estate-failed.json"
    private const val LOGIN = ".estate-вход"

    /** Исходы «осмотр не состоялся» (вопрос прежнего аудита; автор, 03.11.2026: «Нужны»). */
    val OUTCOMES = listOf("Не на месте", "Нет доступа", "Объект закрыт", "Другое ТС", "Другое")

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val marks = MapSerializer(String.serializer(), String.serializer())

    /** Связь платформы; null — приложение не в системе (работает как прежде). */
    var link: EstateLink? = null

    /** Кто в системе (ответ системы); вход на этом устройстве — [signedIn]. */
    val user = MutableStateFlow<EstateUser?>(null)
    val signedIn = MutableStateFlow(false)

    /** Что с отправкой: сколько ждёт и не принято, идёт ли, нет связи, когда сверено с системой. */
    data class Status(val pending: Int = 0, val failed: Int = 0, val sending: Boolean = false, val offline: Boolean = false,
                      val error: String? = null, val syncedAt: Long = 0, val pulling: Boolean = false)
    private val _status = MutableStateFlow(Status())
    val status = _status.asStateFlow()

    /** Работаем в системе: связь есть, вошли. */
    val active: Boolean get() = link != null && signedIn.value && user.value != null

    // ---------- Вход ----------

    /**
     * Спросить систему, кто вошёл; вход на устройстве помнится (тот же человек — без вопроса). Система не
     * ответила, а вход на устройстве был — работаем под ним без связи: снятое копится и уйдёт позже.
     */
    suspend fun start(): EstateUser? {
        val l = link ?: return null
        val saved = runCatching { File(Store.root, LOGIN).readText().trim() }.getOrNull().orEmpty()
        val u = runCatching { l.hello() }.getOrNull()
        if (u == null) {
            if (saved.isEmpty()) return null
            user.value = EstateUser(person = saved)
            signedIn.value = true
            _status.value = _status.value.copy(offline = true, error = "нет связи с системой")
            return user.value
        }
        user.value = u
        signedIn.value = u.canInspect && saved == u.person
        return u
    }

    fun signIn() {
        val u = user.value ?: return
        Store.writeDurably(File(Store.root, LOGIN), u.person.encodeToByteArray())
        signedIn.value = true
    }

    fun signOut() {
        File(Store.root, LOGIN).delete()
        signedIn.value = false
    }

    // ---------- Привязка папок ----------

    fun binding(obj: File): EstateObject? = runCatching { json.decodeFromString(EstateObject.serializer(), File(obj, BIND).readText()) }.getOrNull()

    /** Объекты системы на устройстве — с привязкой. */
    fun bound(): List<Pair<File, EstateObject>> = Objects.all().mapNotNull { o -> binding(o)?.let { o to it } }

    /** Объект системы, к которому относится [dir]. */
    fun of(dir: File): Pair<File, EstateObject>? = Objects.of(dir)?.let { o -> binding(o)?.let { o to it } }

    /** Порядок на главном: незаконченное, в нём ближайшее; снятое — в конце. */
    fun rank(b: EstateObject): String = (if (b.removed) "3" else if (b.state == "done") "2" else if (b.isReturned) "0" else "1") +
        (b.plannedAt.ifEmpty { "9" }) + (b.deadline.ifEmpty { "9" })

    private fun write(obj: File, b: EstateObject) {
        Store.writeDurably(File(obj, BIND), json.encodeToString(EstateObject.serializer(), b).encodeToByteArray())
        oiPaths = null
    }

    /** Папки ОИ из системы (абсолютные пути) — их нельзя переименовать и перенести (Objects.isBase). */
    private var oiPaths: Set<String>? = null

    fun isOiFolder(dir: File): Boolean {
        if (link == null) return false
        val all = oiPaths ?: runCatching {
            bound().flatMap { (o, b) -> (b.ois.map { it.path } + b.inventories.map { it.folder }).filter { it.isNotEmpty() }.flatMap { path ->
                // Сама папка ОИ (описи) и промежуточные («Земельный участок» у участков по ЕНИ).
                val parts = path.split('/')
                (1..parts.size).map { n -> File(o, parts.take(n).joinToString("/")).path.trimEnd('/') }
            } }.filter { File(it).name != Objects.REAL && File(it).name != Objects.MOVABLE && File(it).name != Objects.MACHINES }.toSet()
        }.getOrDefault(emptySet()).also { oiPaths = it }
        return dir.path.trimEnd('/') in all
    }

    // ---------- Назначенные объекты ----------

    private val pullLock = Mutex()

    /**
     * Сверить с системой: новые назначения — папками по сущности (у недвижимости — литеры, квартира, участки по ЕНИ,
     * ТС в «Транспортных средствах»; объект-ТС — сам машина), сведения и привязка — свежие, документы с файлом — в
     * «Документы» своего ОИ (или объекта); снятое — пометкой (папка и снятое остаются, неотправленное уходит).
     * Сколько назначено; связи нет — исключение.
     */
    suspend fun pull(): Int = pullLock.withLock {
        val l = link ?: return 0
        _status.value = _status.value.copy(pulling = true)
        try {
            val list = l.objects()
            val have = bound().associate { it.second.id to it.first }
            for (o in list) {
                val info = Objects.Info(o.institution, o.address, o.objectEntity)
                val dir = have[o.id] ?: Objects.create(o.title.ifBlank { o.id }, info)
                if (Objects.info(dir) != info) Objects.setInfo(dir, info)
                write(dir, o)
                for (oi in o.ois) {
                    val d = if (oi.path.isEmpty()) dir else File(dir, oi.path)
                    if (!d.isDirectory) d.mkdirs()
                    // Тип ОИ система знает (квартира, жилой дом, здание) — в форму, если там ещё пусто.
                    if (oi.oiType in Params.OI_TYPES && Params.formOf(d) != null && Params.oiType(d) == null) {
                        Params.save(d, Params.load(d) + (Params.OBJ_KIND to oi.oiType))
                        markSent(dir, Params.fileOf(d))
                    }
                }
                // Контакты учреждения — в «Контакты» объекта, если своих там ещё нет (свои не затираются).
                if (o.contacts.isNotEmpty() && Store.contacts(dir).isEmpty()) {
                    Store.setContacts(dir, o.contacts.map { Store.Contact(name = it.name, role = it.role, phone = it.phone) })
                    File(dir, "Контакты.xlsx").takeIf { it.isFile }?.let { markSent(dir, it) }
                }
                // Описи назначения — книгой из системы, своей описью приложения (обмен описью; автор, 03.11.2026).
                for (inv in o.inventories) {
                    val d = File(dir, inv.folder)
                    if (Inventory.fileIn(d) != null) continue
                    val bytes = l.inventory(o.id, inv.id) ?: continue
                    d.mkdirs()
                    runCatching { Inventory.attachBook(bytes, Inventory.PREFIX + Store.cleanName(inv.title) + ".xlsx", d) }
                        .onFailure { Telemetry.error("опись из системы", it) }
                }
                for (d in o.docs) if (d.file && d.name.isNotBlank()) {
                    val oi = o.ois.firstOrNull { it.id == d.oiId }
                    val into = File(if (oi == null || oi.path.isEmpty()) dir else File(dir, oi.path), Objects.DOCS)
                    // Уже скачанный — по номеру документа в системе; одноимённый другой документ — «имя (2)», а не пропуск
                    // (аудит 03.11.2026, п. 27: второй документ с тем же именем не приходил).
                    if (sentOf(dir).containsKey("doc:${d.id}")) continue
                    val clean = Store.cleanName(d.name)
                    val ext = clean.substringAfterLast('.', "").let { if (it.isEmpty() || it == clean) "" else ".$it" }
                    val stem = clean.removeSuffix(ext)
                    var f = File(into, clean)
                    var n = 2
                    while (f.exists()) { f = File(into, "$stem ($n)$ext"); n++ }
                    into.mkdirs()
                    if (l.doc(o.id, d.id, f)) { markSent(dir, f); markRaw(dir, "doc:${d.id}", "есть") }
                }
            }
            for ((id, dir) in have) if (list.none { it.id == id }) binding(dir)?.takeIf { !it.removed }?.let { write(dir, it.copy(removed = true)) }
            _status.value = _status.value.copy(syncedAt = Platform.nowMs(), offline = false, error = null)
            Store.changed()
            refreshNotes()
            refreshCadastre()
            list.size
        } catch (e: Throwable) {
            _status.value = _status.value.copy(offline = !l.online, error = e.message ?: "нет связи с системой")
            throw e
        } finally {
            _status.value = _status.value.copy(pulling = false)
        }
    }

    // ---------- Отправка ----------

    private fun read(obj: File, name: String): MutableMap<String, String> = runCatching {
        json.decodeFromString(marks, File(obj, name).readText()).toMutableMap()
    }.getOrDefault(HashMap())

    private fun save(obj: File, name: String, m: Map<String, String>) = Store.writeDurably(File(obj, name), json.encodeToString(marks, m).encodeToByteArray())

    private fun sentOf(obj: File) = read(obj, SENT)

    private fun sig(f: File) = "${f.length()}:${f.lastModified()}"

    private fun rel(obj: File, f: File) = f.path.removePrefix(obj.path.trimEnd('/')).trimStart('/')

    private fun markSent(obj: File, f: File) = markRaw(obj, rel(obj, f), sig(f))

    private fun markRaw(obj: File, key: String, value: String) { val m = sentOf(obj); m[key] = value; save(obj, SENT, m) }

    /** Отметки описи — файлами её папки; уходят в систему вместе со снимками предметов. */
    private val INVENTORY_MARKS = setOf(Inventory.BROKEN, Inventory.REPAIR, Inventory.EARLIER)

    /**
     * Что из объекта уходит в систему: всё, кроме служебного и сведений объекта; из описей — отметки и снимки
     * предметов (книга, отчёт и журнал описи — её служебное).
     */
    private fun sendable(r: String): Boolean {
        // Поворот снимка — скрытым файлом «.<снимок>.поворот» рядом (Store.setTurn): уходит, чтобы снимок в системе
        // не лежал на боку (аудит 03.11.2026, п. 24). Остальное скрытое — служебное.
        val last = r.substringAfterLast('/')
        val turn = last.startsWith(".") && last.endsWith(".поворот") && r.split('/').dropLast(1).none { it.startsWith(".") }
        if (!turn && r.split('/').any { it.startsWith(".") }) return false
        if (r == Objects.INFO) return false
        if (r.substringBefore('/') != Objects.MACHINES) return true
        val name = r.substringAfterLast('/')
        val parts = r.split('/')
        // Причина ремонта — «Комментарий.txt» папки предмета описи (<Механизмы>/<опись>/<папка>/…): уходит с инвентарниками
        // папки (06.11.2026). Комментарий самой описи — её служебное.
        if (name == Store.NOTE) return parts.size == 4
        // Акт на группу позиций — файл в «<опись>/Акты/» (инвентарники — рядом, скрытым файлом [actItemsFile]).
        if (parts.size == 4 && parts[2] == ACTS) return name.substringAfterLast('.', "").lowercase() in setOf("pdf", "jpg", "jpeg", "png", "webp", "heic")
        return name in INVENTORY_MARKS || name.substringAfterLast('.', "").lowercase() in setOf("jpg", "jpeg", "png", "webp", "heic")
    }

    /** Папка актов в папке описи. */
    const val ACTS = "Акты"

    /** Скрытый файл рядом с актом: инвентарники позиций, на которые он составлен (по строке). */
    private fun actItemsFile(act: File) = File(act.parentFile!!, ".${act.name}.позиции")

    /**
     * Инвентарники, с которыми файл уходит в систему: у снимка и комментария папки предмета — предметы этой папки, у акта —
     * позиции группы.
     */
    private fun itemsOf(r: String, f: File): List<String> = when {
        !r.startsWith(Objects.MACHINES + "/") -> emptyList()
        f.parentFile?.name == ACTS -> runCatching { actItemsFile(f).readLines().filter { it.isNotBlank() } }.getOrDefault(emptyList())
        else -> f.parentFile?.let { Inventory.members(it) }.orEmpty()
    }

    /** Не отправленное из объекта: новое и изменённое; не принятое системой — пока файл тот же, не повторяется. */
    fun pending(obj: File): List<File> {
        val sent = sentOf(obj)
        val failed = read(obj, FAILED)
        // ТС, выявленное на месте, без снимка не уходит — ни параметры, ни документы (автор, 06.11.2026).
        val held = foundWithoutPhoto(obj).map { rel(obj, it) + "/" }
        return obj.walkTopDown().onEnter { it == obj || !it.name.startsWith(".") }
            .filter { it.isFile && sendable(rel(obj, it)) && sent[rel(obj, it)] != sig(it) && failed[rel(obj, it)]?.substringBefore('|') != sig(it) &&
                held.none { h -> rel(obj, it).startsWith(h) } }
            .toList()
    }

    /**
     * Выявленное на месте ТС — папка в «Транспортных средствах», которой нет среди назначенных ОИ системы — без единого
     * снимка. Автор, 06.11.2026: «Выявленное на месте ТС — снимок обязателен», номер, VIN и описание — по желанию.
     */
    fun foundWithoutPhoto(obj: File): List<File> {
        val b = binding(obj) ?: return emptyList()
        return Objects.vehicles(obj).filter { d -> b.oiOf(rel(obj, d) + "/x") == null && Store.photoTree(d).isEmpty() }
    }

    /** Папка [dir] — выявленное на месте ТС, в котором ещё нет снимка (подсказка «Нужен хотя бы один снимок ТС»). */
    fun needsPhoto(dir: File): Boolean = Objects.of(dir)?.let { o -> foundWithoutPhoto(o).any { it.path == dir.path } } == true

    /** Не принятое системой: путь → причина. */
    fun failed(obj: File): Map<String, String> = read(obj, FAILED).mapValues { it.value.substringAfter('|') }
        .filterKeys { File(obj, it).isFile }

    /** Отправленное и удалённое на телефоне — уходит пометкой. */
    private fun gone(obj: File): List<String> = sentOf(obj).keys.filter { !it.startsWith("doc:") && !File(obj, it).exists() }

    /** Сколько ждёт отправки по всем объектам системы. */
    fun pendingCount(): Int = bound().sumOf { pending(it.first).size }

    private val sendLock = Mutex()

    /**
     * Отправить всё неотправленное — и по законченным, и по снятым объектам («пока есть то, что относится к обьекту
     * - отправляем»). Система не ответила — остановиться: остальное подождёт следующей попытки (при съёмке, по
     * «Отправить», раз в полминуты). Не приняла файл — запомнить почему и идти дальше. Сколько ушло.
     */
    suspend fun sendAll(): Int = sendLock.withLock {
        val l = link ?: return 0
        if (!active) return 0
        var sent = 0
        _status.value = _status.value.copy(sending = true, pending = pendingCount())
        try {
            for ((obj, b) in bound()) {
                for (f in pending(obj)) {
                    val r = rel(obj, f)
                    // Снимок и комментарий в папке предмета описи — с инвентарниками предметов этой папки, акт — с позициями группы.
                    val items = itemsOf(r, f)
                    val res = runCatching { l.send(b.id, r, b.oiOf(r), f, items) }.getOrElse { SendResult(false) }
                    if (!res.ok) {
                        _status.value = _status.value.copy(offline = !l.online, error = if (l.online) "система не ответила" else "нет связи")
                        return sent
                    }
                    if (res.taken) {
                        markSent(obj, f); sent++
                        read(obj, FAILED).takeIf { r in it }?.let { m -> m.remove(r); save(obj, FAILED, m) }
                    } else {
                        val m = read(obj, FAILED); m[r] = sig(f) + "|" + res.why.ifBlank { "система не приняла файл" }; save(obj, FAILED, m)
                    }
                    _status.value = _status.value.copy(pending = (_status.value.pending - 1).coerceAtLeast(0), offline = false, error = null)
                }
                for (r in gone(obj)) {
                    val ok = runCatching { l.deleted(b.id, r, b.oiOf(r)?.id.orEmpty()) }.getOrElse { false }
                    if (!ok) return sent
                    val m = sentOf(obj); m.remove(r); save(obj, SENT, m)
                }
            }
            sent
        } finally {
            _status.value = _status.value.copy(sending = false, pending = pendingCount(), failed = bound().sumOf { failed(it.first).size })
        }
    }

    /** Пересчитать «ждёт отправки» и «не принято» (после съёмки, удаления). */
    fun recount() {
        _status.value = _status.value.copy(pending = if (active) pendingCount() else 0,
            failed = if (active) bound().sumOf { failed(it.first).size } else 0)
    }

    /** Незаполненное обязательное по ОИ объекта: подпись ОИ → сколько обязательных не заполнено. */
    fun missing(obj: File): List<Pair<String, Int>> {
        val b = binding(obj) ?: return emptyList()
        return b.ois.mapNotNull { oi ->
            val d = if (oi.path.isEmpty()) obj else File(obj, oi.path)
            val form = Params.formOf(d) ?: return@mapNotNull null
            val left = Params.progress(form, Params.load(d)).requiredLeft
            if (left > 0) oi.label to left else null
        }
    }

    /**
     * «Осмотр закончен»: сначала отправить всё, потом отметить; не ушло — не отмечать. [incomplete] — обязательное
     * заполнено не всё (автор: «Предупредить, «неполный»»).
     */
    suspend fun finish(obj: File, done: Boolean = true, incomplete: Boolean = false): Boolean {
        val l = link ?: return false
        val b = binding(obj) ?: return false
        sendAll()
        if (done && pending(obj).isNotEmpty()) return false
        if (!runCatching { l.finish(b.id, done, incomplete) }.getOrElse { false }) return false
        runCatching { pull() }
        return true
    }

    // ---------- День осмотрщика (план пользователя 06.11.2026) ----------

    private const val READ = ".уведомления-прочитаны"
    /** Лента уведомлений; прочитанные — номера хранятся на устройстве, как прочие настройки приложения. */
    val notes = MutableStateFlow<List<EstateNote>>(emptyList())
    private val _read = MutableStateFlow<Set<String>?>(null)
    val read = _read.asStateFlow()

    private fun readSet(): Set<String> = _read.value ?: runCatching { File(Store.root, READ).readText().lines().filter { it.isNotBlank() }.toSet() }
        .getOrDefault(emptySet()).also { _read.value = it }

    /** Сколько непрочитанных. */
    fun unread(list: List<EstateNote>, read: Set<String>?): Int = list.count { it.id !in (read ?: emptySet()) }

    /** Подтянуть ленту; нет связи — прежняя остаётся. */
    suspend fun refreshNotes() {
        val l = link ?: return
        readSet()
        runCatching { l.notes() }.onSuccess { notes.value = it }
    }

    /** Отметить прочитанными (при открытии ленты); хранится не больше последних 300. */
    fun markRead(ids: Collection<String>) {
        val now = readSet()
        if (ids.all { it in now }) return
        val next = (now + ids).toList().takeLast(300).toSet()
        _read.value = next
        Store.writeDurably(File(Store.root, READ), next.joinToString("\n").encodeToByteArray())
    }

    suspend fun moveReasons(): List<String> = runCatching { link?.moveReasons() }.getOrNull().orEmpty().ifEmpty { listOf("Объект закрыт") }
    suspend fun plans(days: Int = 28): EstatePlans? = runCatching { link?.plans(days) }.getOrNull()
    suspend fun report(date: String): EstateDayReport? = runCatching { link?.report(date) }.getOrNull()

    /** Взять задачу на день и сверить назначения. */
    suspend fun take(objectId: String, date: String): Boolean {
        val ok = runCatching { link?.take(objectId, date) }.getOrNull() == true
        if (ok) runCatching { pull() }
        return ok
    }

    /** Запрос переноса и сверка (метка «Запрошен перенос» приходит с назначениями). */
    suspend fun move(objectId: String, date: String, reason: String, note: String): Boolean {
        val ok = runCatching { link?.move(objectId, date, reason, note) }.getOrNull() == true
        if (ok) runCatching { pull() }
        return ok
    }

    suspend fun saveMorning(date: String, odometer: String, noOdometer: Boolean): EstateSaved =
        runCatching { link?.saveMorning(date, odometer, noOdometer) }.getOrNull() ?: EstateSaved(false, "нет связи с E•state")

    suspend fun saveEvening(date: String, km: String, kmByRoute: Boolean, done: List<String>, partial: List<EstatePartial>, note: String): EstateSaved =
        runCatching { link?.saveEvening(date, km, kmByRoute, done, partial, note) }.getOrNull() ?: EstateSaved(false, "нет связи с E•state")

    /** Осмотр не состоялся — причина и пояснение в систему. */
    suspend fun outcome(obj: File, reason: String, note: String): Boolean {
        val l = link ?: return false
        val b = binding(obj) ?: return false
        return runCatching { l.outcome(b.id, reason, note) }.getOrElse { false }
    }

    // ---------- Пересъёмка, запросы документов, акты (решения пользователя 06.11.2026) ----------

    /**
     * Пересъёмка скана: страницы [pages] — файлом с тем же именем ([EstateRetake.title]) в «Документы» того же ОИ; прежний файл
     * заменяется, и система по имени и открытому возврату сама подменяет названные страницы. Одна страница документа с
     * расширением jpg — снимком как есть, прочее — PDF; у названия без расширения — «.pdf».
     */
    fun retakeInto(obj: File, b: EstateObject, r: EstateRetake, pages: List<File>): File {
        val oi = b.ois.firstOrNull { it.id == r.oiId }
        val into = File(if (oi == null || oi.path.isEmpty()) obj else File(obj, oi.path), Objects.DOCS)
        val clean = Store.cleanName(r.title)
        val ext = clean.substringAfterLast('.', "").lowercase()
        val name = if (ext in setOf("pdf", "jpg", "jpeg")) clean else clean.substringBeforeLast('.', clean) + ".pdf"
        val f = File(into, name)
        if (ext in setOf("jpg", "jpeg") && pages.size == 1) Store.writeDurably(f, pages[0].readBytes()) else Store.writeDurably(f) { ScanPdf.write(pages, it) }
        Store.scan(listOf(f)); Store.changed(structure = false)
        return f
    }

    /**
     * Акт на группу позиций: страницы — PDF «Акт <дата> <первый инвентарник> и ещё N» в «Акты» описи [inv], инвентарники позиций —
     * скрытым файлом рядом ([actItemsFile]); уходит в систему с ними. Имя занято — «(2)».
     */
    fun addAct(inv: File, ids: List<String>, pages: List<File>): File {
        val date = Platform.format(Platform.nowMs(), "dd.MM.yyyy")
        val what = ids.first() + if (ids.size > 1) " и ещё ${ids.size - 1}" else ""
        val f = Store.addFile(File(inv, ACTS), "Акт $date $what.pdf") { ScanPdf.write(pages, it) }
        Store.writeDurably(actItemsFile(f), ids.joinToString("\n").encodeToByteArray())
        Store.changed(structure = false)
        return f
    }

    /** Запросы документов осмотрщика (открытые и закрытые). */
    val cadastre = MutableStateFlow<List<EstateCadRequest>>(emptyList())

    /** Подтянуть запросы; система не ответила — прежние остаются, ответ false. */
    suspend fun refreshCadastre(): Boolean {
        val l = link ?: return false
        val got = runCatching { l.cadastre() }.getOrNull() ?: return false
        cadastre.value = got
        return true
    }

    /** Строк без ответа в открытых запросах. */
    fun cadOpen(list: List<EstateCadRequest>): Int = list.filter { !it.closed }.sumOf { it.waiting }

    /** Ответ по строке запроса; файл ([file]) — для «Получен». После успеха запросы читаются заново. */
    suspend fun cadAnswer(reqId: String, rowId: String, result: String, scanDate: String, answer: String, fileName: String, file: File?): EstateSaved {
        val saved = try {
            link?.cadAnswer(reqId, rowId, result, scanDate, answer, fileName, file) ?: EstateSaved(false, "нет связи с E•state")
        } catch (e: Throwable) {
            EstateSaved(false, e.message.orEmpty().ifBlank { "нет связи с E•state" })
        }
        if (saved.ok) refreshCadastre()
        return saved
    }
}
