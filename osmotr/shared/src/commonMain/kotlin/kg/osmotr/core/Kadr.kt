package kg.osmotr.core

import okio.use

import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import okio.Path.Companion.toPath

/**
 * Кадр своей камеры — от имени до регистрации; одно правило для Android и iPhone (автор,
 * 19.10.2026: «фото сразу в нужную папку… только после этого регистрируем в системе»; «камера наша»).
 *
 * Порядок: имя в папке предмета резервируется (быстрая серия иначе давала двум кадрам одно имя —
 * файла ещё нет, пока камера пишет первый) → камера пишет во временный скрытый файл в той же папке
 * → кадр проверяется (JPEG от начала до конца) → переименование в настоящее имя → регистрация в
 * системе, миниатюра и журнал (`Store.saved`). Галерея о кадре узнаёт последней, когда файл уже
 * лежит на месте и цел; переносов из DCIM нет вовсе.
 */
class Kadr(private val dir: File) : SynchronizedObject() {
    /** Папка съёмки — чтобы экран отличал свои кадры от кадров других заходов. */
    val dirPath: String get() = dir.path

    class Slot(val tmp: File, val target: File)

    /** Место под следующий кадр: настоящее имя (не занятое ни на диске, ни в серии) и временный файл рядом. */
    fun reserve(nowMs: Long = Platform.nowMs()): Slot = synchronized(this) {
        // Имя держится на всё приложение (Store.newPhotoFile), не только в этой съёмке: второй заход
        // камеры в ту же папку и галерея, пока дописываются прежние кадры, его не возьмут.
        val target = Store.newPhotoFile(dir, "jpg", nowMs)
        Slot(File(dir, ".${target.name}.${Platform.nanoTime()}.tmp"), target)
    }

    /** Кадр записан камерой: проверить, переименовать, зарегистрировать. Ошибка — временный убран, имя свободно. */
    fun finish(slot: Slot): Result<File> = synchronized(this) {
        val r = runCatching {
            check(slot.tmp.isFile && slot.tmp.length() > 0) { "камера не записала кадр" }
            check(isWholeJpeg(slot.tmp)) { "кадр записан не до конца" }
            check(!slot.target.exists()) { "имя уже занято" }
            check(slot.tmp.renameTo(slot.target)) { "не переименовался" }
            slot.target
        }
        if (r.isFailure) slot.tmp.delete()
        Store.releasePhotoName(slot.target)
        // Регистрация — когда файл уже на месте (Store.saved: сканер медиа, миниатюра, журнал — в фоне).
        r.onSuccess { Store.saved(it) }
    }

    /** Кадр не получился: временный — прочь, имя — свободно. */
    fun abort(slot: Slot) = synchronized(this) {
        slot.tmp.delete()
        Store.releasePhotoName(slot.target)
    }

    companion object {
        /** JPEG целиком: начинается с FF D8 и кончается FF D9 (обрыв записи — нет конца). */
        fun isWholeJpeg(f: File): Boolean = runCatching {
            systemFs.openReadOnly(f.path.toPath()).use { h ->
                val n = h.size()
                if (n < 4) return false
                val head = ByteArray(2); h.read(0, head, 0, 2)
                val tail = ByteArray(2); h.read(n - 2, tail, 0, 2)
                head[0] == 0xFF.toByte() && head[1] == 0xD8.toByte() && tail[0] == 0xFF.toByte() && tail[1] == 0xD9.toByte()
            }
        }.getOrDefault(false)
    }
}
