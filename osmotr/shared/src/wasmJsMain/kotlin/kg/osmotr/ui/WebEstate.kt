@file:OptIn(ExperimentalWasmJsInterop::class)

package kg.osmotr.ui

import kg.osmotr.core.Describe
import kg.osmotr.core.EstateCadRequest
import kg.osmotr.core.EstateDayReport
import kg.osmotr.core.EstateLink
import kg.osmotr.core.EstateNote
import kg.osmotr.core.EstatePartial
import kg.osmotr.core.EstatePlans
import kg.osmotr.core.EstateSaved
import kg.osmotr.core.EstateOi
import kg.osmotr.core.SendResult
import kg.osmotr.core.EstateObject
import kg.osmotr.core.EstateUser
import kg.osmotr.core.File
import kg.osmotr.core.Store
import kg.osmotr.core.WebFs
import kg.osmotr.core.jsNewKey
import kg.osmotr.core.jsPutBlob
import kg.osmotr.core.jsSize
import kg.osmotr.core.toBytes
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

/**
 * Связь PWA с системой E•state: приложение открыто в рамке страницы осмотрщиков, запросы — сообщениями
 * окну системы (glue.js, osmotrWeb.estate). Файлы ходят Blob-ами: из хранилища браузера — в систему, из
 * системы — в хранилище, без копии в памяти приложения. Вне рамки связи нет ([embedded] = false).
 */
object WebEstate : EstateLink {
    val embedded: Boolean by lazy { jsEstateEmbedded() }

    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    @Serializable private class Items(val items: List<EstateObject> = emptyList())
    @Serializable private class Notes(val items: List<EstateNote> = emptyList())
    @Serializable private class Reasons(val move: List<String> = emptyList())
    @Serializable private class Cad(val requests: List<EstateCadRequest> = emptyList())

    private class Answer(val json: String, val blob: JsAny?)

    /** Запрос системе; не ответила за [ms] или отказала — исключение с её словами. */
    private suspend fun ask(t: String, body: String = "{}", blob: JsAny? = null, ms: Int = 20_000): Answer =
        suspendCoroutine<Result<Answer>> { c ->
            jsEstateAsk(t, body, blob, ms) { ok, j, b, err ->
                if (ok) c.resume(Result.success(Answer(j ?: "{}", b))) else c.resume(Result.failure(IllegalStateException(err ?: "отказ системы")))
            }
        }.getOrThrow()

    override suspend fun hello(): EstateUser? = runCatching { json.decodeFromString(EstateUser.serializer(), ask("hello", ms = 5_000).json) }.getOrNull()

    override suspend fun objects(): List<EstateObject> = json.decodeFromString(Items.serializer(), ask("assignments").json).items

    override suspend fun doc(objectId: String, docId: String, into: File): Boolean {
        val a = runCatching { ask("doc", buildJsonObject { put("assignId", objectId); put("id", docId) }.toString(), ms = 60_000) }.getOrNull() ?: return false
        val blob = a.blob ?: return false
        return suspendCoroutine { c ->
            Describe.of(blob) { sha, head, tail ->
                val key = jsNewKey()
                jsPutBlob(key, blob) {
                    val ok = runCatching { WebFs.adopt(into.path, key, jsSize(blob).toLong(), sha, head, tail) }.isSuccess
                    if (ok) Store.changed(structure = false)
                    c.resume(ok)
                }
            }
        }
    }

    /**
     * Файл — в систему. Ответила — [SendResult.ok]; приняла ли — по её ответу «taken» (не приняла — «why»).
     * Не ответила (нет связи) — ok = false: файл подождёт. Отказ системы по этому объекту — ответ с причиной.
     */
    override suspend fun inventory(objectId: String, invId: String): ByteArray? {
        val a = runCatching { ask("inventory", buildJsonObject { put("assignId", objectId); put("id", invId) }.toString(), ms = 60_000) }.getOrNull() ?: return null
        val blob = a.blob ?: return null
        return suspendCoroutine { c -> jsBlobBytes(blob) { u -> c.resume(u?.toBytes()) } }
    }

    override suspend fun send(objectId: String, rel: String, oi: EstateOi?, file: File, items: List<String>): SendResult {
        val blob = WebFs.blob(file.path) ?: return SendResult(true, false, "файл не прочитался на устройстве")
        val body = buildJsonObject {
            put("assignId", objectId); put("rel", rel); put("oiId", oi?.id.orEmpty())
            if (oi != null) put("depth", oi.depth)
            if (items.isNotEmpty()) put("items", kotlinx.serialization.json.JsonArray(items.map { kotlinx.serialization.json.JsonPrimitive(it) }))
        }.toString()
        return try {
            val a = ask("send", body, blob, ms = 120_000)
            val o = json.parseToJsonElement(a.json).jsonObject
            SendResult(true, o["taken"]?.jsonPrimitive?.boolean ?: false, o["why"]?.jsonPrimitive?.contentOrNull.orEmpty())
        } catch (e: Throwable) {
            val why = e.message.orEmpty()
            // Не ответила — связи нет; ответила отказом — файл не принят, причина её словами.
            if (why.startsWith("нет ответа") || why == "не в системе") SendResult(false) else SendResult(true, false, why)
        }
    }

    override suspend fun deleted(objectId: String, rel: String, oiId: String): Boolean =
        runCatching { ask("deleted", buildJsonObject { put("assignId", objectId); put("rel", rel); put("oiId", oiId) }.toString()) }.isSuccess

    override suspend fun finish(objectId: String, done: Boolean, incomplete: Boolean): Boolean =
        runCatching { ask("finish", buildJsonObject { put("assignId", objectId); put("done", done); put("incomplete", incomplete) }.toString()) }.isSuccess

    override suspend fun outcome(objectId: String, reason: String, note: String): Boolean =
        runCatching { ask("outcome", buildJsonObject { put("assignId", objectId); put("reason", reason); put("note", note) }.toString()) }.isSuccess

    override suspend fun moveReasons(): List<String> = json.decodeFromString(Reasons.serializer(), ask("reasons").json).move

    override suspend fun notes(): List<EstateNote> = json.decodeFromString(Notes.serializer(), ask("notes").json).items

    override suspend fun plans(days: Int): EstatePlans? =
        runCatching { json.decodeFromString(EstatePlans.serializer(), ask("plans", buildJsonObject { put("days", days) }.toString()).json) }.getOrNull()

    override suspend fun take(objectId: String, date: String): Boolean =
        runCatching { ask("take", buildJsonObject { put("objectId", objectId); put("date", date) }.toString()) }.isSuccess

    override suspend fun move(objectId: String, date: String, reason: String, note: String): Boolean =
        runCatching { ask("move", buildJsonObject { put("objectId", objectId); put("date", date); put("reason", reason); put("note", note) }.toString()) }.isSuccess

    // Маршрут по дорогам система считает по OSM: ответа можно ждать дольше.
    override suspend fun report(date: String): EstateDayReport? =
        runCatching { json.decodeFromString(EstateDayReport.serializer(), ask("report", buildJsonObject { if (date.isNotEmpty()) put("date", date) }.toString(), ms = 40_000).json) }.getOrNull()

    private suspend fun save(kind: String, date: String, data: kotlinx.serialization.json.JsonObject): EstateSaved = try {
        val body = buildJsonObject { put("kind", kind); if (date.isNotEmpty()) put("date", date); put("data", data) }.toString()
        ask("saveReport", body)
        EstateSaved(true)
    } catch (e: Throwable) {
        EstateSaved(false, if (e.message.orEmpty().startsWith("нет ответа")) "нет связи с E•state" else e.message.orEmpty().ifBlank { "отказ системы" })
    }

    override suspend fun saveMorning(date: String, odometer: String, noOdometer: Boolean): EstateSaved =
        save("morning", date, buildJsonObject { if (odometer.isNotBlank()) put("odometer", odometer); if (noOdometer) put("noOdometer", true) })

    override suspend fun saveEvening(date: String, km: String, kmByRoute: Boolean, done: List<String>, partial: List<EstatePartial>, note: String): EstateSaved =
        save("evening", date, buildJsonObject {
            put("km", km); put("kmByRoute", kmByRoute); put("note", note)
            put("done", kotlinx.serialization.json.JsonArray(done.map { kotlinx.serialization.json.JsonPrimitive(it) }))
            put("partial", kotlinx.serialization.json.JsonArray(partial.map { p -> buildJsonObject { put("assignId", p.assignId); put("reason", p.reason) } }))
        })

    override suspend fun cadastre(): List<EstateCadRequest>? =
        runCatching { json.decodeFromString(Cad.serializer(), ask("cadastre").json).requests }.getOrNull()

    override suspend fun cadAnswer(reqId: String, rowId: String, result: String, scanDate: String, answer: String, fileName: String, file: File?): EstateSaved {
        val blob = file?.let { WebFs.blob(it.path) ?: return EstateSaved(false, "файл не прочитался на устройстве") }
        val body = buildJsonObject {
            put("reqId", reqId); put("rowId", rowId); put("result", result); put("scanDate", scanDate); put("answer", answer); put("fileName", fileName)
        }.toString()
        return try {
            ask("cadAnswer", body, blob, ms = 120_000)
            EstateSaved(true)
        } catch (e: Throwable) {
            EstateSaved(false, if (e.message.orEmpty().startsWith("нет ответа")) "нет связи с E•state" else e.message.orEmpty().ifBlank { "отказ системы" })
        }
    }

    override fun exit() { jsEstateAsk("exit", "{}", null, 5_000) { _, _, _, _ -> } }

    override fun onChanged(f: () -> Unit) = jsEstateOnChanged(f)

    override val online: Boolean get() = jsEstateOnline()
}

private fun jsBlobBytes(blob: JsAny, done: (JsAny?) -> Unit): Unit = js("globalThis.osmotrWeb.estate.bytes(blob, done)")
private fun jsEstateEmbedded(): Boolean = js("!!(globalThis.osmotrWeb.estate && globalThis.osmotrWeb.estate.embedded())")
private fun jsEstateOnline(): Boolean = js("globalThis.osmotrWeb.estate.online()")
private fun jsEstateOnChanged(f: () -> Unit): Unit = js("globalThis.osmotrWeb.estate.onChanged(f)")
private fun jsEstateAsk(t: String, body: String, blob: JsAny?, ms: Int, done: (Boolean, String?, JsAny?, String?) -> Unit): Unit =
    js("globalThis.osmotrWeb.estate.ask(t, body, blob, ms, done)")
