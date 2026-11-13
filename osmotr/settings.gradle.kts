// «Осмотр» — фотофиксация осмотров оборудования (docs/ТЗ.md).
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    // PWA (wasmJs): сборке нужны Node.js, Yarn и Binaryen — плагин Kotlin добавляет их хранилища в проект,
    // а здесь всё — в одном месте: проектные хранилища не берутся (PREFER_SETTINGS), их три — ниже.
    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
    repositories {
        google()
        mavenCentral()
        ivy("https://nodejs.org/dist") {
            name = "Node.js"
            patternLayout { artifact("v[revision]/[artifact](-v[revision]-[classifier]).[ext]") }
            metadataSources { artifact() }
            content { includeModule("org.nodejs", "node") }
        }
        ivy("https://github.com/yarnpkg/yarn/releases/download") {
            name = "Yarn"
            patternLayout { artifact("v[revision]/[artifact](-v[revision]).[ext]") }
            metadataSources { artifact() }
            content { includeModule("com.yarnpkg", "yarn") }
        }
        ivy("https://github.com/WebAssembly/binaryen/releases/download") {
            name = "Binaryen"
            patternLayout { artifact("version_[revision]/[module]-version_[revision]-[classifier].[ext]") }
            metadataSources { artifact() }
            content { includeModule("com.github.webassembly", "binaryen") }
        }
    }
}
// PWA собирается на Compose 1.13 (пока альфа), телефоны — на стабильной из libs.versions.toml: в 1.12
// дерево доступности в браузере после первого же диалога или меню пустеет навсегда (слушатель помнит
// одного «владельца» дерева, закрытый диалог его обнуляет) — VoiceOver и автотесты PWA теряли экран;
// в 1.13 владельцев список. tools/web/build.sh передаёт -Posmotr.web. Выйдет 1.13 стабильной — общая версия.
dependencyResolutionManagement {
    // Каталог libs Gradle заводит сам из gradle/libs.versions.toml — здесь только подмена версии.
    if (providers.gradleProperty("osmotr.web").isPresent) versionCatalogs.configureEach {
        if (name == "libs") version("compose-multiplatform", "1.13.0-alpha02")
    }
}
rootProject.name = "osmotr"
include(":app")
// Общее для Android и iPhone: описи, Excel, поиск, интерфейс (Kotlin Multiplatform + Compose Multiplatform).
include(":shared")
