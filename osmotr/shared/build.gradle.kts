// Общее для Android и iPhone: описи (подбор столбцов), Excel, поиск, интерфейс.
plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.compose.multiplatform)
    alias(libs.plugins.android.kmp.library)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kover)
}

kotlin {
    jvmToolchain(21)
    jvm()
    android {
        namespace = "kg.osmotr.shared"
        compileSdk = 37
        minSdk = 26
        androidResources { enable = true }
    }
    // Версия для iPhone без установки — PWA (автор, 23.10.2026): тот же интерфейс, собранный в WebAssembly.
    @OptIn(org.jetbrains.kotlin.gradle.ExperimentalWasmDsl::class)
    wasmJs {
        outputModuleName = "osmotr"
        browser { commonWebpackConfig { outputFileName = "osmotr.js" } }
        binaries.executable()
    }
    listOf(iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "Shared"
            isStatic = true
        }
    }
    sourceSets {
        commonMain.dependencies {
            implementation(compose.runtime)
            implementation(compose.foundation)
            implementation(compose.material3)
            implementation(compose.components.resources)
            implementation(libs.okio)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.atomicfu)
            implementation(libs.coil.compose.mp)
            implementation(libs.telephoto.zoomable)
            implementation(libs.compose.icons.mp)
            implementation(libs.lifecycle.runtime.compose.mp)
            implementation(libs.compose.backhandler.mp)
            implementation(libs.kotlinx.coroutines.core)
        }
        androidMain.dependencies {
            implementation(libs.exifinterface)
            implementation(libs.telephoto.coil3)
        }
        wasmJsMain.dependencies {
            // Распаковка и сжатие (xlsx, zip) и подпись журнала — синхронно, как на телефоне.
            implementation(npm("fflate", "0.8.3"))
            implementation(npm("@noble/curves", "1.9.7"))
            // «Назад» браузера — в диспетчер «назад» Compose (Main.kt).
            implementation("org.jetbrains.androidx.navigationevent:navigationevent-compose:1.1.0")
        }
        jvmTest.dependencies {
            implementation(kotlin("test-junit"))
        }
    }
}

tasks.withType<Test>().configureEach {
    // Набор кривых описей — тот же, что у Android-тестов.
    systemProperty("templates", rootProject.file("shared/src/jvmTest/resources/templates").absolutePath)
    // Куда сложить образец отчёта (ReportSampleTest); пусто — образец не собирается.
    systemProperty("reportSample", providers.environmentVariable("OSMOTR_REPORT_SAMPLE").orElse("").get())
}

// Шрифт и прочие ресурсы общего кода — класс Res в своём пакете, наружу не виден.
compose.resources {
    packageOfResClass = "kg.osmotr.ui.res"
    publicResClass = false
}
