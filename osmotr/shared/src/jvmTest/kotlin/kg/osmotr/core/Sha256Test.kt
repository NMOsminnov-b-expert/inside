package kg.osmotr.core

import org.junit.Assert.assertArrayEquals
import org.junit.Test
import java.security.MessageDigest

/** SHA-256 на Kotlin (PWA: отпечатки журнала, архивы по частям) — тот же, что у Java, целиком и по частям. */
class Sha256Test {
    private fun java(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b)

    @Test fun какУJava() {
        val r = java.util.Random(7)
        for (n in listOf(0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 1 shl 20)) {
            val b = ByteArray(n).also(r::nextBytes)
            assertArrayEquals("$n байт", java(b), Sha256.of(b))
        }
    }

    @Test fun поЧастямТоЖе() {
        val r = java.util.Random(11)
        val b = ByteArray(3_000_017).also(r::nextBytes)
        val s = Sha256.Stream()
        var i = 0
        while (i < b.size) { val n = minOf(b.size - i, 1 + r.nextInt(70_000)); s.update(b, i, n); i += n }
        assertArrayEquals(java(b), s.digest())
    }
}
