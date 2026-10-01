# -*- coding: utf-8 -*-
"""Просмотрщик одинаково работает во всех модулях ОЦ.

Что ловит сценарий (найдено 01.10.2026, замечание пользователя «Баги с
просмотрщиком… Не переносится при сворачивании сайдбара, режим в отдельном окне
не отображает документы. Проверь тщательно модуль»):

  * отдельное окно открывалось пустым везде, кроме civil: окно перерисовывал
    только модуль civil (renderPopout в своём index.js). Теперь это делает
    kernel/viewer/ctrl.js bindViewer — для всех модулей;
  * в режиме раскрытия колонка документа не ехала за свёрнутым боковым меню в
    ТС, механизмах, квартире, жилом доме, участке: наблюдатель за областью
    приложения (dock.js watchDockArea) подключал только civil. Теперь — тоже
    bindViewer.

Модули проверяются по очереди: ТС и механизмы — новой записью, остальные —
записью из примеров.
"""
import base64

NAME = 'просмотрщик во всех модулях'

TOUCHES = (
    'app/kernel/viewer/*', 'app/kernel/viewer.css',
    'app/modules/*/index.js', 'app/modules/*/ctrl.js',
)


def _pdf(pages, label):
    objs = ['1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj']
    kids = ' '.join('%d 0 R' % (3 + i * 2) for i in range(pages))
    objs.append('2 0 obj<</Type/Pages/Kids[%s]/Count %d>>endobj' % (kids, pages))
    for i in range(pages):
        pid, cid = 3 + i * 2, 4 + i * 2
        objs.append('%d 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents %d 0 R>>endobj' % (pid, cid))
        stream = 'BT /F1 28 Tf 60 760 Td (%s %d) Tj ET' % (label, i + 1)
        objs.append('%d 0 obj<</Length %d>>stream\n%s\nendstream endobj' % (cid, len(stream), stream))
    return ('%PDF-1.4\n' + '\n'.join(objs) + '\ntrailer<</Root 1 0 R>>\n%%EOF\n').encode('latin-1')


MODULES = [
    ('ТС', None, 'vehicle'),
    ('механизмы', None, 'mechanisms'),
    ('гражданское', '#/oc/civil/oc-cv-1', None),
    ('квартира', '#/oc/apartment/oc-ap-1', None),
    ('жилой дом', '#/oc/residential-house/oc-rh-1', None),
    ('участок', '#/oc/land-plot/oc-lp-1', None),
]

LEFT = "() => [Math.round(document.querySelector('.viewer').getBoundingClientRect().left), Math.round(document.querySelector('.main').getBoundingClientRect().left)]"


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1600, 'height': 1000})
    for name, route, create in MODULES:
        if create:
            t.open('', wait='[data-create]')
            pg.locator('.dd [data-dd-toggle]').filter(has_text='Создать ОЦ').click()
            pg.click('[data-create="%s"]' % create)
        else:
            t.open(route, wait='.viewer')
        t.wait_for('.viewer')

        # --- режим раскрытия и свёрнутое меню ---------------------------------------
        if pg.locator('[data-vdock]').count():
            pg.locator('[data-vdock]').first.click()
            t.wait_until("() => document.body.classList.contains('viewer-dock')")
            pg.click('[data-sidebar-toggle]')
            t.wait_until("() => document.getElementById('appSidebar').classList.contains('collapsed')")
            # Колонка стоит у левого края области приложения (8px отступ) — по
            # факту: ждём, пока меню доедет.
            ok = t.wait_until("() => { const v = document.querySelector('.viewer').getBoundingClientRect().left, m = document.querySelector('.main').getBoundingClientRect().left; return m < 100 && Math.abs(v - m - 8) <= 2; }")
            t.ck(ok, '%s: колонка раскрытия не поехала за свёрнутым меню: viewer/main %s' % (name, pg.evaluate(LEFT)))
            pg.click('[data-sidebar-toggle]')
            t.wait_until("() => !document.getElementById('appSidebar').classList.contains('collapsed')")
            pg.locator('[data-vdock]').first.click()
            t.wait_until("() => !document.body.classList.contains('viewer-dock')")
        else:
            t.ck(False, '%s: нет кнопки режима раскрытия' % name)

        # --- отдельное окно показывает документ --------------------------------------
        if pg.locator('.vdrop-card [data-vattach]').count():
            with pg.expect_file_chooser() as fc:
                pg.locator('.vdrop-card [data-vattach]').click()
            fc.value.set_files([{'name': 'Техпаспорт.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf(2, 'Tekh')}])
            t.wait_for('.vattach-row')
            pg.click('[data-att-ok]')
        t.wait_for('.vstage canvas.ready', timeout=15000)
        with pg.context.expect_page() as pi:
            pg.locator('[data-vpopout]').first.click()
        pop = pi.value
        try:
            pop.wait_for_selector('.vstage canvas.ready', timeout=15000)
            shown = True
        except Exception:
            shown = False
        t.ck(shown, '%s: в отдельном окне документ не показан: %s' % (
            name, pop.evaluate("() => (document.body.innerText || '').slice(0, 120)")))
        pop.close()
        t.wait_until("() => !document.querySelector('.vpop-stub')")
