# -*- coding: utf-8 -*-
"""Страница «Сканы с осмотров» — находки аудита 30.10.2026 (решение пользователя не требовалось).

Что ловит сценарий:
  * просмотр скана — миниатюра без масштаба и листания (нужен просмотрщик ядра);
  * ЕНИ без разделителей, а в карточке — с дефисами; скан по ТС без марки и госномера;
  * у скана описи — ложные «Объект» и ЕНИ;
  * «Принять» без выбранного вида кладёт «Прочее»; не видно, как ляжет документ;
  * причина возврата теряется при переходе на соседний скан; нет «‹ ›» в панели;
  * на 760 пропадают источник и документ; поле причины шире полей выше;
  * подпись отбора — глагол «Показывать»; пустое «Мне» без подсказки;
  * у ЦОД нет среза «Ждут сканы» на главной.
"""
NAME = 'сканы: находки аудита'

TOUCHES = ('app/pages/scans/*', 'app/kernel/scanQueue.js', 'app/pages/ocMenu/slices.js', 'app/pages/inspections/inspections.js')

GIF = 'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='
MAKE = """async ([ty, oc, title, inv]) => { const IR = await import('./app/kernel/inspectionResults.js');
  const b = Uint8Array.from(atob('%s'), (c) => c.charCodeAt(0));
  const s = IR.addResultScan(ty, oc, [1, 2].map((i) => new File([b], 'p' + i + '.gif', { type: 'image/gif' })), { title, by: 'Айдай', inv });
  return 'scan|' + ty + '|' + oc + '|' + s.id; }""" % GIF


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1600, 'height': 900})
    t.open('#/scans', wait='.sc-main')
    oc = pg.evaluate("""async () => { const R = await import('./app/kernel/registry.js'); return R.getType('civil').records.queryRecords({ filter: {}, offset: 0, limit: 30 }).rows.find((s) => s.eni).id; }""")
    k1 = pg.evaluate(MAKE, ['civil', oc, 'Скан полировки 1', None])
    k2 = pg.evaluate(MAKE, ['civil', oc, 'Скан полировки 2', None])
    kts = pg.evaluate(MAKE, ['vehicle', 'oc-vehicle-d2', 'Скан ТС полировки', None])
    kinv = pg.evaluate("""async (mk) => { const I = await import('./app/kernel/inventories.js'); const inv = I.allInventories()[0];
      return [inv.id, inv.items[0].id]; }""", None)
    kiv = pg.evaluate(MAKE, ['civil', oc, 'Скан описи полировки', {'invId': kinv[0], 'itemId': kinv[1]}])
    t.open('#/scans?key=%s' % k1.replace('|', '%7C'), wait='.sc-pane')
    t.ck(t.wait_for('.sc-view [data-vmode], .sc-view .viewer, .sc-view .vbar', timeout=8000), 'просмотр скана — не просмотрщик ядра')
    row = pg.inner_text('tr[data-sc-row="%s"]' % k1)
    t.ck(any(ch == '-' for ch in row.split('\t')[-2] if True), 'ЕНИ в перечне без разделителей: %r' % row)
    t.ck('Чьи' in pg.inner_text('.sc-tools') and 'Показывать' not in pg.inner_text('.sc-tools'), 'подпись отбора — не «Чьи»')
    t.ck(pg.locator('[data-sc-step="1"]').count() == 1, 'нет «‹ ›» в панели')
    # Вид не выбран — «Принять» не проходит, итог виден в подвале.
    t.ck('вид не выбран' in pg.inner_text('[data-sc-as]'), 'в подвале не видно, как ляжет документ: %r' % pg.inner_text('[data-sc-as]'))
    pg.click('[data-sc-accept]')
    t.ck(t.wait_until("() => /Выберите вид/.test((document.querySelector('[data-sc-err]') || {}).textContent || '')"), '«Принять» без вида не остановлено')
    # Черновик причины — помнится по скану.
    pg.fill('[data-sc-f-reason]', 'Причина для первого')
    pg.click('[data-sc-step="1"]')
    t.wait_until("(k) => !decodeURIComponent(location.hash).includes(k)", k1)
    t.open('#/scans?key=%s' % k1.replace('|', '%7C'), wait='.sc-pane')
    t.ck(pg.input_value('[data-sc-f-reason]') == 'Причина для первого', 'черновик причины потерялся при переходе: %r' % pg.input_value('[data-sc-f-reason]'))
    # Поле причины — той же ширины, что поля выше.
    w = pg.evaluate("() => [document.querySelector('#sc-f-title').getBoundingClientRect().width, document.querySelector('#sc-f-reason').getBoundingClientRect().width]")
    t.ck(abs(w[0] - w[1]) <= 1, 'поле причины шире полей формы: %s' % w)
    # ТС — марка и госномер; опись — без «Объект» и ЕНИ.
    t.ck('02KG' in pg.inner_text('tr[data-sc-row="%s"]' % kts).replace(' ', ''), 'у скана ТС нет госномера: %r' % pg.inner_text('tr[data-sc-row="%s"]' % kts))
    t.open('#/scans?key=%s' % kiv.replace('|', '%7C'), wait='.sc-pane')
    info = pg.inner_text('.sc-dl')
    t.ck('Объект\n' not in info and 'ЕНИ' not in info and 'Опись' in info, 'у скана описи — «Объект» или ЕНИ: %r' % info)
    # 760: источник меткой в строке документа.
    pg.set_viewport_size({'width': 760, 'height': 900})
    t.open('#/scans', wait='[data-sc-row]')
    t.ck(pg.locator('.sc-tbl tbody tr').first.locator('.sc-src-narrow').is_visible(), 'на 760 нет метки источника в строке')
    t.ck(pg.evaluate("() => document.querySelector('.sc-tbl td:nth-child(3)').getBoundingClientRect().width > 120"), 'на 760 столбец документа сжат')
    pg.set_viewport_size({'width': 1600, 'height': 900})
    # Пустое «Мне» — подсказка.
    pg.evaluate("async () => (await import('./app/kernel/session.js')).session.set({ person: 'Никто Проверочный', role: 'cod' })")
    t.open('#/scans?who=me', wait='.sc-main')
    t.ck('Показать все' in pg.inner_text('.sc-main'), 'у пустого «Мне» нет подсказки «Показать все»')
    pg.evaluate("async () => (await import('./app/kernel/session.js')).session.set({ person: 'Осминнов Н.', role: 'any' })")
    # Срез ЦОД «Ждут сканы».
    t.open('', wait='[data-slice]')
    t.ck(pg.locator('[data-slice="my-cod-scans"]').count() == 1, 'на главной нет среза «Ждут сканы»')

    # --- площади (указание пользователя 06.11.2026: документ — главное, размеры регулируются) ---
    pg.set_viewport_size({'width': 1920, 'height': 1000})
    t.open('#/scans?key=%s' % k2.replace('|', '%7C'), wait='[data-sc-split="list"]')
    LW = "() => document.querySelector('.sc-list').getBoundingClientRect().width"
    w0 = pg.evaluate(LW)
    box = pg.locator('[data-sc-split="list"]').bounding_box()
    pg.mouse.move(box['x'] + 5, box['y'] + 100)
    pg.mouse.down()
    pg.mouse.move(box['x'] - 200, box['y'] + 100, steps=5)
    pg.mouse.up()
    w1 = pg.evaluate(LW)
    t.ck(w1 < w0 - 150, 'перетаскивание разделителя не сузило перечень: %s → %s' % (w0, w1))
    t.ck(pg.locator('[data-sc-split="side"]').is_visible(), 'на широком экране нет разделителя полей разбора')
    pg.focus('[data-sc-split="list"]')
    pg.keyboard.press('ArrowRight')
    t.ck(pg.evaluate(LW) > w1, 'стрелка вправо не расширила перечень')
    pg.wait_for_timeout(1200)
    t.open('#/scans?x=1', wait='.sc-main')
    t.open('#/scans?key=%s' % k2.replace('|', '%7C'), wait='[data-sc-split="list"]')
    w2 = pg.evaluate(LW)
    t.ck(abs(w2 - pg.evaluate(LW)) < 2 and w2 < w0 - 100, 'ширина перечня не запомнилась после перезагрузки: %s (было %s)' % (w2, w0))
    pg.dblclick('[data-sc-split="list"]')
    t.ck(abs(pg.evaluate(LW) - w0) < 4, 'двойной щелчок не вернул ширину по умолчанию')
    d = pg.evaluate("() => { const a = document.querySelector('.sc-docarea').getBoundingClientRect(); const m = document.querySelector('.sc-main').getBoundingClientRect(); return [a.width * a.height, m.width * m.height]; }")
    t.ck(d[0] > d[1] * 0.3, 'документ занимает меньше трети площади: %s' % d)
    for w in (1280, 1100, 900, 760):
        pg.set_viewport_size({'width': w, 'height': 900})
        t.open('#/scans?key=%s' % k2.replace('|', '%7C'), wait='[data-sc-accept]')
        vis = pg.evaluate("() => { const b = document.querySelector('[data-sc-accept]').getBoundingClientRect(); return b.bottom <= innerHeight && b.top >= 0; }")
        t.ck(vis, '%d: «Принять» не в видимой части' % w)
    pg.set_viewport_size({'width': 1600, 'height': 900})

    # --- высота документа (указание 06.11.2026: «Шапка сверху, шапка снизу. Переделываем страницу») ---
    for w in (1920, 1280, 900):
        pg.set_viewport_size({'width': w, 'height': 1000})
        t.open('#/scans?key=%s' % k2.replace('|', '%7C'), wait='.sc-docarea')
        g = pg.evaluate("""() => { const a = document.querySelector('.sc-docarea').getBoundingClientRect(); const m = document.querySelector('.sc-main').getBoundingClientRect();
          const tabs = document.querySelector('.sc-view .vtabs'); return { gap: Math.round(a.top - m.top), h: Math.round(a.height), vh: innerHeight, tabs: !!tabs && getComputedStyle(tabs).display !== 'none' }; }""")
        t.ck(g['gap'] <= 2 and g['h'] >= g['vh'] * 0.85 and not g['tabs'], '%d: над документом шапка или он ниже 85%% окна: %s' % (w, g))
    pg.set_viewport_size({'width': 1600, 'height': 900})
