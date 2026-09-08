# -*- coding: utf-8 -*-
"""Открытый мультивыбор виден целиком — его не обрезает и не перекрывает.

Дефект, который сценарий ловит (08.09.2026): поля материалов стоят в ячейках
таблицы «Конструктив и износ», у ячейки overflow:hidden, а у обёртки таблицы
overflow-x:auto — по спецификации браузер делает из этого auto по обеим осям.
Список рисовался position:absolute внутри ячейки высотой 47 px и обрезался
ЦЕЛИКОМ: не было видно ни одного значения. Снаружи это выглядело как «пропали
словари» — перечни приходили в поле, но человек их не видел.

Существующие проверки словарей этого не поймали, потому что читали значения из
DOM (`option`, `[data-struct-opt]`), а обрезка — вопрос геометрии. Поэтому
здесь каждый пункт проверяется двумя вопросами:

  * попадает ли он в границы окна (не за краем экрана);
  * лежит ли он сверху в своей точке (elementFromPoint) — не закрыт ли соседней
    карточкой; при position:fixed прежнего z-index:60 не хватало.

Лечится в app/kernel/msDrop.js — одной точкой на все мультивыборы проекта.
"""
NAME = 'выпадающий мультивыбор'

TOUCHES = (
    'app/kernel/msDrop.js', 'app/kernel/multiSelect.js', 'app/kernel/scope.js',
    'app/kernel/cards.css', 'app/modules/*/parts/struct/*',
    'app/modules/*/oi/building/heating.js', 'app/modules/*/oi/apartment/heating.js',
    'app/modules/*/oi/building/tempMode.js',
)

# Где смотрим: карточка литеры жилого дома (таблица конструктива — худший
# случай) и карточка квартиры (тот же состав, но полями в сетке).
LETTER = '#/oc/residential-house/oc-rh-1/oi/oi-a'

# Сколько пунктов видно в открытом списке. Пункты сверх высоты списка
# прокручиваются внутри него — это нормально, поэтому сравниваем с меньшим из
# (всего пунктов, столько влезает).
VISIBLE = """(sel) => {
  const box = document.querySelector(sel);
  if (!box) return { ошибка: 'нет поля ' + sel };
  const drop = box.querySelector('.ms-drop');
  if (!drop || drop.hidden) return { ошибка: 'список закрыт' };
  const opts = [...drop.querySelectorAll('.ms-opt')];
  let видно = 0;
  opts.forEach((o) => {
    const r = o.getBoundingClientRect();
    if (!(r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight
          && r.left >= 0 && r.right <= window.innerWidth)) return;
    const el = document.elementFromPoint(r.left + 20, r.top + r.height / 2);
    if (el && el.closest('.ms-opt') === o) видно++;
  });
  const r = drop.getBoundingClientRect();
  // Обрезка снаружи: сколько от рамки списка реально попало в окно. Именно
  // это и было сломано — рамка 246 px внутри ячейки высотой 47 px.
  const видимая = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
  return {
    всего: opts.length,
    видно: видно,
    позиция: getComputedStyle(drop).position,
    высота: Math.round(r.height),
    видимая_высота: Math.round(видимая),
    // Помещается ли содержимое без внутренней прокрутки.
    без_прокрутки: drop.scrollHeight <= drop.clientHeight + 1,
  };
}"""


def _open(t, sel):
    """Открыть список поля и дождаться, пока он всплывёт."""
    t.page.locator(sel + ' [data-ms-toggle]').click()
    t.wait_until(
        "() => { const d = document.querySelector('%s .ms-drop');"
        " return d && !d.hidden && getComputedStyle(d).position === 'fixed'; }" % sel)


def _close(t):
    t.page.keyboard.press('Escape')
    t.page.mouse.click(4, 4)
    t.wait_until("() => !document.querySelector('.ms-drop:not([hidden])')")


def _check_field(t, sel, label):
    _open(t, sel)
    r = t.page.evaluate(VISIBLE, sel)
    t.ck('ошибка' not in r, 'поле «%s»: %s' % (label, r.get('ошибка')))
    if 'ошибка' in r:
        return

    # Главное утверждение: видно НЕ НОЛЬ пунктов. Ровно этого и не было.
    t.ck(r['видно'] > 0,
         'в списке «%s» не видно ни одного значения из %d — список обрезан или '
         'перекрыт' % (label, r['всего']))

    # Список не обрезан снаружи: вся его рамка в окне. Длинные перечни
    # прокручиваются ВНУТРИ списка — это не обрезка.
    t.ck(r['видимая_высота'] >= r['высота'] - 1,
         'список «%s» обрезан чужим контейнером: видно %d px из %d'
         % (label, r['видимая_высота'], r['высота']))

    # Если внутренней прокрутки нет, значит видны все пункты до последнего.
    if r['без_прокрутки']:
        t.ck(r['видно'] == r['всего'],
             'в списке «%s» видно %d значений из %d, хотя прокрутки в нём нет'
             % (label, r['видно'], r['всего']))
    else:
        t.ck(r['видно'] >= 3,
             'в списке «%s» видно всего %d значений — за один взгляд не выбрать'
             % (label, r['видно']))
    _close(t)


def run(t):
    pg = t.page

    # --- 1. таблица конструктива: та самая обрезающая ячейка ---------------
    t.open(LETTER, wait='[data-struct-field]')
    pg.locator('#q-struct').scroll_into_view_if_needed()
    t.wait_for('[data-struct-field="foundation"] [data-ms-toggle]')

    rows = pg.evaluate("""() => [...document.querySelectorAll('[data-struct-field]')]
        .map((f) => f.dataset.structField)""")
    t.ck(len(rows) >= 8, 'в конструктиве меньше восьми материалов: %s' % rows)

    # Первое поле, последнее и самое длинное: у нижних строк места под полем
    # нет вовсе — список обязан открыться вверх.
    for key in ('foundation', 'wallsExt', 'doors'):
        _check_field(t, '[data-struct-field="%s"]' % key, key)

    # Выбор значения перерисовывает список (перегруппировка «Выбрано / Не
    # выбрано») — после этого он тоже обязан остаться видимым.
    _open(t, '[data-struct-field="foundation"]')
    pg.locator('[data-struct-field="foundation"] .ms-opt').last.click()
    t.wait_until("() => !!document.querySelector('[data-struct-field=\"foundation\"] .ms-drop:not([hidden])')")
    r = pg.evaluate(VISIBLE, '[data-struct-field="foundation"]')
    t.ck(r.get('видно', 0) > 0,
         'после выбора материала список пропал из вида: %s' % r)
    _close(t)

    # --- 2. отопление: поле в сетке, а не в таблице ------------------------
    if pg.locator('[data-heat-field]').count():
        _check_field(t, '[data-heat-field]', 'отопление')

    # --- 3. узкое окно: список не уезжает за край экрана -------------------
    pg.set_viewport_size({'width': 1024, 'height': 700})
    t.wait(250)
    _open(t, '[data-struct-field="wallsExt"]')
    r = pg.evaluate(VISIBLE, '[data-struct-field="wallsExt"]')
    t.ck(r.get('видно', 0) > 0, 'на 1024 px список материалов не виден: %s' % r)
    _close(t)
    pg.set_viewport_size({'width': 1500, 'height': 1000})

    # --- 4. карточка квартиры: тот же состав, свои словари -----------------
    t.open('#/oc/apartment/oc-ap-1', wait='tr[data-open-oi]')
    pg.locator('tr[data-open-oi]').first.click()
    t.wait_for('[data-struct-field="foundation"]')
    pg.locator('#q-struct').scroll_into_view_if_needed()
    _check_field(t, '[data-struct-field="foundation"]', 'квартира · фундамент')
