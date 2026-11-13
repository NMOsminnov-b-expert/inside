package kg.osmotr.core

import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized

/**
 * Телеметрия «Осмотра» — что происходило на телефоне, без личных данных (автор, 13.10.2026:
 * «Телеметрия доступна вся, кроме личных данных»; 14.10.2026: «подготовить всю телеметрию»).
 *
 * Журнал событий — строками в служебной папке приложения (не видна ни в «Файлах», ни по кабелю):
 * запуск (версия, система, модель), экраны, загрузки описей, разборы и их время, ошибки, падения.
 * Не пишется ничего, что человек набрал или назвал: ни текст поиска, ни комментарии, ни контакты,
 * ни имена описей и папок — вместо имени короткий отпечаток ([id]). Каждая строка ещё и
 * проходит [clean]: адреса почты и номера телефонов вычищаются, откуда бы ни пришли (текст
 * ошибки системы тоже бывает с ними).
 *
 * Падение (необработанная ошибка Kotlin) пишется отдельным файлом в момент сбоя — при следующем
 * запуске приложение предлагает его отправить. На iPhone рядом ложатся отчёты MetricKit (падения
 * и зависания самой системы, память, запуск) — их пишет обёртка на Swift в [dir]/metrickit.
 * «Диагностика» ([pack]) — всё одним архивом для «Поделиться».
 */
object Telemetry {
    /** Предел журнала: дорос — уходит в «прежний», новый начинается с нуля (вместе не больше двух пределов). */
    var limit = 512 * 1024L
    private val lock = SynchronizedObject()
    private var header = ""

    fun dir(): File = File(Store.cacheDir.parentFile!!, "telemetry")
    private fun log() = File(dir(), "log.txt")
    private fun previous() = File(dir(), "log.1.txt")
    private fun crashes() = dir().listFiles()?.filter { it.name.startsWith("crash-") && it.name.endsWith(".txt") }.orEmpty().sortedBy { it.name }
    private fun sentMark() = File(dir(), "sent.txt")

    /** Короткий отпечаток имени (описи, папки): одно и то же имя — один отпечаток, само имя не восстановить. */
    fun id(name: String): String = Journal.hex(Platform.sha256(name.encodeToByteArray())).take(8)

    private val EMAIL = Regex("""[\p{L}\p{N}._%+\-]+@[\p{L}\p{N}.\-]+\.\p{L}{2,}""")
    // Телефон: 7 и больше цифр, между ними пробелы, дефисы, скобки; «+» впереди.
    private val PHONE = Regex("""\+?\(?\d(?:[\s\-()]{0,2}\d){6,}""")

    /**
     * Строка без адресов почты, номеров телефонов и путей внутри «Осмотров» (в пути — названия описей и папок;
     * попадают из системного журнала и отчётов системы). Числа короче семи цифр (время, размеры, номера строк) остаются.
     */
    fun clean(text: String): String =
        PHONE.replace(EMAIL.replace(APP_PATH.replace(PATH.replace(text, "Осмотры/<…>"), "kg.osmotr/<…>"), "<почта>"), "<номер>")
    // До конца строки: в названиях папок бывают пробелы, а где путь кончается — по строке не понять.
    private val PATH = Regex("""Осмотры(?:-корзина)?/[^\n]*""")
    // Служебные папки приложения: в именах архивов и выгрузок — названия описей (падение 20.10.2026 так их и унесло).
    private val APP_PATH = Regex("""kg\.osmotr/(?:files|cache|code_cache)/[^\n]*""")

    /** Начало сеанса: версия, система, модель — первой строкой; заодно — шапка архива диагностики. */
    fun start(platform: String, app: String, os: String, model: String) {
        header = "Осмотр $app · $platform $os · $model"
        event("запуск", header)
    }

    /** Событие: вид («экран», «загрузка описи», «разбор»…) и подробности — без личного (их чистит [clean]). */
    fun event(kind: String, detail: String = "") = write("$kind${if (detail.isEmpty()) "" else ": $detail"}")

    /** Ошибка, пойманная по ходу (приложение работает дальше): где и что — вид и текст, первые строки стека. */
    fun error(where: String, e: Throwable) = write("ошибка · $where: ${describe(e, 6)}")

    /** Строка и в системный журнал (logcat, консоль Xcode) — как прежде [Platform.log]. */
    fun log(msg: String) { Platform.log(clean(msg)); write(msg) }

    private fun write(line: String) {
        val text = Platform.format(Platform.nowMs(), "yyyy-MM-dd HH:mm:ss") + "  " + clean(line).replace('\n', ' ') + "\n"
        runCatching {
            synchronized(lock) {
                dir().mkdirs()
                val f = log()
                if (f.length() + text.length > limit) { previous().delete(); f.renameTo(previous()) }
                if (!f.exists()) f.writeText("")
                f.appendDurably(text.encodeToByteArray())
            }
        }
    }

    /**
     * Падение: файл сразу, без очередей (процесс вот-вот закончится) — что, где, стек, и последние
     * строки журнала (что делали перед сбоем). Отправленные не предлагаются снова.
     */
    fun crash(e: Throwable) {
        runCatching {
            dir().mkdirs()
            val now = Platform.nowMs()
            val tail = runCatching { log().readLines().takeLast(40) }.getOrDefault(emptyList())
            // Чистится только текст ошибки: строки журнала уже чистые, а дата и время — не номер телефона.
            val body = buildString {
                appendLine("Падение «Осмотра» · ${Platform.format(now, "yyyy-MM-dd HH:mm:ss")}")
                appendLine(header)
                appendLine()
                appendLine(clean(describe(e, 60)))
                appendLine()
                appendLine("Перед этим:")
                tail.forEach { appendLine(it) }
            }
            File(dir(), "crash-${Platform.format(now, "yyyyMMdd-HHmmss")}.txt").writeText(body)
        }
    }

    /** Был ли наш файл падения в пределах 10 с от [ms] (то же падение Kotlin, что Android назвал своим). */
    fun crashedNear(ms: Long): Boolean {
        val near = (-10..10).map { "crash-" + Platform.format(ms + it * 1000L, "yyyyMMdd-HHmmss") }.toSet()
        return crashes().any { it.name.take(21) in near }
    }

    /**
     * Выход процесса со слов системы (Android: ApplicationExitInfo — нативное падение, зависание, убийство
     * при нехватке памяти): отчётом рядом с падениями Kotlin — тот же вид, предлагается отправить.
     * [trace] — стеки потоков зависания, чистятся [clean] как и всё остальное.
     */
    fun systemExit(kind: String, whenMs: Long, detail: String, trace: String) {
        runCatching {
            dir().mkdirs()
            val tail = runCatching { log().readLines().takeLast(40) }.getOrDefault(emptyList())
            val body = buildString {
                appendLine("Сбой «Осмотра» со слов системы · ${Platform.format(whenMs, "yyyy-MM-dd HH:mm:ss")}")
                appendLine(header)
                appendLine()
                appendLine(kind)
                appendLine(clean(detail))
                if (trace.isNotEmpty()) { appendLine(); appendLine(clean(trace)) }
                appendLine()
                appendLine("Журнал (до сбоя и запуск после):")
                tail.forEach { appendLine(it) }
            }
            File(dir(), "crash-${Platform.format(whenMs, "yyyyMMdd-HHmmss")}-система.txt").writeText(body)
        }
    }

    /** Ошибка словами: вид, текст и стек — до [lines] строк; причины — тоже. */
    private fun describe(e: Throwable, lines: Int): String {
        val parts = mutableListOf<String>()
        var t: Throwable? = e
        var depth = 0
        while (t != null && depth < 4) {
            val stack = t.stackTraceToString().lines().drop(1).map { it.trim() }.filter { it.isNotEmpty() }.take(lines)
            parts += (if (depth == 0) "" else "причина: ") + "${t::class.simpleName}: ${t.message.orEmpty()}" +
                if (stack.isEmpty()) "" else "\n  " + stack.joinToString("\n  ")
            t = t.cause.takeIf { it !== t }; depth++
        }
        return parts.joinToString("\n")
    }

    /** Отчёт целиком через [clean] — кроме первой строки (заголовок с датой: дату [clean] принял бы за номер телефона). */
    fun cleanReport(text: String): String = text.substringBefore('\n') + text.substringAfter('\n', "").let { if (it.isEmpty()) "" else "\n" + clean(it) }

    /** Отчёт об ошибке для экрана «Отчёты об ошибках»: что случилось, когда, первая строка подробностей. */
    class Report(val file: File, val title: String, val whenText: String, val summary: String, val sent: Boolean)

    /** Все отчёты — падения Kotlin и сбои со слов системы, новые сверху. */
    fun reports(): List<Report> {
        val sent = runCatching { sentMark().readLines().toSet() }.getOrDefault(emptySet())
        return crashes().reversed().map { f ->
            val lines = runCatching { cleanReport(f.readText()).lines() }.getOrDefault(emptyList())
            val first = lines.firstOrNull().orEmpty()
            val whenText = first.substringAfterLast(" · ", "")
            val system = first.startsWith("Сбой")
            // Падение Kotlin: 4-я строка — «Вид: текст»; со слов системы: 4-я — вид сбоя, 5-я — подробности.
            val title = if (system) lines.getOrNull(3).orEmpty().replaceFirstChar { it.uppercase() }.ifEmpty { "Сбой со слов системы" }
                else "Падение: " + lines.getOrNull(3).orEmpty().substringBefore(':').ifEmpty { "ошибка" }
            val summary = if (system) lines.getOrNull(4).orEmpty() else lines.getOrNull(3).orEmpty().substringAfter(": ", "").take(200)
            Report(f, title, whenText, summary, f.name in sent)
        }
    }

    /** Отчёты — копиями в [cacheDir]/reports (оттуда их отдаёт «Поделиться»; служебная папка наружу не открыта). */
    fun exportReports(files: List<File>, cacheDir: File): List<File> {
        val out = File(cacheDir, "diagnostics").apply { deleteRecursively(); mkdirs() }
        // Ещё раз через clean: отчёты, записанные до нынешних правил очистки, наружу тоже уходят чистыми.
        return files.filter { it.isFile }.map { f -> File(out, "Осмотр — ${f.name}").also { it.writeText(cleanReport(f.readText())) } }
    }

    /** Падения, которые ещё не отправляли: предложить при запуске. */
    fun unsentCrashes(): List<File> {
        val sent = runCatching { sentMark().readLines().toSet() }.getOrDefault(emptySet())
        return crashes().filter { it.name !in sent && worthNotice(it) }
    }

    /**
     * Предлагать ли отчёт при запуске: только настоящий сбой (автор, 02.11.2026: «Каждый раз говорит об ошибке даже
     * если просто выгрузили из памяти»). Систему, убравшую приложение из памяти, человек сбоем не считает —
     * такие выходы остаются в журнале и в «Отчётах об ошибках», но плашкой не приходят.
     */
    private fun worthNotice(f: File): Boolean {
        if ("-система" !in f.name) return true
        val kind = runCatching { f.readText().lines().getOrNull(3).orEmpty() }.getOrDefault("")
        return kind.startsWith("падение") || kind.startsWith("зависание") || kind.startsWith("сбой запуска")
    }

    /** Отправили — больше не предлагать. */
    fun markSent() = runCatching {
        dir().mkdirs()
        sentMark().writeText(crashes().joinToString("\n") { it.name } + "\n")
    }

    /**
     * Архив диагностики в [out]: сводка (версии, сколько описей, предметов и снимков — числа),
     * журнал (и прежний), падения, отчёты MetricKit. Личного внутри нет — всё прошло [clean] при записи.
     */
    fun pack(out: File): File {
        val summary = buildString {
            appendLine(header.ifEmpty { "Осмотр" })
            appendLine("Собрано: ${Platform.format(Platform.nowMs(), "yyyy-MM-dd HH:mm:ss")}")
            runCatching {
                val objs = Objects.inventories()
                appendLine("Описей: ${objs.size}")
                objs.forEach { o ->
                    val items = runCatching { Inventory.filesIn(o).sumOf { Inventory.parse(it).items.size } }.getOrDefault(-1)
                    val photos = runCatching { Store.photoTree(o).size }.getOrDefault(-1)
                    val check = runCatching { Journal.verifyQuick(o).text() }.getOrDefault("журнал не проверен")
                    appendLine("  опись ${id(o.name)}: предметов $items, снимков $photos; ${clean(check)}")
                }
            }.onFailure { appendLine("Описи не прочитаны: ${it::class.simpleName}") }
            appendLine("Падений: ${crashes().size}, не отправлено: ${unsentCrashes().size}")
        }
        out.parentFile?.mkdirs()
        Store.writeDurably(out) { sink ->
            val z = ZipWriter(sink)
            z.add("сводка.txt", summary.encodeToByteArray())
            listOf(previous(), log()).filter { it.isFile }.forEach { z.add(it.name, it.readBytes()) }
            crashes().forEach { z.add(it.name, cleanReport(it.readText()).encodeToByteArray()) }   // и старые — по нынешним правилам
            File(dir(), "metrickit").listFiles()?.filter { it.isFile }?.sortedBy { it.name }?.forEach { z.add("metrickit/" + it.name, it.readBytes()) }
            z.finish()
        }
        return out
    }
}
