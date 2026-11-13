package kg.osmotr.core

/**
 * Объект осмотра (автор, 29.10.2026): «Обьект (название). В корне недвижимое и движимое. Механизмы и
 * оборудование (текущие описи) переносим в отдельную папку (3-я категория)». Объект — папка в «Осмотрах»:
 *
 * ```
 * <Объект>/
 * ├── Объект.txt                    «Учреждение: …», «Адрес: …» — заранее, от регионального менеджера
 * ├── Контакты.xlsx                 контакты лица — тоже заранее (Store.contacts)
 * ├── Документы/                    PDF недвижимости — к объекту
 * ├── Недвижимое/
 * │   ├── Земельный участок/        без деления
 * │   └── <литер или найденное>/    «А», «Б», «Навес» — имя любое
 * │       ├── Внутренние помещения/ одна папка (автор: «Внутренние — 1 папка»)
 * │       └── Фасад/
 * ├── Движимое/
 * │   └── <госномер>/               снимки и PDF ТС; госномер — руками
 * └── Механизмы и оборудование/
 *     └── <опись>/                  описи как прежде (Inventory)
 * ```
 *
 * Файлы — истина, как везде в «Осмотре»: объект узнаётся по `Объект.txt`, сведения читаются из него.
 */
object Objects {
    const val INFO = "Объект.txt"
    const val DOCS = "Документы"
    const val REAL = "Недвижимое"
    /** Раздел ТС объекта (автор, 03.11.2026: «Транспортные средства»; прежде — «Движимое», Layout.migrate переименовывает). */
    const val MOVABLE = "Транспортные средства"
    const val OLD_MOVABLE = "Движимое"
    const val MACHINES = "Механизмы и оборудование"
    const val LAND = "Земельный участок"
    const val INSIDE = "Внутренние помещения"
    const val FACADE = "Фасад"

    /**
     * Всё, что лежало в «Осмотрах» до объектов (автор, 29.10.2026: «то, что есть на момент установки и
     * первого запуска переносим в папку осмотрено ранее (старая версия)… А рядом уже наша новая
     * структура»). Описи внутри работают как прежде.
     */
    const val OLD = "Осмотрено ранее (старая версия)"

    /** Перенос сделан: второй раз при запуске не переносить (и новое не трогать). */
    private const val MARK = ".объекты-v1"

    /**
     * Сущность объекта (автор, 03.11.2026: «Необходимо сделать 3 сущности. ТС, недвижка и опись. Документы - раздел»):
     * [REAL] — недвижимость (литеры, квартира, участки; ТС и описи внутри — своими разделами), [VEHICLE] — объект и есть
     * машина (снимки, параметры и «Документы» прямо в нём), [INVENTORY] — опись (механизмы и оборудование).
     * [MIXED] — объект без указанного вида (заведён до сущностей): все разделы, как прежде.
     */
    enum class Entity(val word: String, val title: String) {
        REAL("недвижимость", "Недвижимость"), VEHICLE("тс", "Транспортное средство"), INVENTORY("опись", "Опись"), MIXED("", "");
        companion object { fun of(word: String) = entries.firstOrNull { it.word.isNotEmpty() && it.word.equals(word.trim(), ignoreCase = true) } ?: MIXED }
    }

    data class Info(val institution: String = "", val address: String = "", val entity: Entity = Entity.MIXED)

    fun isObject(dir: File): Boolean = dir.parentFile == Store.root && File(dir, INFO).isFile

    /** Объекты — в «Осмотрах», по `Объект.txt`; «Осмотрено ранее» — не объект. */
    fun all(): List<File> = Store.foldersIn(Store.root).filter(::isObject)

    fun old(): File = File(Store.root, OLD)

    /** Объект, к которому относится [dir] (сам объект или что-то внутри него); вне объектов — null. */
    fun of(dir: File): File? = generateSequence(dir) { if (it == Store.root) null else it.parentFile }.firstOrNull(::isObject)

    fun info(obj: File): Info {
        val lines = runCatching { File(obj, INFO).readText() }.getOrDefault("").lines()
        fun field(name: String) = lines.firstOrNull { it.startsWith("$name:") }?.substringAfter(':')?.trim().orEmpty()
        return Info(field("Учреждение"), field("Адрес"), Entity.of(field("Вид")))
    }

    /** Сущность объекта ([Entity]) — из `Объект.txt`, строка «Вид: …». */
    fun entity(obj: File): Entity = info(obj).entity

    fun setInfo(obj: File, info0: Info) {
        // Вид не указан (окно сведений его не знает) — прежний остаётся.
        val info = if (info0.entity == Entity.MIXED) info0.copy(entity = entity(obj)) else info0
        val text = "Учреждение: ${info.institution.trim().replace('\n', ' ')}\nАдрес: ${info.address.trim().replace('\n', ' ')}\n" +
            (if (info.entity != Entity.MIXED) "Вид: ${info.entity.word}\n" else "")
        Store.writeDurably(File(obj, INFO), text.encodeToByteArray())
        Store.changed(structure = false)
    }

    /** Новый объект со всей раскладкой; имя занято — «Имя (2)». */
    fun create(name: String, info: Info = Info()): File {
        val clean = Store.cleanName(name).trim().ifEmpty { "Объект" }
        var dir = File(Store.root, clean); var n = 2
        while (dir.exists() || dir.name == OLD) dir = File(Store.root, "$clean (${n++})")
        dir.mkdirs()
        setInfo(dir, info)
        Store.changed()
        return dir
    }

    /**
     * Документы недвижимости — папка в «Недвижимом» (автор, 30.10.2026: «Документы недвижки должны лежать в
     * папке внутри папки недвижимость… К конкретной литере мы не можем привязать техпаспорт»). Не литер:
     * без формы параметров, сети на неё не переносятся.
     */
    fun realDocs(obj: File) = File(obj, "$REAL/$DOCS")

    /** У объекта, заведённого до 3.17, папки документов недвижимости нет — завести (при входе в «Недвижимое»). */
    /**
     * Базовые папки (автор, 03.11.2026: «базовые папки запрещаем удалять. Для них запускаем очищение… на телефоне они
     * создаются только при наличии содержимого»): у объекта — документы, недвижимое, движимое, механизмы; в недвижимом —
     * участок и документы; у литера — помещения и фасад; у ТС — документы. На экране видны всегда, на диске — пока в них
     * что-то есть; удалить нельзя — только очистить, переименовать и перенести тоже нельзя.
     */
    fun baseChildren(dir: File): List<String> {
        val parent = dir.parentFile ?: return emptyList()
        return when {
            // Разделы — по сущности: у ТС только документы (снимки и параметры — в самом объекте), у описи — механизмы.
            isObject(dir) -> when (entity(dir)) {
                Entity.VEHICLE -> listOf(DOCS)
                Entity.INVENTORY -> listOf(DOCS, MACHINES)
                Entity.REAL, Entity.MIXED -> listOf(DOCS, REAL, MOVABLE, MACHINES)
            }
            dir.name == REAL && isObject(parent) -> listOf(LAND, DOCS)
            parent.name == REAL && parent.parentFile?.let(::isObject) == true && dir.name != LAND && dir.name != DOCS -> listOf(INSIDE, FACADE)
            parent.name == MOVABLE && parent.parentFile?.let(::isObject) == true -> listOf(DOCS)
            else -> emptyList()
        }
    }

    /** Папки внутри [dir] — с его разделами, даже пустыми и потому пока не заведёнными на диске (дерево, перенос). */
    fun foldersWithBase(dir: File): List<File> {
        val have = Store.foldersIn(dir)
        val names = have.mapTo(HashSet()) { it.name }
        val extra = baseChildren(dir).filter { it !in names }.map { File(dir, it) }
        return if (extra.isEmpty()) have else (have + extra).sortedWith(Store.NATURAL_FILES)
    }

    /** Базовая папка — раздел объекта или папка ОИ из системы E•state (их тоже нельзя переименовать и перенести). */
    fun isBase(dir: File): Boolean = dir.parentFile?.let { dir.name in baseChildren(it) } == true || Estate.isOiFolder(dir)

    /** Папка есть — на диске или как базовая папки, которая есть сама. */
    fun present(dir: File): Boolean = dir.isDirectory || (isBase(dir) && dir.parentFile?.let(::present) == true)

    /** Пусто ли на диске: ни файлов, ни своих папок — только пустые базовые и служебное (с точки). */
    private fun bare(d: File): Boolean = (d.listFiles() ?: emptyArray()).all { it.name.startsWith(".") || (it.isDirectory && isBase(it) && bare(it)) }

    /** Пустые базовые папки объекта — с диска прочь (на экране остаются). Сколько убрано. */
    fun prune(obj: File): Int {
        if (!isObject(obj)) return 0
        val dirs = ArrayList<File>()
        fun walk(d: File) { for (n in baseChildren(d)) File(d, n).takeIf { it.isDirectory }?.let { dirs += it; walk(it) }
            Store.foldersIn(d).filter { !isBase(it) }.forEach { c -> if (baseChildren(c).isNotEmpty()) walk(c) } }
        walk(obj)
        var n = 0
        for (d in dirs.sortedByDescending { it.path.length }) if (d.isDirectory && bare(d) && d.deleteRecursively()) n++
        if (n > 0) Store.changed()
        return n
    }

    /** Литер или найденное («А», «Навес») — с «Внутренними помещениями» и «Фасадом»; занято — null. */
    fun addBuilding(obj: File, name: String): File? {
        val clean = Store.cleanName(name).trim()
        if (clean.isEmpty() || clean.equals(LAND, ignoreCase = true) || clean.equals(DOCS, ignoreCase = true)) return null
        val dir = File(obj, "$REAL/$clean")
        if (dir.exists()) return null
        dir.mkdirs()
        Store.changed()
        return dir
    }

    /** Литеры и найденное объекта — всё в «Недвижимом», кроме земельного участка и документов. */
    fun buildings(obj: File): List<File> = Store.foldersIn(File(obj, REAL)).filter { it.name != LAND && it.name != DOCS }

    /**
     * Госномер — руками (автор: «Вводим руками»), как написан: пробелы схлопываются, буквы — заглавные,
     * чтобы «01 kg 123 abc» и «01KG 123ABC» не стали двумя машинами.
     */
    fun plate(text: String): String = Store.cleanName(text).uppercase().replace(Regex("\\s+"), " ").trim()

    /** ТС по госномеру; такой уже есть — null. */
    fun addVehicle(obj: File, number: String): File? {
        val p = plate(number)
        if (p.isEmpty()) return null
        val all = Store.foldersIn(File(obj, MOVABLE))
        if (all.any { it.name.replace(" ", "").equals(p.replace(" ", ""), ignoreCase = true) }) return null
        val dir = File(obj, "$MOVABLE/$p")
        dir.mkdirs()
        Store.changed()
        return dir
    }

    fun vehicles(obj: File): List<File> = Store.foldersIn(File(obj, MOVABLE))

    /**
     * Место объекта, куда раскладываются файлы при массовой подгрузке (автор, 29.10.2026: «массовую подгрузку
     * с предпросмотром и ручным распределением что куда»). [pdf] — можно ли сюда PDF: у недвижимости — к
     * объекту («Документы»), у ТС — к госномеру (автор: «У недвижки к обьекту, у ТС к госномеру»).
     */
    data class Place(val dir: File, val title: String, val pdf: Boolean)

    /**
     * Куда можно разложить в объекте: документы, участок (и каждый участок в нём — заведённые из листа сводной),
     * помещения и фасад каждого литера, каждое ТС, свои категории объекта (автор, 29.10.2026: «даем возможность
     * завести свою категорию. Жесткие ограничения нам не особо нужны» — туда можно и PDF).
     */
    fun places(obj: File): List<Place> = buildList {
        add(Place(File(obj, DOCS), DOCS, pdf = true))
        add(Place(realDocs(obj), "$REAL · документы", pdf = true))
        add(Place(File(obj, "$REAL/$LAND"), LAND, pdf = false))
        for (plot in Store.foldersIn(File(obj, "$REAL/$LAND"))) add(Place(plot, "$LAND · ${plot.name}", pdf = false))
        for (b in buildings(obj)) {
            add(Place(File(b, INSIDE), "${b.name} · помещения", pdf = false))
            add(Place(File(b, FACADE), "${b.name} · фасад", pdf = false))
        }
        for (v in vehicles(obj)) { add(Place(vehicleDocs(v), "ТС ${v.name} · документы", pdf = true)); add(Place(v, "ТС ${v.name} · снимки", pdf = false)) }
        for (c in categories(obj)) add(Place(c, c.name, pdf = true))
    }

    /** Папка документов ТС: `<госномер>/Документы` — любые форматы, сканы jpg не смешиваются со снимками ТС. */
    fun vehicleDocs(vehicle: File): File = File(vehicle, DOCS)

    /** Группа в «Все документы»: где лежат и что. */
    class DocGroup(val title: String, val files: List<File>)

    /**
     * Все документы объекта по местам (автор, 02.11.2026: «Нет просмотра всех прикрепленных документов»).
     * Снимок — документ только в папках «Документы»; описи «Механизмов и оборудования» — не документы.
     */
    fun documents(obj: File): List<DocGroup> {
        val root = obj.absolutePath
        fun inDir(d: File) = buildList {
            addAll(Store.pdfsIn(d)); addAll(Lists.listsIn(d)); addAll(Store.docsIn(d))
            if (d.name == DOCS) addAll(Store.photosIn(d))
        }
        return obj.walkTopDown().onEnter { !it.name.startsWith(".") && it.name != MACHINES }.filter { it.isDirectory }
            .map { d -> d to inDir(d) }.filter { it.second.isNotEmpty() }
            .map { (d, files) -> DocGroup(d.absolutePath.removePrefix(root).trimStart(File.separatorChar).replace(File.separator, " › ").ifEmpty { obj.name }, files) }
            .toList()
    }

    /** Свои категории объекта — папки в нём, кроме заведённых приложением. */
    fun categories(obj: File): List<File> = Store.foldersIn(obj).filter { it.name !in setOf(DOCS, REAL, MOVABLE, MACHINES) }

    /**
     * Где могут лежать описи: «Осмотрено ранее» (прежние, как были), «Механизмы и оборудование» каждого
     * объекта и — на всякий случай — сами «Осмотры» (опись, положенная туда мимо приложения).
     */
    fun inventoryHomes(): List<File> = buildList {
        add(Store.root)
        old().takeIf { it.isDirectory }?.let(::add)
        all().forEach { add(File(it, MACHINES)) }
    }

    /** Все папки описей. */
    fun inventories(): List<File> = inventoryHomes().flatMap { Store.foldersIn(it) }.filter { Inventory.fileIn(it) != null }

    /** Сколько занимает «Осмотрено ранее» на телефоне — для напоминания выгрузить и стереть. */
    fun oldBytes(): Long = old().takeIf { it.isDirectory }?.walkTopDown()?.filter { it.isFile }?.sumOf { it.length() } ?: 0L

    /**
     * Разовый перенос при первом запуске версии с объектами: всё, что лежит в «Осмотрах», — как есть в
     * [OLD]. Описи переезжают целиком, и в журнал каждой — «Папка перенесена: было → стало»: проверка
     * журнала переписывает по этой записи пути всех её файлов (Journal.expected), иначе каждый снимок
     * выглядел бы «пропал без записи» и «появился без записи». Миниатюры едут следом. Пусто — только метка.
     */
    /** Переносить нечего — отметить сделанным (стенд тестов экранов: описи там заводятся в корне по-старому). */
    fun markMigrated() { if (Store.root.isDirectory) Store.writeDurably(File(Store.root, MARK), "без переноса\n".encodeToByteArray()) }

    fun migrateOnce() {
        val mark = File(Store.root, MARK)
        if (mark.exists() || !Store.root.isDirectory) return
        val before = (Store.root.listFiles() ?: emptyArray()).filter { !it.name.startsWith(".") && it.name != OLD && !isObject(it) }
        if (before.isNotEmpty()) {
            val old = old().also { it.mkdirs() }
            for (f in before) {
                var to = File(old, f.name); var n = 2
                while (to.exists()) to = File(old, "${f.name} (${n++})")
                val books = if (f.isDirectory) f.walkTopDown().onEnter { it == f || !it.name.startsWith(".") }
                    .filter { it.isDirectory && Inventory.fileIn(it) != null }.map { Store.relative(it) }.toList() else emptyList()
                val from = Store.relative(f)
                // Без имени папки: в телеметрию названия описей не идут.
                if (!f.renameTo(to)) { Telemetry.event("объекты", "папку не перенесли в «$OLD»"); continue }
                Store.movedThumbs(from, to)
                for (rel in books) {
                    val rest = rel.removePrefix(from).trimStart(File.separatorChar)
                    val inv = if (rest.isEmpty()) to else File(to, rest)
                    Journal.add(inv, Journal.FOLDER_MOVED, "$rel → ${Store.relative(inv)}")
                }
            }
        }
        Store.writeDurably(mark, "Перенос в «$OLD» сделан ${Platform.nowMs()}\n".encodeToByteArray())
        Store.changed()
    }
}
