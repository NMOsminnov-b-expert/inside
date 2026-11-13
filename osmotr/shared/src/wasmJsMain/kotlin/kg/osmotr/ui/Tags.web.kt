package kg.osmotr.ui

import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics

actual fun Modifier.exposeTags(): Modifier = this

actual fun Modifier.voiceLabel(text: String): Modifier = semantics { contentDescription = text }
