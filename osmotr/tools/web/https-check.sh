#!/usr/bin/env bash
# Проверить раздачу PWA так, как в бою: nginx с deploy/pwa/osmotr-pwa.conf, https (самоподписанный
# сертификат), затем — заголовки и пути матрицы через этот адрес. Систему не трогает: всё — во временной папке.
#
#   tools/web/https-check.sh [путь к nginx] [ключи matrix.mjs…]
#   NGINX=… — nginx не из PATH (например, распакованный: apt-get download nginx && dpkg -x nginx_*.deb root)
set -euo pipefail
cd "$(dirname "$0")/../.."
NGINX=${NGINX:-nginx}
DIST=$PWD/shared/build/dist/wasmJs/productionExecutable
CONF=$PWD/deploy/pwa/osmotr-pwa.conf
PORT=${PORT:-8443}
T=$(mktemp -d)
NPID=
trap '[ -n "$NPID" ] && kill "$NPID" 2>/dev/null; rm -rf "$T"' EXIT
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=127.0.0.1 -keyout "$T/key.pem" -out "$T/cert.pem" </dev/null >/dev/null 2>&1
cat > "$T/nginx.conf" <<CONF
daemon off; pid $T/nginx.pid; error_log $T/error.log;
events {}
http {
    access_log off; client_body_temp_path $T; proxy_temp_path $T; fastcgi_temp_path $T; uwsgi_temp_path $T; scgi_temp_path $T;
    server {
        listen 127.0.0.1:$PORT ssl; http2 on;
        ssl_certificate $T/cert.pem; ssl_certificate_key $T/key.pem;
        root $DIST;
        include $CONF;
    }
}
CONF
"$NGINX" -p "$T" -c "$T/nginx.conf" -t </dev/null 2>&1 | tail -n 1
"$NGINX" -p "$T" -c "$T/nginx.conf" </dev/null >/dev/null 2>&1 &  # без своего фона (он в WSL зависал) и без нашего вывода
NPID=$!
for _ in $(seq 50); do curl -sk -o /dev/null "https://127.0.0.1:$PORT/" && break; sleep 0.1; done
B=https://127.0.0.1:$PORT
fail=0
check() { # путь, заголовок, ожидаемое (подстрока)
  local got; got=$(curl -sk -o /dev/null -D - -H 'Accept-Encoding: gzip' "$B$1" | tr -d '\r' | grep -i "^$2:" | head -n 1 || true)
  if [[ "${got,,}" == *"${3,,}"* ]]; then echo "  ✓ $1  $2: ${got#*: }"; else echo "  ✗ $1  $2 — ждали «$3», было «${got#*: }»"; fail=1; fi
}
WASM=$(cd "$DIST" && ls *.wasm | head -n 1)
echo "заголовки ($B):"
check / content-type text/html
check / cache-control no-cache
check /sw.js cache-control no-cache
check /sw.js content-type javascript
check /manifest.webmanifest content-type application/manifest+json
check "/$WASM" content-type application/wasm
check "/$WASM" content-encoding gzip
check "/$WASM" cache-control immutable
check /osmotr.js content-encoding gzip
check / permissions-policy 'camera=(self)'
check / strict-transport-security max-age
check / x-content-type-options nosniff
code=$(curl -sk -o /dev/null -w '%{http_code}' "$B/нет-такого.js"); [ "$code" = 404 ] && echo "  ✓ нет файла — 404" || { echo "  ✗ нет файла — $code"; fail=1; }
[ $fail = 0 ] || { echo "заголовки не те"; exit 1; }
node tools/web/matrix.mjs --адрес "$B/" "$@"
