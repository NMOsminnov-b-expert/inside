#!/usr/bin/env bash
# «Осмотр» PWA с этого ноутбука через его мобильную точку доступа — временно, без своего сервера (автор,
# 27.10.2026: «захостить пока что временно на этом ноутбуке; подключаться по мобильной точке»).
#
# iPhone видит ноутбук по адресу точки доступа Windows (192.168.137.1). https — на свой корневой
# сертификат: настоящий на IP-адрес не выдают. Корневой сертификат и значок «Осмотра» ставятся одним
# профилем (.mobileconfig) со страницы http://192.168.137.1/ — Apple ID не нужен.
#
#   tools/web/hotspot.sh start      собрать раздачу, включить точку доступа, поднять nginx на Windows
#   tools/web/hotspot.sh stop       погасить nginx (точку доступа — выключить в Windows самим)
#   tools/web/hotspot.sh firewall   разрешить 80 и 443 в брандмауэре (окно «Разрешить изменения?»)
#
# Данные «Осмотра» привязаны к адресу: при переезде на постоянный — выгрузить архивы (docs/pwa.md).
set -euo pipefail
cd "$(dirname "$0")/../.."
IP=${OSMOTR_HOTSPOT_IP:-192.168.137.1}
WIN=${OSMOTR_HOTSPOT_WIN:-C:\\Users\\osmin\\osmotr-host}      # папка раздачи на Windows
H=$(wslpath "$WIN")
NGINX_DIR=$(ls -d "$H"/nginx-*/ 2>/dev/null | sort -V | tail -n 1)
WIN_NGINX=$(wslpath -w "$NGINX_DIR")
KEYS=${OSMOTR_HOTSPOT_KEYS:-$HOME/.config/osmotr-hotspot}  # закрытый ключ корневого — только здесь
DIST=shared/build/dist/wasmJs/productionExecutable
# PowerShell из WSL: вывод — в UTF-8 (иначе кириллица в cp866); ошибка команды (нет процесса) — не обрыв скрипта.
ps() { (cd /mnt/c && powershell.exe -NoProfile -Command "[Console]::OutputEncoding = [Text.Encoding]::UTF8; $1" </dev/null 2>&1 | tr -d '\r') || true; }

certs() {
  mkdir -p "$KEYS" && chmod 700 "$KEYS"
  if [ ! -f "$KEYS/ca.key" ]; then
    openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -sha256 -subj "/CN=Осмотр — ноутбук (временный)/O=Осмотр" \
      -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" \
      -keyout "$KEYS/ca.key" -out "$KEYS/ca.crt" </dev/null >/dev/null 2>&1
    chmod 600 "$KEYS/ca.key"
  fi
  # Сертификат сайта — на адрес точки доступа; iOS не принимает сроки длиннее 397 дней.
  if [ ! -f "$KEYS/site-$IP.crt" ] || ! openssl x509 -checkend 2592000 -noout -in "$KEYS/site-$IP.crt" >/dev/null; then
    openssl req -newkey rsa:2048 -nodes -subj "/CN=$IP" -keyout "$KEYS/site.key" -out "$KEYS/site.csr" </dev/null >/dev/null 2>&1
    printf 'subjectAltName=IP:%s\nextendedKeyUsage=serverAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\nbasicConstraints=CA:FALSE\n' "$IP" > "$KEYS/site.ext"
    openssl x509 -req -in "$KEYS/site.csr" -CA "$KEYS/ca.crt" -CAkey "$KEYS/ca.key" -CAcreateserial -days 397 -sha256 \
      -extfile "$KEYS/site.ext" -out "$KEYS/site-$IP.crt" >/dev/null 2>&1
  fi
}

profile() {
  # Один профиль: корневой сертификат + значок «Осмотра» на весь экран (веб-клип). Идентификаторы постоянные —
  # повторная установка заменяет прежний профиль, а не ставит второй.
  python3 - "$KEYS/ca.crt" "$DIST/icon-180.png" "$IP" "$H/install/osmotr.mobileconfig" <<'EOF'
import plistlib, ssl, sys, uuid
ca, icon, ip, out = sys.argv[1:]
der = ssl.PEM_cert_to_DER_cert(open(ca).read())
ns = uuid.UUID('6f6e1a40-8b8a-4c0e-9b54-0a1c2d3e4f50')
u = lambda s: str(uuid.uuid5(ns, s)).upper()
plist = {
    'PayloadType': 'Configuration', 'PayloadVersion': 1, 'PayloadIdentifier': 'kg.osmotr.install',
    'PayloadUUID': u('profile'), 'PayloadDisplayName': 'Осмотр', 'PayloadOrganization': 'Осмотр',
    'PayloadDescription': 'Значок «Осмотра» на экране «Домой» и сертификат ноутбука, с которого он раздаётся.',
    'PayloadRemovalDisallowed': False,
    'PayloadContent': [
        {'PayloadType': 'com.apple.security.root', 'PayloadVersion': 1, 'PayloadIdentifier': 'kg.osmotr.install.ca',
         'PayloadUUID': u('ca'), 'PayloadDisplayName': 'Сертификат ноутбука «Осмотра»', 'PayloadContent': der},
        {'PayloadType': 'com.apple.webClip.managed', 'PayloadVersion': 1, 'PayloadIdentifier': 'kg.osmotr.install.webclip',
         'PayloadUUID': u('webclip'), 'PayloadDisplayName': 'Значок «Осмотра»', 'Label': 'Осмотр',
         'URL': f'https://{ip}/', 'Icon': open(icon, 'rb').read(), 'FullScreen': True, 'IsRemovable': True,
         'IgnoreManifestScope': False, 'Precomposed': True},
    ],
}
plistlib.dump(plist, open(out, 'wb'))
EOF
}

page() {
  cat > "$H/install/index.html" <<EOF
<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Установить «Осмотр»</title>
<style>body{font:17px/1.45 -apple-system,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;color:#111;background:#F4F6F8}
h1{font-size:24px}ol{padding-left:22px}li{margin:10px 0}a.b{display:block;text-align:center;background:#1F6FEB;color:#fff;text-decoration:none;
padding:14px;border-radius:12px;font-weight:600;margin:16px 0}small{color:#555}@media(prefers-color-scheme:dark){body{background:#0D1117;color:#eee}small{color:#aaa}}</style></head>
<body><h1>Установить «Осмотр»</h1>
<p>Нужен iPhone на iOS 18.2 или новее и Safari.</p>
<a class="b" href="osmotr.mobileconfig">1. Загрузить профиль</a>
<ol>
<li>Safari спросит «Разрешить загрузку профиля?» — <b>Разрешить</b>.</li>
<li>Откройте <b>Настройки</b> → вверху <b>«Профиль загружен»</b> → <b>Установить</b> (код телефона) → <b>Установить</b>.</li>
<li><b>Настройки → Основные → Об этом устройстве → Доверие сертификатам</b> → включите <b>«Осмотр — ноутбук»</b> → <b>Продолжить</b>.</li>
<li>На экране «Домой» появился значок <b>«Осмотр»</b> — откройте его. Первый раз телефон должен быть подключён к точке доступа ноутбука.</li>
</ol>
<a class="b" href="https://$IP/">2. Открыть «Осмотр»</a>
<p><small>После первого открытия «Осмотр» работает без сети. Обновления приходят, когда телефон снова в точке доступа ноутбука.
Снимки хранятся в телефоне, в «Осмотре»; выгружайте архивы после каждого выезда.</small></p>
</body></html>
EOF
}

conf() {
  cp deploy/pwa/osmotr-pwa.conf "$NGINX_DIR/conf/osmotr-pwa.conf"
  cp "$KEYS/site-$IP.crt" "$NGINX_DIR/conf/site.crt"; cp "$KEYS/site.key" "$NGINX_DIR/conf/site.key"
  cat > "$NGINX_DIR/conf/nginx.conf" <<EOF
# Создан tools/web/hotspot.sh — не править руками.
worker_processes 1;
events { worker_connections 256; }
http {
    access_log logs/access.log;
    sendfile on;
    # http — только страница установки и профиль (по https их не открыть, пока сертификату не доверяют).
    server {
        listen 80;
        root ../install;
        types { text/html html; application/x-apple-aspen-config mobileconfig; }
        location = / { try_files /index.html =404; add_header Cache-Control "no-cache" always; }
        location / { try_files \$uri =404; add_header Cache-Control "no-cache" always; }
    }
    server {
        listen 443 ssl;
        http2 on;
        ssl_certificate site.crt;
        ssl_certificate_key site.key;
        root ../site;
        include osmotr-pwa.conf;
    }
}
EOF
}

case "${1:-start}" in
start)
  [ -n "$NGINX_DIR" ] || { echo "нет nginx в $WIN (nginx.org/download, zip для Windows)"; exit 1; }
  [ -f "$DIST/index.html" ] || tools/web/build.sh
  certs
  mkdir -p "$H/install"
  rm -rf "$H/site" && cp -r "$DIST" "$H/site" && rm -f "$H"/site/*.map
  profile; page; conf
  # Точка доступа Windows — делится тем интернетом, что есть у ноутбука.
  ps "[Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime] | Out-Null;
      [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime] | Out-Null;
      Add-Type -AssemblyName System.Runtime.WindowsRuntime;
      \$p = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile();
      if (-not \$p) { 'точка доступа: нет интернета, которым делиться'; exit }
      \$m = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile(\$p);
      if (\$m.TetheringOperationalState -eq 'On') { 'точка доступа: уже включена'; exit }
      \$a = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { \$_.Name -eq 'AsTask' -and \$_.GetParameters().Count -eq 1 -and \$_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0];
      \$t = \$a.MakeGenericMethod([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult]).Invoke(\$null, @(\$m.StartTetheringAsync()));
      \$t.Wait(20000) | Out-Null; 'точка доступа: ' + \$t.Result.Status + ' ' + \$t.Result.AdditionalErrorMessage;
      'сеть: ' + \$m.GetCurrentAccessPointConfiguration().Ssid"
  ps "Get-Process nginx -ErrorAction SilentlyContinue | Where-Object { \$_.Path -like '$WIN*' } | Stop-Process -Force" >/dev/null
  ps "Start-Process -WindowStyle Hidden -FilePath '${WIN_NGINX}nginx.exe' -WorkingDirectory '$WIN_NGINX'" >/dev/null
  sleep 2
  ps "Get-NetTCPConnection -State Listen -LocalPort 80,443 -ErrorAction SilentlyContinue | Select-Object -Unique LocalAddress,LocalPort | Format-Table -HideTableHeaders | Out-String"
  echo "установка на iPhone: http://$IP/   приложение: https://$IP/"
  ;;
stop)
  ps "Get-Process nginx -ErrorAction SilentlyContinue | Where-Object { \$_.Path -like '$WIN*' } | Stop-Process -Force"
  echo "nginx остановлен"
  ;;
firewall)
  # Отдельным файлом: русское имя правила в кавычках внутри -ArgumentList терялось.
  cat > "$H/firewall.ps1" <<'EOF2'
Remove-NetFirewallRule -DisplayName 'Osmotr PWA (laptop)' -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName 'Osmotr PWA (laptop)' -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow -Profile Any | Out-Null
EOF2
  ps "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','$WIN\\firewall.ps1'"
  ps "Get-NetFirewallRule -DisplayName 'Osmotr PWA (laptop)' -ErrorAction SilentlyContinue | Select-Object DisplayName,Enabled | Format-List | Out-String"
  ;;
*) sed -n '2,14p' "$0"; exit 1 ;;
esac
