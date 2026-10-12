# -*- coding: utf-8 -*-
"""Реестр на 20 000 записей: прокрутка показывает те строки, что надо.

Код-ревью 09.10.2026 (docs/kod-revyu.xlsx): каждое событие прокрутки заново
собирало и сортировало строки со всех модулей — 50–64 мс на событие у конца
реестра (замер 12.10.2026); теперь отсортированная выборка одна на
отрисовку данных, прокрутка берёт из неё срез, не чаще раза в кадр
(pages/ocMenu/ocMenu.js rowsAt).

Что ловит сценарий: после прокрутки к середине и к концу строки на экране не
совпадают с выборкой реестра в том же порядке (срез из устаревшей или не так
отсортированной выборки).
"""
NAME = 'реестр: прокрутка 20 000'

TOUCHES = ('app/pages/ocMenu/ocMenu.js', 'app/pages/ocMenu/query.js')

ROWS = "() => [...document.querySelectorAll('[data-rows] [data-row]')].map((r) => [+r.dataset.index, r.dataset.row.split('|')[1]])"


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    pg.click('[data-user-toggle]')
    pg.click('[data-um-bulk="20000"]')
    t.wait_until("() => parseInt(document.querySelector('[data-spacer]').style.height) > 500000")
    for frac in (0.5, 0.995):
        pg.evaluate("(f) => { const v = document.querySelector('[data-viewport]'); v.scrollTop = Math.floor(v.scrollHeight * f); }", frac)
        pg.wait_for_timeout(300)
        shown = pg.evaluate(ROWS)
        if not t.ck(bool(shown), 'после прокрутки на %s строк на экране нет' % frac):
            continue
        first = shown[0][0]
        want = pg.evaluate("""async ([offset, n]) => {
          const q = await import('./app/pages/ocMenu/query.js');
          const st = await import('./app/pages/ocMenu/state.js');
          const r = await import('./app/kernel/router.js');
          const s = st.createState(); st.applyQueryToState(s, r.parse().query || {});
          return q.queryAll({ filter: st.queryFilter(s), sort: s.sort, offset, limit: n }).rows.map((x) => x.id); }""",
                           [first, len(shown)])
        t.ck([x[1] for x in shown] == want[:len(shown)],
             'строки на экране (с %d) не совпадают с выборкой реестра' % first)
