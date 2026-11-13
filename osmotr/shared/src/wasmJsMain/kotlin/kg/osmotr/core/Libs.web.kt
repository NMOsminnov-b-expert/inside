@file:OptIn(ExperimentalWasmJsInterop::class)

package kg.osmotr.core

import kg.osmotr.core.js.fflate.deflateSync as fflateDeflate
import kg.osmotr.core.js.fflate.unzipSync as fflateUnzip
import kg.osmotr.core.js.noble.p256

/** fflate — zip и deflate синхронно (xlsx читается и пишется так же, как на телефоне). */
object Fflate {
    fun unzipSync(data: JsAny): JsAny = fflateUnzip(data)
    fun deflateSync(data: JsAny): JsAny = fflateDeflate(data, level6())
}

/** @noble/curves — ECDSA P-256 синхронно (WebCrypto умеет только асинхронно). */
object Noble {
    fun randomPrivateKey(): JsAny = nobleRandom(p256)
    fun publicKey(priv: JsAny): JsAny = noblePub(p256, priv)
    fun sign(hash: JsAny, priv: JsAny): JsAny = nobleSign(p256, hash, priv)
    /** Подписи с телефонов (Android Keystore, Secure Enclave) бывают с «высоким S» — принимать. */
    fun verify(der: JsAny, hash: JsAny, pub: JsAny): Boolean = nobleVerify(p256, der, hash, pub)
}

private fun level6(): JsAny = js("({ level: 6 })")
private fun nobleRandom(c: JsAny): JsAny = js("c.utils.randomPrivateKey()")
private fun noblePub(c: JsAny, k: JsAny): JsAny = js("c.getPublicKey(k, false)")
private fun nobleSign(c: JsAny, h: JsAny, k: JsAny): JsAny = js("c.sign(h, k).toDERRawBytes()")
private fun nobleVerify(c: JsAny, s: JsAny, h: JsAny, p: JsAny): Boolean = js("c.verify(c.Signature.fromDER(s), h, p, { lowS: false })")
