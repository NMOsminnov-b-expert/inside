#!/usr/bin/env bash
# Сборка PWA «Осмотра» (тот же интерфейс, что у телефонов, в WebAssembly) → shared/build/dist/wasmJs/productionExecutable.
# Оптимизатор Binaryen Gradle иногда считает свежим при изменённом коде — он пересобирается всегда.
set -euo pipefail
cd "$(dirname "$0")/../.."
export JAVA_HOME="${JAVA_HOME:-$HOME/.local/opt/jdk-21.0.12.1+1}"
# -Posmotr.web — Compose для браузера своей версии (settings.gradle.kts).
./gradlew -Posmotr.web :shared:compileProductionExecutableKotlinWasmJsOptimize --rerun --console=plain -q
./gradlew -Posmotr.web :shared:wasmJsBrowserDistribution --console=plain -q
node tools/web/sw.mjs shared/build/dist/wasmJs/productionExecutable
echo "готово: shared/build/dist/wasmJs/productionExecutable"
