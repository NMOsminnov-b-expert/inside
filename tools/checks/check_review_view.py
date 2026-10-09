# -*- coding: utf-8 -*-
"""Вид экрана: как закрыли — так и открылось.

Решение пользователя 09.10.2026 по код-ревью: «Вот в каком виде мы страницу
закрываем, в таком же она потом должна открываться. Относится ко всей
динамике по всему макету» (kernel/viewState.js).

Что ловит сценарий:
  * квартира: просмотрщик, закрытый крестиком, после перезагрузки снова открыт
    (у квартиры, дома и участка не сохранялся и открывался на каждой записи);
  * ТС: свёрнутый блок после перезагрузки развёрнут (состояние жило внутри
    монтирования модуля);
  * учреждения: выбранный узел после перезагрузки не выбран;
  * документы: набранный поиск после перезагрузки пуст;
  * блок карточки ОЦ, свёрнутый по заголовку, разворачивается обратно при
    любой перерисовке и после перезагрузки (класс в разметке, нигде не
    запомненный); в ОЦ «Механизмы» стрелки блоков не работали вовсе
    (kernel/cardToggle.js);
  * раздел карточки документа («Метаданные») после перезагрузки снова развёрнут;
  * растянутая панель дерева учреждений после перезагрузки снова 320 px
    (ширины на страницах жили в переменных модуля и не сохранялись);
  * просмотрщик: после перезагрузки документ открыт не на той странице и не в
    том масштабе (состояние просмотрщика VS не сохранялось).
"""
from check_civil_viewer_docs import _pdf
NAME = 'вид экрана после перезагрузки'

TOUCHES = ('app/kernel/viewState.js', 'app/kernel/cardToggle.js', 'app/modules/civil/index.js', 'app/modules/apartment/data/store.js', 'app/modules/vehicle/index.js',
           'app/modules/mechanisms/index.js', 'app/pages/institutions/institutions.js', 'app/pages/docs/docs.js',
           'app/pages/dicts/dicts.js', 'app/pages/archive/archive.js', 'app/pages/docs/detail.js', 'app/kernel/viewer/state.js')


def reload(t, wait):
    t.page.evaluate("async () => (await import('./app/kernel/persist.js')).saveNow()")
    t.page.reload()
    t.wait_for(wait)


def run(t):
    pg = t.page

    # --- квартира: закрытый просмотрщик ---------------------------------------------
    t.open('#/oc/apartment/oc-ap-1', wait='[data-vclose]')
    pg.click('[data-vclose]')
    t.wait_until("() => !document.querySelector('[data-vclose]')")
    reload(t, '.card')
    t.ck(pg.locator('[data-vclose]').count() == 0, 'квартира: закрытый просмотрщик после перезагрузки снова открыт')

    # --- ТС: свёрнутый блок -------------------------------------------------------------
    t.open('', wait='.reg-tr')
    pg.click('.reg-create [data-dd-toggle]')
    pg.click('.reg-create [data-create="vehicle"]')
    t.wait_for('[data-ts-cat]')
    pg.select_option('[data-ts-cat]', 'Легковое')
    t.wait_for('[data-ts-acc="Регистрационный учёт"]')
    pg.locator('[data-ts-acc="Регистрационный учёт"] h3').click()
    t.wait_until("() => document.querySelector('[data-ts-acc=\"Регистрационный учёт\"]').getAttribute('aria-expanded') === 'false'")
    reload(t, '[data-ts-acc="Регистрационный учёт"]')
    t.ck(pg.get_attribute('[data-ts-acc="Регистрационный учёт"]', 'aria-expanded') == 'false',
         'ТС: свёрнутый блок после перезагрузки развёрнут')

    # --- учреждения: выбранный узел --------------------------------------------------
    t.open('#/institutions', wait='.itree-row[data-inode]')
    row = pg.locator('.itree-row[data-inode]').nth(2)
    nid = row.get_attribute('data-inode')
    row.locator('.itree-name').click()
    t.wait_until("(id) => !!document.querySelector('.itree-row.on[data-inode=\"' + id + '\"]')", nid)
    pg.evaluate("() => { location.hash = '#/'; }")
    t.wait_for('.reg-tr')
    reload(t, '.reg-tr')
    t.open('#/institutions', wait='.itree-row[data-inode]')
    t.ck(pg.locator('.itree-row.on[data-inode="%s"]' % nid).count() == 1, 'учреждения: выбранный узел не восстановлен')

    # --- документы: поиск -----------------------------------------------------------------
    t.open('#/docs', wait='[data-docs-q]')
    pg.fill('[data-docs-q]', 'техпаспорт')
    pg.wait_for_timeout(400)
    reload(t, '[data-docs-q]')
    t.ck(pg.input_value('[data-docs-q]') == 'техпаспорт', 'документы: поиск после перезагрузки пуст')

    # --- свёрнутый блок карточки ОЦ: перерисовка и перезагрузка -------------------
    closed = "() => document.querySelector('[data-card-toggle]').closest('.card').classList.contains('collapsed')"
    t.open('#/oc/civil/oc-cv-1', wait='[data-card-toggle]')
    pg.locator('[data-card-toggle] h3').first.click()
    t.ck(t.wait_until(closed), 'нежилое здание: блок не свернулся по заголовку')
    pg.evaluate("() => window.dispatchEvent(new Event('inside:redraw'))")
    pg.wait_for_timeout(600)
    t.ck(pg.evaluate(closed), 'нежилое здание: свёрнутый блок развернулся при перерисовке')
    reload(t, '[data-card-toggle]')
    t.ck(pg.evaluate(closed), 'нежилое здание: свёрнутый блок развернулся после перезагрузки')

    # --- ОЦ «Механизмы»: стрелки блоков работают -----------------------------------
    t.open('', wait='.reg-tr')
    pg.click('.reg-create [data-dd-toggle]')
    pg.click('.reg-create [data-create="mechanisms"]')
    t.wait_for('[data-card-toggle]')
    pg.locator('[data-card-toggle] h3').first.click()
    t.ck(t.wait_until(closed), 'ОЦ «Механизмы»: блок не сворачивается по заголовку')

    # --- карточка документа: свёрнутый раздел ---------------------------------------
    t.open('#/docs', wait='[data-doc-row]')
    pg.locator('[data-doc-row]').first.click()
    t.wait_for('[data-dd-sec="Метаданные"]')
    pg.click('[data-dd-sec="Метаданные"] [data-dd-toggle]')
    sec = "() => document.querySelector('[data-dd-sec=\"Метаданные\"]').classList.contains('collapsed')"
    t.ck(t.wait_until(sec), 'документ: раздел «Метаданные» не свернулся')
    reload(t, '[data-dd-sec="Метаданные"]')
    t.ck(pg.evaluate(sec), 'документ: свёрнутый раздел после перезагрузки развёрнут')

    # --- учреждения: растянутая панель дерева ----------------------------------------
    t.open('#/institutions', wait='[data-ipanel-grip]')
    w0 = pg.evaluate("() => document.querySelector('.ipanel').getBoundingClientRect().width")
    box = pg.locator('[data-ipanel-grip]').bounding_box()
    pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + 40)
    pg.mouse.down()
    pg.mouse.move(box['x'] + box['width'] / 2 + 120, box['y'] + 40, steps=6)
    pg.mouse.up()
    w1 = pg.evaluate("() => document.querySelector('.ipanel').getBoundingClientRect().width")
    t.ck(w1 > w0 + 60, 'учреждения: панель дерева не растянулась: %s → %s' % (w0, w1))
    reload(t, '[data-ipanel-grip]')
    w2 = pg.evaluate("() => document.querySelector('.ipanel').getBoundingClientRect().width")
    t.ck(abs(w2 - w1) < 3, 'учреждения: ширина панели дерева не сохранилась: %s → %s' % (w1, w2))

    # --- просмотрщик: страница и масштаб документа -------------------------------------
    t.open('#/oc/civil/oc-cv-2', wait='.viewer')
    with pg.expect_file_chooser() as fc:
        pg.locator('[data-vattach]:visible').first.click()
    fc.value.set_files([{'name': 'Вид.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf(12, 'V')}])
    t.wait_for('[data-att-ok]')
    pg.click('[data-att-ok]')
    t.wait_for('.vstage canvas.ready', timeout=15000)
    pg.locator('.vstage').click(position={'x': 40, 'y': 40})
    pg.keyboard.press('Control+Equal')
    # Шаги по очереди, как у человека: масштаб применился и лента
    # перерисовалась — только потом переход на страницу.
    t.wait_until("""async () => (await import('./app/kernel/viewer/state.js')).VS.zoom !== 100""")
    t.wait_for('.vstage canvas.ready')
    pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('[data-vthumb=\"10\"]').click()")
    VS = """async () => { const v = (await import('./app/kernel/viewer/state.js')).VS;
      const vd = (await import('./app/modules/civil/data/store.js')).ui.viewerDoc;
      return { zoom: v.zoom, page: vd && v.docs[vd.id] ? v.docs[vd.id].page : 0 }; }"""
    # Переход — плавной прокруткой (около секунды): просмотрщик сразу ставит
    # страницу 10, по ходу прокрутки показывает промежуточные и снова 10 в
    # конце. Ждём, пока лента остановится на десятой. Условие ожидания —
    # обычная функция: асинхронную Playwright не дожидается.
    pg.evaluate("""async () => { window.__vs = (await import('./app/kernel/viewer/state.js')).VS;
      window.__ui = (await import('./app/modules/civil/data/store.js')).ui; window.__y = -1; }""")
    t.ck(t.wait_until("""() => { const vd = window.__ui.viewerDoc; const st = vd && window.__vs.docs[vd.id];
      const y = document.querySelector('[data-vstage]').scrollTop; const still = y === window.__y; window.__y = y;
      return !!st && st.page === 10 && still; }"""), 'просмотрщик: лента не остановилась на 10-й странице')
    before = pg.evaluate(VS)
    t.ck(before['page'] == 10 and before['zoom'] != 100, 'просмотрщик: не перешёл на 10-ю страницу или масштаб не изменился: %s' % before)
    reload(t, '.viewer')
    after = pg.evaluate(VS)
    t.ck(after == before, 'просмотрщик: после перезагрузки другая страница или масштаб: %s → %s' % (before, after))
