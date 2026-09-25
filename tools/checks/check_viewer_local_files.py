# -*- coding: utf-8 -*-
"""Просмотрщик: прикреплённые файлы переживают перезагрузку.

Задача пользователя 25.09.2026: «добавляем сохранение доков локально, для
удобства тестирования… не должно улетать в сеть». До этого файл жил
blob-ссылкой вкладки, и после перезагрузки документ оставался без файла.

Сценарий держит:
  * прикреплённый PDF после перезагрузки страницы снова рисуется в
    просмотрщике (файл лежит в IndexedDB, kernel/localFiles.js);
  * «Копировать файлы в папку…» копирует уже прикреплённые файлы в выбранную
    папку. Окно выбора папки в прогоне не открыть — вместо него подставляется
    внутренняя файловая система браузера (OPFS), логика копирования та же.
"""

NAME = 'просмотрщик: файлы после перезагрузки'

TOUCHES = (
    'app/kernel/localFiles.js', 'app/kernel/persist.js', 'app/kernel/fileUpload.js',
    'app/modules/*/parts/docs/model.js', 'app/kernel/viewer/doc.js', 'app/kernel/viewer/ctrl.js',
)

OC = '#/oc/civil/oc-cv-1'


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


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1600, 'height': 900})
    t.open(OC, wait='.viewer')

    with pg.expect_file_chooser() as fc:
        pg.locator('.vdrop-card [data-vattach]').click()
    fc.value.set_files([{'name': 'Техпаспорт литера А.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf(2, 'Tekh')}])
    t.wait_for('.vattach-row')
    pg.click('[data-att-ok]')
    t.wait_for('.vstage canvas.ready', timeout=15000)
    # запись в хранилище асинхронная — ждём, пока файл там окажется
    t.wait_until("""() => new Promise((ok) => {
      const r = indexedDB.open('inside-files'); r.onsuccess = () => {
        const q = r.result.transaction('files').objectStore('files').count(); q.onsuccess = () => ok(q.result > 0);
      }; r.onerror = () => ok(false); })""")
    pg.wait_for_timeout(600)     # отложенная запись снимка в localStorage (persist.js, 400 мс)

    # --- перезагрузка ----------------------------------------------------------------
    pg.reload()
    t.wait_for('.viewer')
    tab = pg.locator('.vtabs-list .vtab', has_text='Техпаспорт')
    if tab.count():
        tab.click()
    else:
        pg.locator('.vtab-plus').click()
        pg.locator('.vtab-add .dd-menu [data-vaddtab]', has_text='Техпаспорт').click()
    t.wait_for('.vstage canvas.ready', timeout=15000)
    t.ck(pg.locator('.vstage canvas.ready').count() == 2, 'после перезагрузки страниц PDF не две')

    # --- копии в папку (OPFS вместо окна выбора папки) --------------------------------
    pg.evaluate("() => { window.showDirectoryPicker = async () => navigator.storage.getDirectory(); }")
    pg.locator('.vtab-plus').click()
    item = pg.locator('.vtab-add .dd-menu [data-vlocal-dir]')
    t.ck(item.count() == 1, 'в меню «+» нет пункта копий в папку')
    item.click()
    t.wait_until("() => [...document.querySelectorAll('.toast, [class*=toast]')].some((x) => x.textContent.includes('Копии файлов'))")
    t.wait_until("""async () => { const d = await navigator.storage.getDirectory(); const names = [];
      for await (const [n] of d.entries()) names.push(n); return names.some((n) => n.endsWith('Техпаспорт литера А.pdf')); }""")
    names = pg.evaluate("""async () => { const d = await navigator.storage.getDirectory(); const out = [];
      for await (const [n, h] of d.entries()) { const f = await h.getFile(); out.push([n, f.size]); } return out; }""")
    t.ck(any(n.endswith('Техпаспорт литера А.pdf') and s > 100 for n, s in names), 'копия файла не записана: %s' % names)
    pg.locator('.vtab-plus').click()
    t.ck('Копии файлов' in pg.inner_text('.vtab-add .dd-menu [data-vlocal-dir]'),
         'пункт меню не показывает подключённую папку')
