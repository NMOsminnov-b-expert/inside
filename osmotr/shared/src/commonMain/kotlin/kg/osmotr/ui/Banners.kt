package kg.osmotr.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * Плашки внизу — смахиваются в любую сторону и закрываются крестиком (отзыв 15.10.2026: «это
 * уведомление можно сделать, чтобы его можно было смахнуть, а то пока я его не открою, оно висит
 * и потом мне кнопку „добавить в одну папку“ перекрывает»; автор: «Уведомления оптимизируем.
 * Ибо они мешают сильно»). Плашка не должна держать экран: её можно убрать одним движением.
 */
@Composable
fun Banners(state: SnackbarHostState, modifier: Modifier = Modifier) {
    SnackbarHost(state, modifier) { data ->
        key(data) {
            val swipe = rememberSwipeToDismissBoxState()
            LaunchedEffect(swipe.currentValue) {
                if (swipe.currentValue != SwipeToDismissBoxValue.Settled) data.dismiss()
            }
            SwipeToDismissBox(swipe, backgroundContent = {}, modifier = Modifier.testTag("плашка")) {
                // Мягкое напоминание — жёлтое, как карточка «Осмотрено ранее» (автор: «Не нервируем людей»).
                if (data.visuals is Notice) Snackbar(data, Modifier.padding(horizontal = 12.dp).testTag("напоминание"),
                    containerColor = NOTICE, contentColor = ON_NOTICE, actionColor = ON_NOTICE, dismissActionContentColor = ON_NOTICE)
                else Snackbar(data, Modifier.padding(horizontal = 12.dp))
            }
        }
    }
}

/** Плашка-напоминание (жёлтая, не тревожная): «Осмотрено ранее — выгрузите». */
class Notice(
    override val message: String,
    override val actionLabel: String? = null,
    override val withDismissAction: Boolean = true,
    override val duration: androidx.compose.material3.SnackbarDuration = androidx.compose.material3.SnackbarDuration.Long,
) : androidx.compose.material3.SnackbarVisuals

/** Видна ли сейчас плашка внизу — экраны с двумя плавающими кнопками раздвигают их над ней. */
val LocalBannerShown = androidx.compose.runtime.staticCompositionLocalOf { androidx.compose.runtime.mutableStateOf(false) as androidx.compose.runtime.State<Boolean> }

/**
 * Высота плашки внизу, как она легла (0 — нет). Плашка бывает и в три строки (напоминание об «Осмотрено
 * ранее» на каждом запуске): верхняя из двух кнопок встаёт над ней по её настоящей высоте, а не по
 * однострочной (эмулятор, 29.10.2026: «Новая опись» уходила под трёхстрочную плашку).
 */
/** Высота нижней панели действий (0 — панели нет): плашки встают над ней, а не под ней. */
val LocalBarHeight = androidx.compose.runtime.staticCompositionLocalOf { androidx.compose.runtime.mutableStateOf(0.dp) as androidx.compose.runtime.MutableState<androidx.compose.ui.unit.Dp> }

val LocalBannerHeight = androidx.compose.runtime.staticCompositionLocalOf { androidx.compose.runtime.mutableStateOf(0.dp) as androidx.compose.runtime.State<androidx.compose.ui.unit.Dp> }

/**
 * Плашка «только про последнее»: новая снимает прежнюю и ту, что ждала очереди (снимали быстро
 * 1–5 — плашка показывала второй, «Открыть» уводило в него; отзыв 15.10.2026). Короткая, с
 * крестиком, смахивается ([Banners]).
 */
class LatestBanner {
    private var job: kotlinx.coroutines.Job? = null
    fun show(scope: kotlinx.coroutines.CoroutineScope, state: SnackbarHostState, message: String, action: String? = null, onAction: () -> Unit = {}) {
        job?.cancel()
        state.currentSnackbarData?.dismiss()
        job = scope.launch {
            val r = state.showSnackbar(message, actionLabel = action, withDismissAction = true, duration = androidx.compose.material3.SnackbarDuration.Short)
            if (r == androidx.compose.material3.SnackbarResult.ActionPerformed) onAction()
        }
    }
}
