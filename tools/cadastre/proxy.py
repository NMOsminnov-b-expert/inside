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
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

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


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        # Разрешаем любой источник: прокси слушает только петлевой адрес и
        # отдаёт публичные данные портала.
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
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


def main():
    ap = argparse.ArgumentParser(description='Прокси к порталу Кадастра (адрес по ЕНИ)')
    ap.add_argument('--port', type=int, default=8787)
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--check', metavar='ЕНИ', help='разовый запрос без запуска сервера')
    args = ap.parse_args()

    if args.check:
        print(json.dumps(fetch(args.check), ensure_ascii=False, indent=2))
        return

    srv = HTTPServer((args.host, args.port), Handler)
    print('Прокси Кадастра: http://%s:%d/eni?code=<ЕНИ>' % (args.host, args.port))
    print('Остановить — Ctrl+C')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nостановлен')


if __name__ == '__main__':
    main()
