# -*- coding: utf-8 -*-
"""Матрица путей макета: путь × ширина окна × роль — что осталось после действия.

Практика APCS (запись графа matrica-putey-chto-ostalos-posle-deystviya),
задача matricy-vzaimodeystviy-putey-i-scenarii-po-rolyam. Путь — шаги
человека из сценария роли; после шагов сверяется видимое состояние (адрес,
раздел, подраздел, поиск, строки, выбранное, прокрутка, введённое). Отчёт —
таблица путь × сочетание (✓ / ✗ / пусто — путь в сочетании не идёт) и
разбор провалов «было / ждали»; код выхода 1, если путь не прошёл.

Ширины — те же, что в правиле замера интерфейса (claude-feedback-ui-polish-
before-report): 1920, 1600, 1280, 1100, 900, 760. Прогон — на стенде
проверок без __persist (правки в data/local не пишутся).

    python tools/matrix/paths.py                    # все пути раздела «Осмотры»
    python tools/matrix/paths.py --path jump        # пути с этим словом в id
    python tools/matrix/paths.py --changed          # затронутые правкой
      [--widths 1920,1280,760] [--jobs 4]

Отчёт — tools/matrix/out/paths.json и .md.
"""
import json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'checks'))
os.environ.setdefault('INSIDE_CHECKS_PORT', '8976')
import harness  # noqa: E402
from paths_osmotry import PATHS, STATE_JS  # noqa: E402

OUT = os.path.join(HERE, 'out')
WIDTHS = [1920, 1600, 1280, 1100, 900, 760]


class Stop(Exception):
    pass


class P:
    """Шаги пути и проверки; провал жёсткой проверки останавливает путь."""

    def __init__(self, page, t):
        self.page, self.t = page, t
        self.steps = []
        self.ok = True

    # проверки
    def ck(self, what, cond, got, want, soft=False):
        self.steps.append({'что': what, 'ок': bool(cond), 'было': got, 'ждали': want, 'мягко': soft})
        if not cond and not soft:
            self.ok = False

    def eq(self, what, got, want):
        self.ck(what, json.dumps(got, ensure_ascii=False) == json.dumps(want, ensure_ascii=False), got, want)

    # действия
    def wait(self, ms=400):
        self.t.wait(ms)

    def wait_for(self, sel, timeout=9000):
        self.page.wait_for_selector(sel, timeout=timeout)
        self.wait(200)

    def wait_until(self, js, timeout=9000):
        self.page.wait_for_function(js, timeout=timeout)
        self.wait(200)

    def open(self, route, wait):
        self.page.evaluate('(h) => { location.hash = h; }', route)
        self.wait_for(wait)

    def state(self):
        return self.page.evaluate(STATE_JS)

    def click(self, sel):
        self.page.locator(sel).first.click(timeout=4000)
        self.wait()

    def click_text(self, sel, text):
        self.page.locator(sel).filter(has_text=text).first.click(timeout=4000)
        self.wait()

    def fill(self, sel, text):
        loc = self.page.locator(sel).first
        loc.click(timeout=4000)
        loc.fill('')
        self.page.keyboard.type(text)
        self.wait()

    def type(self, text):
        self.page.keyboard.type(text)
        self.wait(300)

    def key(self, k):
        self.page.keyboard.press(k)
        self.wait()

    def back(self):
        self.page.go_back()
        self.wait(500)

    def open_filters(self):
        """Узкая раскладка (до 1100 px): отборы свёрнуты в «Отборы · N» — раскрыть, как человек."""
        t = self.page.locator('[data-ip-ftoggle]')
        if t.count() and t.is_visible() and not self.page.locator('.ip-facets.open').count():
            t.click()
            self.wait(300)

    def scroll(self, sel, px):
        return self.page.evaluate("([s, px]) => { const e = document.querySelector(s); if (!e) return 0; e.scrollTop = px; return Math.round(e.scrollTop); }", [sel, px])

    def value(self, sel):
        return self.page.locator(sel).first.input_value()

    def text(self, sel):
        loc = self.page.locator(sel).first
        return loc.inner_text().strip() if loc.count() else ''

    def first_text_input(self, sel):
        return self.page.evaluate("(s) => { const e = [...document.querySelectorAll(s)].find((x) => x.tagName === 'INPUT' && /^(text|tel|email|)$/.test(x.type) && x.offsetParent); return e ? `[data-ip-c=\"${e.getAttribute('data-ip-c')}\"]` : ''; }", sel)


def worker(pid, width, role, out):
    from playwright.sync_api import sync_playwright
    path_ = next(x for x in PATHS if x['id'] == pid)
    base = 'http://127.0.0.1:%d' % harness.PORT
    res = {'id': pid, 'width': width, 'role': role, 'ok': False, 'steps': [], 'error': '', 'console': []}
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        ctx = br.new_context(viewport={'width': width, 'height': 900})
        ctx.route('**/*', lambda r: r.continue_() if r.request.url.startswith(base) else r.fulfill(status=204, body=''))
        page = ctx.new_page()
        page.set_default_timeout(9000)
        page.on('console', lambda m: res['console'].append(m.text[:200]) if m.type == 'error' else None)
        page.on('pageerror', lambda e: res['console'].append(('PAGEERROR ' + str(e))[:200]))
        page.on('dialog', lambda d: (res['console'].append('МОДАЛКА ' + d.message[:80]), d.dismiss()))
        t = harness.Tester(page, base + '/app.html')
        p = P(page, t)
        started = time.time()
        try:
            page.goto(base + '/data/local/manifest.json')
            page.evaluate('try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}')
            t.open('', wait='.reg-thead, .card, main')
            if role != 'any':
                t.set_role(role)
            path_['run'](p)
        except Exception as e:
            p.ok = False
            res['error'] = str(e).split('\n')[0][:300]
        if res['console']:
            p.ok = False
        res.update(ok=p.ok, steps=p.steps, secs=round(time.time() - started, 1))
        br.close()
    json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, default=str)


def to_md(res, combos):
    out = ['# Матрица путей', '',
           '✓ — путь прошёл, ✗ — нет (разбор ниже), пусто — путь в этом сочетании не идёт. Ширина × роль.', '']
    head = ['%s · %s' % (w, r) for w, r in combos]
    out.append('| путь | сценарий | ' + ' | '.join(head) + ' |')
    out.append('|---|---|' + '---|' * len(head))
    by = {(x['id'], x['width'], x['role']): x for x in res}
    for pth in PATHS:
        cells = []
        for w, r in combos:
            x = by.get((pth['id'], w, r))
            cells.append('' if not x else ('✓' if x['ok'] else '✗'))
        if any(cells):
            out.append('| %s | %s | %s |' % (pth['title'], pth['scenario'], ' | '.join(cells)))
    bad = [x for x in res if not x['ok']]
    out += ['', '## Провалы — %d' % len(bad), '']
    for x in bad:
        title = next(p['title'] for p in PATHS if p['id'] == x['id'])
        out.append('### %s · %s · %s' % (title, x['width'], x['role']))
        if x['error']:
            out.append('- остановился: %s' % x['error'])
        for s in x['steps']:
            if not s['ок']:
                out.append('- %s%s: было `%s`, ждали `%s`' % (s['что'], ' (мягко)' if s.get('мягко') else '',
                                                             json.dumps(s['было'], ensure_ascii=False)[:300],
                                                             json.dumps(s['ждали'], ensure_ascii=False)[:300]))
        for c in x['console'][:3]:
            out.append('- консоль: %s' % c)
        out.append('')
    return '\n'.join(out)


def main():
    args = sys.argv[1:]
    if args[:1] == ['--worker']:
        return worker(args[1], int(args[2]), args[3], args[4])
    opt = lambda k, d: args[args.index(k) + 1] if k in args else d
    widths = [int(x) for x in opt('--widths', ','.join(map(str, WIDTHS))).split(',')]
    jobs = int(opt('--jobs', 4))
    sel = PATHS
    if '--path' in args:
        sel = [x for x in PATHS if opt('--path', '') in x['id']]
    elif '--changed' in args:
        r = subprocess.run(['git', 'status', '--porcelain'], cwd=harness.ROOT, capture_output=True, text=True, encoding='utf-8')
        files = [line[3:].strip().strip('"') for line in r.stdout.splitlines()]
        sel = [x for x in PATHS if any(f.startswith(t) for f in files for t in x['touches'])]
    roles = []
    for x in sel:
        roles += [r for r in x['roles'] if r not in roles]
    combos = [(w, r) for r in roles for w in widths]
    units = [(x['id'], w, r) for x in sel for w, r in combos if r in x['roles']]
    if not units:
        print('путей не выбрано')
        return 0
    os.makedirs(OUT, exist_ok=True)
    srv = harness.serve()
    started = time.time()
    res = []
    try:
        queue, live = list(units), []
        while queue or live:
            while queue and len(live) < jobs:
                u = queue.pop(0)
                part = os.path.join(OUT, 'path-%s-%d-%s.json' % u)
                live.append((u, subprocess.Popen([sys.executable, __file__, '--worker', u[0], str(u[1]), u[2], part]), part))
            for item in list(live):
                if item[1].poll() is None:
                    continue
                live.remove(item)
                if os.path.exists(item[2]):
                    x = json.load(open(item[2], encoding='utf-8'))
                    os.remove(item[2])
                else:
                    x = {'id': item[0][0], 'width': item[0][1], 'role': item[0][2], 'ok': False, 'steps': [], 'error': 'работник упал', 'console': []}
                res.append(x)
                print('  %s %-28s %5s %-4s' % ('✓' if x['ok'] else '✗', x['id'], x['width'], x['role']), flush=True)
            time.sleep(0.2)
    finally:
        srv.terminate()
    json.dump(res, open(os.path.join(OUT, 'paths.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
    open(os.path.join(OUT, 'paths.md'), 'w', encoding='utf-8').write(to_md(res, combos))
    bad = sum(1 for x in res if not x['ok'])
    print('путей %d, прогонов %d, провалов %d, %.0f с · отчёт tools/matrix/out/paths.md' % (len(sel), len(res), bad, time.time() - started))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
