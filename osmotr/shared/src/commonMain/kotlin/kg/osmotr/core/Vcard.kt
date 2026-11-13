package kg.osmotr.core

/**
 * Контакт из «Поделиться» (автор, 02.11.2026): телефонная книга отдаёт карточку vCard. Берём имя, должность, телефон,
 * почту; несколько карточек в одном файле — по одному контакту. Формат — RFC 6350, строки-продолжения склеиваются.
 */
object Vcard {
    fun isVcard(name: String, text: String) = name.endsWith(".vcf", true) || text.trimStart().startsWith("BEGIN:VCARD", true)

    fun parse(text: String): List<Store.Contact> {
        val lines = text.replace("\r\n", "\n").replace(Regex("\n[ \t]"), "").split('\n')
        val out = mutableListOf<Store.Contact>()
        var c: Store.Contact? = null
        for (raw in lines) {
            val colon = raw.indexOf(':')
            if (colon < 0) continue
            val head = raw.take(colon).uppercase()
            val tag = head.substringBefore(';').substringAfterLast('.')
            val value = decode(raw.drop(colon + 1), head)
            when {
                tag == "BEGIN" -> c = Store.Contact()
                tag == "END" -> { c?.takeIf { !it.blank }?.let(out::add); c = null }
                c == null -> {}
                tag == "FN" -> c = c!!.copy(name = value)
                tag == "N" && c!!.name.isBlank() -> c = c!!.copy(name = value.split(';').take(3).filter { it.isNotBlank() }.joinToString(" "))
                tag == "TITLE" || (tag == "ORG" && c!!.role.isBlank()) -> c = c!!.copy(role = value.replace(";", " ").trim())
                tag == "TEL" && c!!.phone.isBlank() -> c = c!!.copy(phone = value)
                tag == "EMAIL" && c!!.email.isBlank() -> c = c!!.copy(email = value)
            }
        }
        return out
    }

    private fun decode(v: String, head: String): String {
        val text = if ("QUOTED-PRINTABLE" !in head) v else runCatching {
            val b = mutableListOf<Byte>(); var i = 0
            while (i < v.length) {
                if (v[i] == '=' && i + 2 < v.length + 0 && i + 2 <= v.lastIndex) { b += v.substring(i + 1, i + 3).toInt(16).toByte(); i += 3 }
                else { b += v[i].code.toByte(); i++ }
            }
            b.toByteArray().decodeToString()
        }.getOrDefault(v)
        return text.replace("\\,", ",").replace("\\;", ";").replace("\\n", " ").trim()
    }
}
