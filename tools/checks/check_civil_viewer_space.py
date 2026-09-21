# -*- coding: utf-8 -*-
"""Просмотрщик гражданского здания: площадь под лист.

Задача пользователя 21.09.2026: «у просмотрщика довольно мало полезной
площади … просмотр документов — основное, с чем работает ЦОД и оценка». До
правки лист был зажат в 430px, над ним стояли три полосы (119px), и на экране
1600×900 страница занимала 18% площади. Сценарий держит то, что легко вернуть
обратно правкой стилей или разметки:

  * над листом ОДНА панель: полос «режимы» и «инструменты» по отдельности
    нет; строка вкладок с «+» одна и тонкая;
  * «по ширине» — лист во всю ширину ленты; «целиком» — лист помещается по
    высоте; 100% масштаба — выбранный режим;
  * смена режима «документы / фото» возвращает масштаб к 100%;
  * миниатюры прячутся кнопкой в панели, и лента забирает их место;
  * F — режим раскрытия: документ слева во всю высоту окна (лента не ниже
    85% высоты), шапка сайта и карточка сдвинуты вправо и не перекрыты
    (решение пользователя 21.09.2026); Esc снимает режим, не закрывая
    просмотрщик;
  * Shift+F — во весь экран поверх карточки, Esc возвращает;
  * отдельное окно: документ открывается во втором окне, в карточке остаётся
    полоса-заглушка, клавиши листают в окне, «Вернуть» закрывает окно и
    возвращает просмотрщик в карточку;
  * в раскрытии шапка ОЦ и блоки карточки стоят по одному краю, а в карточке
    ОИ между блоками есть промежуток (замечания пользователя 21.09.2026);
  * увеличенный лист двигается мышью;
  * на экране 1600×900 страница занимает не меньше четверти площади.
"""

NAME = 'просмотрщик: площадь'

TOUCHES = (
    'app/modules/civil/parts/viewer/*', 'app/modules/civil/module.css',
    'app/modules/civil/card/ocCard.view.js',
)

OC = '#/oc/civil/oc-cv-1'


def _pdf(pages=4):
    """Минимальный многостраничный PDF формата A4 — без бинаря в репозитории."""
    objs = ['1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj']
    kids = ' '.join('%d 0 R' % (3 + i * 2) for i in range(pages))
    objs.append('2 0 obj<</Type/Pages/Kids[%s]/Count %d>>endobj' % (kids, pages))
    for i in range(pages):
        pid, cid = 3 + i * 2, 4 + i * 2
        objs.append('%d 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents %d 0 R>>endobj' % (pid, cid))
        stream = 'BT /F1 28 Tf 60 760 Td (Str %d) Tj ET' % (i + 1)
        objs.append('%d 0 obj<</Length %d>>stream\n%s\nendstream endobj' % (cid, len(stream), stream))
    return ('%PDF-1.4\n' + '\n'.join(objs) + '\ntrailer<</Root 1 0 R>>\n%%EOF\n').encode('latin-1')


GEOM = """() => {
  const b = (s) => { const e = document.querySelector(s); if (!e) return null;
    const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; };
  const stage = document.querySelector('.vstage');
  const cs = stage && getComputedStyle(stage);
  return {
    stageW: stage ? stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : 0,
    stageH: stage ? stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) : 0,
    page: b('.vribbon .vpage'), rail: b('.vrail'), viewer: b('.viewer'),
    zoom: (document.querySelector('[data-zoomlabel]') || {}).textContent,
    full: !!document.querySelector('.viewer.is-full'),
    share: (() => { const p = b('.vribbon .vpage'); return p ? Math.min(p.h, innerHeight) * p.w / (innerWidth * innerHeight) : 0; })(),
  };
}"""


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1600, 'height': 900})

    t.open(OC, wait='.viewer')
    with pg.expect_file_chooser() as fc:
        pg.locator('.vdrop-card [data-vattach]').click()
    fc.value.set_files({'name': 'tekhpasport.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf()})
    t.wait_for('[data-att-ok]')
    pg.click('[data-att-ok]')
    t.wait_for('.vstage canvas.ready', timeout=15000)

    # --- одна панель ---------------------------------------------------------------
    t.ck(pg.locator('.viewer .vbar').count() == 1, 'над листом нет общей панели')
    t.ck(pg.locator('.viewer .vmode, .viewer .vtoolbar').count() == 0,
         'вернулись отдельные полосы режимов и инструментов')
    # Строка вкладок видна всегда — с «+» (требование пользователя 21.09.2026:
    # «нет возможности открыть ещё один документ»); она тонкая, 31px.
    t.ck(pg.locator('.viewer .vtabs .vtab').count() == 1 and pg.locator('.viewer .vtab-plus').count() == 1,
         'нет строки вкладок с кнопкой «+»')

    # --- по ширине -----------------------------------------------------------------
    g = pg.evaluate(GEOM)
    t.ck(g['page'] and abs(g['page']['w'] - g['stageW']) <= 2,
         'лист не во всю ширину ленты: лист %s, лента %s' % (g['page'] and round(g['page']['w']), round(g['stageW'])))
    t.ck(g['share'] >= 0.25, 'страница занимает меньше четверти экрана: %.0f%%' % (g['share'] * 100))

    # --- целиком -------------------------------------------------------------------
    pg.click('[data-vfit="page"]')
    t.wait_until("() => document.querySelector('.vribbon').classList.contains('fit-page')")
    g = pg.evaluate(GEOM)
    t.ck(g['page']['h'] <= g['stageH'] + 2, 'лист «целиком» не помещается по высоте: %s из %s'
         % (round(g['page']['h']), round(g['stageH'])))
    t.ck(g['zoom'] == '100%', 'режим вписывания не вернул масштаб 100%%: %s' % g['zoom'])

    # --- миниатюры ------------------------------------------------------------------
    pg.click('[data-vfit="width"]')
    t.wait_until("() => document.querySelector('.vribbon').classList.contains('fit-width')")
    before = pg.evaluate(GEOM)['stageW']
    pg.click('.vbar [data-vrail-toggle]')
    t.wait_until("() => !document.querySelector('.vrail')")
    g = pg.evaluate(GEOM)
    t.ck(g['stageW'] > before + 80, 'лента не забрала место миниатюр: %s → %s' % (round(before), round(g['stageW'])))
    t.ck(abs(g['page']['w'] - g['stageW']) <= 2, 'после скрытия миниатюр лист не растянулся по ширине')
    pg.click('.vbar [data-vrail-toggle]')
    t.wait_for('.vrail')

    # --- раскрытие: документ во всю высоту, карточка справа ----------------------------
    pg.keyboard.press('KeyF')
    t.wait_until("() => document.body.classList.contains('civil-dock')")
    t.wait(300)
    dock = pg.evaluate("""() => {
      const v = document.querySelector('.viewer').getBoundingClientRect();
      const s = document.querySelector('.vstage').getBoundingClientRect();
      const top = document.querySelector('.topbar .crumbs').getBoundingClientRect();
      const head = document.querySelector('[data-oc-head]').getBoundingClientRect();
      return { stageH: s.height, vr: v.right, crumbsL: top.left, headL: head.left };
    }""")
    t.ck(dock['stageH'] >= 0.85 * 900, 'в раскрытии лента ниже 85%% высоты: %s px' % round(dock['stageH']))
    t.ck(dock['crumbsL'] >= dock['vr'] and dock['headL'] >= dock['vr'],
         'шапка сайта или шапка ОЦ заходит под документ в раскрытии')
    # Шапка и блоки карточки — по одному краю (замечание пользователя
    # 21.09.2026: «ширина не совпадает у блоков 01, 02, 03 и шапки»).
    edge = pg.evaluate("""() => {
      const h = document.querySelector('[data-oc-head] .oc-head-top').getBoundingClientRect();
      const c = document.querySelector('.grow .card').getBoundingClientRect();
      return [Math.round(h.left), Math.round(c.left), Math.round(h.right), Math.round(c.right)];
    }""")
    t.ck(abs(edge[0] - edge[1]) <= 1 and abs(edge[2] - edge[3]) <= 1,
         'в раскрытии шапка и блоки не по одному краю: %s' % edge)
    pg.keyboard.press('Escape')
    t.wait_until("() => !document.body.classList.contains('civil-dock')")
    t.ck(pg.locator('.viewer').count() == 1, 'Esc из раскрытия закрыл просмотрщик')

    # --- во весь экран ----------------------------------------------------------------
    pg.keyboard.press('Shift+KeyF')
    t.wait_for('.viewer.is-full')
    g = pg.evaluate(GEOM)
    t.ck(g['viewer']['w'] >= 1500 and g['viewer']['h'] >= 850,
         'во весь экран просмотрщик не занял окно: %s×%s' % (round(g['viewer']['w']), round(g['viewer']['h'])))
    t.ck(abs(g['page']['w'] - g['stageW']) <= 2, 'во весь экран лист не пересчитан по новой ширине')

    # --- увеличение и перетаскивание ---------------------------------------------------
    for _ in range(3):
        pg.keyboard.press('+')
    t.wait_until("() => document.querySelector('[data-zoomlabel]').textContent === '130%'")
    stage = pg.locator('.vstage').bounding_box()
    x0 = pg.evaluate("document.querySelector('.vstage').scrollLeft")
    cx, cy = stage['x'] + stage['width'] / 2, stage['y'] + stage['height'] / 2
    pg.mouse.move(cx, cy)
    pg.mouse.down()
    pg.mouse.move(cx - 120, cy - 120, steps=5)
    pg.mouse.up()
    x1 = pg.evaluate("document.querySelector('.vstage').scrollLeft")
    t.ck(x1 > x0 + 60, 'увеличенный лист не двигается мышью: прокрутка %s → %s' % (x0, x1))

    pg.keyboard.press('Escape')
    t.wait_until("() => !document.querySelector('.viewer.is-full')")
    t.ck(pg.locator('.viewer').count() == 1, 'Esc из полноэкранного режима закрыл просмотрщик')

    # --- смена режима сбрасывает масштаб --------------------------------------------------
    pg.click('[data-vmode="photo"]')
    t.wait_until("() => document.querySelector('[data-vmode=\"photo\"]').classList.contains('active')")
    zoom = pg.evaluate("(document.querySelector('[data-zoomlabel]') || {}).textContent || '100%'")
    t.ck(zoom == '100%', 'фото открылись с масштабом документа: %s' % zoom)

    # --- отдельное окно -------------------------------------------------------------------
    pg.click('[data-vmode="doc"]')
    t.wait_for('.vstage canvas')
    with pg.context.expect_page() as info:
        pg.click('[data-vpopout]')
    pop = info.value
    pop.wait_for_selector('.vstage canvas.ready', timeout=15000)
    t.ck(pg.locator('.viewer.vpop-stub').count() == 1, 'в карточке нет полосы «Документ в отдельном окне»')
    t.ck(pop.locator('[data-vpageblk]').count() == 4, 'в окне не все страницы документа')
    pop.keyboard.press('End')
    pop.wait_for_function("() => document.querySelector('[data-vpage]').value !== '1'")
    t.ck(pop.eval_on_selector('[data-vpage]', 'e => e.value') != '1', 'клавиши в окне не листают документ')
    pop.click('[data-vpop-back]')
    t.wait_until("() => !!document.querySelector('.viewer:not(.vpop-stub) .vstage')")
    t.ck(pop.is_closed(), '«Вернуть» не закрыл окно просмотра')

    # --- карточка ОИ: промежутки между блоками ----------------------------------------------
    t.open(OC, wait='tr[data-open-oi]')
    pg.locator('tr[data-open-oi]').first.click()
    t.wait_for('.oi-stack > .card + .card')
    gaps = pg.evaluate("""() => { const c = [...document.querySelectorAll('.oi-stack > .card')];
      return c.slice(1).map((n, i) => Math.round(n.getBoundingClientRect().top - c[i].getBoundingClientRect().bottom)); }""")
    t.ck(gaps and min(gaps) >= 10, 'в карточке ОИ блоки стоят вплотную: %s' % gaps)
