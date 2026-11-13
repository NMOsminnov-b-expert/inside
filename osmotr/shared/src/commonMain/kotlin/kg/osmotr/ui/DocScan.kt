package kg.osmotr.ui

import kg.osmotr.core.File
import kg.osmotr.core.Platform
import kg.osmotr.core.Store

/**
 * Съёмка документа страницами (решения пользователя 06.11.2026: пересъёмка скана, ответ на запрос документов из кадастра,
 * акт на группу позиций описи). Режим один — штатная камера приложения: на Android в ней есть кнопка сканера документов
 * (ML Kit: поля, выравнивание), на PWA и iPhone — обычная серия кадров. Кадры ложатся во временную скрытую папку
 * `.скан/…` в «Осмотрах», вернулись из камеры — страницы по порядку съёмки собираются в один PDF ([kg.osmotr.core.ScanPdf]), а
 * временная папка убирается. Папка с кадрами не относится ни к одному объекту: в журнал, отчёты и отправку не попадает.
 */
object DocScan {
    private class Job(val tmp: File, val done: suspend (pages: List<File>) -> String?)

    private var job: Job? = null

    /**
     * Открыть камеру. По возвращении [done] получает снятые страницы (по порядку съёмки) и отвечает строкой для плашки внизу
     * экрана (или null). Не снято ничего — [done] не зовётся.
     */
    fun start(host: Host, done: suspend (pages: List<File>) -> String?) {
        val tmp = File(Store.root, ".скан/${Platform.nanoTime()}")
        tmp.mkdirs()
        job = Job(tmp, done)
        host.takePhotos(tmp)
    }

    /** Вернулись из камеры, снимавшей [dir] — это съёмка документа. */
    fun owns(dir: File): Boolean = job?.tmp?.path == dir.path

    /** Собрать снятое: страницы — в [Job.done]; временная папка убирается. Ответ — для плашки. */
    suspend fun finish(): String? {
        val j = job ?: return null
        job = null
        return try {
            val pages = j.tmp.listFiles().orEmpty().filter(Store::isPhoto).sortedBy { it.name }
            if (pages.isEmpty()) null else j.done(pages)
        } catch (e: Throwable) {
            kg.osmotr.core.Telemetry.error("съёмка документа", e)
            "Документ не сохранён: " + e.message.orEmpty().ifBlank { "ошибка" }
        } finally {
            j.tmp.deleteRecursively()
        }
    }
}
