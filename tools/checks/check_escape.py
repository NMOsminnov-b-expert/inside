# -*- coding: utf-8 -*-
"""Экранирование: текст из адреса, полей и справочников не становится разметкой.

Код-ревью 09.10.2026 (docs/kod-revyu.xlsx, очередь 1) нашло три места, где
текст вставлялся в разметку как есть.

Что ловит сценарий:
  * название типа ОЦ из адреса страницы (#/oc/<разметка>) выводится разметкой —
    ссылка выполняет код у любого, кто по ней перешёл (kernel/boot.js);
  * свободный текст «Площадь сервитутов» участка в подсказке ячейки таблицы
    участков карточки ОЦ закрывает атрибут title и добавляет свои
    (*/card/oiTable.view.js);
  * значение справочника с угловыми скобками в выпадающем списке карточки
    строения превращается в разметку (*/oi/building/view.js и соседи — все
    <option>).
"""
NAME = 'экранирование'

TOUCHES = (
    'app/kernel/boot.js', 'app/kernel/dom.js',
    'app/modules/apartment/card/oiTable.view.js', 'app/modules/civil/card/oiTable.view.js',
    'app/modules/land-plot/card/oiTable.view.js', 'app/modules/residential-house/card/oiTable.view.js',
    'app/modules/civil/oi/building/view.js', 'app/modules/apartment/oi/building/view.js',
    'app/modules/land-plot/oi/building/view.js', 'app/modules/residential-house/oi/building/view.js',
    'app/modules/vehicle/tsFields.view.js',
)

BAD = '<img src=x id=xss-probe>'


def run(t):
    pg = t.page

    # --- адрес страницы --------------------------------------------------------
    t.open('#/oc/%3Cimg%20src%3Dx%20id%3Dxss-probe%3E', wait='[data-back-menu]')
    t.ck(pg.locator('#xss-probe').count() == 0, 'тип ОЦ из адреса выведен разметкой')
    t.ck('<img' in pg.locator('#content').inner_text(), 'тип ОЦ из адреса не показан текстом')

    # --- подсказка ячейки участка ----------------------------------------------
    t.open('#/oc/civil/oc-cv-1', wait='[data-open-oi]')
    pg.evaluate("""async (bad) => {
      const s = await import('./app/modules/civil/data/store.js');
      const rec = s.getRecord('oc-cv-1');
      const land = rec.oi.find((o) => o.card === 'land');
      if (land) { land.encumbrance = 'Есть'; land.encumbranceArea = '5" data-xss-probe="1'; }
      window.dispatchEvent(new Event('inside:redraw'));
    }""", BAD)
    t.wait_until("() => !!document.querySelector('[data-open-oi]')")
    t.ck(pg.locator('[data-xss-probe]').count() == 0, 'текст «Площадь сервитутов» вышел из атрибута title')

    # --- значение справочника в выпадающем списке --------------------------------
    pg.evaluate("""async (bad) => {
      const d = await import('./app/kernel/dicts.js');
      const list = d.optionsFor('civil', 'building', 'status');
      const dict = list && d.dictAt('civil', 'building', 'status');
      if (dict) dict.items.push({ id: 'it-xss', value: bad, group: '', note: '', order: dict.items.length });
    }""", BAD)
    bid = pg.evaluate("""async () => {
      const s = await import('./app/modules/civil/data/store.js');
      const b = s.getRecord('oc-cv-1').oi.find((o) => o.card === 'building');
      return b ? b.id : '';
    }""")
    t.open('#/oc/civil/oc-cv-1/oi/' + bid, wait='[data-buildtype]')
    t.ck(pg.locator('#xss-probe').count() == 0, 'значение справочника выведено в списке разметкой')
