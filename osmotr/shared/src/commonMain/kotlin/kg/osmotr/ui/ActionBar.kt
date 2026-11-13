package kg.osmotr.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/** Действие нижней панели: подпись обязательна, [main] — главное действие экрана. */
class BarAction(val label: String, val icon: ImageVector, val tag: String = "", val main: Boolean = false, val onClick: () -> Unit)

/**
 * Нижняя панель действий (автор, 02.11.2026: «пересматриваем навигацию кнопок снизу. Стоит от вертикали к горизонтали
 * перейти»): кнопки в ряд во всю ширину, в зоне большого пальца, каждая подписана, высота не меньше 56 dp, зазор 8 dp.
 * Образец — docked toolbar Material 3: до трёх действий на экране, редкое — в «Ещё». Плашки встают над панелью.
 */
@Composable
fun ActionBar(actions: List<BarAction>) {
    if (actions.isEmpty()) return
    val height = LocalBarHeight.current
    val density = LocalDensity.current
    DisposableEffect(Unit) { onDispose { height.value = 0.dp } }
    Surface(Modifier.fillMaxWidth().onSizeChanged { height.value = with(density) { it.height.toDp() } }.testTag("панель действий"), tonalElevation = 3.dp, shadowElevation = 6.dp) {
        Row(Modifier.navigationBarsPadding().padding(horizontal = 8.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // Главное действие — справа и шире: туда дотягивается большой палец держащей руки (автор, 02.11.2026:
            // «Кнопка добавления фото неудобно для пользования 1 рукой стоит»). Слева оно было самым дальним.
            for (a in actions.sortedBy { it.main }) {
                val m = Modifier.weight(if (a.main && actions.size > 1) 1.5f else 1f).heightIn(min = 56.dp).testTag(a.tag.ifEmpty { "кнопка: ${a.label}" }).voiceLabel(a.label)
                val body: @Composable () -> Unit = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(a.icon, null, Modifier.size(22.dp))
                        Text(a.label, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                val inset = PaddingValues(horizontal = 4.dp, vertical = 6.dp)
                if (a.main) Button(a.onClick, m, contentPadding = inset) { body() }
                else FilledTonalButton(a.onClick, m, contentPadding = inset) { body() }
            }
        }
    }
}
