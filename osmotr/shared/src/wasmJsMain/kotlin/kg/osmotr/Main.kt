@file:OptIn(ExperimentalWasmJsInterop::class, androidx.compose.ui.ExperimentalComposeUiApi::class)

package kg.osmotr

import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateListOf
import androidx.navigationevent.NavigationEventInput
import androidx.navigationevent.compose.LocalNavigationEventDispatcherOwner
import androidx.compose.ui.window.ComposeViewport
import coil3.ImageLoader
import coil3.compose.setSingletonImageLoaderFactory
import kg.osmotr.core.File
import kg.osmotr.core.Platform
import kg.osmotr.core.Store
import kg.osmotr.core.Telemetry
import kg.osmotr.core.WebFs
import kg.osmotr.ui.OsmotrApp
import kg.osmotr.ui.Picked
import kg.osmotr.ui.WebFileFetcher
import kg.osmotr.ui.WebHost

/**
 * Вход PWA. Сначала — опись файлов из хранилища браузера (без неё общий код не видит папок),
 * потом тот же интерфейс, что на телефонах. «Осмотры» — в хранилище браузера; наружу — выгрузкой.
 */
fun main() {
    WebFs.load { err ->
        if (err != null) Platform.log("хранилище: $err")
        Store.init(File("/"), File("/app"))
        Telemetry.start("PWA", Platform.appVersion(), Platform.osVersion(), Platform.hardware())
        val incoming = mutableStateListOf<Picked>()
        jsExposeMemory { memoryBytes() }
        jsReady()
        // Дерево доступности — в DOM: читалка экрана (VoiceOver) и автотесты находят кнопки по подписям.
        ComposeViewport(viewportContainerId = "app", configure = { isA11YEnabled = true }) {
            setSingletonImageLoaderFactory { ctx ->
                ImageLoader.Builder(ctx).components {
                    add(WebFileFetcher.Factory())
                    add(WebFileFetcher.PathFactory())
                }.build()
            }
            // «Назад» браузера (кнопка, жест) — в тот же диспетчер, что и «назад» телефона.
            val owner = LocalNavigationEventDispatcherOwner.current
            DisposableEffect(owner) {
                val input = BrowserBack()
                owner?.navigationEventDispatcher?.addInput(input)
                jsOnBack { input.back() }
                onDispose { owner?.navigationEventDispatcher?.removeInput(input) }
            }
            OsmotrApp(WebHost, incoming, emptyList())
        }
    }
}

private class BrowserBack : NavigationEventInput() {
    fun back() = dispatchOnBackCompleted()
}

private fun jsOnBack(back: () -> Unit): Unit = js("globalThis.osmotrWeb.onBack = back")
/** Размер памяти WebAssembly — для автотестов больших объёмов (сколько держит приложение). */
@OptIn(kotlin.wasm.unsafe.UnsafeWasmMemoryApi::class)
private fun memoryBytes(): Double = jsBufferBytes(kotlin.wasm.unsafe.wasmMemory)
private fun jsBufferBytes(m: JsAny): Double = js("m.buffer.byteLength")
private fun jsExposeMemory(f: () -> Double): Unit = js("globalThis.osmotrWeb.wasmBytes = f")

private fun jsReady(): Unit = js("(document.getElementById('loading')?.remove(), globalThis.osmotrWeb.trapBack())")
