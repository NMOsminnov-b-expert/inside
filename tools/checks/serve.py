# -*- coding: utf-8 -*-
"""Раздающий сервер стенда проверок: python serve.py <порт> <корень>.

То же, что python -m http.server, но с очередью соединений побольше. У
стандартного очередь — 5 ожидающих соединений, а полный прогон открывает
5 браузеров разом, и каждый тянет сотни файлов модулей: лишние соединения
сервер отбрасывал, и сценарий падал с первой попытки на «ERR_CONNECTION_
REFUSED» (флак 09.10.2026, трижды за день; на повторе проходил).
"""
import functools
import http.server
import sys


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True


class Quiet(http.server.SimpleHTTPRequestHandler):
    # HTTP/1.1 — соединение держится (keep-alive), и браузер тянет сотни файлов
    # модулей по нескольким соединениям. По HTTP/1.0 на каждый файл
    # открывалось новое: пять сценариев оставляли ~9000 сокетов в TIME_WAIT, и
    # полный прогон выбирал динамические порты Windows (16 384) — браузер
    # падал на «net::ERR_NO_BUFFER_SPACE» (полный прогон 26.10.2026).
    protocol_version = 'HTTP/1.1'

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    port, root = int(sys.argv[1]), sys.argv[2]
    Server(('127.0.0.1', port), functools.partial(Quiet, directory=root)).serve_forever()
