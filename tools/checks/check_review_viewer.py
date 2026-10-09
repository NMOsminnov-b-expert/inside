# -*- coding: utf-8 -*-
"""Просмотрщик и ящик заметок: исправления по код-ревью 09.10.2026.

docs/kod-revyu.xlsx, очередь 1. Что ловит сценарий:
  * выделенные страницы документа A остаются выделенными у документа B —
    Ctrl+Shift+D убирал страницы не того документа (ctx.ui.pageSel на весь
    модуль, kernel/viewer/state.js syncPageSel);
  * крестик на миниатюре убирает страницу без вопроса (решение пользователя
    09.10.2026: спрашивать, как пункт меню);
  * перетаскивание файла на карточку работает только в нежилом здании — в
    квартире браузер открывает файл вместо макета (kernel/viewer/files.js);
  * после ухода на вкладку без ящика заметок и возврата кнопки заметок не
    работают (флаг в dataset корня ящика, shell/shell.js setDrawer).
"""
from check_civil_viewer_docs import _pdf

NAME = 'просмотрщик и заметки: ревью'

TOUCHES = (
    'app/kernel/viewer/state.js', 'app/kernel/viewer/shell.js', 'app/kernel/viewer/docActions.js',
    'app/kernel/viewer/ctrl.js', 'app/kernel/viewer/files.js', 'app/kernel/viewer/popout.js',
    'app/shell/shell.js', 'app/kernel/boot.js', 'app/kernel/css.js',
    'app/modules/civil/parts/notes/ctrl.js', 'app/modules/apartment/parts/notes/ctrl.js',
)

OC = '#/oc/civil/oc-cv-1'

DRAGOVER = """() => {
  const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array([37, 80, 68, 70])], 'x.pdf', { type: 'application/pdf' }));
  const e = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
  document.querySelector('#content').dispatchEvent(e);
  return e.defaultPrevented;
}"""


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1600, 'height': 900})

    # --- два документа: выделение не переходит на другой --------------------------
    t.open(OC, wait='.viewer')
    with pg.expect_file_chooser() as fc:
        pg.locator('.vdrop-card [data-vattach]').click()
    fc.value.set_files([
        {'name': 'Техпаспорт А.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf(3, 'A')},
        {'name': 'Договор Б.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf(3, 'B')},
    ])
    t.wait_for('.vattach-row')
    pg.click('[data-att-ok]')
    t.wait_for('.vstage canvas.ready', timeout=15000)
    t.wait_until("() => document.querySelectorAll('[data-vthumb]').length === 3")
    pg.locator('[data-vthumb="2"]').click(modifiers=['Control'])
    pg.locator('[data-vthumb="3"]').click(modifiers=['Control'])
    t.wait_until("() => document.querySelectorAll('[data-vthumb].sel, [data-vthumb].selected, [data-vthumb][aria-selected=\"true\"]').length >= 2")
    pg.locator('.vtabs-list .vtab').nth(1).click()
    t.wait_until("() => document.querySelector('.vtab.active .vtab-t').textContent.includes('Договор')")
    t.wait_until("() => document.querySelectorAll('[data-vthumb]').length === 3")
    sel = pg.evaluate("""() => document.querySelectorAll('[data-vthumb].sel, [data-vthumb].selected, [data-vthumb][aria-selected="true"]').length""")
    t.ck(sel == 0, 'выделение страниц перешло на другой документ: %d' % sel)

    # --- крестик на миниатюре — с вопросом ---------------------------------------------
    pg.locator('[data-vthumb="2"]').hover()
    pg.locator('[data-vdelpage="2"]').click(force=True)
    t.ck(t.wait_for('.modal-back [data-modal-ok]', timeout=3000), 'крестик на миниатюре убрал страницу без вопроса')
    if pg.locator('.modal-back [data-modal-cancel]').count():
        pg.click('.modal-back [data-modal-cancel]')
    t.ck(pg.locator('[data-vthumb]').count() == 3, 'после отмены страниц не три')

    # --- ящик заметок после вкладки без ящика ---------------------------------------
    t.open(OC + '?tab=photo', wait='#photoSections')
    t.open(OC, wait='.viewer')
    t.wait_for('#drawerNotes [data-note-add]')
    before = pg.evaluate("""async () => { const s = await import('./app/modules/civil/data/store.js');
      return JSON.stringify(s.getRecord('oc-cv-1').notes || {}).length; }""")
    pg.evaluate("() => document.querySelector('#drawerNotes [data-note-add]').click()")
    after = pg.evaluate("""async () => { const s = await import('./app/modules/civil/data/store.js');
      return JSON.stringify(s.getRecord('oc-cv-1').notes || {}).length; }""")
    t.ck(after > before, 'после возврата на вкладку «+ Заметка» не работает')

    # --- перетаскивание файла в квартире ---------------------------------------------
    t.open('#/oc/apartment/oc-ap-1', wait='.card')
    t.ck(pg.evaluate(DRAGOVER), 'в квартире перетаскивание файла не перехвачено — браузер откроет файл')
