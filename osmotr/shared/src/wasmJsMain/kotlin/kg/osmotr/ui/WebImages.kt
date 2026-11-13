package kg.osmotr.ui

import coil3.ImageLoader
import coil3.Uri
import coil3.decode.DataSource
import coil3.decode.ImageSource
import coil3.fetch.FetchResult
import coil3.fetch.Fetcher
import coil3.fetch.SourceFetchResult
import coil3.request.Options
import kg.osmotr.core.Store
import kg.osmotr.core.WebFs
import kg.osmotr.core.toBytes
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine
import okio.Buffer
import okio.IOException

/**
 * Снимки для Coil — из хранилища браузера, асинхронно: синхронно браузер содержимое не отдаёт.
 * Путь Coil превращает в file-адрес — его и ловим.
 */
class WebFileFetcher(private val path: String) : Fetcher {
    override suspend fun fetch(): FetchResult {
        val video = path.substringAfterLast('.', "").lowercase() in Store.VIDEO_EXT
        val bytes = (if (video) videoFrame(path) else WebFs.bytes(path)) ?: throw IOException("нет файла $path")
        return SourceFetchResult(ImageSource(Buffer().write(bytes), WebFs), mimeType = null, dataSource = DataSource.DISK)
    }

    /** Видео — обложкой его первый кадр (как миниатюра видео на Android): кадр рисует браузер. */
    private suspend fun videoFrame(path: String): ByteArray? {
        val blob = WebFs.blob(path) ?: return null
        return suspendCoroutine { c -> jsVideoFrame(blob) { b -> c.resume(b?.toBytes()) } }
    }

    class Factory : Fetcher.Factory<Uri> {
        override fun create(data: Uri, options: Options, imageLoader: ImageLoader): Fetcher? {
            if (data.scheme != null && data.scheme != "file") return null
            val path = data.path ?: return null
            return WebFileFetcher(path)
        }
    }

    class PathFactory : Fetcher.Factory<okio.Path> {
        override fun create(data: okio.Path, options: Options, imageLoader: ImageLoader): Fetcher = WebFileFetcher(data.toString())
    }
}

@OptIn(ExperimentalWasmJsInterop::class)
private fun jsVideoFrame(blob: JsAny, got: (JsAny?) -> Unit): Unit = js("globalThis.osmotrWeb.videoFrame(blob, got)")
