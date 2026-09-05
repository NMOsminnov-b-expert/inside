# -*- coding: utf-8 -*-
"""Значки состояния и сортировка по ним.

Две вещи, сломанные до 2026-09-02:
  * у записи с непроверенным импортом ML висели ДВА значка «ML» подряд —
    поднимались и ml, и mlUnverified (пользователь: «это дубли»);
  * сортировка по столбцу «Теги» в реестре молча подменялась сортировкой по
    дате: сводный запрос не знал флажковых компараторов. На первом экране это
    было незаметно, а вглубь списка порядок разъезжался.
"""
NAME = 'значки и сортировка'


def _bulk(t, n='20000'):
    pg = t.page
    t.open('', wait='.reg-thead')
    pg.select_option('[data-bulk-count]', n)
    t.wait(2600)


def run(t):
    pg = t.page
    _bulk(t)

    # --- один значок ML вместо двух ---
    info = pg.evaluate("""() => {
      let two = 0;
      const rows = [...document.querySelectorAll('.reg-tr')];
      rows.forEach((r) => { if (r.querySelectorAll('.reg-badge.ml').length > 1) two++; });
      const sp = document.querySelector('.reg-badge.spec');
      const ml = document.querySelector('.reg-badge.ml');
      const bg = (el) => el ? getComputedStyle(el).backgroundColor : null;
      return {rows: rows.length, two, spec: bg(sp), ml: bg(ml)};
    }""")
    t.ck(info['rows'] > 0, 'в реестре не отрисовано ни одной строки')
    t.ck(info['two'] == 0, 'на записи два значка ML одновременно (строк: %d)' % info['two'])
    t.ck(info['spec'] and info['ml'] and info['spec'] != info['ml'],
         'значок особенностей совпадает по цвету с ML (%s / %s)' % (info['spec'], info['ml']))

    # --- сортировка по флажку не рвётся вглубь списка ---
    pg.locator('[data-cols-dd]').first.click()
    t.wait(350)
    tags = pg.locator('[data-column="tags"]')
    if t.ck(tags.count() > 0, 'в меню столбцов нет столбца «Теги»'):
        tags.first.click()
        t.wait(400)
    pg.keyboard.press('Escape')
    t.wait(300)

    th = pg.locator('[data-sort="specials"]')
    if not t.ck(th.count() > 0, 'столбец «Теги» не сортируемый'):
        return
    th.first.click()
    t.wait(900)

    def flagged_at(frac):
        pg.evaluate("""(f) => { const vp = document.querySelector('[data-viewport]');
            vp.scrollTop = vp.scrollHeight * f; }""", frac)
        t.wait(700)
        return pg.evaluate("""() => {
          const rows = [...document.querySelectorAll('.reg-tr')].slice(0, 20);
          return rows.filter((r) => r.querySelector('.reg-badge.spec')).length;
        }""")

    # Отмеченных заведомо больше, чем помещается на четверти списка, поэтому до
    # 25 % глубины все двадцать строк должны быть с отметкой.
    for frac in (0, 0.1, 0.25):
        n = flagged_at(frac)
        t.ck(n == 20, 'сортировка по флажку рвётся на глубине %d%%: отмечено %d из 20'
             % (int(frac * 100), n))

    # --- выгрузка со столбцом «Теги» не падает ---
    before = len(t.console)
    with pg.expect_download(timeout=20000) as dl:
        pg.locator('[data-export]').first.click()
    path = dl.value.path()
    t.ck(bool(path), 'выгрузка не сформировалась')
    t.ck(len(t.console) == before, 'выгрузка со столбцом «Теги» дала ошибку в консоли')
