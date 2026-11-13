plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.kmp.library) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.multiplatform) apply false
    alias(libs.plugins.compose.multiplatform) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.kover)
}

// Покрытие — общий отчёт по общему коду (тесты JVM) и приложению (тесты экранов, Robolectric):
// ./gradlew koverHtmlReport koverLog
dependencies {
    kover(project(":shared"))
    kover(project(":app"))
}
