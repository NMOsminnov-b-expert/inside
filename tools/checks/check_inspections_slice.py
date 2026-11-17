# -*- coding: utf-8 -*-
"""Общий срез экрана регионалов: «Мои / Все», область, учреждение.

ТЗ tz-ekran-regionalov-odna-stroka-menyu-obschiy-srez-planirovanie-den-os (17.11.2026): одна
строка меню, общий срез под ней — один на все разделы, переживает переходы, лежит в адресе;
учреждение — фильтр среза (указание пользователя «в фильтры добавляем учреждения»).

Что ловит сценарий:
  * учреждение (часть названия) не сужает «К назначению», «Назначено», точки карты, «Горит срок»;
  * область не сужает очередь; числа переключателя «К назначению · Назначено» не по срезу;
  * срез не попал в адрес страницы или не восстановился из него после перезагрузки;
  * срез сбросился при переходе в «Люди» и обратно;
  * отметка свёрнутой группы задела объекты вне среза;
  * «×» у учреждения не снимает его;
  * ошибки консоли.
"""
NAME = 'срез экрана регионалов'

TOUCHES = ('app/pages/inspections/inspections.js', 'app/pages/inspections/inspections.css', 'app/kernel/motion.css')

COUNTS = """async ([inst, region]) => { const M = await import('./app/pages/inspections/model.js'); const all = M.summaries();
  const hit = (s) => (!inst || String(s.institution || '').toLowerCase().includes(inst.toLowerCase())) && (!region || M.regionOf(s) === region);
  return { queue: M.queueBase(all).filter(hit).length, live: M.assignedRows(all, { q: '' }).filter(({ s }) => hit(s)).length,
    all: M.queueBase(all).length, regions: [...new Set(M.queueBase(all).map(M.regionOf))].filter(Boolean),
    insts: [...new Set(M.queueBase(all).map((s) => s.institution))].filter(Boolean) }; }"""
SW = "() => [...document.querySelectorAll('.ip-qswitch [data-ip-team] b')].map((b) => +b.textContent)"


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1440, 'height': 900})
    t.open('#/inspections?s=assign&t=queue', wait='.ip-qswitch')
    pg.click('.ip-slice [data-ip-mode="all"]')
    base = pg.evaluate(COUNTS, ['', ''])
    t.ck(len(base['insts']) > 1 and len(base['regions']) > 1, 'в демо очереди одно учреждение или одна область — срезу нечего сужать')
    # Учреждение — по части названия: первое слово самого частого учреждения.
    inst = sorted(base['insts'], key=lambda n: -sum(1 for x in base['insts'] if x == n))[0].split(' ')[0]
    want = pg.evaluate(COUNTS, [inst, ''])
    t.ck(0 < want['queue'] < base['all'], 'учреждение «%s» не сужает очередь в данных: %s' % (inst, want))
    pg.fill('[data-ip-inst]', inst)
    pg.press('[data-ip-inst]', 'Enter')
    t.ck(t.wait_until("([q, l]) => { const n = (" + SW + ")(); return n[0] === q && n[1] === l; }", [want['queue'], want['live']]),
         'числа «К назначению · Назначено» не по учреждению: %s, ждали %s' % (pg.evaluate(SW), [want['queue'], want['live']]))
    shown = pg.eval_on_selector_all('[data-ip-row]', 'els => els.length')
    t.ck(shown == min(want['queue'], 200) or pg.locator('.ip-grp-t[aria-expanded="false"]').count() > 0, 'строк очереди не по срезу: %d из %d' % (shown, want['queue']))
    t.ck(t.wait_until("(i) => decodeURIComponent(location.hash).includes('i=' + i)", inst), 'учреждение не в адресе: %s' % pg.evaluate('location.hash'))
    # Карта: подпись «На карте N из M» — M по срезу.
    note = pg.locator('[data-ip-scene-note]')
    if note.count() and note.is_visible():
        t.ck(('из %d' % want['queue']) in note.inner_text(), 'карта не по срезу: %s' % note.inner_text())

    # Переход и возврат — срез держится; перезагрузка — из адреса.
    pg.click('[data-ip-section="people"]')
    t.wait_for('.ip-person-main')
    t.ck(pg.input_value('[data-ip-inst]') == inst, 'срез сбросился при переходе в «Люди»')
    pg.click('[data-ip-section="assign"]')
    t.wait_for('.ip-qswitch')
    pg.reload()
    t.wait_for('.ip-qswitch')
    t.ck(t.wait_until("([q]) => (" + SW + ")()[0] === q", [want['queue']]), 'после перезагрузки очередь не по срезу из адреса')

    # Свёрнутая группа: отметка — только объекты среза.
    g = pg.locator('[data-ip-gtoggle]').first
    place = g.get_attribute('data-ip-gtoggle')
    g.click()
    t.wait_for('[data-ip-gtoggle="%s"][aria-expanded="false"]' % place)
    pg.check('[data-ip-gcheck="%s"]' % place)
    picked = pg.evaluate("""async ([place, inst]) => { const M = await import('./app/pages/inspections/model.js'); const all = M.summaries();
      const n = (document.querySelector('.ip-bulk2 b') || {}).textContent;
      return { n: +n, inSlice: M.queueBase(all).filter((s) => s.place === place && String(s.institution || '').toLowerCase().includes(inst.toLowerCase())).length }; }""", [place, inst])
    t.ck(picked['n'] == picked['inSlice'], 'отметка свёрнутой группы задела объекты вне среза: отмечено %s, в срезе %s' % (picked['n'], picked['inSlice']))
    pg.click('[data-ip-bulk-clear]') if pg.locator('[data-ip-bulk-clear]').count() else None

    # «×» снимает учреждение; область сужает очередь.
    pg.click('[data-ip-inst-clear]')
    t.ck(t.wait_until("([q]) => (" + SW + ")()[0] === q", [base['all']]), '«×» не снял учреждение')
    region = base['regions'][0]
    rw = pg.evaluate(COUNTS, ['', region])
    pg.select_option('[data-ip-region]', region)
    t.ck(t.wait_until("([q]) => (" + SW + ")()[0] === q", [rw['queue']]), 'область «%s» не сузила очередь до %d' % (region, rw['queue']))

    # «Сегодня» — «Горит срок» только из среза.
    t.open('#/inspections?s=today&i=%s' % inst, wait='.ip-today')
    hot = pg.eval_on_selector_all('[data-ip-today-q]', 'els => els.map((e) => e.dataset.ipTodayQ)')
    bad = pg.evaluate("""async ([keys, inst]) => { const M = await import('./app/pages/inspections/model.js'); const all = M.summaries();
      return keys.filter((k) => !String((all.get(k) || {}).institution || '').toLowerCase().includes(inst.toLowerCase())); }""", [hot, inst])
    t.ck(not bad, '«Горит срок» показывает объекты вне среза: %s' % bad)
    pg.select_option('[data-ip-region]', '')
