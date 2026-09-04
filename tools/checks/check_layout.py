# -*- coding: utf-8 -*-
"""Раскладка: ничего не выходит за окно, значения не обрезаются, шапка читается.

Ловит дефекты, которые уже случались:
  * закладка заметок торчала за правый край на 4px — на каждом экране внизу
    висела горизонтальная полоса прокрутки;
  * шапка ОЦ при узком окне ужимала данные до «Г…», «А…», оставляя кнопки в
    полную ширину;
  * поля формы ОЦ при открытом просмотрщике сжимались до 150px и обрезали
    «Административный департамент», ФИО ответственных и код ЕНИ;
  * мансардная секция поэтажной развёртки не помещалась по ширине.
"""
NAME = 'раскладка'

SCREENS = [
    ('реестр', '', '.reg-thead'),
    ('карточка ОЦ', '#/oc/civil/oc-cv-1', '.card'),
    ('карточка ЗУ', '#/oc/land-plot/oc-lp-1', '.card'),
    ('архив', '#/archive', '.arc'),
]


def run(t):
    pg = t.page

    for width in (1600, 1366, 1152, 1024):
        pg.set_viewport_size({'width': width, 'height': 850})
        for name, route, wait in SCREENS:
            t.open(route, wait=wait)
            over = pg.evaluate(
                '() => document.documentElement.scrollWidth - document.documentElement.clientWidth')
            t.ck(over <= 1, '%dpx, %s: страница шире окна на %dpx' % (width, name, over))

        # шапка объекта оценки читается целиком
        t.open('#/oc/civil/oc-cv-1')
        cut = pg.evaluate("""() => {
          const out = [];
          document.querySelectorAll('.hm b').forEach((b) => {
            if (b.scrollWidth > b.clientWidth + 1) out.push(b.textContent.trim().slice(0, 20));
          });
          return out;
        }""")
        t.ck(not cut, '%dpx: в шапке ОЦ обрезаны значения: %s' % (width, cut))

        # поля формы редактирования не режут содержимое
        pg.locator('#btnEditOc').click()
        t.wait(600)
        clipped = pg.evaluate("""() => {
          let n = 0;
          document.querySelectorAll('.card .input').forEach((el) => {
            if (el.scrollWidth > el.clientWidth + 2) n++;
          });
          return n;
        }""")
        t.ck(clipped == 0, '%dpx: в форме ОЦ обрезано значений: %d' % (width, clipped))

    pg.set_viewport_size({'width': 1600, 'height': 1000})

    # поэтажная развёртка: помещается целиком, служебные колонки не режут
    # содержимое (у чекбокса дорисовывалось многоточие)
    t.open('#/oc/apartment/oc-ap-1')
    pg.locator('tr[data-open-oi]').first.click()
    t.wait(800)
    for head in pg.locator('.al:has([data-add-floor]) .acc-head').all():
        cls = head.evaluate('e => e.closest(".acc").className')
        if 'open' not in cls:
            head.click()
            t.wait(200)

    res = pg.evaluate("""() => {
      const out = [];
      document.querySelectorAll('.al').forEach((al) => {
        if (!al.querySelector('[data-add-floor]')) return;
        const body = al.querySelector('.acc-body');
        const table = body && body.querySelector('table');
        if (!table) return;
        const name = al.querySelector('.acc-head span:nth-of-type(2)');
        out.push({
          cat: (name ? name.textContent : '?').trim(),
          over: body.scrollWidth - body.clientWidth,
        });
      });
      return out;
    }""")
    for r in res:
        t.ck(r['over'] <= 1, 'развёртка, секция «%s»: не помещается на %dpx' % (r['cat'], r['over']))
