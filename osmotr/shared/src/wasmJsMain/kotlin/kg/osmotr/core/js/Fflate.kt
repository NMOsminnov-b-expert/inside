@file:JsModule("fflate")
@file:OptIn(ExperimentalWasmJsInterop::class)

package kg.osmotr.core.js.fflate

external fun unzipSync(data: JsAny): JsAny
external fun deflateSync(data: JsAny, opts: JsAny): JsAny
