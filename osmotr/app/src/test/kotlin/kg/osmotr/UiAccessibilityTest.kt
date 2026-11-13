package kg.osmotr

import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityNodeProvider
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kg.osmotr.core.Inventory
import kg.osmotr.ui.Screen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Диктор (TalkBack): у всего, что нажимается или куда вводят текст, есть слова — в самом узле или
 * в его потомках (из них TalkBack и собирает подпись). Дерево — то, что получает диктор: узлы
 * доступности Android от поставщика экрана, а не дерево семантики Compose. В нём, например, текст
 * плавающей кнопки был пустым и подсказка поля, закрытая самим полем, не попадала вовсе
 * (найдено на устройстве 30.10.2026 — uiautomator помечал их NAF).
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w360dp-h800dp-xhdpi")
class UiAccessibilityTest {
    @get:Rule val compose = createComposeRule()
    @get:Rule val tmp = TemporaryFolder()
    private val rig by lazy { UiRig(compose, tmp.root.path) }

    private class Node(val info: AccessibilityNodeInfo, val children: List<Node>) {
        val own get() = listOfNotNull(info.text, info.contentDescription, info.hintText).map { it.toString() }.filter { it.isNotBlank() }
        val words: List<String> get() = own + children.flatMap { it.words }
        val actionable get() = info.isClickable || info.isLongClickable || info.isEditable
        fun all(): List<Node> = listOf(this) + children.flatMap { it.all() }
    }

    private fun provider(): AccessibilityNodeProvider {
        val am = ApplicationProvider.getApplicationContext<android.content.Context>()
            .getSystemService(android.content.Context.ACCESSIBILITY_SERVICE) as android.view.accessibility.AccessibilityManager
        shadowOf(am).setEnabled(true)
        shadowOf(am).setTouchExplorationEnabled(true)
        var p: AccessibilityNodeProvider? = null
        compose.runOnIdle {
            fun find(v: android.view.View): android.view.View? = if (v.javaClass.name.endsWith("AndroidComposeView")) v
                else (v as? android.view.ViewGroup)?.let { g -> (0 until g.childCount).firstNotNullOfOrNull { find(g.getChildAt(it)) } }
            // Окно диалога — своё: берётся последнее окно с экраном Compose.
            val roots = (compose as AndroidComposeTestRule<*, *>).activity.window.decorView.rootView.let { listOf(it) } +
                windowRoots()
            p = roots.mapNotNull { find(it) }.last().accessibilityNodeProvider
        }
        return p!!
    }

    /** Корни всех окон приложения (у диалога своё окно). */
    private fun windowRoots(): List<android.view.View> = runCatching {
        val wmg = Class.forName("android.view.WindowManagerGlobal")
        val inst = wmg.getMethod("getInstance").invoke(null)
        @Suppress("UNCHECKED_CAST")
        (wmg.getDeclaredField("mViews").apply { isAccessible = true }.get(inst) as List<android.view.View>)
    }.getOrDefault(emptyList())

    /** Дерево узлов, как его видит диктор: от корня экрана по номерам детей. */
    private fun tree(): Node {
        val p = provider()
        val childId = AccessibilityNodeInfo::class.java.getDeclaredMethod("getChildId", Int::class.java).apply { isAccessible = true }
        fun build(id: Int, depth: Int): Node? {
            if (depth > 60) return null
            var info: AccessibilityNodeInfo? = null
            compose.runOnIdle { info = p.createAccessibilityNodeInfo(id) }
            val i = info ?: return null
            val kids = (0 until i.childCount).mapNotNull { k -> build(((childId.invoke(i, k) as Long) ushr 32).toInt(), depth + 1) }
            return Node(i, kids)
        }
        return build(AccessibilityNodeProvider.HOST_VIEW_ID, 0)!!
    }

    /** Что нажимается или вводится — и без единого слова. */
    private fun mute(): List<String> = tree().all().filter { it.actionable && it.words.isEmpty() }
        .map { "${it.info.className} ${android.graphics.Rect().also(it.info::getBoundsInScreen)}" }

    private fun noMute(where: String) = assertEquals("$where: без слов для диктора", emptyList<String>(), mute())

    /** Опись «Подстанция»: трансформатор (к нему есть инструкция) и стол. */
    private fun subst(): kg.osmotr.core.File =
        rig.inventory("Подстанция", listOf(listOf(1, "Трансформатор силовой ТМ-630", "ТП-1", 1987), listOf(2, "Стол письменный", "ТП-2", 2018)))

    @Test fun главный() {
        rig.init(); kg.osmotr.core.Objects.create("Школа")
        rig.start()
        rig.waitFor("главный") { rig.has("Школа") }
        noMute("главный")
        // Плавающие кнопки — словами (на Android были немыми).
        assertTrue(tree().all().any { it.actionable && "Новый объект" in it.words })
        assertTrue(tree().all().any { it.actionable && "Новая опись" in it.words })
    }

    @Test fun объект_и_его_разделы() {
        rig.init(); val obj = kg.osmotr.core.Objects.create("Школа")
        rig.start(Screen.Browser(kg.osmotr.core.File(obj, kg.osmotr.core.Objects.REAL)), Screen.Browser(kg.osmotr.core.File(obj, kg.osmotr.core.Objects.DOCS)))
        rig.waitFor("документы") { rig.hasDesc("Назад") }
        noMute("документы")
        assertTrue(tree().all().any { it.actionable && "Добавить документ" in it.words })
        rig.clickDesc("Назад")
        rig.waitFor("недвижимое") { tree().all().any { it.actionable && "Литер или найденное" in it.words } }
        noMute("недвижимое")
    }

    @Test fun опись() {
        rig.init(); val obj = subst()
        rig.start(Screen.Inventory(obj))
        rig.waitFor("опись") { rig.has("Стол письменный") }
        noMute("опись")
        val t = tree().all()
        val field = t.indexOfFirst { it.info.isEditable }
        assertTrue("поле поиска подписано: ${t.map { it.own }}", t.subList(maxOf(0, field - 2), field + 1).any { n -> n.words.any { "Инв. номер" in it } })
    }

    @Test fun папка_предмета() {
        rig.init(); val obj = subst()
        val folder = kg.osmotr.core.Inventory.openFolder(obj, kg.osmotr.core.Inventory.parse(kg.osmotr.core.Inventory.fileIn(obj)!!).items[0])
        rig.start(Screen.Browser(folder))
        rig.waitFor("папка") { rig.has("ТП-1") }
        noMute("папка предмета")
        assertTrue(tree().all().any { it.actionable && "Снимать" in it.words })
    }

    @Test fun pdf_и_параметры() {
        rig.init(); val obj = kg.osmotr.core.Objects.create("Школа")
        val lit = kg.osmotr.core.Objects.addBuilding(obj, "Литер А")!!
        val pdf = kg.osmotr.core.Store.addFile(kg.osmotr.core.File(obj, kg.osmotr.core.Objects.DOCS), "Техпаспорт.pdf") { it.write("%PDF-1.4\n%%EOF\n".encodeToByteArray()) }
        rig.start(Screen.Params(lit, kg.osmotr.core.Params.Form.BUILDING), Screen.Pdf(pdf))
        rig.waitFor("pdf") { rig.has("1 / 2") }
        noMute("просмотр pdf")
        rig.clickDesc("Назад")
        rig.waitFor("параметры") { rig.has("Параметры осмотра") }
        noMute("параметры осмотра")
    }

    @Test fun поиск_и_структура() {
        rig.init(); subst()
        rig.start(Screen.Tree(kg.osmotr.core.Store.root), Screen.Search(kg.osmotr.core.Store.root))
        rig.waitFor("поле") { compose.onAllNodes(androidx.compose.ui.test.hasSetTextAction(), true).fetchSemanticsNodes().isNotEmpty() }
        noMute("поиск")
        rig.clickDesc("Назад")
        rig.waitFor("структура") { rig.has("Подстанция") }
        noMute("структура")
    }
}
