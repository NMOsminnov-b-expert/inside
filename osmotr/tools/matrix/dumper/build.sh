#!/usr/bin/env bash
# Собрать помощник снимков матрицы (Dumper.java) инструментами SDK, без Gradle → build/dumper.apk.
set -euo pipefail
cd "$(dirname "$0")"
SDK=${ANDROID_HOME:-$HOME/Android/Sdk}
BT=$(ls -d "$SDK"/build-tools/* | sort -V | tail -n 1)
JAR=$(ls -d "$SDK"/platforms/android-* | sort -V | tail -n 1)/android.jar
JAVA_HOME=${JAVA_HOME:-$HOME/.local/opt/jdk-21.0.12.1+1}
rm -rf build && mkdir -p build/classes build/dex
"$JAVA_HOME/bin/javac" -source 11 -target 11 -nowarn -cp "$JAR" -d build/classes $(find src -name '*.java') 2>&1 | grep -v "bootstrap class path" || true
"$BT/d8" --min-api 26 --lib "$JAR" --output build/dex $(find build/classes -name '*.class')
"$BT/aapt2" link -o build/unsigned.apk -I "$JAR" --manifest AndroidManifest.xml --min-sdk-version 26 --target-sdk-version 35
python3 -c "import zipfile; zipfile.ZipFile('build/unsigned.apk', 'a').write('build/dex/classes.dex', 'classes.dex')"
"$BT/zipalign" -f 4 build/unsigned.apk build/aligned.apk
"$BT/apksigner" sign --ks "$HOME/.android/debug.keystore" --ks-pass pass:android --key-pass pass:android --out build/dumper.apk build/aligned.apk
echo "готово: $(pwd)/build/dumper.apk"
