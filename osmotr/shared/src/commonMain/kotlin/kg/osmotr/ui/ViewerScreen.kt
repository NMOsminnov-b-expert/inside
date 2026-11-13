package kg.osmotr.ui

import kg.osmotr.core.File
import kg.osmotr.core.Inventory
import kg.osmotr.core.Platform
import kg.osmotr.core.Search
import kg.osmotr.core.Store
import kg.osmotr.core.Xlsx

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.testTag
import kg.osmotr.core.Background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.request.ImageRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.ui.unit.dp

/** Просмотр снимков папки: листание, зум с полным разрешением; отправка, перенос, удаление. */
@Composable
fun ViewerScreen(dir: File, start: File, close: () -> Unit) {
    val host = LocalHost.current
    val version by Store.version.collectAsStateWithLifecycle()
    val gone = Undo.gone.toSet()
    val photos = rememberLoaded("снимки|${dir.path}", version) { Store.photosIn(dir) }?.filter { it.path !in gone }
    val list = photos ?: return Box(Modifier.fillMaxSize().background(Color.Black))
    if (list.isEmpty()) { close(); return }
    val pager = rememberPagerState(initialPage = list.indexOf(start).coerceAtLeast(0)) { list.size }
    val current = list.getOrNull(pager.currentPage) ?: list.last()
    var moving by remember { mutableStateOf(false) }
    // Поворот — сразу в памяти, файл следом: два быстрых нажатия не должны слиться в одно.
    val turns = remember(dir) { androidx.compose.runtime.mutableStateMapOf<String, Int>() }
    androidx.compose.runtime.LaunchedEffect(dir) { turns.putAll(withContext(Background) { Store.turnsIn(dir) }) }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        HorizontalPager(pager, Modifier.fillMaxSize(), key = { list[it].path }, beyondViewportPageCount = 1) { page ->
            // Приближение подгружает полное разрешение только видимой области (telephoto, разбиение
            // на плитки): шильдик читается при сильном зуме, а 12 МП целиком в память не поднимаются.
            TurnedPhoto(list[page], turns[list[page].name] ?: 0)
        }
        Row(Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.45f)).statusBarsPadding().padding(4.dp),
            verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = close) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад", tint = Color.White) }
            Column(Modifier.weight(1f)) {
                Text(current.name, color = Color.White, maxLines = 1, overflow = TextOverflow.MiddleEllipsis)
                Text("${pager.currentPage + 1} из ${list.size} · ${Store.title(dir)}", color = Color.White.copy(alpha = 0.7f),
                    style = MaterialTheme.typography.labelSmall, maxLines = 1)
            }
        }
        Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Color.Black.copy(alpha = 0.45f)).navigationBarsPadding()
            .padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
            Action(AppIcons.RotateRight, "Повернуть") {
                val q = ((turns[current.name] ?: 0) + 1) % 4
                turns[current.name] = q
                Store.setTurn(current, q)
            }
            Action(Icons.Default.Share, "Отправить") { sharePhotos(host, listOf(current)) }
            Action(AppIcons.DriveFileMove, "Перенести") { moving = true }
            Action(Icons.Default.Delete, "Удалить") { Undo.trash(listOf(current)) }
        }
    }

    if (moving) FolderPicker("Перенести снимок", dir, "Сюда", onPick = { to -> moving = false; if (to != dir) Store.move(listOf(current), to) },
        onCancel = { moving = false })
}

/** Снимок с поворотом: на боку поле меняет стороны местами, и скан встаёт во весь экран, а не обрезается. */
@Composable
private fun TurnedPhoto(photo: File, quarters: Int) {
    // Телефон не разобрал снимок (редкий HEIC и подобное) — сказать и предложить другое приложение, а не чёрный экран.
    var failed by remember(photo) { mutableStateOf(false) }
    val host = LocalHost.current
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val side = quarters % 2 == 1
        ZoomablePhoto(photo, Modifier.requiredSize(if (side) maxHeight else maxWidth, if (side) maxWidth else maxHeight)
            .graphicsLayer { rotationZ = quarters * 90f }.testTag("снимок: поворот $quarters"), onError = { failed = true })
        if (failed) Column(Modifier.padding(24.dp).testTag("снимок не показывается"), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Телефон не может показать этот снимок", color = Color.White, style = MaterialTheme.typography.titleMedium)
            Text(photo.name, color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = { host.openExternal(photo, "image/*") }) { Text("Открыть в другом приложении") }
        }
    }
}

@Composable
private fun Action(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(onClick = onClick) { Icon(icon, label, tint = Color.White) }
        Text(label, color = Color.White, style = MaterialTheme.typography.labelSmall)
    }
}

/** Снимок с приближением: Android — с подгрузкой полного разрешения видимой части, iPhone — обычный. */
@Composable
expect fun ZoomablePhoto(photo: File, modifier: Modifier, onError: () -> Unit = {})
