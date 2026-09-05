# -*- coding: utf-8 -*-
"""Поля выглядят одинаково во всех типах ОЦ, а общий файл стилей — общий.

Замечание пользователя 05.09.2026: в карточке участка текстовые поля шли с
рамкой браузера, а не оформлением макета. Причина оказалась системной: при
сведении пяти копий module.css в app/kernel/cards.css префикс модуля дочищался
только у ПЕРВОГО селектора группы, и правила вида

    body[data-module] .input, body[data-module="civil"] .textarea { … }

работали только в гражданском модуле. Таких мест было 31 — под них попали
текстовые поля, подписи, шапки блоков, часть просмотрщика и сравнения.

Сценарий сторожит обе стороны:
  * в общем файле стилей нет селекторов, названных по типу ОЦ (иначе правило
    молча перестаёт действовать в четырёх модулях из пяти);
  * вычисленные стили полей совпадают во всех пяти типах ОЦ — на карточке
    участка, которая одна на все модули, и на карточке строения.

Плюс раскладка блока «Благоустройство территории» карточки участка: ранг и
описание идут разными строками (решение пользователя 05.09.2026 — рядом они
выглядели полем, разрезанным пополам).
"""
import io
import json
import os

NAME = 'стили полей'

CSS = 'app/kernel/cards.css'

ROUTES = {
    'квартира': '#/oc/apartment/oc-ap-1',
    'жилой дом': '#/oc/residential-house/oc-rh-1',
    'гражданское': '#/oc/civil/oc-cv-1',
    'производственное': '#/oc/production/oc-pr-1',
    'участок': '#/oc/land-plot/oc-lp-1',
}

MEASURE = """() => {
  const pick = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const cs = getComputedStyle(e);
    return [cs.border, cs.borderRadius, cs.padding, cs.fontSize,
            cs.backgroundColor, cs.fontWeight].join(' | ');
  };
  return JSON.stringify({
    textarea: pick('.oi-stack .textarea'),
    select: pick('.oi-stack .select'),
    input: pick('.oi-stack .input'),
    label: pick('.oi-stack .field > label'),
  });
}"""

IMPROVE = """() => {
  const box = (sel) => {
    const e = document.querySelector(sel);
    return e ? e.getBoundingClientRect() : null;
  };
  const rank = box('[data-land-improve-rank]');
  const note = box('[data-land-improve-note]');
  if (!rank || !note) return null;
  return JSON.stringify({
    rankTop: Math.round(rank.top), noteTop: Math.round(note.top),
    rankW: Math.round(rank.width), noteW: Math.round(note.width),
    padW: Math.round(document.querySelector('[data-land-improve-note]')
      .closest('.card-pad').getBoundingClientRect().width),
  });
}"""


def _open_land(t, route):
    """Открыть карточку участка: свою в записи либо заведённую через меню."""
    pg = t.page
    t.open(route, wait='[data-open-oi]')
    t.wait(300)

    row = pg.locator('[data-open-oi]:has-text("Земельный участок")')
    if row.count():
        row.first.click()
    else:
        pg.locator('[data-dd-toggle]').first.click()
        if not t.wait_for('[data-add-oi]'):
            return False
        item = pg.locator('[data-add-oi="Земельный участок"]')
        if not item.count():
            return False
        item.first.click()

    return t.wait_for('.oi-stack') and t.wait_for('[data-land-improve-rank]')


def run(t):
    pg = t.page

    # --- общий файл стилей не знает типов ОЦ ---
    css = io.open(os.path.join(os.getcwd(), CSS), encoding='utf-8').read()
    body = '\n'.join(l for l in css.split('\n') if not l.strip().startswith('*')
                     and not l.strip().startswith('/*'))
    t.ck('body[data-module="' not in body,
         'в %s есть селекторы, привязанные к одному типу ОЦ — в остальных '
         'четырёх такое правило не действует' % CSS)

    # --- вычисленные стили полей одинаковы во всех типах ОЦ ---
    styles = {}
    for oc, route in ROUTES.items():
        if not t.ck(_open_land(t, route), 'в %s не открывается карточка участка' % oc):
            continue
        styles[oc] = json.loads(pg.evaluate(MEASURE))

    for key in ('textarea', 'select', 'input', 'label'):
        seen = {oc: s[key] for oc, s in styles.items()}
        t.ck(len(set(seen.values())) <= 1,
             'оформление «%s» различается по типам ОЦ: %s' % (key, seen))
        t.ck(all(v for v in seen.values()), 'поле «%s» не найдено: %s' % (key, seen))

    # --- благоустройство: два поля, две строки ---
    for oc, route in ROUTES.items():
        if not t.ck(_open_land(t, route), 'в %s не открывается карточка участка' % oc):
            continue

        got = pg.evaluate(IMPROVE)
        if not t.ck(got, 'в %s не найден блок благоустройства' % oc):
            continue
        g = json.loads(got)

        t.ck(g['noteTop'] > g['rankTop'] + 20,
             'в %s ранг и особенности благоустройства стоят в одной строке' % oc)
        t.ck(g['rankW'] <= 360,
             'в %s ранг благоустройства растянут на %d px' % (oc, g['rankW']))
        t.ck(g['noteW'] > g['padW'] * 0.9,
             'в %s описание благоустройства занимает %d%% ширины блока'
             % (oc, round(g['noteW'] / g['padW'] * 100)))
