# -*- coding: utf-8 -*-
"""Статистика осмотров: период, показатели, медиана команды, выгрузка xlsx.

Задача графа ekran-statistiki-osmotrov-pokazateli-i-vygruzka-xlsx (14.10.2026).

Что ловит сценарий:
  * итог ОИ в таблице показателей не равен сумме строк;
  * медиана команды не совпадает с медианой столбца;
  * плитка «ОИ» расходится с итогом таблицы;
  * переключатель периода не меняет подпись периода; «следующий» доступен
    на текущем периоде; шаг назад не уводит в прошлое;
  * строка таблицы не открывает статистику осмотрщика или теряет период;
  * у осмотрщика нет медианы команды рядом со значением;
  * выгрузка — не xlsx с листами «Сводка», «По областям», «По видам ОИ»
    (по всем) и «Осмотренные объекты», «Отчёты дня» (по осмотрщику), без
    закреплённой шапки и автофильтра;
  * в консоли ошибки.
"""
import os
import tempfile

NAME = 'статистика осмотров'

TOUCHES = ('app/pages/inspections/*', 'app/kernel/inspections.js', 'app/kernel/xlsx.js', 'app/vendor/uplot/')


def num(s):
    s = (s or '').replace(' ', '').replace(' ', '').replace(',', '.').replace('%', '')
    return float(s) if s and s != '—' else None


def sheets_of(t, pg, name):
    with pg.expect_download(timeout=15000) as dl:
        pg.click('[data-ip-sxlsx]')
    out = os.path.join(tempfile.gettempdir(), name)
    dl.value.save_as(out)
    import openpyxl
    wb = openpyxl.load_workbook(out)
    for ws in wb.worksheets:
        t.ck(ws.freeze_panes == 'A2', 'лист «%s»: шапка не закреплена' % ws.title)
        t.ck(bool(ws.auto_filter.ref), 'лист «%s»: нет автофильтра' % ws.title)
    return [ws.title for ws in wb.worksheets]


def run(t):
    pg = t.page
    t.open('#/inspections?s=people&t=stats', wait='[data-ip-section]')
    if not t.ck(t.wait_for('.ipc-mtbl tbody tr'), 'нет таблицы показателей'):
        return
    rows = pg.locator('.ipc-mtbl tbody tr')
    n = rows.count()
    oi = [num(rows.nth(i).locator('td').nth(1).inner_text()) or 0 for i in range(n)]
    foot = num(pg.locator('.ipc-mtbl tfoot tr').first.locator('td').nth(0).inner_text()) or 0
    t.ck(abs(sum(oi) - foot) < 0.5, 'итог ОИ %s не равен сумме строк %s' % (foot, sum(oi)))
    tile = num(pg.locator('.ip-card-body .ip-tile', has_text='ОИ').first.locator('b').inner_text())
    t.ck(tile == foot, 'плитка «ОИ» %s расходится с итогом таблицы %s' % (tile, foot))
    v = sorted(oi)
    med = v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2
    med_cell = num(pg.locator('.ipc-mtbl tfoot tr.ipc-med td').nth(0).inner_text())
    t.ck(med_cell is not None and abs(med_cell - med) < 0.05, 'медиана команды %s, по столбцу %s' % (med_cell, med))

    t.ck(pg.locator('[data-ip-sstep="-1"]').is_disabled(), '«следующий период» доступен на текущем')
    label0 = pg.locator('.ip-repmonth').inner_text()
    pg.click('[data-ip-sunit="quarter"]')
    t.ck(t.wait_until("() => document.querySelector('.ip-repmonth').textContent.includes('квартал')"), 'квартал не выбрался')
    q_label = pg.locator('.ip-repmonth').inner_text()
    pg.click('[data-ip-sstep="1"]')
    t.wait_until("(l) => document.querySelector('.ip-repmonth').textContent !== l", q_label)
    label = pg.locator('.ip-repmonth').inner_text()
    t.ck(label != label0 and not pg.locator('[data-ip-sstep="-1"]').is_disabled(), 'шаг назад не сменил период: %s' % label)

    names = sheets_of(t, pg, '_tmp_check_stat_all.xlsx')
    for s in ('Сводка', 'По областям', 'По видам ОИ'):
        t.ck(s in names, 'в выгрузке по всем нет листа «%s»: %s' % (s, names))

    pg.locator('.ipc-mtbl tbody tr').first.click()
    if not t.ck(t.wait_for('.ipc-ptbl tbody tr'), 'строка не открыла статистику осмотрщика'):
        return
    t.ck(pg.locator('.ip-repmonth').inner_text() == label, 'у осмотрщика другой период')
    med_cells = pg.locator('.ipc-ptbl tbody tr').first.locator('td').nth(2).inner_text()
    t.ck(num(med_cells) is not None, 'у осмотрщика нет медианы команды рядом со значением')
    t.ck(t.wait_for('.ipc-pgrid .ipc-plot .uplot'), 'графики осмотрщика не нарисованы')
    names = sheets_of(t, pg, '_tmp_check_stat_person.xlsx')
    for s in ('Сводка', 'Осмотренные объекты', 'Отчёты дня'):
        t.ck(s in names, 'в выгрузке по осмотрщику нет листа «%s»: %s' % (s, names))
