# -*- coding: utf-8 -*-
"""Обвязка проверок: сервер, страница, счёт проверок.

Проверки живут рядом, по файлу на область (checks/*.py), и запускаются одной
командой:

    python tools/checks/run.py            — всё
    python tools/checks/run.py archive    — только архив документов

Каждый файл проверки экспортирует NAME и функцию run(t), где t — объект этого
модуля: t.page — страница Playwright, t.ck(условие, сообщение) — проверка,
t.open(маршрут) — переход и ожидание отрисовки.

Почему свой мини-каркас, а не pytest: проверкам нужен один поднятый сервер и
один браузер на весь прогон, а зависимостей у проекта нет ни одной (кроме
playwright, который уже используется в tools/visual-parity). Ставить ради
десятка сценариев целый фреймворк — дороже, чем эти сорок строк.
"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 8971


class Tester:
    def __init__(self, page, base):
        self.page = page
        self.base = base
        self.checks = 0
        self.fails = []
        self.console = []

    def ck(self, cond, msg):
        self.checks += 1
        if not cond:
            self.fails.append(msg)
        return bool(cond)

    def open(self, route='', wait='.card, .arc, .reg-thead', timeout=9000):
        self.page.goto(self.base + route)
        if wait:
            try:
                self.page.wait_for_selector(wait, timeout=timeout)
            except Exception:
                pass
        self.page.wait_for_timeout(450)
        return self.page

    def text(self):
        return self.page.evaluate('() => document.body.innerText')


def run_all(modules, headless=True):
    srv = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(PORT), '-d', ROOT],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1.4)

    total_checks = 0
    total_fails = []
    console_errors = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=headless)
            for mod in modules:
                page = browser.new_page(viewport={'width': 1600, 'height': 1000})
                t = Tester(page, 'http://127.0.0.1:%d/app.html' % PORT)
                page.on('pageerror', lambda e, t=t: t.console.append('PAGEERROR: ' + str(e)))
                page.on('console', lambda m, t=t: t.console.append('CONSOLE: ' + m.text)
                        if m.type == 'error' else None)

                started = time.time()
                try:
                    mod.run(t)
                except Exception as e:
                    t.fails.append('сценарий прерван ошибкой: %s' % str(e)[:160])

                # Ошибки консоли — это тоже провал: они означают, что где-то
                # сломалось, даже если проверка этого не заметила.
                for line in dict.fromkeys(t.console):
                    t.fails.append('ошибка в консоли: ' + line[:150])
                    console_errors.append(line)

                mark = 'ok ' if not t.fails else 'ПРОВАЛ'
                print('%-6s %-26s проверок %3d, провалов %d, %4.1f с'
                      % (mark, mod.NAME, t.checks, len(t.fails), time.time() - started))
                for f in t.fails:
                    print('        · ' + f)

                total_checks += t.checks
                total_fails += ['%s: %s' % (mod.NAME, f) for f in t.fails]
                page.close()
            browser.close()
    finally:
        srv.terminate()

    print('\nИТОГ: провалено %d из %d проверок' % (len(total_fails), total_checks))
    return 1 if total_fails else 0
