#!/usr/bin/env bash
# Несколько эмуляторов в Windows для параллельной матрицы (в WSL нет KVM — «Nested features: 0x0»).
# Все экземпляры — «только чтение» (-read-only): иначе второй того же AVD не стартует; изменения сеанса
# не сохраняются, опись стенда и разрешения — из образа устройства.
#
#   tools/matrix/emulators.sh            поднять один (emulator-5554), дождаться загрузки
#   tools/matrix/emulators.sh 2          два — только по слову автора (27.10.2026: «Не надо 2 эмулятора. По одному.»)
#   tools/matrix/emulators.sh stop       погасить свои (по портам)
#
# Затем: OSMOTR_ADB=$ADB python3 tools/matrix/paths.py --устройства emulator-5554,emulator-5556 …
set -euo pipefail
WIN=${OSMOTR_EMU_HOME:-C:\\Users\\osmin\\AndroidEmu}
ADB=${OSMOTR_ADB:-/mnt/c/Users/osmin/AndroidEmu/sdk/platform-tools/adb.exe}
AVD=${OSMOTR_AVD:-osmotr}
# Графика: один экземпляр — видеокарта ноутбука (быстрее); два и больше — программная: с «-gpu host» они делят
# видеокарту, и канал к ней встаёт — поток отрисовки висит в eglSwapBuffers, Android показывает «Осмотр не
# отвечает» (27.10.2026, ANR в /data/anr).
GPU=${OSMOTR_EMU_GPU:-$([ "${1:-1}" = 1 ] && echo host || echo swiftshader_indirect)}
n=${1:-1}
# Ещё ключи эмулятору, через пробел (опыты с графикой): OSMOTR_EMU_ARGS='-feature -Vulkan'.
EXTRA=$(for a in ${OSMOTR_EMU_ARGS:-}; do printf ",'%s'" "$a"; done)
if [ "$n" = stop ]; then
  for s in $("$ADB" devices | tr -d '\r' | awk '/^emulator-/{print $1}'); do "$ADB" -s "$s" emu kill >/dev/null 2>&1 || true; done
  exit 0
fi
cd /mnt/c   # cmd.exe/powershell не любят UNC-путь WSL текущей папкой
for ((i = 0; i < n; i++)); do
  port=$((5554 + 2 * i))
  "$ADB" -s "emulator-$port" get-state >/dev/null 2>&1 && continue
  powershell.exe -NoProfile -Command "\$env:ANDROID_SDK_ROOT='$WIN\\sdk'; \$env:ANDROID_AVD_HOME='$WIN\\avd'; Start-Process -WindowStyle Minimized -FilePath '$WIN\\sdk\\emulator\\emulator.exe' -ArgumentList '-avd','$AVD','-read-only','-no-snapshot','-no-boot-anim','-no-audio','-gpu','$GPU','-memory','3072','-cores','6','-accel','on','-port','$port'$EXTRA" </dev/null >/dev/null 2>&1 &
  sleep 4
done
for ((i = 0; i < n; i++)); do
  s=emulator-$((5554 + 2 * i))
  for _ in $(seq 1 100); do
    [ "$("$ADB" -s "$s" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && break
    sleep 3
  done
  # Щелчок мышью в окне Gboard принимает за стилус — обучение рукописному вводу перехватывает набор.
  "$ADB" -s "$s" shell settings put secure stylus_handwriting_enabled 0
  echo "$s: $("$ADB" -s "$s" shell getprop sys.boot_completed | tr -d '\r')"
done
