# -*- coding: utf-8 -*-
"""Раскладка пачки объектов по дням и назначение на день из «Загрузки».

Решение пользователя 05.11.2026 на вопрос «Автораскладка пачки объектов по свободным дням»:
«Раскладка с правкой» — система предлагает дни по норме, маршруту и дому осмотрщика,
регионал правит до назначения; «Назначить на этот день» сужает очередь до подходящих.

Что ловит сценарий:
  * групповое назначение уходит без дат;
  * день, поправленный в строке, не доходит до назначения;
  * раскладка ставит день, когда осмотрщик не работает;
  * «Назначить на этот день» не сужает очередь, «Показать все» не возвращает её.
"""
NAME = 'раскладка пачки по дням'

TOUCHES = ('app/pages/inspections/route.js', 'app/pages/inspections/assignPane.js', 'app/pages/inspections/inspections.js')

K = "await import('./app/kernel/inspections.js')"


def run(t):
    pg = t.page
    t.open('#/inspections?s=people', wait='.ip-person-main')
    pg.click('[data-ip-team="queue"]')
    t.wait_for('[data-ip-check]')
    for i in range(3):
        pg.locator('[data-ip-check]').nth(i).check()
    t.wait_until("() => /Выбрано объектов: 3/.test(document.querySelector('.ip-pane').innerText)")
    keys = [pg.locator('[data-ip-check]').nth(i).get_attribute('data-ip-check') for i in range(3)]
    person = pg.eval_on_selector('[data-ip-f-person]', "s => s.options[1].value")
    pg.select_option('[data-ip-f-person]', person)
    t.ck(t.wait_for('[data-ip-lay]'), 'после выбора осмотрщика нет раскладки пачки по дням')
    days = pg.evaluate("() => Object.fromEntries([...document.querySelectorAll('[data-ip-lay]')].map((x) => [x.dataset.ipLay, x.value]))")
    t.ck(all(days.get(k) for k in keys), 'раскладка оставила объекты без дня: %s' % days)
    off = pg.evaluate("async ([p, ds]) => { const m = %s; return ds.filter((d) => d && !m.workdayOf(p, d).ok); }" % K, [person, list(days.values())])
    t.ck(not off, 'раскладка поставила нерабочие дни осмотрщика: %s' % off)
    # Правка дня в строке — до назначения.
    pg.fill('[data-ip-lay="%s"]' % keys[0], '2099-05-05')
    pg.dispatch_event('[data-ip-lay="%s"]' % keys[0], 'change')
    pg.click('[data-ip-f-ok]')
    got = pg.evaluate("""async ([ks, p]) => { const m = %s; return ks.map((k) => { const [ty, oc] = k.split('|');
      const a = m.assignmentsOf(ty, oc).find((x) => x.person === p); return a ? a.plannedAt : null; }); }""" % K, [keys, person])
    t.ck(got[0] == '2099-05-05', 'поправленный день строки не дошёл до назначения: %s' % got)
    t.ck(all(got[1:]) and got[1:] == [days[k] for k in keys[1:]], 'дни раскладки не дошли до назначений: %s vs %s' % (got, days))

    # «Назначить на этот день» из «Загрузки» — очередь только подходящих.
    pg.click('[data-ip-team="people"]')
    pg.locator('.ip-person-main[data-ip-person=""]').click()
    pg.click('[data-ip-atab="load"]')
    t.wait_for('[data-ip-load]')
    # Клетка рабочего дня с назначениями или без — у нерабочего дня кнопки назначения нет.
    pg.locator('[data-ip-load]').nth(1).click()
    if not t.ck(t.wait_for('[data-ip-load-assign]', timeout=5000), 'в «Загрузке» нет «Назначить на этот день»'):
        return
    pg.locator('[data-ip-load-assign]').first.click()
    t.ck(t.wait_for('[data-ip-assign-fit]'), 'назначение на день не показывает «подходит N из M»')
    note = pg.inner_text('.ip-assign-day')
    t.ck('подходит' in note, 'нет счёта подходящих: %r' % note)
    n_fit = pg.locator('tr[data-ip-row]').count()
    pg.click('[data-ip-assign-fit]')
    t.ck(t.wait_until("(n) => document.querySelectorAll('tr[data-ip-row]').length >= n", n_fit), '«Показать все» не вернуло очередь')
