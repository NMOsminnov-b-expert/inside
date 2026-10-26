# -*- coding: utf-8 -*-
"""Локальный прокси к порталу Кадастра: адрес по коду ЕНИ.

Зачем он нужен. Портал отвечает обычным HTML-фрагментом и НЕ отдаёт заголовок
Access-Control-Allow-Origin, поэтому браузер не даст макету прочитать ответ:
запрос уйдёт, а результат будет заблокирован. Прежний скрипт на VBA этого
ограничения не знал — MSXML2.ServerXMLHTTP не браузер, и CORS ему не писан.

Прокси делает ровно один шаг: принимает код ЕНИ, ходит на портал сам и
возвращает разобранный адрес с разрешающим заголовком.

    python tools/cadastre/proxy.py            # слушает 127.0.0.1:8787
    python tools/cadastre/proxy.py --port 9000

Проверка:

    curl "http://127.0.0.1:8787/eni?code=7100600330016"
    {"eni": "7100600330016", "address": "обл. Чуй, г. Токмок, ул. Гагарина, д. 82."}

ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: на сервере прокси не нужен — запрос к Кадастру делает
бэкенд, а фронт зовёт свой API. Здесь это подпорка для макета: она живёт рядом с
Live Server и работает только у того, кто её запустил.
"""
import argparse
import json
import os
import re
import socket
import ssl
import sys
import threading
import http.cookiejar
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

URL = 'https://cadastre.kg/svc-portal/map/searchAddrResult.do'

# Адрес приходит дважды — в <dd> и в data-addr у ссылки на карту. Берём первое,
# что нашли: значения совпадают, а разные страницы портала показывают то одно,
# то другое.
RE_DD = re.compile(r'<dd[^>]*>(.*?)</dd>', re.S | re.I)
RE_ATTR = re.compile(r'data-addr="([^"]+)"', re.I)

HEADERS = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://cadastre.kg/svc-portal/map/main.do',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
}

# Портал отдаёт только свой сертификат, без промежуточного (проверка
# 26.10.2026: openssl s_client — «unable to verify the first certificate»).
# Браузер и curl на Windows докачивают промежуточный по ссылке AIA из
# сертификата сайта, Python — нет: каждый запрос падал с
# CERTIFICATE_VERIFY_FAILED, и прокси отвечал макету 502. Поэтому промежуточный
# сертификат Sectigo (публичный, до 2036 года) зашит сюда, а если портал
# сменит удостоверяющий центр — недостающий докачивается по AIA и запрос
# повторяется (_open). Проверка подлинности не отключается.
#
# Sectigo Public Server Authentication CA DV R36, выдан Sectigo Public Server
# Authentication Root R46; SHA-256 8C:54:C3:34:B6:6B:A4:E4:26:77:2A:F4:A3:F9:
# 13:6C:19:A1:AE:C7:29:FD:B2:8C:53:5C:07:A5:A4:EF:22:E0.
ISSUERS = '''-----BEGIN CERTIFICATE-----
MIIGTDCCBDSgAwIBAgIQOXpmzCdWNi4NqofKbqvjsTANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNMzYwMzIxMjM1OTU5WjBgMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTcwNQYDVQQDEy5TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gQ0EgRFYgUjM2MIIBojANBgkqhkiG9w0B
AQEFAAOCAY8AMIIBigKCAYEAljZf2HIz7+SPUPQCQObZYcrxLTHYdf1ZtMRe7Yeq
RPSwygz16qJ9cAWtWNTcuICc++p8Dct7zNGxCpqmEtqifO7NvuB5dEVexXn9RFFH
12Hm+NtPRQgXIFjx6MSJcNWuVO3XGE57L1mHlcQYj+g4hny90aFh2SCZCDEVkAja
EMMfYPKuCjHuuF+bzHFb/9gV8P9+ekcHENF2nR1efGWSKwnfG5RawlkaQDpRtZTm
M64TIsv/r7cyFO4nSjs1jLdXYdz5q3a4L0NoabZfbdxVb+CUEHfB0bpulZQtH1Rv
38e/lIdP7OTTIlZh6OYL6NhxP8So0/sht/4J9mqIGxRFc0/pC8suja+wcIUna0HB
pXKfXTKpzgis+zmXDL06ASJf5E4A2/m+Hp6b84sfPAwQ766rI65mh50S0Di9E3Pn
2WcaJc+PILsBmYpgtmgWTR9eV9otfKRUBfzHUHcVgarub/XluEpRlTtZudU5xbFN
xx/DgMrXLUAPaI60fZ6wA+PTAgMBAAGjggGBMIIBfTAfBgNVHSMEGDAWgBRWc1hk
lfmSGrASKgRieaFAFYghSTAdBgNVHQ4EFgQUaMASFhgOr872h6YyV6NGUV3LBycw
DgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYI
KwYBBQUHAwEGCCsGAQUFBwMCMBsGA1UdIAQUMBIwBgYEVR0gADAIBgZngQwBAgEw
VAYDVR0fBE0wSzBJoEegRYZDaHR0cDovL2NybC5zZWN0aWdvLmNvbS9TZWN0aWdv
UHVibGljU2VydmVyQXV0aGVudGljYXRpb25Sb290UjQ2LmNybDCBhAYIKwYBBQUH
AQEEeDB2ME8GCCsGAQUFBzAChkNodHRwOi8vY3J0LnNlY3RpZ28uY29tL1NlY3Rp
Z29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RSNDYucDdjMCMGCCsGAQUF
BzABhhdodHRwOi8vb2NzcC5zZWN0aWdvLmNvbTANBgkqhkiG9w0BAQwFAAOCAgEA
YtOC9Fy+TqECFw40IospI92kLGgoSZGPOSQXMBqmsGWZUQ7rux7cj1du6d9rD6C8
ze1B2eQjkrGkIL/OF1s7vSmgYVafsRoZd/IHUrkoQvX8FZwUsmPu7amgBfaY3g+d
q1x0jNGKb6I6Bzdl6LgMD9qxp+3i7GQOnd9J8LFSietY6Z4jUBzVoOoz8iAU84OF
h2HhAuiPw1ai0VnY38RTI+8kepGWVfGxfBWzwH9uIjeooIeaosVFvE8cmYUB4TSH
5dUyD0jHct2+8ceKEtIoFU/FfHq/mDaVnvcDCZXtIgitdMFQdMZaVehmObyhRdDD
4NQCs0gaI9AAgFj4L9QtkARzhQLNyRf87Kln+YU0lgCGr9HLg3rGO8q+Y4ppLsOd
unQZ6ZxPNGIfOApbPVf5hCe58EZwiWdHIMn9lPP6+F404y8NNugbQixBber+x536
WrZhFZLjEkhp7fFXf9r32rNPfb74X/U90Bdy4lzp3+X1ukh1BuMxA/EEhDoTOS3l
7ABvc7BYSQubQ2490OcdkIzUh3ZwDrakMVrbaTxUM2p24N6dB+ns2zptWCva6jzW
r8IWKIMxzxLPv5Kt3ePKcUdvkBU/smqujSczTzzSjIoR5QqQA6lN1ZRSnuHIWCvh
JEltkYnTAH41QJ6SAWO66GrrUESwN/cgZzL4JLEqz1Y=
-----END CERTIFICATE-----
'''
RE_AIA = re.compile(rb'http://[\x21-\x7e]+?\.(?:crt|cer)')
_ctx = ssl.create_default_context()
_ctx.load_verify_locations(cadata=ISSUERS)
_ctx_lock = threading.Lock()


def _chase_issuer(url):
    """Докачать промежуточный сертификат по AIA сертификата сайта; True — добавлен."""
    try:
        host = urllib.parse.urlsplit(url).hostname
        der = ssl.PEM_cert_to_DER_cert(ssl.get_server_certificate((host, 443), timeout=10))
        m = RE_AIA.search(der)
        if not m:
            return False
        with urllib.request.urlopen(m.group(0).decode('ascii'), timeout=10) as r:
            data = r.read()
        with _ctx_lock:
            _ctx.load_verify_locations(cadata=data.decode('ascii') if data.startswith(b'-----BEGIN') else data)
        return True
    except Exception:
        return False


def _open(opener, req, timeout):
    """opener.open с одной повторной попыткой, если не хватило промежуточного сертификата."""
    try:
        return opener.open(req, timeout=timeout)
    except urllib.error.URLError as e:
        if not isinstance(getattr(e, 'reason', None), ssl.SSLCertVerificationError) or not _chase_issuer(req.full_url):
            raise
    return opener.open(req, timeout=timeout)


_plain = urllib.request.build_opener(urllib.request.HTTPSHandler(context=_ctx))


def fetch(eni: str, timeout: float = 20.0) -> dict:
    """Адрес по коду ЕНИ. Возвращает {'eni', 'address'} либо {'eni', 'error'}."""
    code = re.sub(r'\D', '', eni or '')
    if not code:
        return {'eni': eni, 'error': 'пустой код'}

    data = urllib.parse.urlencode({
        'searchCondition': 'ENI',
        'inputPropCode': code,
        'propCode': code,
        'oblast': '', 'region': '', 'ao': '', 'village': '',
        'street': '', 'buildingNumb': '', 'flatNumb': '', 'uchNo': '',
        'page': '1', 'pageListSize': '12',
    }).encode('utf-8')

    req = urllib.request.Request(URL, data=data, headers=HEADERS, method='POST')
    try:
        with _open(_plain, req, timeout) as resp:
            html = resp.read().decode('utf-8', 'replace')
    except Exception as e:                      # сеть, таймаут, ошибка портала
        return {'eni': code, 'error': 'портал недоступен: %s' % e}

    for rx in (RE_DD, RE_ATTR):
        m = rx.search(html)
        if m:
            addr = re.sub(r'<[^>]+>', '', m.group(1)).strip()
            # Портал заканчивает адрес точкой — в поле она не нужна.
            return {'eni': code, 'address': addr.rstrip(' .')}

    return {'eni': code, 'error': 'не найдено'}


# Сквозной проход к карте портала — /portal/<путь> → cadastre.kg/svc-portal/map/<путь>
# (13.10.2026, координаты участков по ЕНИ и адресу: рамка getFeatureExtent.do,
# контур — WFS через proxy.do портала, справочник адресов searchAddr.do,
# адрес → ЕНИ searchAddrResult.do; разбор — в app/kernel/cadastreGeo.js, один
# на оба обхода — этот прокси и прокси Live Server /cadastre/…). Сессия
# портала держится между запросами: часть его служб без неё отвечает ошибкой.
PORTAL = 'https://cadastre.kg/svc-portal/map/'
_jar = http.cookiejar.CookieJar()
_opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=_ctx), urllib.request.HTTPCookieProcessor(_jar))


def portal(path_qs, body=None, ctype=None, timeout=30.0):
    """Запрос к карте портала; (код, тип содержимого, байты)."""
    headers = dict(HEADERS)
    if ctype:
        headers['Content-Type'] = ctype
    elif body is None:
        headers.pop('Content-Type', None)
    req = urllib.request.Request(PORTAL + path_qs, data=body, headers=headers, method='POST' if body is not None else 'GET')
    try:
        with _open(_opener, req, timeout) as resp:
            return resp.status, resp.headers.get('Content-Type', 'text/plain'), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, 'text/plain; charset=utf-8', ('портал ответил %s' % e.code).encode('utf-8')
    except Exception as e:                      # сеть, таймаут
        return 502, 'text/plain; charset=utf-8', ('портал недоступен: %s' % e).encode('utf-8')


# Браузер закрыл соединение, не дождавшись ответа (перезагрузил страницу,
# ушёл с экрана, истёк его таймаут) — ответ писать некуда. Это не ошибка
# прокси: одна строка в журнале вместо стека (журнал пользователя 14.10.2026 —
# ConnectionAbortedError [WinError 10053] на каждый брошенный запрос карты).
GONE = (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)


class Handler(BaseHTTPRequestHandler):
    def _write(self, code, ctype, body):
        try:
            self.send_response(code)
            self.send_header('Content-Type', ctype)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except GONE:
            sys.stdout.write('клиент не дождался ответа: %s' % self.path[:90] + chr(10))

    def _raw(self, code, ctype, body):
        self._write(code, ctype, body)

    def _portal(self, body=None):
        rest = self.path[len('/portal/'):]
        if not rest or '..' in rest or rest.startswith(('http:', 'https:', '/')):
            self._send(400, {'error': 'неверный путь'})
            return
        self._raw(*portal(rest, body, self.headers.get('Content-Type')))

    def do_POST(self):
        if not self.path.startswith('/portal/'):
            self._send(404, {'error': 'нет такого пути'})
            return
        n = int(self.headers.get('Content-Length') or 0)
        self._portal(self.rfile.read(n) if n else b'')

    def _send(self, code, payload):
        # Разрешаем любой источник: прокси слушает только петлевой адрес и
        # отдаёт публичные данные портала.
        self._write(code, 'application/json; charset=utf-8', json.dumps(payload, ensure_ascii=False).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/portal/'):
            self._portal()
            return
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path not in ('/eni', '/'):
            self._send(404, {'error': 'нет такого пути'})
            return

        if parsed.path == '/':
            self._send(200, {'ok': True, 'usage': '/eni?code=7100600330016'})
            return

        code = urllib.parse.parse_qs(parsed.query).get('code', [''])[0]
        self._send(200, fetch(code))

    # Свой лог: стандартный пишет в stderr строкой на каждый запрос и мешает.
    def log_message(self, fmt, *args):
        sys.stdout.write('%s\n' % (fmt % args))


class Server(ThreadingHTTPServer):
    # Порт — только свой. В Windows SO_REUSEADDR (его ставит http.server) даёт
    # второму процессу молча слушать тот же порт: 26.10.2026 на 8787 висели два
    # прокси сразу, и запросы расходились между ними как придётся. Поэтому
    # исключительное занятие порта: второй запуск получает «порт занят».
    allow_reuse_address = os.name != 'nt'

    def server_bind(self):
        if os.name == 'nt':
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

    # Обрыв соединения браузером — и пока прокси читает запрос, и пока пишет
    # ответ: одна строка в журнале, а не стек (WinError 10053/10054).
    def handle_error(self, request, client_address):
        if isinstance(sys.exc_info()[1], GONE):
            sys.stdout.write('клиент оборвал соединение' + chr(10))
            return
        super().handle_error(request, client_address)


def main():
    ap = argparse.ArgumentParser(description='Прокси к порталу Кадастра (адрес по ЕНИ)')
    ap.add_argument('--port', type=int, default=8787)
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--check', metavar='ЕНИ', help='разовый запрос без запуска сервера')
    args = ap.parse_args()

    if args.check:
        print(json.dumps(fetch(args.check), ensure_ascii=False, indent=2))
        return

    # Запросы — параллельно: карта Кадастра просит клетки по три разом и
    # контур участка рядом, а однопоточный сервер отвечал по очереди (замер
    # 14.10.2026: четыре запроса — 0,56 / 1,12 / 1,77 / 2,31 с), и хвост
    # очереди не укладывался в таймаут браузера (15 с).
    try:
        srv = Server((args.host, args.port), Handler)
    except OSError as e:
        print('Порт %d занят — прокси, вероятно, уже запущен (%s)' % (args.port, e))
        sys.exit(1)
    srv.daemon_threads = True
    print('Прокси Кадастра: http://%s:%d/eni?code=<ЕНИ>' % (args.host, args.port))
    print('Остановить — Ctrl+C')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nостановлен')


if __name__ == '__main__':
    main()
