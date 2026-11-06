# -*- coding: utf-8 -*-
"""Один выбор периода для «Итогов», «Статистики» и отчётов осмотрщика.

Решение пользователя 05.11.2026 на вопрос «Один выбор периода для отчётов, итогов и
статистики»: «Один общий» — неделя / месяц / квартал + «с — по», одинаково на трёх экранах
и в карточке осмотрщика.

Что ловит сценарий:
  * на одном из экранов свой, другой выбор периода;
  * выбранный период не переходит с экрана на экран;
  * «Период» с — по не сужает строки отчётов.
"""
NAME = 'один выбор периода'

TOUCHES = ('app/pages/inspections/inspections.js', 'app/pages/inspections/stats.js', 'app/pages/inspections/statsData.js')

LABEL = "() => (document.querySelector('.ipc-sper .ip-repmonth') || {}).innerText || ''"
RANGE = "() => (document.querySelector('.ipc-sper .ip-hint') || {}).innerText || ''"


def run(t):
    pg = t.page
    t.open('#/inspections?s=people&t=totals', wait='[data-ip-sunit]')
    t.ck(pg.locator('.ipc-sper [data-ip-sunit]').count() == 4, 'в «Итогах» нет общего выбора периода (неделя / месяц / квартал / период)')
    pg.click('[data-ip-sunit="week"]')
    pg.click('[data-ip-sstep="1"]')
    week = pg.evaluate(LABEL)
    # Тот же период — в «Статистике» и в отчётах осмотрщика.
    pg.click('[data-ip-atab="stats"]')
    t.ck(t.wait_until("(w) => ((document.querySelector('.ipc-sper .ip-repmonth') || {}).innerText || '') === w", week), 'в «Статистике» другой период: %r вместо %r' % (pg.evaluate(LABEL), week))
    who = pg.locator('.ip-person-main[data-ip-person]:not([data-ip-person=""])').first.get_attribute('data-ip-person')
    pg.locator('.ip-person-main[data-ip-person="%s"]' % who).click()
    pg.click('[data-ip-ptab="reports"]')
    t.ck(t.wait_until("(w) => ((document.querySelector('.ipc-sper .ip-repmonth') || {}).innerText || '') === w", week), 'в отчётах осмотрщика другой период: %r вместо %r' % (pg.evaluate(LABEL), week))
    # «Период» — с — по: строки отчётов только в этих днях.
    pg.click('[data-ip-sunit="custom"]')
    t.wait_for('[data-ip-prange="from"]')
    days = pg.evaluate("() => { const d = new Date(); d.setDate(d.getDate() - 2); const iso = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); return [iso(d), iso(new Date())]; }")
    pg.fill('[data-ip-prange="from"]', days[0])
    pg.dispatch_event('[data-ip-prange="from"]', 'change')
    pg.fill('[data-ip-prange="to"]', days[1])
    pg.dispatch_event('[data-ip-prange="to"]', 'change')
    t.ck(t.wait_until("() => document.querySelectorAll('.ip-reptbl tbody tr').length > 0 && document.querySelectorAll('.ip-reptbl tbody tr').length <= 3"),
         '«Период» с — по не сузил отчёты до трёх дней: строк %s' % pg.locator('.ip-reptbl tbody tr').count())
    t.ck(days[0].split('-')[2] in pg.evaluate(RANGE), 'подпись периода не показывает выбранные даты: %r' % pg.evaluate(RANGE))
