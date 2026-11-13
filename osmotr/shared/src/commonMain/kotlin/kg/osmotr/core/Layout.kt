package kg.osmotr.core

/**
 * Строгая типизация папок (автор, 03.11.2026: «Перенос литер запретить в документы и т.д. Проверять тип папки. Строгая
 * типизация. Если не совпадает — предупреждаем… Необходима многоуровневая защита… Приложение не должно давать
 * возможность сломать структуру. На телефоне всё хранится так же. Изменения идут в логике программы»).
 *
 * Тип папки — по её месту в дереве, одно определение на всё приложение ([kindOf]). Что можно положить внутрь и куда
 * переносить — правила здесь же: [canCreateFolder], [checkMove]. Защита в три слоя: экран не предлагает невозможного
 * (серые места в окне переноса, нет «Новой папки»), спрашивает при несовпадении типа ([Verdict.Warn]), а сами
 * операции хранилища ([Store.moveFolder], [Store.renameFolder]) отказывают в запрещённом ([Verdict.Deny]) — даже
 * если до них дойдёт команда в обход экрана.
 */
object Layout {
    enum class Kind(val title: String) {
        ROOT("«Осмотры»"), OLD("«Осмотрено ранее»"), OBJECT("объект"),
        DOCS("документы объекта"), REAL("недвижимое"), REAL_DOCS("документы недвижимости"), LAND("земельный участок"),
        PLOT("участок"), BUILDING("литера"), ROOMS("внутренние помещения"), FACADE("фасад"),
        MOVABLE("транспортные средства"), VEHICLE("ТС"), VEHICLE_DOCS("документы ТС"),
        MACHINES("механизмы и оборудование"), INVENTORY("опись"),
        CATEGORY("категория объекта"), FOLDER("папка"), OUTSIDE("папка вне объекта"),
    }

    private val DOC_KINDS = setOf(Kind.DOCS, Kind.REAL_DOCS, Kind.VEHICLE_DOCS)

    /** Тип папки по месту: объект и его разделы, литеры, ТС, описи; всё прочее внутри — обычная папка. */
    fun kindOf(dir: File): Kind {
        if (dir == Store.root) return Kind.ROOT
        val parent = dir.parentFile ?: return Kind.OUTSIDE
        if (parent == Store.root) return when {
            dir.name == Objects.OLD -> Kind.OLD
            Objects.isObject(dir) -> Kind.OBJECT
            Inventory.fileIn(dir) != null -> Kind.INVENTORY   // опись прежней раскладки — прямо в «Осмотрах»
            else -> Kind.OUTSIDE
        }
        // Вне объектов (прежние описи, «Осмотрено ранее») — без структуры: обычные папки.
        if (Objects.of(dir) == null) return Kind.FOLDER
        val p = kindOf(parent)
        return when (p) {
            Kind.OBJECT -> when (dir.name) {
                Objects.DOCS -> Kind.DOCS; Objects.REAL -> Kind.REAL; Objects.MOVABLE -> Kind.MOVABLE; Objects.MACHINES -> Kind.MACHINES
                else -> Kind.CATEGORY
            }
            Kind.REAL -> when (dir.name) { Objects.LAND -> Kind.LAND; Objects.DOCS -> Kind.REAL_DOCS; else -> Kind.BUILDING }
            Kind.LAND -> Kind.PLOT
            Kind.BUILDING -> when (dir.name) { Objects.INSIDE -> Kind.ROOMS; Objects.FACADE -> Kind.FACADE; else -> Kind.FOLDER }
            Kind.MOVABLE -> Kind.VEHICLE
            Kind.VEHICLE -> if (dir.name == Objects.DOCS) Kind.VEHICLE_DOCS else Kind.FOLDER
            Kind.MACHINES -> Kind.INVENTORY
            else -> Kind.FOLDER
        }
    }

    fun isDocs(dir: File) = kindOf(dir) in DOC_KINDS

    /**
     * Можно ли завести обычную папку («Новая папка») прямо здесь. Нельзя: в корне — только объекты; в документах —
     * только файлы; в «Недвижимом», «Движимом» и «Механизмах» — только своё (литер, ТС, опись) своими кнопками.
     */
    fun canCreateFolder(parent: File): Boolean = when (kindOf(parent)) {
        Kind.ROOT, Kind.DOCS, Kind.REAL_DOCS, Kind.VEHICLE_DOCS, Kind.REAL, Kind.MOVABLE, Kind.MACHINES -> false
        else -> true
    }

    /** Подсказка имени новой папки — по месту (автор, 03.11.2026: «Подсказки новых папок в разделах показывают Например Насос»). */
    fun nameHint(parent: File): String = when (kindOf(parent)) {
        Kind.OBJECT -> "Например, Сооружения"
        Kind.LAND -> "Например, Участок 2"
        Kind.PLOT -> "Например, Ограждение"
        Kind.BUILDING -> "Например, Подвал"
        Kind.ROOMS -> "Например, Кухня"
        Kind.FACADE -> "Например, Северная сторона"
        Kind.VEHICLE -> "Например, Салон"
        Kind.INVENTORY, Kind.OLD -> "Например, Насос 1"
        else -> "Например, Склад"
    }

    sealed interface Verdict {
        data object Allow : Verdict
        /** Тип меняется или уходит в другой объект — переносить только с согласия. */
        data class Warn(val text: String) : Verdict
        data class Deny(val text: String) : Verdict
    }

    /**
     * Перенос папки [item] в [target]. Нельзя: базовые папки, объекты, в саму себя; папки — в документы; в корень и в
     * «Механизмы» — только описи; опись — только в «Механизмы». С предупреждением: тип меняется (ТС в «Недвижимое»
     * станет литером, литер в «Движимое» — ТС, литер или ТС в обычной папке — обычной папкой) или другой объект.
     */
    fun checkMove(item: File, target: File): Verdict {
        val name = "«${item.name}»"
        // Раздел объекта (его может и не быть на диске) — первым: иначе пустой «Фасад» сошёл бы за файл.
        if (Objects.isBase(item)) return Verdict.Deny("$name — раздел объекта: его нельзя переносить")
        if (!item.isDirectory) return checkFileMove(target)
        val from = kindOf(item)
        val to = kindOf(target)
        if (target == item || target.absolutePath.startsWith(item.absolutePath + File.separator)) return Verdict.Deny("$name нельзя перенести в саму себя")
        if (target == item.parentFile) return Verdict.Deny("$name уже здесь")
        if (from == Kind.OBJECT) return Verdict.Deny("Объект нельзя переносить в другую папку")
        if (from == Kind.ROOT || from == Kind.OLD) return Verdict.Deny("$name нельзя переносить")
        if (to in DOC_KINDS) return Verdict.Deny("В документы кладутся только файлы, не папки")
        // Корень — только объекты. Папки вне объектов (прежние описи) — без структуры: между ними перенос свободный.
        if (to == Kind.ROOT && from != Kind.OUTSIDE) return Verdict.Deny("Здесь лежат только объекты")
        if (from == Kind.OUTSIDE && to == Kind.OUTSIDE || to == Kind.ROOT) return Verdict.Allow
        if (to == Kind.MACHINES && from != Kind.INVENTORY) return Verdict.Deny("В «${Objects.MACHINES}» — только описи")
        if (from == Kind.INVENTORY && to != Kind.MACHINES && Objects.of(item) != null) return Verdict.Deny("Опись переносится только в «${Objects.MACHINES}» другого объекта")
        val becomes = when (to) {
            Kind.REAL -> Kind.BUILDING
            Kind.LAND -> Kind.PLOT
            Kind.MOVABLE -> Kind.VEHICLE
            Kind.MACHINES -> Kind.INVENTORY
            Kind.OBJECT -> Kind.CATEGORY
            Kind.BUILDING, Kind.VEHICLE -> Kind.FOLDER
            else -> Kind.FOLDER
        }
        val warnings = buildList {
            if (becomes != from && !(from == Kind.FOLDER && becomes == Kind.FOLDER) && !(from == Kind.CATEGORY && becomes == Kind.FOLDER)) {
                add("$name — ${from.title}, а там станет: ${becomes.title}")
            }
            if (from == Kind.CATEGORY && becomes == Kind.FOLDER) add("$name — ${from.title}, а там станет обычной папкой")
            val a = Objects.of(item); val b = Objects.of(target)
            if (a != null && b != null && a != b) add("$name уходит в другой объект: «${b.name}»")
        }
        return if (warnings.isEmpty()) Verdict.Allow else Verdict.Warn(warnings.joinToString(". ") + ".")
    }

    /** Снимки и файлы: только внутрь объекта (или «Осмотрено ранее»); в корень — нет. */
    private fun checkFileMove(target: File): Verdict = when (kindOf(target)) {
        Kind.ROOT -> Verdict.Deny("Снимки и файлы лежат внутри объекта или описи")
        else -> Verdict.Allow
    }

    /** Итог по нескольким: запрет — первый же; иначе предупреждения вместе. */
    fun checkMoveAll(items: Collection<File>, target: File): Verdict {
        val vs = items.map { checkMove(it, target) }
        vs.firstOrNull { it is Verdict.Deny }?.let { return it }
        val warns = vs.filterIsInstance<Verdict.Warn>().map { it.text }
        return if (warns.isEmpty()) Verdict.Allow else Verdict.Warn(warns.joinToString(" "))
    }

    // ---------- Версия раскладки и переход между версиями ----------

    /**
     * Версия раскладки — в «Осмотрах» скрытым файлом: какие шаги перехода уже пройдены. Раскладка на диске та же,
     * что прежде; шаги только чинят и сообщают. 2 — базовые папки без содержимого с диска прочь (3.21), проверка
     * типов: что лежит не на своём месте (папка в документах, не опись в «Механизмах») — в журнал диагностики.
     */
    const val VERSION = 3
    private const val MARK = ".структура"

    fun migrate() {
        if (!Store.ensureRoot()) return
        val mark = File(Store.root, MARK)
        val was = runCatching { mark.readText().trim().toInt() }.getOrDefault(1)
        Objects.all().forEach { runCatching { Objects.prune(it) } }
        if (was < 2) runCatching { problems().forEach { Telemetry.event("структура", it) } }
        // 3 — «Движимое» → «Транспортные средства» (автор, 03.11.2026); есть обе — содержимое прежней переносится.
        if (was < 3) runCatching {
            for (obj in Objects.all()) {
                val old = File(obj, Objects.OLD_MOVABLE).takeIf { it.isDirectory } ?: continue
                val now = File(obj, Objects.MOVABLE)
                if (!now.exists()) { if (old.renameTo(now)) Store.movedThumbs(Store.relative(old), now) }
                else for (f in old.listFiles() ?: emptyArray()) { var to = File(now, f.name); var n = 2
                    while (to.exists()) to = File(now, "${f.name} (${n++})"); f.renameTo(to) }
                if (old.isDirectory && (old.listFiles() ?: emptyArray()).isEmpty()) old.delete()
            }
            Store.changed()
        }
        if (was != VERSION) runCatching { Store.writeDurably(mark, VERSION.toString().encodeToByteArray()) }
    }

    /** Что лежит не на своём месте — словами, без имён (в диагностику уходит только вид нарушения). */
    fun problems(): List<String> = buildList {
        for (obj in Objects.all()) {
            for (d in listOf(File(obj, Objects.DOCS), Objects.realDocs(obj)) + Objects.vehicles(obj).map(Objects::vehicleDocs))
                if (Store.foldersIn(d).isNotEmpty()) add("папка внутри документов")
            if (Store.foldersIn(File(obj, Objects.MACHINES)).any { Inventory.fileIn(it) == null }) add("в механизмах — папка без описи")
        }
    }
}
