# -*- coding: utf-8 -*-
"""«Сегодня» регионала — один экран утреннего обхода.

Решение пользователя 05.11.2026 на вопрос «Открытые вопросы разбора 12.10: «Сегодня»
регионала и слияние подразделов»: делать «Сегодня» — горящие, просроченные, отсутствия,
уведомления; слияние подразделов карточки осмотрщика — не делать.

Что ловит сценарий:
  * нет раздела «Сегодня» или он не открывается по адресу ?s=today;
  * объект со сроком сегодня без назначения не в «Горит срок»; строка не ведёт в очередь;
  * осмотрщик в отпуске сегодня не в «Отсутствуют сегодня» или без числа выездов; строка не ведёт к нему;
  * пустые блоки без пояснения; страница уезжает вбок на 760–1920;
  * «Сегодня» не разделами (26.11.2026: «Уходи от карточек! Нужны нормальные разделы!»): слева — четыре группы
    (требует действия, сроки, люди сегодня, уведомления) с разделами и числами, справа — список выбранного; пустой
    раздел открывается.
"""
NAME = 'сегодня регионала'

TOUCHES = ('app/pages/inspections/inspections.js', 'app/pages/inspections/inspections.css', 'app/shell/goto.js')

K = "await import('./app/kernel/inspections.js')"


def run(t):
    pg = t.page
    t.open('#/inspections?s=people', wait='.ip-person-main')
    st = pg.evaluate("""async () => { const K = %s; const M = await import('./app/pages/inspections/model.js'); const R = await import('./app/kernel/registry.js');
      const d = new Date(); const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const t = R.getType('civil'); const s = t.records.queryRecords({ filter: { status: ['Удостоверен по документам'] }, offset: 0, limit: 300 }).rows
        .find((x) => !K.assignmentsOf('civil', x.id, { live: false }).length);
      K.setDeadline(['civil|' + s.id], iso);
      const other = t.records.queryRecords({ filter: { status: ['Удостоверен по документам'] }, offset: 0, limit: 300 }).rows
        .find((x) => x.id !== s.id && !K.assignmentsOf('civil', x.id, { live: false }).length);
      K.assign({ typeId: 'civil', ocId: other.id, person: 'Айдай', plannedAt: iso });
      K.addAbsence('Айдай', { kind: K.absenceKinds()[0].key, from: iso, to: iso });
      return { key: 'civil|' + s.id, title: s.title }; }""" % K)
    t.open('#/inspections?s=today', wait='.ip-today')
    # Четыре группы разделов слева (ответ пользователя 26.11.2026: наверху — все четыре).
    groups = pg.eval_on_selector_all('.ip-today-g', 'els => els.map((e) => e.firstChild.textContent.trim())')
    t.ck(groups == ['Требует действия', 'Сроки', 'Люди сегодня', 'Уведомления'], 'группы «Сегодня» не те: %s' % groups)
    pg.click('.ip-slice [data-ip-mode="all"]')
    t.wait_for('[data-ip-today-sec="hot"]')
    pg.click('[data-ip-today-sec="hot"]')
    hot = pg.locator('[data-ip-today-q="%s"]' % st['key'])
    t.ck(t.wait_until("(k) => !!document.querySelector('[data-ip-today-q=\"' + k + '\"]')", st['key']), 'объект со сроком сегодня не в «Горит срок»')
    pg.click('[data-ip-today-sec="away"]')
    away = pg.locator('[data-ip-today-p="Айдай"]', has_text='переназначить')
    t.ck(t.wait_until("() => [...document.querySelectorAll('[data-ip-today-p]')].some((x) => x.textContent.includes('переназначить'))"),
         'осмотрщик в отсутствии с выездом сегодня не в «Отсутствуют»')
    t.ck(away.count() >= 1, 'у отсутствующего нет числа выездов')
    t.ck(pg.locator('.ip-today .ip-card-body li, .ip-today .ip-card-body .ip-hint').count() > 0, 'раздел «Сегодня» пуст без пояснения')
    pg.click('[data-ip-today-sec="hot"]')
    t.wait_until("(k) => !!document.querySelector('[data-ip-today-q=\"' + k + '\"]')", st['key'])
    for w in (1920, 1280, 900, 760):
        pg.set_viewport_size({'width': w, 'height': 900})
        t.ck(pg.evaluate("() => document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth"), '%d: «Сегодня» уезжает вбок' % w)
    pg.set_viewport_size({'width': 1600, 'height': 900})
    if hot.count():
        hot.click()
        t.ck(t.wait_until("() => /s=assign/.test(location.hash) && /t=queue/.test(location.hash)"), 'строка «Горит срок» не ведёт в очередь: %s' % pg.evaluate('location.hash'))
    t.open('#/inspections?s=today', wait='.ip-today')
    pg.click('.ip-slice [data-ip-mode="all"]')
    pg.click('[data-ip-today-sec="away"]')
    t.wait_until("() => !!document.querySelector('[data-ip-today-p]')")
    if t.ck(pg.locator('[data-ip-today-p="Айдай"]').count(), 'нет строки осмотрщика'):
        pg.locator('[data-ip-today-p="Айдай"]').first.click()
        t.ck(t.wait_until("() => /s=people/.test(location.hash) && /p=%D0%90/.test(location.hash)"), 'строка осмотрщика не ведёт к нему: %s' % pg.evaluate('location.hash'))
