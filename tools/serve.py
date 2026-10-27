# -*- coding: utf-8 -*-
"""Локальный сервер макета: отдаёт файлы и пишет карточки в файл сотрудника.

Решение пользователя 06.10.2026: «на гит попадают и сохранённые у меня
локально карточки», «записи каждого сотрудника в отдельном файле. В системе
показываем уже сбор со всех таких записей. При этом в каждой копии макета своё
название файла, в который пишет система».

    python tools/serve.py                 # http://127.0.0.1:5500/app.html
    python tools/serve.py --name ivanov   # сменить имя файла этой копии

Макет при каждом сохранении шлёт сюда свои правки (kernel/persist.js), сервер
кладёт их в data/local/<имя>.json и обновляет перечень data/local/manifest.json.
Открывая макет, браузер получает файлы всех сотрудников и собирает из них и
засева то, что видно на экране. Коммит файла — обычный, вместе с остальной
работой: сервер в git ничего не пишет.

Имя файла — своё в каждой копии, в .inside-local.json в корне (вне git).
Если его нет — берётся из имени пользователя git. Порт 5500 — тот же, что у
Live Server: браузер хранит сохранённое по адресу, и на другом порту прежние
правки этого браузера не нашлись бы.
"""
import argparse
import functools
import http.server
import json
import os
import re
import socket
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL = os.path.join(ROOT, 'data', 'local')
CONFIG = os.path.join(ROOT, '.inside-local.json')
MAX_BODY = 32 * 1024 * 1024

# Карта портала Кадастра через тот же адрес, что и макет: /cadastre/<путь> →
# cadastre.kg/svc-portal/map/<путь> — так же, как прокси Live Server
# (.vscode/settings.json), и макет пробует этот путь, если своего прокси на
# 8787 нет (kernel/cadastre.js, kernel/cadastreGeo.js). Нужен сборке для
# показа (tools/package): там макет может встать на любой свободный порт
# (пользователь 23.10.2026: «порт занят — переходим на другой»), а адрес
# прокси 8787 в макете зашит. Запрос к порталу — код прокси (tools/cadastre/proxy.py).
sys.path.insert(0, os.path.join(ROOT, 'tools', 'cadastre'))
try:
    import proxy as cadastre_proxy
except ImportError:  # копия без прокси — путь /cadastre/ отвечает 404
    cadastre_proxy = None

TRANSLIT = dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
                    ['a', 'b', 'v', 'g', 'd', 'e', 'e', 'zh', 'z', 'i', 'y', 'k', 'l', 'm', 'n', 'o', 'p', 'r',
                     's', 't', 'u', 'f', 'h', 'ts', 'ch', 'sh', 'sch', '', 'y', '', 'e', 'yu', 'ya']))


def slug(text):
    """Имя файла латиницей: кириллица в путях по-разному видна в терминалах и git."""
    out = ''.join(TRANSLIT.get(c, c) for c in (text or '').lower())
    return re.sub(r'[^a-z0-9]+', '-', out).strip('-')[:40]


def own_name(override='', save=True):
    if override:
        name = slug(override)
    else:
        try:
            name = slug(json.load(open(CONFIG, encoding='utf-8')).get('file', ''))
        except (OSError, ValueError):
            name = ''
        if not name:
            git = subprocess.run(['git', 'config', 'user.name'], cwd=ROOT, capture_output=True, text=True)
            name = slug(git.stdout.strip()) or 'sotrudnik'
    if save:
        with open(CONFIG, 'w', encoding='utf-8') as fp:
            json.dump({'file': name}, fp, ensure_ascii=False, indent=1)
    return name


def files():
    if not os.path.isdir(LOCAL):
        return []
    return sorted(f for f in os.listdir(LOCAL) if f.endswith('.json') and f != 'manifest.json')


def write_manifest():
    os.makedirs(LOCAL, exist_ok=True)
    manifest = os.path.join(LOCAL, 'manifest.json')
    text = json.dumps({'files': files()}, ensure_ascii=False, indent=1) + '\n'
    try:
        if open(manifest, encoding='utf-8').read() == text:
            return
    except OSError:
        pass
    with open(manifest, 'w', encoding='utf-8', newline='\n') as fp:
        fp.write(text)


class Handler(http.server.SimpleHTTPRequestHandler):
    me = ''

    def end_headers(self):
        # Макет правится на ходу — браузер не должен держать старые модули,
        # но и качать заново все 230+ файлов при каждом открытии незачем:
        # no-cache — «перед использованием спроси»; неизменённый файл
        # приходит ответом 304 без тела (по Last-Modified). Было no-store —
        # каждое открытие тянуло ~4,5 МБ (замер 14.10.2026, «загрузка прям
        # очень долгая»).
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        if self.command == 'POST' or (args and str(args[1])[:1] in '45'):
            super().log_message(fmt, *args)

    def reply(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def cadastre(self, body=None):
        rest = self.path[len('/cadastre/'):]
        if not cadastre_proxy or not rest or '..' in rest or rest.startswith(('http:', 'https:', '/')):
            return self.reply(404, {'error': 'нет такого адреса'})
        code, ctype, data = cadastre_proxy.portal(rest, body, self.headers.get('Content-Type'))
        try:
            self.send_response(code)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass  # браузер не дождался ответа

    def do_GET(self):
        if self.path.startswith('/cadastre/'):
            return self.cadastre()
        if self.path.split('?')[0] != '/__persist':
            return super().do_GET()
        out = {}
        for f in files():
            try:
                out[f[:-5]] = json.load(open(os.path.join(LOCAL, f), encoding='utf-8'))
            except (OSError, ValueError) as e:
                print('файл %s не прочитан: %s' % (f, e), file=sys.stderr)
        self.reply(200, {'me': self.me, 'files': out})

    def do_POST(self):
        if self.path.startswith('/cadastre/'):
            n = int(self.headers.get('Content-Length') or 0)
            return self.cadastre(self.rfile.read(n) if n else b'')
        if self.path.split('?')[0] != '/__persist':
            return self.reply(404, {'error': 'нет такого адреса'})
        size = int(self.headers.get('Content-Length') or 0)
        if not 0 < size <= MAX_BODY:
            return self.reply(413, {'error': 'пустые или слишком большие правки'})
        try:
            data = json.loads(self.rfile.read(size).decode('utf-8'))
            assert isinstance(data.get('sources'), dict)
        except (ValueError, AssertionError, AttributeError):
            return self.reply(400, {'error': 'правки не разобраны'})
        data['author'] = self.me
        os.makedirs(LOCAL, exist_ok=True)
        path = os.path.join(LOCAL, self.me + '.json')
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8', newline='\n') as fp:
            fp.write(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
        os.replace(tmp, path)
        write_manifest()
        self.reply(200, {'ok': True})


class Server(http.server.ThreadingHTTPServer):
    # Порт — только свой (как у прокси Кадастра, tools/cadastre/proxy.py): в
    # Windows SO_REUSEADDR даёт второму процессу молча слушать занятый порт, и
    # на 127.0.0.1:5500 рядом с Live Server (0.0.0.0:5500) отвечал то один, то
    # другой. Исключительное занятие — второй запуск получает «порт занят».
    allow_reuse_address = os.name != 'nt'

    def server_bind(self):
        if os.name == 'nt':
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--port', type=int, default=5500)
    ap.add_argument('--name', default='', help='имя файла записей этой копии (сохраняется в .inside-local.json)')
    # Для автопроверок: своя папка файлов, настройки копии не трогаются.
    ap.add_argument('--data', default='', help='папка файлов сотрудников вместо data/local')
    args = ap.parse_args()

    global LOCAL
    if args.data:
        LOCAL = os.path.abspath(args.data)
    Handler.me = own_name(args.name, save=not args.data)
    write_manifest()
    # Очередь соединений — 256, а не 5 по умолчанию: браузер открывает
    # несколько соединений сразу, и на 230+ файлах лишние отбрасывались и
    # повторялись с задержкой (так же, как у сервера автопроверок,
    # tools/checks/serve.py).
    http.server.ThreadingHTTPServer.request_queue_size = 256
    try:
        srv = Server(('127.0.0.1', args.port), functools.partial(Handler, directory=ROOT))
    except OSError as e:
        print('Порт %d занят — макет на нём уже отвечает (Live Server или другая копия): %s' % (args.port, e))
        sys.exit(1)
    print('макет: http://127.0.0.1:%d/app.html' % args.port)
    print('карточки этой копии пишутся в %s (имя — .inside-local.json)'
          % os.path.relpath(os.path.join(LOCAL, Handler.me + '.json'), ROOT))
    sys.stdout.flush()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
