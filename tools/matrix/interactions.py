# -*- coding: utf-8 -*-
"""Матрица взаимодействий макета: действие × экран × блок × повтор.

Практика APCS (запись графа matrica-vzaimodeystviy-kto-na-kogo-deystvuet),
задача matricy-vzaimodeystviy-putey-i-scenarii-po-rolyam. На каждом экране
находятся все действия (что нажимается, выбирается, вводится) и все блоки;
каждое действие — 3 повтора на свежей странице, каждый блок — каждый кадр.

Флаги (приспособлены к макету: анимаций почти нет, ловим случавшееся):
  ПЕРЕКРЫТ      появившийся слой закрыт другим (шапка таблицы поверх списка
                «Перейти», 12.10.2026)
  ЗА КРАЕМ      появившийся всплывающий слой обрезан окном или предком
  СДВИГ         блок выше точки действия сдвинулся или сменил высоту —
                то, на что человек смотрел, уехало
  ПРЫГАЛ        блок сдвигался несколько раз — содержимое доезжает
  МЕЛЬКНУЛ      появился и исчез за время замера
  СБРОС         блок пересоздан и потерял прокрутку
  МЁРТВОЕ       нажатие ничего не изменило
  НЕ НАЖИМАЕТСЯ элемент виден, но нажать его нельзя (закрыт, вне окна)
  МОДАЛКА       окно браузера (alert, confirm) — правило «без модальных окон»
  НЕМАЯ         недоступная кнопка не говорит, чего не хватает
  ВБОК          страница стала шире окна
  КОНСОЛЬ       ошибка в консоли
  РАЗНОБОЙ      повторы дали разный итог
Сведения без флага: ⟳ — блок пересоздан на месте (перерисовка макета —
обычное дело), ↑ появился, ↓ исчез, → изменился.

Прогон — на стенде проверок (tools/checks/serve.py): у него нет __persist,
правки остаются в браузере и в data/local не пишутся. Ссылки наружу не
открываются, запросы не к стенду отклоняются.

    python tools/matrix/interactions.py                  # раздел «Осмотры»
    python tools/matrix/interactions.py --screen Кадастр # экраны с этим словом
    python tools/matrix/interactions.py --changed        # затронутые правкой
    python tools/matrix/interactions.py --all            # всё — по просьбе пользователя
      [--repeats 3] [--width 1600] [--jobs 2]

Отчёт — tools/matrix/out/interactions.json и .md; таблицу для человека
собирает tools/docs/build_matrix_report.py.
"""
import json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'checks'))
os.environ.setdefault('INSIDE_CHECKS_PORT', '8975')
import harness  # noqa: E402
from screens import EXPECTED, SCREENS, SHELL_BLOCKS  # noqa: E402

OUT = os.path.join(HERE, 'out')
RECORD_MS = 1200
SKIP_KINDS = ('наружу', 'файл')


# --- работник: один экран ---------------------------------------------------

def worker(idx, repeats, width, path):
    from playwright.sync_api import sync_playwright
    sc = SCREENS[idx]
    base = 'http://127.0.0.1:%d' % harness.PORT
    rec_js = open(os.path.join(HERE, 'recorder.js'), encoding='utf-8').read()
    result = {'screen': sc['name'], 'route': sc['route'], 'role': sc['role'], 'width': width, 'actions': [], 'error': ''}
    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx = br.new_context(viewport={'width': width, 'height': 1000}, accept_downloads=True)
        ctx.add_init_script(rec_js)
        # Внешнее (подложка карты OSM) — пустым ответом, а не отказом: отказ
        # браузер пишет ошибкой консоли, и вид «Маршрут» сыпал ложными КОНСОЛЬ.
        ctx.route('**/*', lambda r: r.continue_() if r.request.url.startswith(base) else r.fulfill(status=204, body=''))
        ctx.on('page', lambda pg: pg.close() if len(ctx.pages) > 1 else None)
        page = ctx.new_page()
        page.set_default_timeout(8000)
        page.set_default_navigation_timeout(30000)   # холодная загрузка в параллельном прогоне — см. tools/checks/harness.py
        t = harness.Tester(page, base + '/app.html')
        events = {'console': [], 'dialog': []}
        page.on('console', lambda m: events['console'].append(m.text[:200]) if m.type == 'error' else None)
        page.on('pageerror', lambda e: events['console'].append(('PAGEERROR ' + str(e))[:200]))

        def on_dialog(d):
            events['dialog'].append(d.type + ': ' + d.message[:80])
            d.dismiss()
        page.on('dialog', on_dialog)

        def fresh():
            page.goto(base + '/data/local/manifest.json')
            page.evaluate('try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}')
            t.open('', wait='.reg-thead, .card, main')
            if sc['role'] != 'any':
                t.set_role(sc['role'])
            page.evaluate('(h) => { location.hash = h; }', sc['route'])
            page.wait_for_selector(sc['wait'], timeout=9000)
            t.wait(400)
            for sel in sc['prep']:
                page.locator(sel).first.click()
                t.wait(400)

        try:
            fresh()
            acts = page.evaluate('__mx.actions()')
        except Exception as e:
            result['error'] = 'экран не открылся: %s' % str(e)[:300]
            acts = []
        started = time.time()
        for a in acts:
            if a['block'] in SHELL_BLOCKS and not sc['shell']:
                continue
            item = dict(a, runs=[])
            result['actions'].append(item)
            if a['kind'] in SKIP_KINDS:
                continue
            if a['off']:
                continue
            for _ in range(repeats):
                run = {'flags': [], 'err': ''}
                try:
                    fresh()
                    i = page.evaluate('(a) => __mx.mark(a)', a)
                    if not i:
                        run['err'] = 'на свежей странице не нашлось'
                        item['runs'].append(run)
                        continue
                    sel = '[data-mx-a="%d"]' % i
                    events['console'].clear()
                    events['dialog'].clear()
                    run['target'] = page.evaluate("(s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }", sel)
                    page.evaluate('(ms) => __mx.record(ms)', RECORD_MS)
                    try:
                        act(page, sel, a['kind'])
                    except Exception as e:
                        run['flags'].append('НЕ НАЖИМАЕТСЯ')
                        run['err'] = str(e).split('\n')[0][:200]
                    run.update(page.evaluate('__mx.done'))
                    t.wait(300)
                    run['console'] = list(events['console'])
                    run['dialog'] = list(events['dialog'])
                except Exception as e:
                    run['err'] = (run['err'] + ' · ' if run['err'] else '') + str(e).split('\n')[0][:200]
                item['runs'].append(run)
        result['secs'] = round(time.time() - started)
        br.close()
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)


def act(page, sel, kind):
    loc = page.locator(sel)
    if kind == 'выбрать':
        n = page.evaluate("(s) => { const e = document.querySelector(s); const o = [...e.options].findIndex((x, i) => i !== e.selectedIndex && !x.disabled); return o; }", sel)
        if n >= 0:
            loc.select_option(index=n, timeout=2500)
        return
    if kind == 'дата':
        loc.fill('2026-10-20', timeout=2500)
        return
    loc.click(timeout=2500)
    if kind == 'ввести':
        page.keyboard.type('аб12')
    elif kind == 'число':
        page.keyboard.type('5')


# --- разбор -------------------------------------------------------------------

def episodes(series):
    """Сколько раз блок менял место или размер (подряд идущие кадры — один раз)."""
    n, moving = 0, False
    for a, b in zip(series, series[1:]):
        d = any(abs(a[i] - b[i]) > 1 for i in range(4))
        if d and not moving:
            n += 1
        moving = d
    return n


def analyse(run, kind):
    if 'frames' not in run:
        return run
    frames = run.pop('frames')
    f0, fl = frames[0][1], frames[-1][1]
    end = run.pop('end', {})
    vis = lambda f, k: k in f and f[k][4] > 0
    appeared = [k for k in fl if vis(fl, k) and not vis(f0, k)]
    gone = [k for k in f0 if vis(f0, k) and not vis(fl, k)]
    changed, replaced, jumpy, reset, shift = [], [], [], [], []
    tx, ty, tw, th = run.get('target') or [0, 0, 0, 0]
    for k in fl:
        if k not in f0 or not vis(fl, k):
            continue
        a, b = f0[k], fl[k]
        if any(abs(a[i] - b[i]) > 1 for i in range(4)) or abs(a[4] - b[4]) > 0.05:
            changed.append(k)
        if a[5] != b[5]:
            replaced.append(k)
            if a[6] > 0 and b[6] == 0:
                reset.append(k)
        series = [f[k] for _, f in frames if k in f]
        if episodes(series) >= 2:
            jumpy.append(k)
        # Блок целиком выше точки действия в той же колонке (перекрывает её по
        # горизонтали), не содержит её — и уехал: то, на что человек смотрел
        # над местом нажатия, сдвинулось. Панель в соседней колонке, которая
        # показывает выбранное, — не сдвиг, а ответ.
        same_col = a[0] < tx + tw and a[0] + a[2] > tx
        same_screen = run.get('hash0') == run.get('hash1')
        if same_screen and same_col and a[1] + a[3] <= ty + 1 and not (a[0] <= tx and a[1] <= ty and a[0] + a[2] >= tx + tw) \
                and (abs(a[1] - b[1]) >= 4 or abs(a[3] - b[3]) >= 4):
            shift.append(k)
    flash = [k for k in {k for _, f in frames for k in f}
             if not vis(f0, k) and not vis(fl, k) and any(vis(f, k) for _, f in frames)]
    flags = list(run.get('flags', []))
    cover = [k for k in appeared if end.get(k, {}).get('fl') and end[k]['cov'] >= 0.34]
    edge = [k for k in appeared if end.get(k, {}).get('fl') and end[k].get('cut', fl[k][4]) < 0.97]
    if cover: flags.append('ПЕРЕКРЫТ')
    if edge: flags.append('ЗА КРАЕМ')
    if shift: flags.append('СДВИГ')
    if jumpy: flags.append('ПРЫГАЛ')
    if flash: flags.append('МЕЛЬКНУЛ')
    if reset: flags.append('СБРОС')
    if run.get('wide1') and not run.get('wide0'): flags.append('ВБОК')
    if run.get('console'): flags.append('КОНСОЛЬ')
    if run.get('dialog'): flags.append('МОДАЛКА')
    if not run.get('muts') and run.get('hash0') == run.get('hash1') and not (appeared or gone or changed) \
            and kind not in ('ввести', 'число', 'дата') and 'НЕ НАЖИМАЕТСЯ' not in flags:
        flags.append('МЁРТВОЕ')
    run.update(appeared=appeared, gone=gone, changed=changed, replaced=replaced, jumpy=jumpy, shift=shift,
               flash=flash, reset=reset, cover=cover, edge=edge, flags=flags)
    return run


def outcome(run):
    return (run.get('hash1'), tuple(sorted(run.get('appeared', []))), tuple(sorted(run.get('gone', []))),
            tuple(sorted(f for f in run.get('flags', []) if f != 'РАЗНОБОЙ')))


def summarise(res):
    for sc in res:
        for a in sc['actions']:
            runs = [analyse(r, a['kind']) for r in a['runs']]
            a['runs'] = runs
            ok = [r for r in runs if 'hash1' in r]
            flags = []
            for r in ok:
                flags += [f for f in r['flags'] if f not in flags]
            if len({outcome(r) for r in ok}) > 1:
                flags.append('РАЗНОБОЙ')
            if a['off'] and not a['why']:
                flags.append('НЕМАЯ')
            appeared = {k for r in ok for k in r.get('appeared', [])}
            exp = next((e for e in EXPECTED if ('label' in e and (a['label'] or '').startswith(e['label']))
                        or ('appeared' in e and any(e['appeared'] in k for k in appeared))), None)
            a['expected'] = [f for f in flags if exp and f in exp['flags']]
            a['why_expected'] = exp['why'] if exp and a['expected'] else ''
            a['flags'] = [f for f in flags if f not in a['expected']]
    return res


def to_md(res):
    out = ['# Матрица взаимодействий', '',
           'Флаги — жирным. ↑ появился, ↓ исчез, → изменился, ⟳ пересоздан на месте (обычная перерисовка, без флага).', '']
    found = [(sc['screen'], a) for sc in res for a in sc['actions'] if a.get('flags')]
    out += ['## Находки — %d' % len(found), '']
    for scr, a in found:
        r = next((x for x in a['runs'] if 'hash1' in x), a['runs'][0] if a['runs'] else {})
        det = []
        for f, key in (('ПЕРЕКРЫТ', 'cover'), ('ЗА КРАЕМ', 'edge'), ('СДВИГ', 'shift'), ('ПРЫГАЛ', 'jumpy'),
                       ('МЕЛЬКНУЛ', 'flash'), ('СБРОС', 'reset')):
            if f in a['flags'] and r.get(key):
                det.append('%s: %s' % (f.lower(), ', '.join(r[key][:4])))
        for f, key in (('КОНСОЛЬ', 'console'), ('МОДАЛКА', 'dialog')):
            if f in a['flags'] and r.get(key):
                det.append('%s: %s' % (f.lower(), r[key][0]))
        if r.get('err'):
            det.append(r['err'])
        out.append('- **%s** · %s «%s» (%s): %s%s' % (scr, a['kind'], a['label'] or a['sig'].split('|')[0], a['block'] or '—',
                                                     ' '.join('**%s**' % f for f in a['flags']),
                                                     (' — ' + '; '.join(det)) if det else ''))
    out.append('')
    for sc in res:
        out += ['## %s' % sc['screen'], '', '`%s`, роль %s, ширина %d%s' % (sc['route'], sc['role'], sc['width'],
                                                                         (' — ' + sc['error']) if sc['error'] else ''), '',
                '| действие | блок | ответили | флаги |', '|---|---|---|---|']
        for a in sc['actions']:
            r = next((x for x in a['runs'] if 'hash1' in x), None)
            if a['kind'] in SKIP_KINDS:
                resp = 'не нажимается в матрице (%s)' % a['kind']
            elif a['off']:
                resp = 'недоступно' + (' — ' + a['why'] if a['why'] else '')
            elif not r:
                resp = (a['runs'][0].get('err') if a['runs'] else '') or '—'
            else:
                bits = (['↑ ' + k for k in r['appeared'][:4]] + ['↓ ' + k for k in r['gone'][:4]]
                        + ['→ ' + k for k in r['changed'][:5] if k not in r['replaced']]
                        + (['⟳ %d' % len(r['replaced'])] if r['replaced'] else []))
                if r['hash1'] != r['hash0']:
                    bits.insert(0, 'адрес → ' + r['hash1'][:60])
                resp = ', '.join(bits) or '—'
            marks = ' '.join('**%s**' % f for f in a.get('flags', []))
            if a.get('expected'):
                marks += ' (%s — %s)' % (', '.join(f.lower() for f in a['expected']), a['why_expected'])
            out.append('| %s «%s» | %s | %s | %s |' % (a['kind'], (a['label'] or '').replace('|', '/'), a['block'] or '—',
                                                    resp.replace('|', '/'), marks))
        out.append('')
    return '\n'.join(out)


# --- оркестр -----------------------------------------------------------------

def changed_files():
    r = subprocess.run(['git', 'status', '--porcelain'], cwd=harness.ROOT, capture_output=True, text=True, encoding='utf-8')
    return [line[3:].strip().strip('"') for line in r.stdout.splitlines()]


def main():
    args = sys.argv[1:]
    if args[:1] == ['--worker']:
        return worker(int(args[1]), int(args[2]), int(args[3]), args[4])
    opt = lambda k, d: args[args.index(k) + 1] if k in args else d
    repeats, width, jobs = int(opt('--repeats', 3)), int(opt('--width', 1600)), int(opt('--jobs', 2))
    if '--all' in args:
        idx = list(range(len(SCREENS)))
    elif '--changed' in args:
        files = changed_files()
        idx = [i for i, s in enumerate(SCREENS) if any(f.startswith(p) for f in files for p in s['touches'])]
    elif '--screen' in args:
        word = opt('--screen', '').lower()
        idx = [i for i, s in enumerate(SCREENS) if word in s['name'].lower()]
    else:
        idx = [i for i, s in enumerate(SCREENS) if s['section'] == opt('--section', 'osmotry')]
    if not idx:
        print('экранов не выбрано')
        return 0
    os.makedirs(OUT, exist_ok=True)
    srv = harness.serve()
    started = time.time()
    try:
        queue, live, parts = list(idx), [], []
        while queue or live:
            while queue and len(live) < jobs:
                i = queue.pop(0)
                part = os.path.join(OUT, 'part-%d.json' % i)
                live.append((i, subprocess.Popen([sys.executable, __file__, '--worker', str(i), str(repeats), str(width), part]), part))
            for item in list(live):
                if item[1].poll() is not None:
                    live.remove(item)
                    parts.append(item)
                    print('  %-48s %s' % (SCREENS[item[0]]['name'], 'готово' if os.path.exists(item[2]) else 'ОШИБКА работника'), flush=True)
            time.sleep(0.2)
    finally:
        srv.terminate()
    res = []
    for i, _, part in sorted(parts):
        if os.path.exists(part):
            res.append(json.load(open(part, encoding='utf-8')))
            os.remove(part)
    res = summarise(res)
    json.dump(res, open(os.path.join(OUT, 'interactions.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(os.path.join(OUT, 'interactions.md'), 'w', encoding='utf-8').write(to_md(res))
    n_act = sum(len(s['actions']) for s in res)
    found = sum(1 for s in res for a in s['actions'] if a.get('flags'))
    print('экранов %d, действий %d, с флагами %d, %.0f с · отчёт tools/matrix/out/interactions.md'
          % (len(res), n_act, found, time.time() - started))
    return 1 if found else 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
