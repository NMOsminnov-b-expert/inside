# -*- coding: utf-8 -*-
"""Снимки экранов веб-страницы осмотрщика для документа «Функционал осмотрщика».

Снимает запущенный макет (python tools/serve.py) на ширине телефона, экран целиком
(высокое окно — список прокручивается внутри страницы, снимок окна иначе обрежет его).
Данные — демонстрационные, из браузера без сохранённого состояния.

    python tools/docs/shoot_opisanie_osmotrschika.py   # → docs/снимки/opisanie-osmotrschika/*.png
"""
import os
import sys
from urllib.parse import quote

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'снимки', 'opisanie-osmotrschika')
BASE = 'http://127.0.0.1:5500/app.html#/osmotr'
W = 400

PICK = """async () => { const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
  const all = d.myObjects(s.person);
  const real = all.find((o) => o.entity === 'real' && o.state === 'progress' && o.typeId !== 'apartment' && (o.ois || []).length) || all.find((o) => o.entity === 'real' && o.state !== 'done');
  const inv = all.find((o) => o.state !== 'done' && (o.inventories || []).some((x) => x.kind === 'inv'));
  const invId = inv && inv.inventories.find((x) => x.kind === 'inv').id;
  const item = inv && d.inventoryOf(s.person, inv.id, invId).items.find((it) => it.own !== false);
  const ts = all.find((o) => o.entity === 'vehicle' && o.state !== 'done');
  return { real: real.id, oi: real.ois[0] && real.ois[0].id, inv: inv && inv.id, invId, item: item && item.id, ts: ts && ts.id }; }"""


def q(**kw):
    return BASE + '?' + '&'.join('%s=%s' % (k, quote(str(v), safe='')) for k, v in kw.items() if v not in ('', None))


# Низ содержимого экрана — снимок обрезается по нему. Нижняя панель вкладок прижата к низу окна: у главной (nav)
# окно сужается до содержимого, и панель попадает в снимок под ним; у остальных экранов — обрезка без панели.
BOTTOM = "() => Math.ceil(Math.max(...[...document.querySelectorAll('.om-scr > *')].map((e) => e.getBoundingClientRect().bottom)) + 16)"


def shot(pg, name, url, wait, before=None, nav=False, cap=3200):
    pg.set_viewport_size({'width': W, 'height': 3200})
    pg.goto(url)
    pg.wait_for_selector(wait)
    if before:
        before(pg)
        pg.mouse.move(0, 0)  # без всплывающей подсказки у нажатой кнопки
    pg.wait_for_timeout(400)  # карта и шрифты дорисовываются
    h = min(cap, pg.evaluate(BOTTOM))
    if nav:
        pg.set_viewport_size({'width': W, 'height': h + 90})
        pg.wait_for_timeout(200)
        pg.screenshot(path=os.path.join(OUT, name + '.png'))
    else:
        pg.screenshot(path=os.path.join(OUT, name + '.png'), clip={'x': 0, 'y': 0, 'width': W, 'height': h})
    print('  ', name)


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': W, 'height': 1700})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE)
        pg.wait_for_selector('.om-app')
        x = pg.evaluate(PICK)
        shot(pg, '01-moi-obekty', BASE, '.om-app[data-v="today"]', nav=True)
        shot(pg, '02-vyezdy', q(v='trips'), '.om-app[data-v="trips"] .om-obj', cap=1250)
        shot(pg, '03-vyezdy-filtry', q(v='trips'), '[data-trip-filters]', before=lambda g: g.click('[data-trip-filters]'), cap=1000)
        shot(pg, '04-vyezdy-poisk-po-date', q(v='trips', q='20.11'), '.om-app[data-v="trips"] .om-list')
        shot(pg, '05-obekt-zadacha', q(v='obj', id=x['real']), '.om-app[data-v="obj"] .om-facts')
        shot(pg, '06-obekt-dokumenty', q(v='obj', id=x['real'], tab='docs'), '.om-app[data-v="obj"] .om-title')
        if x['oi']:
            shot(pg, '07-oi', q(v='oi', id=x['real'], oi=x['oi']), '.om-app[data-v="oi"] .om-oihead')
            shot(pg, '08-oi-foto', q(v='oi', id=x['real'], oi=x['oi'], tab='photo'), '.om-app[data-v="oi"] .om-oihead')
        if x['ts']:
            shot(pg, '09-ts', q(v='obj', id=x['ts']), '.om-app[data-v="obj"] .om-facts')
        if x['inv']:
            shot(pg, '10-opis', q(v='inv', id=x['inv'], inv=x['invId']), '.om-invrow', cap=1250)
            shot(pg, '11-opis-filtry', q(v='inv', id=x['inv'], inv=x['invId']), '.om-invrow', before=lambda g: g.click('[data-filters]'), cap=1250)
            shot(pg, '12-poziciya-opisi', q(v='item', id=x['inv'], inv=x['invId'], it=x['item']), '[data-mk-off]')
        shot(pg, '13-otchet-dnya', q(v='report'), '.om-app[data-v="report"] .om-title')
        shot(pg, '14-plany', q(v='plans'), '.om-app[data-v="plans"] .om-title')
        shot(pg, '15-zaprosy-dokumentov', q(v='cad'), '.om-app[data-v="cad"] .om-title')
        shot(pg, '16-statistika', q(v='stats'), '.om-app[data-v="stats"] .om-title')
        shot(pg, '17-menyu', q(v='menu'), '.om-app[data-v="menu"]')
        shot(pg, '18-vhodyaschie', q(v='notes'), '.om-app[data-v="notes"]')
        b.close()
    if errs:
        print('Ошибки страницы:', errs)
        sys.exit(1)


if __name__ == '__main__':
    main()
