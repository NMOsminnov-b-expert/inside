package kg.osmotr.ui

import androidx.compose.ui.Modifier

/**
 * Метки testTag — ещё и resource-id (Android): обход на эмуляторе (tools/matrix) находит по ним
 * блоки. У диалога своё окно, и метка корня главного окна туда не доходит — ставится и в нём.
 */
expect fun Modifier.exposeTags(): Modifier

/**
 * Подпись кнопки для читалки экрана там, где платформа не берёт её из текста кнопки: Compose не
 * сливает текст плавающей кнопки в её подпись — ни в браузере (PWA: VoiceOver видел пустую кнопку),
 * ни на Android (TalkBack: «кнопка» без слов, узел помечен недоступным).
 */
expect fun Modifier.voiceLabel(text: String): Modifier
