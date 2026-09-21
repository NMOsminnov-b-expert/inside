# -*- coding: utf-8 -*-
"""Просмотрщик гражданского здания: работа с документами.

Требование пользователя 21.09.2026: «нет возможности открыть ещё один
документ, прикрепить ещё один; обязательны drag'n'drop, множественная вставка
(имена от файлов), правая кнопка мыши, перестановка вкладок, горячие клавиши
как в Adobe Acrobat». Сценарий держит:

  * выбор нескольких файлов сразу → окно, где имя = имя файла, а вид
    подобран по имени («Техпаспорт…» → Техпаспорт, «Гос акт…» → Гос. акт);
  * вкладки видны всегда; «+» открывает ещё не открытый документ записи;
  * перестановка вкладок перетаскиванием и Alt+Shift+←/→; Alt+PageDown —
    следующий документ; Alt+W — закрыть (Ctrl+W браузер не отдаёт);
  * контекстное меню вкладки и листа — мышью и с клавиатуры (Shift+F10),
    пункты с подписанными клавишами;
  * клавиши Acrobat: Ctrl+1 — реальный размер, Ctrl+0 — страница целиком,
    Ctrl+Shift+= — поворот, Ctrl+G — перейти к странице, Alt+← — предыдущий
    вид, Ctrl+Shift+D — убрать страницу; «?» — справка;
  * файл, брошенный на карточку, и файл из буфера (Ctrl+V) открывают то же
    окно прикрепления;
  * поиска по тексту нет (решение пользователя 21.09.2026) — Ctrl+F остаётся
    браузерным;
  * при вынесенном в отдельное окно просмотрщике прикрепление работает В НЁМ:
    и окно выбора файлов, и окно прикрепления, и уведомление, и диалоги
    (переименование) — в окне просмотра, а не в главном (замечание
    пользователя 21.09.2026: «то не там окно выпрыгнет, то вообще не даёт
    прикрепить»); Ctrl+O в главном окне при этом тоже работает.
"""

import base64

NAME = 'просмотрщик: документы'

TOUCHES = (
    'app/modules/civil/parts/viewer/*', 'app/modules/civil/parts/docs/*',
    'app/modules/civil/module.css', 'app/modules/civil/index.js',
)

OC = '#/oc/civil/oc-cv-1'

TABS = """() => [...document.querySelectorAll('.vtabs-list .vtab')]
  .map((t) => t.querySelector('.vtab-t').textContent + (t.classList.contains('active') ? '*' : ''))"""

MENU = "() => [...document.querySelectorAll('.vmenu .vmenu-label')].map((x) => x.textContent.trim())"


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


# Файл в событие перетаскивания или вставки — DataTransfer собирается в
# странице из base64.
FILE_EVENT = """([b64, name, kind]) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const dt = new DataTransfer(); dt.items.add(new File([u], name, { type: 'application/pdf' }));
  const t = document.querySelector('.grow');
  if (kind === 'drop') {
    t.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
    t.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const lit = !!document.querySelector('.vdrop-on');
    t.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return lit;
  }
  document.body.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  return true;
}"""


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 1600, 'height': 900})
    t.open(OC, wait='.viewer')

    def focus_stage():
        pg.locator('.vstage').click(position={'x': 40, 'y': 40})

    # --- несколько файлов сразу ------------------------------------------------------
    t.ck(pg.locator('.vdrop-card [data-vattach]').count() == 1, 'в пустом просмотрщике нет зоны с кнопкой выбора')
    with pg.expect_file_chooser() as fc:
        pg.locator('.vdrop-card [data-vattach]').click()
    t.ck(fc.value.is_multiple(), 'выбор файлов не разрешает несколько сразу')
    fc.value.set_files([
        {'name': 'Техпаспорт литера А.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf(3, 'Tekh')},
        {'name': 'Гос акт на землю.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf(2, 'Akt')},
        {'name': 'Договор купли.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf(1, 'Dog')},
    ])
    t.wait_for('.vattach-row')
    rows = pg.evaluate("""() => [...document.querySelectorAll('.vattach-row')]
      .map((r) => [r.querySelector('[data-att-name]').value, r.querySelector('[data-att-type]').value])""")
    t.ck([r[0] for r in rows] == ['Техпаспорт литера А.pdf', 'Гос акт на землю.pdf', 'Договор купли.pdf'],
         'имена документов не от файлов: %s' % rows)
    t.ck([r[1] for r in rows] == ['Техпаспорт', 'Гос. акт на землю', 'ПУД'], 'вид не подобран по имени: %s' % rows)
    pg.click('[data-att-ok]')
    t.wait_for('.vstage canvas.ready', timeout=15000)
    tabs = pg.evaluate(TABS)
    t.ck(tabs == ['ОЦ · Техпаспорт*', 'ОЦ · Гос. акт на землю', 'ОЦ · ПУД'], 'вкладки после прикрепления: %s' % tabs)

    # --- переключение и перестановка ---------------------------------------------------------
    focus_stage()
    pg.keyboard.press('Alt+PageDown')
    t.wait_until("() => document.querySelector('.vtab.active .vtab-t').textContent.includes('Гос')")
    pg.keyboard.press('Alt+Shift+ArrowLeft')
    t.wait_until("() => document.querySelector('.vtabs-list .vtab').classList.contains('active')")
    t.ck(pg.evaluate(TABS)[0] == 'ОЦ · Гос. акт на землю*', 'Alt+Shift+← не переставил вкладку: %s' % pg.evaluate(TABS))
    # Перетаскивание — событиями в самой странице: настоящий drag в прогоне
    # проверок иногда не завершается, и браузер глотает весь дальнейший ввод.
    # Руками перестановка проверена отдельно; здесь держится логика обработчиков.
    pg.evaluate("""() => {
      const tabs = [...document.querySelectorAll('.vtabs-list .vtab')];
      const src = tabs[2]; const dst = tabs[0];
      const dt = new DataTransfer();
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      const r = dst.getBoundingClientRect();
      const at = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 4, clientY: r.top + 10 };
      dst.dispatchEvent(new DragEvent('dragover', at));
      dst.dispatchEvent(new DragEvent('drop', at));
      src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    }""")
    t.wait_until("() => document.querySelector('.vtabs-list .vtab .vtab-t').textContent.includes('ПУД')")
    t.ck(pg.evaluate(TABS)[0].startswith('ОЦ · ПУД'), 'перетаскивание не переставило вкладку: %s' % pg.evaluate(TABS))

    # --- меню вкладки: мышью и с клавиатуры ---------------------------------------------------
    pg.locator('.vtabs-list .vtab').first.click(button='right')
    t.wait_for('.vmenu')
    items = pg.evaluate(MENU)
    for need in ('Закрыть', 'Закрыть другие', 'Закрыть все', 'Переименовать…', 'Изменить вид…', 'Свойства',
                 'Скачать', 'Печать', 'Убрать в архив…'):
        t.ck(need in items, 'в меню вкладки нет «%s»: %s' % (need, items))
    pg.keyboard.press('Escape')
    t.wait_until("() => !document.querySelector('.vmenu')")
    pg.locator('.vtabs-list .vtab.active').focus()
    pg.keyboard.press('Shift+F10')
    t.ck(t.wait_until("() => !!document.querySelector('.vmenu')"), 'Shift+F10 не открывает меню вкладки')
    pg.keyboard.press('Escape')

    # --- меню листа ---------------------------------------------------------------------------
    pg.locator('.vstage').click(button='right', position={'x': 200, 'y': 200})
    t.wait_for('.vmenu')
    items = pg.evaluate(MENU)
    t.ck('Реальный размер' in items and 'Повернуть по часовой' in items and 'Горячие клавиши' in items,
         'в меню листа не хватает пунктов: %s' % items)
    keys = pg.evaluate("() => [...document.querySelectorAll('.vmenu .vmenu-keys')].map((k) => k.textContent)")
    t.ck('Ctrl+1' in keys and 'Ctrl+Shift+D' in keys, 'у пунктов меню не подписаны клавиши: %s' % keys)
    pg.keyboard.press('Escape')
    t.wait_until("() => !document.querySelector('.vmenu')")

    # --- клавиши Acrobat -----------------------------------------------------------------------
    pg.locator('.vtabs-list .vtab', has_text='Техпаспорт').click()
    t.wait_until("() => document.querySelector('.vtab.active .vtab-t').textContent.includes('Техпаспорт')")
    t.wait_for('.vstage canvas.ready', timeout=15000)
    focus_stage()
    pg.keyboard.press('Control+1')
    t.ck(t.wait_until("() => document.querySelector('[data-zoomlabel]').textContent !== '100%'"),
         'Ctrl+1 (реальный размер) не изменил масштаб')
    pg.keyboard.press('Control+0')
    t.wait_until("() => document.querySelector('.vribbon').classList.contains('fit-page')")
    pg.keyboard.press('Control+Shift+Equal')
    t.ck('90' in (pg.eval_on_selector('.vribbon .vpage', 'e => e.style.transform') or ''), 'Ctrl+Shift+= не поворачивает')
    pg.keyboard.press('Control+Shift+Minus')

    pg.keyboard.press('End')
    t.wait_until("() => document.querySelector('[data-vpage]').value === '3'")
    pg.keyboard.press('Alt+ArrowLeft')
    t.ck(t.wait_until("() => document.querySelector('[data-vpage]').value === '1'"), 'Alt+← не вернул к прежней странице')

    pg.keyboard.press('Control+g')
    t.ck(pg.evaluate("document.activeElement && document.activeElement.hasAttribute('data-vpage')"),
         'Ctrl+G не ставит фокус в номер страницы')
    focus_stage()

    pg.keyboard.press('Control+Shift+KeyD')
    t.wait_for('[data-modal-ok]')
    pg.click('[data-modal-ok]')
    t.ck(t.wait_until("() => document.querySelectorAll('[data-vpageblk]').length === 2"), 'Ctrl+Shift+D не убрал страницу')

    n0 = pg.locator('.vtabs-list .vtab').count()
    focus_stage()
    pg.keyboard.press('Alt+KeyW')
    t.ck(t.wait_until("() => document.querySelectorAll('.vtabs-list .vtab').length === %d" % (n0 - 1)),
         'Alt+W не закрыл документ')

    pg.keyboard.press('Shift+Slash')
    t.ck(t.wait_until("() => document.querySelectorAll('.vkeys tr').length > 25"), '«?» не открывает справку по клавишам')
    pg.keyboard.press('Escape')

    # --- «+»: открыть закрытый документ -------------------------------------------------------
    pg.click('.vtab-plus')
    t.wait_for('.vtab-add.open [data-vaddtab]')
    pg.locator('.vtab-add [data-vaddtab]').first.click()
    t.ck(t.wait_until("() => document.querySelectorAll('.vtabs-list .vtab').length === %d" % n0),
         '«+» не открыл закрытый документ')

    # --- перетаскивание на карточку и вставка -------------------------------------------------
    lit = pg.evaluate(FILE_EVENT, [base64.b64encode(_pdf(1, 'Drop')).decode(), 'Акт осмотра 21-09.pdf', 'drop'])
    t.ck(lit, 'при перетаскивании файла нет подсветки «отпустите здесь»')
    t.wait_for('.vattach-row')
    t.ck(pg.eval_on_selector('[data-att-type]', 'e => e.value') == 'Акт осмотра', 'брошенному файлу не подобран вид')
    pg.click('[data-att-ok]')
    t.wait_until("() => document.querySelector('.vtab.active .vtab-t').textContent.includes('Акт осмотра')")

    pg.evaluate(FILE_EVENT, [base64.b64encode(_pdf(1, 'Paste')).decode(), 'Скан из буфера.pdf', 'paste'])
    t.ck(t.wait_until("() => !!document.querySelector('.vattach-row')"), 'Ctrl+V с файлом не открывает окно прикрепления')
    pg.click('[data-att-cancel]')

    # --- вынесенный просмотрщик: прикрепление в своём окне ----------------------------------
    with pg.context.expect_page() as info:
        pg.click('[data-vpopout]')
    pop = info.value
    pop.wait_for_selector('.viewer')

    with pop.expect_file_chooser(timeout=8000) as fc:
        pop.locator('.vtab-plus').click()
        pop.locator('.vtab-add [data-vattach]').click()
    fc.value.set_files({'name': 'Из окна просмотра.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf(1, 'Pop')})
    pop.wait_for_selector('.vattach-row', timeout=8000)
    t.ck(pop.locator('.vattach-row').count() == 1 and pg.locator('.vattach-row').count() == 0,
         'окно прикрепления открылось не в том окне')
    pop.click('[data-att-ok]')
    t.ck(pop.wait_for_function("() => [...document.querySelectorAll('.vtab')]"
                               ".some((x) => x.title.includes('Из окна просмотра'))", timeout=15000) is not None,
         'документ, прикреплённый в окне просмотра, там не открылся')
    t.ck(pop.locator('.toast').count() > 0, 'уведомление о прикреплении показано не в окне просмотра')

    pop.locator('.vtabs-list .vtab.active').click(button='right')
    pop.wait_for_selector('.vmenu')
    pop.locator('.vmenu-item', has_text='Переименовать').click()
    pop.wait_for_selector('[data-modal-input]', timeout=8000)
    t.ck(pg.locator('[data-modal-input]').count() == 0, 'диалог из окна просмотра открылся в главном окне')
    pop.keyboard.press('Escape')

    # Ctrl+O в главном окне работает и при вынесенном просмотрщике.
    pg.bring_to_front()
    pg.locator('.grow').click(position={'x': 10, 'y': 10})
    with pg.expect_file_chooser(timeout=8000) as fc:
        pg.keyboard.press('Control+o')
    fc.value.set_files({'name': 'Из главного окна.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf(1, 'Main')})
    pg.wait_for_selector('.vattach-row', timeout=8000)
    pg.click('[data-att-ok]')
    t.ck(pop.wait_for_function("() => [...document.querySelectorAll('.vtab')]"
                               ".some((x) => x.title.includes('Из главного окна'))", timeout=15000) is not None,
         'документ, прикреплённый в главном окне, не появился в окне просмотра')
    pop.click('[data-vpop-back]')
