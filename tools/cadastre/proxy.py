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
import re
import sys
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
        with urllib.request.urlopen(req, timeout=timeout) as resp:
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
_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_jar))


def portal(path_qs, body=None, ctype=None, timeout=30.0):
    """Запрос к карте портала; (код, тип содержимого, байты)."""
    headers = dict(HEADERS)
    if ctype:
        headers['Content-Type'] = ctype
    elif body is None:
        headers.pop('Content-Type', None)
    req = urllib.request.Request(PORTAL + path_qs, data=body, headers=headers, method='POST' if body is not None else 'GET')
    try:
        with _opener.open(req, timeout=timeout) as resp:
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
    srv = Server((args.host, args.port), Handler)
    srv.daemon_threads = True
    print('Прокси Кадастра: http://%s:%d/eni?code=<ЕНИ>' % (args.host, args.port))
    print('Остановить — Ctrl+C')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nостановлен')


if __name__ == '__main__':
    main()
