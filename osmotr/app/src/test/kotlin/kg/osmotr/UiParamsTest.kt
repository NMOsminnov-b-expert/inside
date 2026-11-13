package kg.osmotr

import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import kg.osmotr.core.File
import kg.osmotr.core.Objects
import kg.osmotr.core.Params
import kg.osmotr.ui.Screen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Параметры осмотра на экране (автор, 29.10.2026): карточка в литере и участке, выбор, видимость по типу, файл. */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w360dp-h800dp-xhdpi")
class UiParamsTest {
    @get:Rule val compose = createComposeRule()
    @get:Rule val tmp = TemporaryFolder()
    private val rig by lazy { UiRig(compose, tmp.root.path) }

    @Test fun литер_карточка_выбор_и_файл() {
        rig.init()
        val a = Objects.addBuilding(Objects.create("Школа"), "Литер А")!!
        rig.start(Screen.Browser(a))
        rig.waitFor("кнопка в литере") { rig.count("карточка параметров") == 1 && rig.has("обязательных: 5") && rig.count("как снимать") == 1 }
        rig.clickTag("карточка параметров")
        rig.waitFor("экран параметров") { rig.count("параметры") == 1 && rig.has("Расположение строения") && rig.has("Инженерные сети") }
        rig.clickTag("поле: buildType")
        rig.waitFor("окно выбора") { rig.count("вариант: Встроенное") == 1 }
        rig.clickTag("вариант: Встроенное")
        rig.waitFor("выбрано и записано") { rig.has("Встроенное") && Params.load(a)["buildType"] == "Встроенное" }
    }

    @Test fun участок_и_число() {
        rig.init()
        val land = File(Objects.create("Школа"), "${Objects.REAL}/${Objects.LAND}")
        rig.start(Screen.Browser(land))
        rig.clickTag("карточка параметров")
        rig.waitFor("поля участка, обязательных 5") { rig.has("Форма участка") && rig.has("обязательных: 5") }
        rig.clickTag("поле: electricity")
        rig.clickTag("вариант: Подведены")
        rig.waitFor("сеть записана") { Params.load(land)["electricity"] == "Подведены" && rig.has("обязательных: 4") }
    }

    @Test fun этажность_числом() {
        rig.init()
        val a = Objects.addBuilding(Objects.create("Школа"), "Литер Б")!!
        rig.start(Screen.Params(a, Params.Form.BUILDING))
        rig.waitFor("поле этажей") { rig.count("поле: floorsN") == 1 }
        compose.onNode(hasTestTag("поле: floorsN"), true).performTextReplacement("3")
        rig.waitFor("записано") { Params.load(a)["floorsN"] == "3" }
    }

    /** Выгрузка объекта — со всем, что не снимок: PDF, перечень, сведения, файл литера (до 29.10.2026 терялись). */
    @Test fun архив_объекта_со_всеми_файлами() {
        rig.init()
        val obj = Objects.create("Школа", Objects.Info("СШ", "Бишкек"))
        val a = Objects.addBuilding(obj, "Литер А")!!
        Params.save(a, mapOf("buildType" to "Встроенное"))
        kg.osmotr.core.Store.addFile(File(obj, Objects.DOCS), "Техпаспорт.pdf") { it.write("%PDF-1.4\n%%EOF\n".encodeToByteArray()) }
        kg.osmotr.core.Xlsx.writeBook(File(obj, "${Objects.DOCS}/Перечень.xlsx"), listOf(kg.osmotr.core.Xlsx.Out("Л", listOf(listOf("А", "Б"), listOf(1, 2)))))
        val zip = kotlinx.coroutines.runBlocking { kg.osmotr.ui.zipItems(rig.host, listOf(obj), kg.osmotr.core.Store.root, "Школа") {} }
        val names = java.util.zip.ZipFile(zip.file.path).use { z -> z.entries().toList().map { it.name } }
        for (want in listOf("Школа/Объект.txt", "Школа/Документы/Техпаспорт.pdf", "Школа/Документы/Перечень.xlsx", "Школа/Недвижимое/Литер А/Литер_А.json"))
            assertTrue("в архиве «$want»: $names", want in names)
    }

    /** Сеть у участка — копией в литеры; у литера со своим — вопрос, «Заменить у всех». */
    @Config(sdk = [35], qualifiers = "w360dp-h2400dp-xhdpi")
    @Test fun сеть_участка_в_литеры() {
        rig.init()
        val obj = Objects.create("Школа")
        val a = Objects.addBuilding(obj, "Литер А")!!; val b = Objects.addBuilding(obj, "Литер Б")!!
        Params.save(b, mapOf("electricity" to "На удалении"))
        val land = File(obj, "${Objects.REAL}/${Objects.LAND}")
        rig.start(Screen.Params(land, Params.Form.LAND))
        rig.clickTag("поле: electricity")
        rig.clickTag("вариант: Подведены")
        rig.waitFor("вопрос про своё у Б") { rig.has("Заменить у литеров со своим значением?") && rig.has("Литер Б — На удалении") }
        assertEquals("в А — уже?", null, Params.load(a)["electricity"])
        rig.clickTag("заменить у всех")
        rig.waitFor("обе литеры — «Подведены»") { Params.load(a)["electricity"] == "Подведены" && Params.load(b)["electricity"] == "Подведены" }
    }

    @Config(sdk = [35], qualifiers = "w360dp-h2400dp-xhdpi")
    @Test fun сети_всем_литерам_карточкой() {
        rig.init()
        val obj = Objects.create("Школа")
        val a = Objects.addBuilding(obj, "Литер А")!!; val b = Objects.addBuilding(obj, "Литер Б")!!
        Params.save(a, mapOf("sewerage" to "Септик"))
        rig.start(Screen.Browser(File(obj, Objects.REAL)))
        rig.waitFor("одна тихая строка, сети свёрнуты") { rig.count("сети для всех") == 1 && rig.count("для всех: sewerage") == 0 }
        rig.clickTag("сети для всех: открыть")
        rig.waitFor("открыли — видно «Разные»") { rig.has("Разные") }
        rig.clickTag("для всех: sewerage")
        rig.clickTag("вариант: Подведена центральная")
        rig.waitFor("вопрос") { rig.count("заменить у всех") == 1 }
        rig.clickTag("заменить у всех")
        rig.waitFor("обеим") { Params.load(a)["sewerage"] == "Подведена центральная" && Params.load(b)["sewerage"] == "Подведена центральная" }
    }

    /** ТС: карточка в папке госномера, госномер подставлен сам, модуля и VIN нет. */
    @Config(sdk = [35], qualifiers = "w360dp-h2400dp-xhdpi")
    @Test fun тс_параметры() {
        rig.init()
        val car = Objects.addVehicle(Objects.create("Автобаза"), "01KG 123 ABC")!!
        rig.start(Screen.Browser(car))
        rig.clickTag("карточка параметров")
        rig.waitFor("форма ТС") { rig.has("Регистрационный номер") && rig.has("Пробег") }
        rig.waitFor("госномер подставлен и записан") { Params.load(car)[Params.PLATE] == car.name }
        assertEquals(0, rig.count("поле: hasModule") + rig.count("поле: f.vin"))
    }

    /** Тип ОИ виден на плитке литера в «Недвижимом» и в карточке параметров внутри папки. */
    @Config(sdk = [35], qualifiers = "w360dp-h900dp-xhdpi")
    @Test fun тип_ои_на_плитке_и_в_папке() {
        rig.init()
        val obj = Objects.create("Дом")
        val a = Objects.addBuilding(obj, "Кв 12")!!
        Objects.addBuilding(obj, "Лит Б")!!
        Params.save(a, mapOf(Params.OBJ_KIND to Params.FLAT))
        rig.start(Screen.Browser(File(obj, Objects.REAL)))
        rig.waitFor("тип на плитке") { rig.count("тип ОИ: Квартира") == 1 }
        System.getenv("OSMOTR_SHOT")?.let { java.io.File(it, "плитки.png").outputStream().use { o -> compose.onRoot().captureToImage().asAndroidBitmap().compress(android.graphics.Bitmap.CompressFormat.PNG, 100, o) } }
        rig.click("Кв 12")
        rig.waitFor("тип в папке") { rig.has("Квартира") && rig.count("тип ОИ литера") == 1 }
        compose.mainClock.advanceTimeBy(3000); compose.waitForIdle()
        System.getenv("OSMOTR_SHOT")?.let { java.io.File(it, "папка.png").outputStream().use { o -> compose.onRoot().captureToImage().asAndroidBitmap().compress(android.graphics.Bitmap.CompressFormat.PNG, 100, o) } }
    }

    /** Тип участка: сельхоз меняет сети на свои характеристики. */
    @Config(sdk = [35], qualifiers = "w360dp-h2400dp-xhdpi")
    @Test fun сельхоз_участок() {
        rig.init()
        val land = File(Objects.create("Поле"), "${Objects.REAL}/${Objects.LAND}")
        rig.start(Screen.Params(land, Params.Form.LAND))
        rig.clickTag("поле: landType")
        rig.clickTag("вариант: ${Params.AGRI}")
        rig.waitFor("сельхоз вместо сетей") { rig.count("поле: soil") == 1 && rig.count("поле: electricity") == 0 }
    }

    /** Тип не выбран — «Как снимать» ничего не угадывает: список по недвижимости и «Все инструкции»; квартира — сразу своя. */
    @Config(sdk = [35], qualifiers = "w360dp-h800dp-xhdpi")
    @Test fun как_снимать_по_типу() {
        rig.init()
        val obj = Objects.create("Дом")
        val a = Objects.addBuilding(obj, "Лит А")!!
        rig.start(Screen.Browser(a))
        rig.waitFor("выберите вид") { rig.has("выберите вид") }
        rig.clickTag("как снимать")
        rig.waitFor("список по недвижимости") { rig.count("подсказка: dom") == 1 && rig.count("подсказка: kvartira") == 1 && rig.count("подсказка: все инструкции") == 1 }
        System.getenv("OSMOTR_SHOT")?.let { java.io.File(it, "список.png").outputStream().use { o -> compose.onRoot().captureToImage().asAndroidBitmap().compress(android.graphics.Bitmap.CompressFormat.PNG, 100, o) } }
    }

    /** Комментарий: плашка микрофона в углу поля открывает запись в папку литера. */
    @Config(sdk = [35], qualifiers = "w360dp-h2400dp-xhdpi")
    @Test fun голос_в_комментарии() {
        rig.init()
        val a = Objects.addBuilding(Objects.create("Дом"), "А")!!
        rig.start(Screen.Params(a, Params.Form.BUILDING))
        rig.clickTag("голосовой комментарий")
        rig.waitFor("окно записи") { rig.has("Диктофон") }
    }

    /** Квартира: «Тип ОИ» прячет строение и открывает поля квартиры. */
    @Config(sdk = [35], qualifiers = "w360dp-h2400dp-xhdpi")
    @Test fun квартира_в_литере() {
        rig.init()
        val a = Objects.addBuilding(Objects.create("Дом"), "Кв 12")!!
        rig.start(Screen.Params(a, Params.Form.BUILDING))
        rig.clickTag("поле: objKind")
        rig.clickTag("вариант: Квартира")
        rig.waitFor("поля квартиры, строения нет") { rig.count("поле: aptRooms") == 1 && rig.count("поле: buildType") == 0 && rig.count("поле: litKind") == 0 }
    }
}
