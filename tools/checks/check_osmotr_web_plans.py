# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика (17.11.2026): «Планы» — как в приложении «Осмотр» (EstateDay.kt, PlansScreen, TakeDialog).

Что ловит сценарий:
  * в «Планах» не 28 дней вперёд; выезд дня не в своём дне; нет области из плана месяца; нет отсутствия;
    выходной не помечен «Нерабочий»;
  * просроченный выезд не в «Не сделано раньше»;
  * задача без даты не в «Без даты»; «Взять на день» берёт только на сегодня, а не на выбранный день из 28;
    взятое не уходит в назначение (plannedAt) и не попадает в свой день;
  * на «Сегодня» нет строки «Без даты» или она не ведёт к разделу;
  * на 360 пикселях «Планы» прокручиваются вбок.
"""
import datetime

from harness import use_cadastre_fixture

NAME = 'планы осмотрщика (веб)'

TOUCHES = ('app/pages/osmotr/*', 'app/kernel/inspections.js')


def iso(days=0):
    return (datetime.date.today() + datetime.timedelta(days=days)).isoformat()


def run(t):
    pg = t.page
    use_cadastre_fixture(pg)
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    # Данные: один выезд — без даты, другой — вчера (просрочен), третий — через 3 дня; план и отсутствие.
    setup = pg.evaluate("""async ([late, d3, d5]) => {
      const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state;
      const objs = (await import('./app/pages/osmotr/data.js')).myObjects(s.person).filter((o) => o.state !== 'done' && !o.removed);
      const pick = objs.slice(0, 3); if (pick.length < 3) return null;
      const set = (o, day) => k.myAssignsOn(s.person, o.typeId, o.ocId).filter(k.isLive).forEach((a) => { a.plannedAt = day; });
      set(pick[0], ''); set(pick[1], late); set(pick[2], d3);
      k.setPlan(s.person, d3, { region: 'Проверочная обл.' });
      k.addAbsence(s.person, { kind: k.ABSENCE_KINDS[0].key, from: d5, to: d5, note: 'проверка' });
      k.changed();
      return pick.map((o) => ({ id: o.id, typeId: o.typeId, ocId: o.ocId })); }""", [iso(-1), iso(3), iso(5)])
    if not t.ck(setup, 'нет трёх открытых объектов — сценарию не на чем проверить'):
        return
    nod, late, later = setup

    t.ck(t.wait_until("() => [...document.querySelectorAll('.om-row')].some((r) => r.textContent.includes('Без даты'))"), 'на «Сегодня» нет строки «Без даты»')
    pg.locator('.om-row', has_text='Без даты').click()
    t.ck(t.wait_until("() => /v=plans/.test(location.hash) && !!document.querySelector('#om-nodate')"), '«Без даты» не ведёт в «Планы»')
    t.ck(t.wait_until("() => { const r = document.querySelector('#om-nodate').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }"),
         '«Без даты» с «Сегодня» не прокручивает к разделу')

    t.ck(pg.locator('.om-day').count() == 28, 'в «Планах» не 28 дней: %d' % pg.locator('.om-day').count())
    day3 = pg.locator('.om-day[data-day="%s"]' % iso(3))
    t.ck('Проверочная обл.' in day3.inner_text(), 'нет области из плана месяца')
    t.ck(day3.locator('a[href*="%s"]' % later['id'].split('|')[1]).count() >= 1, 'выезд через три дня не в своём дне')
    t.ck('проверка' in pg.locator('.om-day[data-day="%s"]' % iso(5)).inner_text(), 'нет отсутствия в дне')
    sat = next(i for i in range(7) if (datetime.date.today() + datetime.timedelta(days=i)).weekday() == 5)
    t.ck('Нерабочий' in pg.locator('.om-day[data-day="%s"]' % iso(sat)).inner_text(), 'суббота не помечена «Нерабочий»')
    over = pg.locator('.om-sec', has_text='Не сделано раньше')
    t.ck(over.count() == 1, 'нет раздела «Не сделано раньше»')
    t.ck(pg.locator('.om-group a[href*="%s"]' % late['id'].split('|')[1]).count() >= 1, 'просроченный выезд не в «Не сделано раньше»')

    # Взять на день: не сегодня, а через 2 дня.
    btn = pg.locator('[data-take="%s"]' % nod['id'])
    t.ck(btn.count() == 1, 'у задачи без даты нет «Взять на день»')
    btn.click()
    t.wait_for('[data-take-form]')
    t.ck(pg.locator('[data-take-form] input[name=day]').count() == 28, 'выбор дня — не из 28 дней')
    pg.locator('[data-take-form] label.om-seg').nth(2).click()
    t.ck(t.wait_until("(d) => !!document.querySelector('[data-take-form] input[value=\"' + d + '\"]:checked')", iso(2)), 'день не выбирается')
    pg.locator('[data-take-form] button[type=submit]').click()
    t.ck(t.wait_until("""async ([tp, oc, d]) => { const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state;
      const l = k.myAssignsOn(s.person, tp, oc).filter(k.isLive); return l.length && l.every((a) => a.plannedAt === d); }""", [nod['typeId'], nod['ocId'], iso(2)]),
         'взятое на день не ушло в назначение')
    t.ck(t.wait_until("([d, id]) => !!document.querySelector('.om-day[data-day=\"' + d + '\"] a[href*=\"' + encodeURIComponent(id) + '\"]')", [iso(2), nod['id']]),
         'взятое не появилось в своём дне')
    t.ck(pg.locator('[data-take="%s"]' % nod['id']).count() == 0, 'взятое осталось в «Без даты»')

    pg.set_viewport_size({'width': 360, 'height': 780})
    t.open('#/osmotr?v=plans', wait='.om-days')
    w = pg.evaluate("() => { const s = document.querySelector('.om-scr'); return s.scrollWidth - s.clientWidth; }")
    t.ck(w <= 0, '«Планы» на 360 px прокручиваются вбок на %d px' % w)
