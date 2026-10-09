# -*- coding: utf-8 -*-
"""Выгрузка реестра в CSV: значения-формулы остаются текстом.

Код-ревью 09.10.2026 (docs/kod-revyu.xlsx): pages/ocMenu/table.js csvOf не
экранировал значения, начинающиеся с = + - @ — Excel выполняет такие как
формулы (OWASP «CSV Injection»).

Что ловит сценарий: название «=HYPERLINK(…)» и «@SUM(…)» попадают в CSV без
апострофа спереди; отрицательное число получает лишний апостроф.
"""
NAME = 'выгрузка CSV'

TOUCHES = ('app/pages/ocMenu/table.js', 'app/pages/ocMenu/ocMenu.js')


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    csv = pg.evaluate("""async () => {
      const tb = await import('./app/pages/ocMenu/table.js');
      const state = { tab: 'estate', columns: ['title', 'eni'], columnsMov: [] };
      const row = (title, eni) => ({ title, eni, metrics: {}, resp: {}, badges: [], facts: [] });
      return tb.csvOf(state, [row('=HYPERLINK("http://x")', '1-47'), row('@SUM(A1)', '-5'), row('Обычное', '2')]);
    }""")
    lines = csv.split('\r\n')
    t.ck(any(l.startswith('"\'=HYPERLINK') for l in lines), 'формула «=…» попала в CSV без апострофа: %s' % lines)
    t.ck(any(l.startswith("'@SUM") for l in lines), 'формула «@…» попала в CSV без апострофа: %s' % lines)
    t.ck(any(l.endswith(';-5') for l in lines), 'у отрицательного числа лишний апостроф: %s' % lines)
