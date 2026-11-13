package kg.osmotr

import android.app.ActivityManager
import android.app.Application
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.os.Environment
import kg.osmotr.core.File
import kg.osmotr.core.Platform
import kg.osmotr.core.Store
import kg.osmotr.core.Telemetry

/**
 * Процесс «Осмотра»: хранилище, телеметрия и перехват падений — здесь, а не в MainActivity (27.10.2026,
 * «вылеты на андроиде, логов нет»). Android может поднять процесс сразу на экране камеры (выгрузил в
 * фоне — человек вернулся из «недавних»): MainActivity тогда не создаётся, а камера уже пишет кадры
 * через Store — без init и без перехватчика падение не оставляло ни строки.
 */
class OsmotrApplication : Application(), androidx.camera.core.CameraXConfig.Provider {
    /**
     * CameraX — только задние камеры (все: основная, ультраширик, телевик — CameraWork выбирает из них). По умолчанию
     * CameraX при запуске проверяет, что есть и задняя, и передняя; передней нет (эмулятор, часть рабочих
     * телефонов) — повторяет инициализацию до своего предела, ~6 с, и только потом открывает камеру
     * (29.10.2026: «Снять» → спуск готов через 7,0 с холодным запуском, 1,4 с тёплым).
     */
    override fun getCameraXConfig(): androidx.camera.core.CameraXConfig =
        androidx.camera.core.CameraXConfig.Builder.fromConfig(androidx.camera.camera2.Camera2Config.defaultConfig())
            .setAvailableCamerasLimiter(androidx.camera.core.CameraSelector.DEFAULT_BACK_CAMERA)
            .build()

    override fun onCreate() {
        super.onCreate()
        Platform.context = applicationContext
        Store.init(File(Environment.getExternalStorageDirectory().absolutePath), File(filesDir.absolutePath))
        // Телеметрия: сеанс (версия, система, модель) и падение Kotlin — файлом в момент сбоя (Telemetry.kt).
        Telemetry.start("Android", Platform.appVersion(), Platform.osVersion(), Platform.hardware())
        val prior = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e -> Telemetry.crash(e); prior?.uncaughtException(t, e) }
        ExitReasons.record(this)
    }
}

/**
 * Почему прошлые процессы закончились — со слов Android (11+): нативное падение (камера, сканер, видео),
 * зависание (ANR), убийство при нехватке памяти, сбой запуска. Перехватчик Kotlin их не видит, а Android
 * помнит последние выходы приложения — при запуске читаем новые с прошлого раза. Каждый — строкой в
 * журнал; заметные человеку — отчётом о падении (предложится отправить, попадёт в «Диагностику»).
 */
object ExitReasons {
    private const val SEEN = "exit-seen"

    fun record(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        runCatching {
            val prefs = ctx.getSharedPreferences("telemetry", Context.MODE_PRIVATE)
            val seen = prefs.getLong(SEEN, 0L)
            val am = ctx.getSystemService(ActivityManager::class.java)
            val fresh = am.getHistoricalProcessExitReasons(ctx.packageName, 0, 16).filter { it.timestamp > seen }.sortedBy { it.timestamp }
            if (fresh.isEmpty()) return
            // Автор, 27.10.2026: «Все отчёты. Даже от системы» — отчётом любой выход, кроме обычных закрытий
            // (смахнули из недавних, обновили приложение); в первый запуск — и то, что Android уже помнит.
            for (e in fresh) {
                val kind = kind(e.reason)
                val visible = e.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE
                val detail = "${e.description.orEmpty()} · ${if (visible) "на экране" else "в фоне"} · память ${e.pss / 1024} МБ"
                Telemetry.event("выход процесса", "$kind · $detail")
                if (e.reason !in ORDINARY && !(e.reason == ApplicationExitInfo.REASON_CRASH && Telemetry.crashedNear(e.timestamp)))
                    Telemetry.systemExit(kind, e.timestamp, detail, trace(e) + logs(e.pid))
            }
            prefs.edit().putLong(SEEN, fresh.last().timestamp).apply()
        }.onFailure { Telemetry.error("причины выхода", it) }
    }

    /** Обычные закрытия — не сбой: смахнули, остановили в настройках, обновили, сменили разрешения. */
    private val ORDINARY = setOf(ApplicationExitInfo.REASON_USER_REQUESTED, ApplicationExitInfo.REASON_USER_STOPPED,
        ApplicationExitInfo.REASON_PACKAGE_UPDATED, ApplicationExitInfo.REASON_PERMISSION_CHANGE)

    private fun kind(reason: Int) = when (reason) {
        ApplicationExitInfo.REASON_CRASH -> "падение (Kotlin)"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "падение нативного кода"
        ApplicationExitInfo.REASON_ANR -> "зависание (ANR)"
        ApplicationExitInfo.REASON_LOW_MEMORY -> "убит: нехватка памяти"
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "убит: слишком много ресурсов"
        ApplicationExitInfo.REASON_SIGNALED -> "убит сигналом"
        ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "сбой запуска"
        ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "умер зависимый процесс"
        ApplicationExitInfo.REASON_EXIT_SELF -> "закрылось само"
        ApplicationExitInfo.REASON_USER_REQUESTED -> "закрыто пользователем или системой"
        ApplicationExitInfo.REASON_USER_STOPPED -> "остановлено пользователем"
        ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "сменили разрешения"
        ApplicationExitInfo.REASON_PACKAGE_UPDATED -> "обновление приложения"
        ApplicationExitInfo.REASON_FREEZER -> "заморожено системой"
        else -> "причина $reason"
    }

    /**
     * Подробности от системы: зависание (ANR) — стеки потоков текстом (до 400 строк); нативное падение (Android 12+) —
     * отчёт системы двоичный (protobuf), из него — читаемые строки: сигнал, причина, имена функций стека.
     */
    private fun trace(e: ApplicationExitInfo): String = runCatching {
        val input = e.traceInputStream ?: return@runCatching ""
        when (e.reason) {
            ApplicationExitInfo.REASON_ANR -> "Стеки потоков (ANR):\n" + input.bufferedReader().useLines { it.take(400).joinToString("\n") }
            ApplicationExitInfo.REASON_CRASH_NATIVE -> {
                val bytes = input.use { it.readBytes() }
                val words = Regex("[\\x20-\\x7e]{6,}").findAll(String(bytes, Charsets.ISO_8859_1)).map { it.value }.distinct().take(300)
                "Отчёт системы о нативном падении (читаемые строки):\n" + words.joinToString("\n")
            }
            else -> ""
        }
    }.getOrNull().orEmpty()

    /** Журнал самого приложения (logcat) того процесса — если он ещё в буфере: последние 300 строк. */
    private fun logs(pid: Int): String = runCatching {
        val p = ProcessBuilder("logcat", "-d", "-v", "threadtime", "-t", "3000").redirectErrorStream(true).start()
        val mine = p.inputStream.bufferedReader().useLines { seq -> seq.filter { l -> l.split(Regex("\\s+")).getOrNull(2) == pid.toString() }.toList() }
        p.waitFor()
        if (mine.isEmpty()) "" else "\n\nЖурнал процесса (logcat):\n" + mine.takeLast(300).joinToString("\n")
    }.getOrNull().orEmpty()
}
