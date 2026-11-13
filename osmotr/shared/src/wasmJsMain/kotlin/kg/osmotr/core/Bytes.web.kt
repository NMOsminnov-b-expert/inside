@file:OptIn(ExperimentalWasmJsInterop::class, kotlin.wasm.unsafe.UnsafeWasmMemoryApi::class)

package kg.osmotr.core

import kotlin.wasm.unsafe.wasmMemory
import kotlin.wasm.unsafe.withScopedMemoryAllocator

/**
 * Байты между Kotlin и браузером — через память WebAssembly: побайтно через границу снимок в 4 МБ
 * шёл бы секундами, через память — миллисекунды.
 */
fun ByteArray.toJs(): JsAny = withScopedMemoryAllocator { a ->
    val p = a.allocate(maxOf(size, 1))
    for (i in indices) (p + i).storeByte(this[i])
    copyOut(wasmMemory, p.address.toInt(), size)
}

/** Uint8Array → ByteArray. */
fun JsAny.toBytes(): ByteArray {
    val n = jsLength(this)
    if (n == 0) return ByteArray(0)
    return withScopedMemoryAllocator { a ->
        val p = a.allocate(n)
        copyIn(wasmMemory, this, p.address.toInt())
        ByteArray(n) { (p + it).loadByte() }
    }
}

private fun copyOut(mem: JsAny, ptr: Int, n: Int): JsAny = js("new Uint8Array(mem.buffer, ptr, n).slice()")
private fun jsLength(a: JsAny): Int = js("a.length")
private fun copyIn(mem: JsAny, a: JsAny, ptr: Int): Unit = js("new Uint8Array(mem.buffer, ptr, a.length).set(a)")

private val HEX = "0123456789abcdef"
fun ByteArray.hex(): String = buildString(size * 2) { for (b in this@hex) { val v = b.toInt() and 0xFF; append(HEX[v shr 4]); append(HEX[v and 15]) } }
fun String.unhex(): ByteArray = ByteArray(length / 2) { ((HEX.indexOf(this[2 * it]) shl 4) or HEX.indexOf(this[2 * it + 1])).toByte() }
