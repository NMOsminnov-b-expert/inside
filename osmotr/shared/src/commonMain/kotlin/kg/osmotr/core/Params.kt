package kg.osmotr.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive

/**
 * Параметры осмотра недвижимости — то, что осмотрщик заполняет на месте (автор, 29.10.2026: «С ветки осмотров
 * подтяни актуальное по недвижке. Все поля, которые берет осмотрщик. Помимо папок добавляем пункт заполнения
 * параметров»). Состав, подписи, перечни и обязательность — из рабочей системы, как в `inside`
 * (ветка «осмотры», `app/pages/inspector/form.js` и справочники модулей): у строения — общие параметры,
 * инженерные сети, тип и класс капитальности, доп. параметры производственного, комментарий; у земельного
 * участка — тип, основные параметры, сельхоз-характеристики или инженерные сети, благоустройство, комментарий. Конструктив, износ и
 * состояние осмотрщик не заполняет — их ставят по снимкам (там же, решение от 16.10.2026).
 *
 * Всё о литере или участке — одним файлом по его имени в его папке ([fileOf]: «Литер_А.json», «Земельный_участок.json»;
 * автор, 29.10.2026: «Из-за большого количества файлов… пора переходить к единому файлику в формате json»,
 * «Условно Литер_А.json Литер_Б.json»): параметры, что перенесено с участка и комментарий
 * папки (прежний «Комментарий.txt» вливается сюда). Уходит в архив и видно по USB.
 * Репозиторий — закрытый (решение автора 29.10.2026): названия полей и перечни — данные `inside`.
 */
object Params {
    /** Прежнее имя файла (до 29.10.2026) — переименовывается в [fileOf] при первом чтении. */
    const val LEGACY = "Параметры осмотра.json"

    enum class Kind { SELECT, MULTI, NUMBER, TEXT }

    /** Поле: ключ, подпись, вид, перечень; обязательное ли и видно ли — по уже заполненному. */
    class Field(
        val key: String, val label: String, val kind: Kind, val options: List<String> = emptyList(),
        val required: (Map<String, Any>) -> Boolean = { false }, val visible: (Map<String, Any>) -> Boolean = { true },
        /** Подсказка под полем (из каталога рабочей системы). */
        val hint: String = "",
        /** Короткое поле: два таких подряд — в одну строку (автор, 02.11.2026: «Форма слишком громоздкая»). */
        val half: Boolean = false,
        /** Рядом с полем — «Геометка»: координаты вместо набора адреса руками. */
        val geo: Boolean = false,
        /** Подставлено само (госномер — с названия папки): заполненным осмотрщиком не считается. */
        val auto: Boolean = false,
        /** Текст можно наговорить: в правом верхнем углу поля — плашка микрофона (автор, 02.11.2026). */
        val voice: Boolean = false,
        /** Идёт ли в счёт «заполнено N из M» (комментарий — необязательный, не считается; автор, 03.11.2026). */
        val counted: Boolean = true,
    )

    private val ALWAYS: (Map<String, Any>) -> Boolean = { true }

    class Section(val key: String, val title: String, val fields: List<Field>)

    enum class Form { BUILDING, LAND, VEHICLE }

    // ---- Перечни (рабочая система) ----

    private val UTILITY = listOf("Подведены", "Проходят рядом", "На удалении", "Отсутствуют в районе")
    private val SEWERAGE = listOf("Подведена центральная", "Септик", "Очистные сооружения", "Проходят рядом", "На удалении", "Отсутствуют в районе")
    private val HEATING = UTILITY + "Автономное"
    private val BUILD_TYPE = listOf("Отдельностоящее", "Встроенное")
    private val LAND_FORM = listOf("Квадратная", "Прямоугольная", "Близкая к прямоугольной", "Трапециевидная", "Вытянутая прямоугольная",
        "Близкая к Г-образной", "Г-образная", "Неправильный многоугольник", "Неправильный многоугольник с заужением",
        "Узкая зауженная прямоугольная", "Треугольная", "Иное")
    private val LAND_RELIEF = listOf("Ровный", "Слабый уклон", "Средний уклон или с перепадами", "Крутой уклон", "Сложный рельеф")
    private val IMPROVE = listOf("Не благоустроен", "Частично благоустроен", "Благоустроен", "Дорогое благоустройство")

    private val COMMENT = Section("comments", "Комментарии", listOf(Field("note", "Комментарий осмотрщика", Kind.TEXT, voice = true, counted = false)))

    /**
     * Тип ОИ в папке литера — перечень недвижимости `inside` (data/rules.js, OI_TYPES; участок — своя папка; автор,
     * 02.11.2026: «Заместо квартира/нежилое используем типизацию ОЦ/ОИ из макета»). Форму меняет только квартира
     * (карточка apartment: flatSections), разделы строения скрыты; остальные типы — карточка строения.
     * Ключ прежний, в файлах прежнее «Строение» читается как «Здание».
     */
    const val OBJ_KIND = "objKind"

    /** Санузел — ключ формы осмотра системы. */
    const val BATHROOM = "bathroom"
    const val FLAT = "Квартира"
    private const val OLD_BUILDING = "Строение"
    const val BUILDING = "Здание"
    const val HOUSE = "Жилой дом"
    const val OTHER = "Прочее строение"
    const val AUX = "Вспомогательная постройка"
    val OI_TYPES = listOf(FLAT, BUILDING, HOUSE, OTHER, AUX)
    private fun flat(v: Map<String, Any>) = v[OBJ_KIND] == FLAT
    private val notFlat: (Map<String, Any>) -> Boolean = { !flat(it) }
    private val isFlat: (Map<String, Any>) -> Boolean = { flat(it) }

    /**
     * Тип участка (автор, 02.11.2026: «Осматриваться могут и сельхоз земли. Тогда надо выбирать тип ЗУ и подогнать под
     * каждую категорию характеристики»): состав — карточка участка `inside` (oi/land/view.js, data/dictionaries.js).
     * Тип не выбран — форма несельхоза, как у участков, заведённых раньше.
     */
    const val LAND_TYPE = "landType"
    const val AGRI = "Сельскохозяйственный"
    private val isAgri: (Map<String, Any>) -> Boolean = { it[LAND_TYPE] == AGRI }
    private val notAgri: (Map<String, Any>) -> Boolean = { it[LAND_TYPE] != AGRI }

    private val LAND_USE = listOf("Орошаемая пашня", "Богара", "Сенокос", "Сельскохозяйственное производство", "Кошара", "Иное")
    private val IRRIGATION_ACCESS = listOf("Хорошая", "Средняя", "Ограничена", "Отсутствует")
    /** Удалённость полива (автор, 13.11.2026); ключ irrigationDistance — тот же в карточке участка `inside`. */
    private val IRRIGATION_DISTANCE = listOf("На участке", "Рядом", "На незначительном удалении", "Удалён")
    private val IRRIGATION_TYPE = listOf("Арык", "Канал", "Речка", "Скважина", "Водопровод", "Прочее")
    private val LAND_SOIL = listOf("Чернозёмная", "Серозёмная", "Каштановая", "Лугово-болотная", "Песчаная", "Каменистая", "Иное")
    private val ENGINEERING = listOf("Электроснабжение", "Водоснабжение", "Ёмкость для воды", "Газоснабжение", "Отопление", "Канализация")

    // ---- Формы ----

    fun sections(form: Form): List<Section> = when (form) {
        Form.BUILDING -> building()
        Form.LAND -> land()
        Form.VEHICLE -> vehicle()
    }

    private fun building() = listOf(
        Section("kind", "Тип ОИ", listOf(Field(OBJ_KIND, "Тип ОИ", Kind.SELECT, OI_TYPES))),
        Section("general", "Общие параметры", listOf(
            // Автор, 13.11.2026: «В литерах (любых литерах) расположение строения переименовать в тип строения»; ключ прежний.
            Field("buildType", "Тип строения", Kind.SELECT, BUILD_TYPE, visible = notFlat),
            Field("floorsN", "Количество этажей", Kind.NUMBER, visible = notFlat),
        )),
        Section("flat", "Общие параметры квартиры", listOf(
            Field("aptFloor", "Этаж", Kind.NUMBER, visible = isFlat),
            Field("aptBuildingFloors", "Этажность дома", Kind.NUMBER, visible = isFlat),
            Field("aptStoreys", "Количество этажей в квартире", Kind.NUMBER, visible = isFlat),
            Field("aptRooms", "Количество комнат", Kind.NUMBER, visible = isFlat),
        )),
        // Автор, 02.11.2026: внутри и снаружи, множественный выбор; в макет поле добавляется тогда же.
        // Ключ — как в форме осмотра системы (inside, form.js: «bathroom»; автор, 03.11.2026: «Подбить ключи - ок»);
        // прежний «sanuzel» в файлах читается как он ([load]).
        Section("sanuzel", "Санузел", listOf(Field(BATHROOM, "Санузел", Kind.MULTI, listOf("Внутри", "Снаружи")))),
        // Обязательны у недвижимости только инженерные сети (автор, 02.11.2026).
        Section("nets", "Инженерные сети", listOf(
            Field("electricity", "Наличие электроснабжения", Kind.SELECT, UTILITY, required = ALWAYS),
            Field("centralWater", "Наличие водоснабжения", Kind.SELECT, UTILITY, required = ALWAYS),
            Field("sewerage", "Наличие канализации", Kind.SELECT, SEWERAGE, required = ALWAYS),
            Field("gasification", "Наличие газификации", Kind.SELECT, UTILITY, required = ALWAYS),
            Field("centralHeating", "Наличие отопления", Kind.SELECT, HEATING, required = ALWAYS),
        )),
        COMMENT,
    )

    private fun land() = listOf(
        Section("type", "Тип земельного участка", listOf(Field(LAND_TYPE, "Тип земельного участка", Kind.SELECT, listOf(AGRI, "Несельскохозяйственный")))),
        Section("place", "Основные параметры", listOf(
            Field("locationFeatures", "Особенности местоположения", Kind.TEXT),
            Field("form", "Форма участка", Kind.SELECT, LAND_FORM),
            Field("relief", "Рельеф участка", Kind.SELECT, LAND_RELIEF),
        )),
        Section("agri", "Сельскохозяйственные характеристики", listOf(
            Field("useCategory", "Категория и разрешенное использование", Kind.SELECT, LAND_USE, visible = isAgri),
            Field("irrigation", "Доступность полива", Kind.SELECT, IRRIGATION_ACCESS, visible = isAgri),
            Field("irrigationDistance", "Удалённость полива", Kind.SELECT, IRRIGATION_DISTANCE, visible = isAgri),
            Field("irrigationType", "Тип полива", Kind.SELECT, IRRIGATION_TYPE, visible = isAgri),
            Field("soil", "Тип почвы", Kind.SELECT, LAND_SOIL, visible = isAgri),
            // Автор, 13.11.2026: удалённость от райцентра, балл бонитета и каменистость убраны; прежние значения в файлах остаются.
            Field("utilities", "Инженерное оснащение", Kind.MULTI, ENGINEERING, visible = isAgri),
        )),
        // Сети и ветка — только у несельхоза; у сельхоза вместо них «Инженерное оснащение».
        Section("nets", "Инженерные сети", listOf(
            Field("electricity", "Наличие электроснабжения", Kind.SELECT, UTILITY, required = ALWAYS, visible = notAgri),
            Field("centralWater", "Наличие водоснабжения", Kind.SELECT, UTILITY, required = ALWAYS, visible = notAgri),
            Field("sewerage", "Наличие канализации", Kind.SELECT, SEWERAGE, required = ALWAYS, visible = notAgri),
            Field("gasification", "Наличие газификации", Kind.SELECT, UTILITY, required = ALWAYS, visible = notAgri),
            Field("centralHeating", "Наличие отопления", Kind.SELECT, HEATING, required = ALWAYS, visible = notAgri),
            Field("railway", "Наличие железнодорожной ветки", Kind.SELECT, listOf("Нет", "Есть", "Возможно подвести"), visible = notAgri),
        )),
        Section("improve", "Благоустройство территории", listOf(
            Field("improvementRank", "Наличие благоустройства", Kind.SELECT, IMPROVE),
            Field("improvementNote", "Особенности благоустройства", Kind.TEXT),
        )),
        COMMENT,
    )

    /**
     * ТС — поля «на месте» с экрана осмотрщика `inside` (form.js, vehicleSections; ключи — TS_ONSITE модуля ТС,
     * подписи, единицы и подсказки — из каталога ТС): что читается с таблички, прибора или документа, считается или
     * меряется рулеткой. Состояния, комплектация по видам, КПП и прочее «по снимкам» осмотрщику не показываются.
     * Категории ТС в «Осмотре» нет — подпись поля общая; модуль (установка на шасси) — по ответу «Есть модуль».
     */
    const val PLATE = "f.plate"

    // Автор, 02.11.2026: госномер вводится в начале — подставляется сам; модули, VIN, номера кузова и шасси
    // осмотрщик не ставит; адрес можно прикрепить геометкой; оси и комплектность убраны, вместо них — топливо
    // (перечень — каталог ТС `inside`, tsCatalog.js). Прежние значения в файлах остаются.
    private fun vehicle() = listOf(
        Section("ident", "Осмотр", listOf(
            Field(PLATE, "Регистрационный номер", Kind.TEXT, auto = true),
            Field("ts.addr", "Адрес на момент осмотра", Kind.TEXT, geo = true),
        )),
        Section("readings", "Показания", listOf(
            Field("f.mileage", "Пробег", Kind.NUMBER, half = true),
            Field("f.mileage@unit", "Единица", Kind.SELECT, listOf("км", "миль"), half = true),
            Field("f.engineHours", "Моточасы, ч", Kind.NUMBER, half = true),
            Field("f.wheel", "Руль", Kind.SELECT, listOf("Левый", "Правый"), half = true),
        )),
        Section("engine", "Двигатель", listOf(
            Field("f.fuel", "Тип топлива", Kind.SELECT, listOf("Бензин", "Дизель", "Газ", "Газ-бензин", "Гибрид", "Электро")),
        )),
        // Автор, 13.11.2026: «В ТС добавляем поле общего состояния с тем же словарем, что и в карточке ТС»
        // (`inside`, tsCatalog.js: generalState и generalStateNote при «Иное»).
        Section("state", "Состояние", listOf(
            Field("f.generalState", "Общее состояние", Kind.SELECT, listOf("Рабочее", "Условно пригодное", "Нерабочее", "Иное")),
            Field("f.generalStateNote", "Описание общего состояния", Kind.TEXT, visible = { it["f.generalState"] == "Иное" }, voice = true),
        )),
        COMMENT,
    )

    /** Какая форма у папки: литер или найденное объекта — строение (или квартира); участок; госномер в «Движимом» — ТС. */
    fun formOf(dir: File): Form? {
        val parent = dir.parentFile ?: return null
        // Объект-ТС — сам машина: форма ТС у объекта.
        if (Objects.isObject(dir) && Objects.entity(dir) == Objects.Entity.VEHICLE) return Form.VEHICLE
        if (parent.name == Objects.MOVABLE && parent.parentFile?.let(Objects::isObject) == true) return Form.VEHICLE
        val real = parent.takeIf { it.name == Objects.REAL && it.parentFile?.let(Objects::isObject) == true }
        if (real != null) return when (dir.name) { Objects.LAND -> Form.LAND; Objects.DOCS -> null; else -> Form.BUILDING }
        val land = parent.takeIf { it.name == Objects.LAND && it.parentFile?.name == Objects.REAL && it.parentFile?.parentFile?.let(Objects::isObject) == true }
        return if (land != null) Form.LAND else null
    }

    // ---- Место ТС при первом снимке ----

    /**
     * Определение места — у платформы ([Host.locate]); задаёт корень интерфейса. Нет — места само не ставится.
     */
    var locator: ((done: (String?) -> Unit) -> Unit)? = null
    private val placing = HashSet<String>()

    /**
     * Автор, 06.11.2026: «Место ТС — само при первом снимке». Лёг первый снимок в папку ТС, а «Адрес на момент
     * осмотра» пуст — записать туда геометку, как кнопка у поля (она остаётся для правки).
     */
    fun placeOnFirstPhoto(photos: List<File>) {
        val locate = locator ?: return
        for (dir in photos.mapNotNull { it.parentFile }.distinct()) {
            if (formOf(dir) != Form.VEHICLE) continue
            if (Store.photosIn(dir).size > photos.count { it.parentFile == dir }) continue
            if (!(load(dir)["ts.addr"] as? String).isNullOrBlank()) continue
            if (!placing.add(dir.path)) continue
            locate { place ->
                placing.remove(dir.path)
                val vals = load(dir)
                if (place != null && (vals["ts.addr"] as? String).isNullOrBlank()) save(dir, vals + ("ts.addr" to place))
            }
        }
    }

    // ---- Хранение ----

    private val json = Json { prettyPrint = true }

    /** Файл литера или участка — по имени папки, пробелы — подчёркиванием: «Литер А» → «Литер_А.json». */
    fun fileOf(dir: File) = File(dir, dir.name.trim().replace(Regex("\\s+"), "_") + ".json")

    /**
     * Прежнее — в файл литера: «Параметры осмотра.json» или файл под прежним именем (литер переименовали) —
     * переименовать; «Комментарий.txt» — влить в «note» и убрать. Только у папок литера и участка.
     */
    private fun migrate(dir: File) {
        val target = fileOf(dir)
        if (!target.exists()) {
            val old = File(dir, LEGACY).takeIf { it.isFile }
                ?: (dir.listFiles() ?: emptyArray()).filter { it.isFile && it.name.endsWith(".json") && !it.name.startsWith(".") }.singleOrNull()
            old?.renameTo(target)
        }
        val note = File(dir, Store.NOTE)
        if (note.isFile) {
            val text = note.readText().trim()
            val vals = read(target).toMutableMap()
            if (text.isNotEmpty() && (vals["note"] as? String).isNullOrBlank()) { vals["note"] = text; write(dir, vals) }
            note.delete()
        }
    }

    /** Тип ОИ литера ([OBJ_KIND]); не указан — null. Прежнее «Строение» — «Здание». */
    fun oiType(dir: File): String? = load(dir)[OBJ_KIND] as? String

    /** Заполненное: ключ → строка (выбор, число, текст) или список строк (несколько). */
    fun load(dir: File): Map<String, Any> {
        if (formOf(dir) != null) migrate(dir)
        var vals = read(fileOf(dir))
        // Прежний ключ санузла «sanuzel» — ключ формы осмотра системы «bathroom».
        vals["sanuzel"]?.let { v -> vals = (vals - "sanuzel") + (if (BATHROOM in vals) emptyMap() else mapOf(BATHROOM to v)) }
        return if (vals[OBJ_KIND] == OLD_BUILDING) vals + (OBJ_KIND to BUILDING) else vals
    }

    private fun read(f: File): Map<String, Any> {
        if (!f.isFile) return emptyMap()
        val obj = runCatching { json.parseToJsonElement(f.readText()) as? JsonObject }.getOrNull() ?: return emptyMap()
        return obj.mapNotNull { (k, v) ->
            when (v) {
                is JsonArray -> k to v.map { it.jsonPrimitive.content }
                is JsonPrimitive -> k to v.content
                else -> null
            }
        }.toMap()
    }

    /** Записать заполненное; пустые значения не хранятся, всё пустое — файла нет. */
    fun save(dir: File, values: Map<String, Any>) {
        if (formOf(dir) != null) migrate(dir)
        write(dir, values)
        Store.changed(structure = false)
    }

    private fun write(dir: File, values: Map<String, Any>) {
        val clean = values.filterValues { v -> (v as? String)?.isNotBlank() ?: (v as? List<*>)?.isNotEmpty() ?: false }
        val f = fileOf(dir)
        if (clean.isEmpty()) { if (f.exists()) f.delete(); return }
        val obj = JsonObject(clean.mapValues { (_, v) ->
            if (v is List<*>) JsonArray(v.map { JsonPrimitive(it.toString()) }) else JsonPrimitive(v.toString())
        })
        Store.writeDurably(f, json.encodeToString(JsonObject.serializer(), obj).encodeToByteArray())
    }

    // ---- Сети: с участка в литеры и «для всех разом» ----

    /** Инженерные сети строения — те же ключи и перечни, что у участка. */
    val NET_KEYS = listOf("electricity", "centralWater", "sewerage", "gasification", "centralHeating")

    /** Что участок перенёс в литеры — в его же файле: копию отличить от своего значения литера. */
    private fun carriedKey(key: String) = "carried.$key"

    /** Объект, если [land] — основной «Земельный участок» его «Недвижимого» (с него сети переносятся в литеры). */
    fun objectOfLand(land: File): File? = land.takeIf { it.name == Objects.LAND && it.parentFile?.name == Objects.REAL }
        ?.parentFile?.parentFile?.takeIf(Objects::isObject)

    /**
     * Литеры со своим значением сети [key], отличным и от перенесённого раньше, и от нового [value]: их перенос
     * затронет только с согласия («Заменить у объектов со своим значением?» — как в `inside`).
     */
    fun ownValues(obj: File, land: File, key: String, value: String): List<Pair<File, String>> {
        val was = load(land)[carriedKey(key)] as? String ?: ""
        return Objects.buildings(obj).mapNotNull { b ->
            val v = load(b)[key] as? String ?: ""
            if (v.isNotEmpty() && v != was && v != value) b to v else null
        }
    }

    /**
     * Перенести сеть с участка в литеры объекта (решения автора в `inside` 16.10 и 23.10.2026: «переносим копию.
     * Внутри ОИ оно может меняться»): у кого пусто или копия прежнего — ставится; своё — только при [replaceOwn];
     * участок очищен — копии снимаются, своё остаётся. Сколько литеров изменилось.
     */
    fun carryFromLand(land: File, key: String, value: String, replaceOwn: Boolean): Int {
        val obj = objectOfLand(land) ?: return 0
        val own = ownValues(obj, land, key, value).map { it.first }.toSet()
        var n = 0
        for (b in Objects.buildings(obj)) {
            if (b in own && (!replaceOwn || value.isEmpty())) continue
            val vals = load(b).toMutableMap()
            if ((vals[key] as? String ?: "") == value) continue
            if (value.isEmpty()) vals.remove(key) else vals[key] = value
            save(b, vals); n++
        }
        val landVals = load(land).toMutableMap()
        if (value.isEmpty()) landVals.remove(carriedKey(key)) else landVals[carriedKey(key)] = value
        save(land, landVals)
        return n
    }

    /** Значение сети у всех литеров объекта: одно на всех — оно; разные — null; литеров нет — "". */
    fun commonValue(obj: File, key: String): String? {
        val vs = Objects.buildings(obj).map { load(it)[key] as? String ?: "" }.toSet()
        return when (vs.size) { 0 -> ""; 1 -> vs.first(); else -> null }
    }

    /**
     * Сеть — всем литерам объекта разом (в `inside` 16.10.2026: «можем заполнить для всех разом, однако внутри
     * каждой карточки… всё ещё можно поменять отдельно»): литеры со своим другим значением — только при [replaceOwn].
     */
    fun setForAll(obj: File, key: String, value: String, replaceOwn: Boolean): Int {
        var n = 0
        for (b in Objects.buildings(obj)) {
            val vals = load(b).toMutableMap()
            val v = vals[key] as? String ?: ""
            if (v == value || (v.isNotEmpty() && !replaceOwn)) continue
            if (value.isEmpty()) vals.remove(key) else vals[key] = value
            save(b, vals); n++
        }
        return n
    }

    /** Видимые поля формы при этих значениях. */
    fun visibleFields(form: Form, values: Map<String, Any>): List<Field> = sections(form).flatMap { it.fields }.filter { it.visible(values) }

    /** Итог: сколько видимых полей заполнено, из скольких, и сколько обязательных ещё пусто. */
    data class Progress(val filled: Int, val total: Int, val requiredLeft: Int)

    fun progress(form: Form, values: Map<String, Any>): Progress {
        val fields = visibleFields(form, values)
        fun filled(f: Field) = values[f.key]?.let { v -> (v as? String)?.isNotBlank() ?: (v as? List<*>)?.isNotEmpty() } == true
        val own = fields.filter { !it.auto && it.counted }
        return Progress(own.count(::filled), own.size, own.count { it.required(values) && !filled(it) })
    }
}
