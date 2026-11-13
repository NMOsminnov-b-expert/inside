package kg.osmotr.ui

import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId

@OptIn(ExperimentalComposeUiApi::class)
actual fun Modifier.exposeTags(): Modifier = semantics { testTagsAsResourceId = true }

/**
 * На телефоне текст плавающей кнопки диктору тоже не доставался: узел кнопки без текста и описания,
 * Android метил его «недоступным» (NAF, uiautomator 30.10.2026) — TalkBack читал «кнопка» без слов.
 */
actual fun Modifier.voiceLabel(text: String): Modifier = semantics { contentDescription = text }
