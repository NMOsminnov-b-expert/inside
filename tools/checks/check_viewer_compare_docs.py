# -*- coding: utf-8 -*-
"""Просмотрщик: сравнение двух документов.

Пожелание пользователей (переписка, 25.09.2026), принятое в макет: когда
открыто несколько документов, «Сравнение» сразу показывает ДВА документа —
основной (справа) и открытый перед ним (слева), а не просит выбрать второй;
вкладки в сравнении остаются, и щелчок по вкладке меняет документ слева;
вкладку можно перетащить в область просмотра — документ открывается вторым.

Сценарий держит:
  * одна вкладка — слева фото, как раньше;
  * три вкладки — слева открытый перед основным, вкладка слева помечена;
  * щелчок по вкладке в сравнении меняет левую колонку, основной не трогает;
  * кнопка «Фото» возвращает фото в левую колонку;
  * вкладка, брошенная на правую колонку, становится основной, а если она
    стояла слева — документы меняются местами;
  * в режиме «Документы» вкладка, брошенная на лист, включает сравнение и
    открывается слева.
"""

NAME = 'просмотрщик: сравнение документов'

TOUCHES = (
    'app/kernel/viewer/compare.js', 'app/kernel/viewer/state.js', 'app/kernel/viewer/docActions.js',
    'app/kernel/viewer/doc.js', 'app/kernel/viewer/shell.js', 'app/kernel/viewer/ctrl.js',
    'app/kernel/viewer/tabs.js', 'app/kernel/viewer.css',
)

OC = '#/oc/civil/oc-cv-1'

LEFT = "() => { const h = document.querySelector('[data-cmp-side=photo] .cmp-h'); return h ? h.textContent.replace(/\\s+/g, ' ').trim() : ''; }"
RIGHT = "() => { const h = document.querySelector('[data-cmp-side=doc] .cmp-h'); return h ? h.textContent.replace(/\\s+/g, ' ').trim() : ''; }"
PAIRED = "() => [...document.querySelectorAll('.vtab.paired .vtab-t')].map((t) => t.textContent)"

# Перетаскивание вкладки — событиями в странице (как в check_civil_viewer_docs):
# настоящий drag в прогоне проверок иногда не завершается.
DROP = """([tabText, target]) => {
  const tab = [...document.querySelectorAll('.vtabs-list .vtab')].find((t) => t.textContent.includes(tabText));
  const dst = document.querySelector(target);
  if (!tab || !dst) return 'нет ' + (!tab ? 'вкладки' : 'цели');
  const dt = new DataTransfer();
  tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  const r = dst.getBoundingClientRect();
  const at = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  dst.dispatchEvent(new DragEvent('dragover', at));
  const lit = dst.classList.contains('vtab-drop');
  dst.dispatchEvent(new DragEvent('drop', at));
  tab.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  return lit ? 'ok' : 'зона не подсветилась';
}"""


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


def _attach(t, files):
    pg = t.page
    btn = pg.locator('.vdrop-card [data-vattach]')
    if btn.count():
        with pg.expect_file_chooser() as fc:
            btn.click()
    else:
        pg.locator('.vtab-plus').click()
        with pg.expect_file_chooser() as fc:
            pg.locator('.vtab-add .dd-menu [data-vattach]').click()
    fc.value.set_files(files)
    t.wait_for('.vattach-row')
    pg.click('[data-att-ok]')
    t.wait_for('.vstage canvas.ready', timeout=15000)


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1600, 'height': 900})
    t.open(OC, wait='.viewer')

    # --- одна вкладка: слева фото -----------------------------------------------------
    _attach(t, [{'name': 'Техпаспорт литера А.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf(2, 'Tekh')}])
    pg.click('[data-vmode="compare"]')
    t.wait_for('[data-cmp]')
    t.ck('ФОТО' in pg.evaluate(LEFT), 'при одной вкладке слева не фото: %r' % pg.evaluate(LEFT))
    t.ck(pg.locator('.vtabs-list .vtab').count() == 1, 'в сравнении пропали вкладки')

    # --- три вкладки: слева открытый перед основным --------------------------------------
    pg.click('[data-vmode="doc"]')
    _attach(t, [
        {'name': 'Гос акт на землю.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf(2, 'Akt')},
        {'name': 'Договор купли.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf(1, 'Dog')},
    ])
    # открыт первый из прикреплённых (Гос. акт); перед ним смотрели техпаспорт
    pg.locator('.vtabs-list .vtab', has_text='ПУД').click()
    t.wait_until("() => document.querySelector('.vtab.active').textContent.includes('ПУД')")
    pg.click('[data-vmode="compare"]')
    t.wait_for('[data-cmp]')
    t.wait_until("() => document.querySelectorAll('[data-cmp-side] canvas.ready').length >= 2", timeout=15000)
    t.ck('ПУД' in pg.evaluate(RIGHT), 'справа не основной документ: %r' % pg.evaluate(RIGHT))
    t.ck('Гос. акт' in pg.evaluate(LEFT), 'слева не открытый перед основным: %r' % pg.evaluate(LEFT))
    t.ck(pg.evaluate(PAIRED) == ['ОЦ · Гос. акт на землю'], 'вкладка для сравнения не помечена: %s' % pg.evaluate(PAIRED))
    t.ck(pg.locator('.vtabs-list .vtab').count() == 3, 'в сравнении не все вкладки')
    t.ck('Два документа' in pg.inner_text('.vbar .vtitle'), 'заголовок сравнения не про два документа')

    # --- щелчок по вкладке меняет левую колонку ------------------------------------------
    pg.locator('.vtabs-list .vtab', has_text='Техпаспорт').click()
    t.wait_until("() => document.querySelector('[data-cmp-side=photo] .cmp-h').textContent.includes('Техпаспорт')")
    t.ck('ПУД' in pg.evaluate(RIGHT), 'щелчок по вкладке сменил основной документ: %r' % pg.evaluate(RIGHT))

    # --- «Фото» возвращает фото ----------------------------------------------------------
    pg.click('[data-cmp-left-photo]')
    t.wait_until("() => document.querySelector('[data-cmp-side=photo] .cmp-h').textContent.includes('ФОТО')")
    t.ck(not pg.evaluate(PAIRED), 'при фото слева вкладка осталась помеченной')

    # --- перетаскивание на колонки -------------------------------------------------------
    r = pg.evaluate(DROP, ['Гос. акт', '[data-cmp-drop="left"]'])
    t.ck(r == 'ok', 'вкладка на левую колонку: %s' % r)
    t.wait_until("() => document.querySelector('[data-cmp-side=photo] .cmp-h').textContent.includes('Гос. акт')")
    r = pg.evaluate(DROP, ['Гос. акт', '[data-cmp-drop="right"]'])
    t.ck(r == 'ok', 'вкладка на правую колонку: %s' % r)
    t.wait_until("() => document.querySelector('[data-cmp-side=doc] .cmp-h').textContent.includes('Гос. акт')")
    t.ck('ПУД' in pg.evaluate(LEFT), 'документы не поменялись местами: слева %r' % pg.evaluate(LEFT))

    # --- в «Документах» вкладка на лист включает сравнение --------------------------------
    pg.click('[data-vmode="doc"]')
    t.wait_for('.vbody')
    r = pg.evaluate(DROP, ['Техпаспорт', '.viewer .vbody'])
    t.ck(r == 'ok', 'вкладка на лист в режиме «Документы»: %s' % r)
    t.wait_for('[data-cmp]')
    t.ck('Техпаспорт' in pg.evaluate(LEFT), 'брошенная вкладка не открылась слева: %r' % pg.evaluate(LEFT))
    t.ck('Гос. акт' in pg.evaluate(RIGHT), 'основной документ сменился: %r' % pg.evaluate(RIGHT))
