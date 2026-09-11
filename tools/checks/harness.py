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

Тяжёлый сценарий может объявить PARTS — названия частей, на которые его можно
разложить (обычно по типу ОЦ), и принимать их вторым доводом: run(t, part).
Тогда каждая часть считается отдельной единицей прогона и раскладывается по
потокам независимо (см. run.py). Это не про изоляцию, а про время: файл,
который обходит пять модулей подряд, целиком занимает минуту и один держит
весь прогон.

Почему свой мини-каркас, а не pytest: проверкам нужен один поднятый сервер и
один браузер на весь прогон, а зависимостей у проекта нет ни одной (кроме
playwright, который уже используется в tools/visual-parity). Ставить ради
десятка сценариев целый фреймворк — дороже, чем эти сорок строк.

СКОРОСТЬ. Требование пользователя 04.09.2026: «проверки ускоряй, слишком много
времени едят… И без конских задержек! Логикой, а не временем правь!». Три вещи,
за счёт которых прогон быстрый, и ни одна из них не «подобранная задержка»:

1. Единицы прогона идут ПАРАЛЛЕЛЬНО (см. run.py): они делятся на столько
   частей, сколько потоков, и внутри части браузер поднимается один раз.
   Страница у каждой единицы своя: данные макета живут в памяти вкладки, и
   сценарии не должны видеть чужие правки.
2. t.wait НЕ СПИТ. Он ждёт события, а не времени: смотрит на изменения DOM и
   возвращает управление, как только страница затихла (см. SETTLE). Число в
   вызове — не пауза, а верхний предел ожидания: сколько ждать, если страница
   так и не успокоилась. Поэтому в обычном случае ожидание занимает десятки
   миллисекунд вместо сотен, а в редком медленном — столько, сколько нужно.
3. Прогоняется не всё подряд, а то, чего касается правка (`run.py --changed`):
   каждый сценарий объявляет TOUCHES — файлы, от которых зависит.

Так было не всегда: раньше в сценариях стояли фиксированные
`wait_for_timeout(700)`, набранные на глаз с запасом. Запас в сумме давал больше
трёх минут прогона, а надёжности не добавлял — на медленной машине его всё
равно не хватало бы.
"""
import contextlib
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
        self.waits = 0            # сколько раз ждали затишья
        self.opens = 0            # сколько раз переходили по маршруту
        self.open_ms = 0          # и сколько это заняло

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
        self.waits += 1
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

    # Завести объект имущества и открыть его карточку.
    #
    # С 11.09.2026 создание НЕ переходит в карточку (решение пользователя:
    # объекты заводят пачкой, и переход после каждого заставлял возвращаться).
    # Сценариям карточка нужна, поэтому строку открываем здесь — по
    # идентификатору, а не «последнюю»: строки группируются по участкам, и новая
    # встаёт не обязательно в конец.
    def add_oi(self, kind, wait=None):
        pg = self.page
        toggle = pg.locator('[data-dd-toggle]')
        if not toggle.count():
            return False
        toggle.first.click()
        if not self.wait_for('[data-add-oi]'):
            return False

        item = pg.locator('[data-add-oi="%s"]' % kind)
        if not item.count():
            return False

        # Селектор без «tr»: участок открывается кнопкой «Карточка участка →»,
        # а не строкой таблицы, и по «tr[data-open-oi]» его не видно.
        ids = 'els => els.map((e) => e.dataset.openOi)'
        before = set(pg.eval_on_selector_all('[data-open-oi]', ids))
        item.first.click()
        self.wait(400)

        new = [x for x in pg.eval_on_selector_all('[data-open-oi]', ids) if x not in before]
        if not new:
            return False
        pg.locator('[data-open-oi="%s"]' % new[0]).first.click()

        # Карточку ОИ ждём всегда: «.card-idx» и прочие признаки есть и у
        # карточки объекта оценки, и ожидание по ним проходит, не дождавшись
        # перехода. `wait` — дополнительное условие поверх этого.
        if not self.wait_for('.oi-stack'):
            return False
        return self.wait_for(wait) if wait else True

    def open(self, route='', wait='.card, .arc, .reg-thead', timeout=9000):
        started = time.time()
        self.opens += 1
        self.page.goto(self.base + route)
        if wait:
            try:
                self.page.wait_for_selector(wait, timeout=timeout)
            except Exception:
                pass
        self.wait(450)
        self.open_ms += int((time.time() - started) * 1000)
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


@contextlib.contextmanager
def browser(headless=True):
    """Один Playwright и один браузер на несколько единиц прогона.

    Подъём драйвера с Chromium стоит около 1,4 с. Раньше он повторялся на каждый
    файл проверок — на 25 файлах это четверть всего времени прогона, потраченная
    на старты. Страницы внутри остаются раздельными: изоляция сценариев держится
    на своей вкладке, а не на своём браузере.
    """
    with sync_playwright() as p:
        br = p.chromium.launch(headless=headless)
        try:
            yield br
        finally:
            br.close()


def run_one(mod, part=None, headless=True, browser_=None):
    """Прогнать файл проверок (или одну его часть). Возвращает отчёт словарём."""
    started = time.time()

    def go(br):
        page = br.new_page(viewport={'width': 1600, 'height': 1000})
        # Данные переживают перезагрузку через localStorage (kernel/persist.js,
        # 09.09.2026). Для сценария это чужое состояние: правки предыдущего
        # прогона доставались бы следующему, и порядок запуска начал бы влиять
        # на результат.
        #
        # Чистим ОДИН раз перед сценарием, а не на каждой навигации: сценарий
        # сохранения сам перезагружает страницу и обязан увидеть свои данные.
        page.goto('http://127.0.0.1:%d/app.html' % PORT)
        page.evaluate('try { localStorage.clear(); } catch (e) {}')
        # Предел для действий Playwright — клика, ввода, ожидания локатора.
        # Свои ожидания каркаса ограничены девятью секундами, а у locator.click
        # предел по умолчанию 30 с: один клик по элементу, которого на экране
        # нет, стоил дороже целого сценария (07.09.2026 такой клик съел 40 с
        # прогона). Десяти секунд хватает с запасом, а на повторе упавшего
        # предел растёт вместе с остальными — cap×3.
        page.set_default_timeout(min(30000, int(10000 * CAP_SCALE)))
        t = Tester(page, 'http://127.0.0.1:%d/app.html' % PORT)
        page.on('pageerror', lambda e, t=t: t.console.append('PAGEERROR: ' + str(e)))
        page.on('console', lambda m, t=t: t.console.append('CONSOLE: ' + m.text)
                if m.type == 'error' else None)
        try:
            mod.run(t, part) if part else mod.run(t)
        except Exception as e:
            t.fails.append('сценарий прерван ошибкой: %s' % str(e)[:160])

        # Ошибки консоли — это тоже провал: они означают, что где-то
        # сломалось, даже если проверка этого не заметила.
        for line in dict.fromkeys(t.console):
            t.fails.append('ошибка в консоли: ' + line[:150])
        page.close()
        return t

    if browser_ is not None:
        t = go(browser_)
    else:
        with browser(headless=headless) as br:
            t = go(br)

    return {
        'name': mod.NAME + (' · %s' % part if part else ''),
        'checks': t.checks, 'fails': t.fails,
        'secs': time.time() - started, 'waited': t.waited_ms,
        'waits': t.waits, 'opens': t.opens, 'open_ms': t.open_ms,
    }


def report(res, profile=False, name=None):
    fails = res.get('fails') or []
    mark = 'ok ' if not fails else 'ПРОВАЛ'
    note = ' (повтор с полным ожиданием)' if res.get('retried') else ''
    line = ('%-6s %-30s проверок %3d, провалов %d, %4.1f с (в ожиданиях %4.1f с)%s'
            % (mark, name or res.get('name') or '?', res.get('checks', 0), len(fails),
               res.get('secs', 0.0), res.get('waited', 0) / 1000.0, note))
    if profile:
        line += ('\n       переходов %d (%0.1f с), ожиданий %d'
                 % (res.get('opens', 0), res.get('open_ms', 0) / 1000.0,
                    res.get('waits', 0)))
    print(line, flush=True)
    for f in fails:
        print('        · ' + f, flush=True)


def run_all(units, headless=True, profile=False):
    """Последовательный прогон в одном браузере — для --jobs 1 и отладки."""
    srv = serve()
    total_checks = 0
    total_fails = []

    try:
        with browser(headless=headless) as br:
            for u in units:
                res = run_one(u.mod, part=u.part, browser_=br)
                report(res, profile=profile, name=u.name)
                total_checks += res['checks']
                total_fails += ['%s: %s' % (u.name, f) for f in res['fails']]
    finally:
        srv.terminate()

    print('\nИТОГ: провалено %d из %d проверок' % (len(total_fails), total_checks))
    return 1 if total_fails else 0
