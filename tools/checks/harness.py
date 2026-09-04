# -*- coding: utf-8 -*-
"""Обвязка проверок: сервер, страница, счёт проверок.

Проверки живут рядом, по файлу на область (checks/*.py), и запускаются одной
командой:

    python tools/checks/run.py            — всё
    python tools/checks/run.py archive    — только архив документов

Каждый файл проверки экспортирует NAME и функцию run(t), где t — объект этого
модуля: t.page — страница Playwright, t.ck(условие, сообщение) — проверка,
t.open(маршрут) — переход и ожидание отрисовки, t.wait(мс) — дождаться, пока
страница перестанет меняться.

Почему свой мини-каркас, а не pytest: проверкам нужен один поднятый сервер и
один браузер на весь прогон, а зависимостей у проекта нет ни одной (кроме
playwright, который уже используется в tools/visual-parity). Ставить ради
десятка сценариев целый фреймворк — дороже, чем эти сорок строк.

СКОРОСТЬ. Требование пользователя 04.09.2026: «проверки ускоряй, слишком много
времени едят… И без конских задержек! Логикой, а не временем правь!». Две вещи,
за счёт которых прогон быстрый, и ни одна из них не «подобранная задержка»:

1. Файлы проверок идут ПАРАЛЛЕЛЬНО, по процессу на файл (см. run.py): у каждого
   свой браузер, общий только раздающий файлы http-сервер. Данные макета живут в
   памяти вкладки, поэтому сценарии друг другу не мешают.
2. t.wait НЕ СПИТ. Он ждёт события, а не времени: смотрит на изменения DOM и
   возвращает управление, как только страница затихла (см. SETTLE). Число в
   вызове — не пауза, а верхний предел ожидания: сколько ждать, если страница
   так и не успокоилась. Поэтому в обычном случае ожидание занимает десятки
   миллисекунд вместо сотен, а в редком медленном — столько, сколько нужно.

Так было не всегда: раньше в сценариях стояли фиксированные
`wait_for_timeout(700)`, набранные на глаз с запасом. Запас в сумме давал больше
трёх минут прогона, а надёжности не добавлял — на медленной машине его всё
равно не хватало бы.
"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = int(os.environ.get('INSIDE_CHECKS_PORT') or 8971)

# Сколько миллисекунд без изменений DOM считать «страница затихла». Столько
# занимает обычное ожидание в сценарии. Меньше 40 мс брать нельзя: перерисовка
# карточки идёт в несколько заходов (разметка, затем привязка обработчиков и
# доводка ширин колонок), и между заходами бывает пустой кадр.
SETTLE_MS = int(os.environ.get('INSIDE_CHECKS_SETTLE') or 50)

# Верхний предел ожидания, если страница так и не затихла: множитель к числу,
# указанному в t.wait(...). Единица означает «не дольше, чем ждала прежняя
# фиксированная пауза».
CAP_SCALE = float(os.environ.get('INSIDE_CHECKS_CAP') or 1.0)

# Ждать в любом случае не меньше: страница может ещё не начать меняться в тот
# момент, когда мы спросили (клик обработан, перерисовка на следующем кадре).
MIN_CAP_MS = 150

# Ожидание затишья целиком в браузере: один вызов вместо опроса из Python.
# Наблюдаем всё поддерево документа вместе с атрибутами — перерисовка карточки
# меняет и то, и другое.
SETTLE_JS = """([quiet, cap]) => new Promise((resolve) => {
  let timer = null;
  const started = performance.now();

  const finish = () => {
    obs.disconnect();
    clearTimeout(timer);
    // Ещё один кадр: стили и раскладка применяются после мутаций, а сценарии
    // спрашивают именно про то, что видно на экране.
    requestAnimationFrame(() => requestAnimationFrame(
      () => resolve(Math.round(performance.now() - started))));
  };

  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(finish, quiet);
  };

  const obs = new MutationObserver(arm);
  obs.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, characterData: true,
  });

  arm();
  setTimeout(finish, cap);   // предел: страница может меняться непрерывно
})"""


class Tester:
    def __init__(self, page, base):
        self.page = page
        self.base = base
        self.checks = 0
        self.fails = []
        self.console = []
        self.waited_ms = 0        # сколько всего простояли в ожиданиях

    def ck(self, cond, msg):
        self.checks += 1
        if not cond:
            self.fails.append(msg)
        return bool(cond)

    def wait(self, ms=300):
        """Дождаться, пока страница перестанет меняться.

        ms — не пауза, а предел: столько ждём, если изменения не прекращаются.
        """
        cap = max(MIN_CAP_MS, int(ms * CAP_SCALE))
        try:
            spent = self.page.evaluate(SETTLE_JS, [SETTLE_MS, cap])
            self.waited_ms += int(spent or 0)
        except Exception:
            # Страница перезагружается или закрыта — ожидание тут не нужно.
            pass

    # Дождаться появления элемента. Нужно там, где содержимое приходит ПОСЛЕ
    # затишья DOM: карточки ОИ грузятся лениво (import()), и t.wait возвращает
    # управление раньше, чем модуль карточки доехал. Ждать «подольше» здесь
    # неправильно — ждать надо ровно того, чего ждём.
    def wait_for(self, selector, timeout=9000):
        try:
            self.page.wait_for_selector(selector, timeout=timeout)
            return True
        except Exception:
            return False

    # Дождаться условия в браузере. Нужно там, где ждём не появления узла, а
    # состояния: страниц в предпросмотре стало столько, сколько в файле; список
    # перестроился. Условие — выражение JS, возвращающее истину.
    def wait_until(self, js, timeout=9000):
        try:
            self.page.wait_for_function(js, timeout=timeout)
            return True
        except Exception:
            return False

    def open(self, route='', wait='.card, .arc, .reg-thead', timeout=9000):
        self.page.goto(self.base + route)
        if wait:
            try:
                self.page.wait_for_selector(wait, timeout=timeout)
            except Exception:
                pass
        self.wait(450)
        return self.page

    def text(self):
        return self.page.evaluate('() => document.body.innerText')


def serve():
    """Поднять раздающий сервер и дождаться, пока он ответит."""
    srv = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(PORT), '-d', ROOT],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )

    # Ждём по факту готовности, а не «полторы секунды на всякий случай».
    import urllib.error
    import urllib.request
    for _ in range(100):
        try:
            urllib.request.urlopen('http://127.0.0.1:%d/app.html' % PORT, timeout=0.3)
            break
        except urllib.error.HTTPError:
            break                      # ответил, пусть и ошибкой — значит живой
        except Exception:
            time.sleep(0.05)
    return srv


def run_one(mod, headless=True, browser=None):
    """Прогнать один файл проверок. Возвращает (checks, fails, seconds, waited)."""
    started = time.time()

    def go(br):
        page = br.new_page(viewport={'width': 1600, 'height': 1000})
        t = Tester(page, 'http://127.0.0.1:%d/app.html' % PORT)
        page.on('pageerror', lambda e, t=t: t.console.append('PAGEERROR: ' + str(e)))
        page.on('console', lambda m, t=t: t.console.append('CONSOLE: ' + m.text)
                if m.type == 'error' else None)
        try:
            mod.run(t)
        except Exception as e:
            t.fails.append('сценарий прерван ошибкой: %s' % str(e)[:160])

        # Ошибки консоли — это тоже провал: они означают, что где-то
        # сломалось, даже если проверка этого не заметила.
        for line in dict.fromkeys(t.console):
            t.fails.append('ошибка в консоли: ' + line[:150])
        page.close()
        return t

    if browser is not None:
        t = go(browser)
    else:
        with sync_playwright() as p:
            br = p.chromium.launch(headless=headless)
            t = go(br)
            br.close()

    return t.checks, t.fails, time.time() - started, t.waited_ms


def report(name, checks, fails, seconds, waited=0, retried=False):
    mark = 'ok ' if not fails else 'ПРОВАЛ'
    note = ' (повтор с полным ожиданием)' if retried else ''
    print('%-6s %-26s проверок %3d, провалов %d, %4.1f с (в ожиданиях %4.1f с)%s'
          % (mark, name, checks, len(fails), seconds, waited / 1000.0, note))
    for f in fails:
        print('        · ' + f)


def run_all(modules, headless=True):
    """Последовательный прогон в одном браузере — для --jobs 1 и отладки."""
    srv = serve()
    total_checks = 0
    total_fails = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=headless)
            for mod in modules:
                checks, fails, secs, waited = run_one(mod, browser=browser)
                report(mod.NAME, checks, fails, secs, waited)
                total_checks += checks
                total_fails += ['%s: %s' % (mod.NAME, f) for f in fails]
            browser.close()
    finally:
        srv.terminate()

    print('\nИТОГ: провалено %d из %d проверок' % (len(total_fails), total_checks))
    return 1 if total_fails else 0
