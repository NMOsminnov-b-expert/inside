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
  * управление двумя документами (замечание пользователя 25.09.2026: «не
    совсем понятно, что с чем соединяется»): номера колонок 1 и 2 на шапках и
    на вкладках; выбор документа в шапке колонки (у колонки 1 — ещё «Фото»);
    колонка в фокусе — щелчок по вкладке открывает документ в ней; ⇄ меняет
    документы местами;
  * клавиши в сравнении (замечание пользователя 25.09.2026: «горячие клавиши
    в режиме сравнения не работают», «не работает поворот страниц»): →/←
    листают колонку в фокусе, Ctrl+= увеличивает её, и лист при этом растёт,
    а не упирается в ширину колонки; Ctrl+Shift+= поворачивает, Ctrl+2 — по
    ширине, Ctrl+0 — целиком; Alt+1/Alt+2 переводят фокус;
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
PAIRED = "() => [...document.querySelectorAll('.vtab.in-col.c1 .vtab-t')].map((t) => t.textContent)"
COL2 = "() => [...document.querySelectorAll('.vtab.in-col.c2 .vtab-t')].map((t) => t.textContent)"
PICK = "(side) => { const s = document.querySelector('[data-cmp-pick=' + side + ']'); return s ? s.options[s.selectedIndex].textContent : ''; }"

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
    t.ck(pg.evaluate("() => document.querySelector('[data-cmp-pick=left]').value") == 'photo', 'при одной вкладке слева не фото')
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
    t.ck('ПУД' in pg.evaluate(PICK, 'right'), 'в колонке 2 не основной документ: %r' % pg.evaluate(PICK, 'right'))
    t.ck('Гос. акт' in pg.evaluate(PICK, 'left'), 'в колонке 1 не открытый перед основным: %r' % pg.evaluate(PICK, 'left'))
    t.ck(pg.evaluate(PAIRED) == ['ОЦ · Гос. акт на землю'], 'вкладка колонки 1 не помечена: %s' % pg.evaluate(PAIRED))
    t.ck(pg.evaluate(COL2) == ['ОЦ · ПУД'], 'вкладка колонки 2 не помечена: %s' % pg.evaluate(COL2))
    t.ck('Гос. акт' in pg.evaluate(PICK, 'left') and 'ПУД' in pg.evaluate(PICK, 'right'),
         'выбор в шапках не совпадает с колонками: %r / %r' % (pg.evaluate(PICK, 'left'), pg.evaluate(PICK, 'right')))
    t.ck(pg.locator('[data-cmp-drop="left"].cmp-focus').count() == 1, 'при входе в сравнение фокус не на колонке 1')
    t.ck(pg.locator('.vtabs-list .vtab').count() == 3, 'в сравнении не все вкладки')
    t.ck('Два документа' in pg.inner_text('.vbar .vtitle'), 'заголовок сравнения не про два документа')

    # --- щелчок по вкладке открывает в колонке в фокусе (1) ------------------------------
    pg.locator('.vtabs-list .vtab', has_text='Техпаспорт').click()
    t.wait_until("() => document.querySelector('[data-cmp-pick=left]').selectedOptions[0].textContent.includes('Техпаспорт')")
    t.ck('ПУД' in pg.evaluate(PICK, 'right'), 'щелчок по вкладке сменил колонку 2: %r' % pg.evaluate(PICK, 'right'))

    # --- клавиши листают и масштабируют колонку в фокусе -----------------------------
    pg.locator('[data-cmp-stage="photo"]').click(position={'x': 30, 'y': 30})
    pg.keyboard.press('ArrowRight')
    t.wait_until("() => document.querySelector('[data-cmp-phnum]').textContent.startsWith('2/')")
    z = pg.inner_text('[data-cmp-zoomlabel="photo"]')
    pg.keyboard.press('Control+Equal')
    t.ck(pg.inner_text('[data-cmp-zoomlabel="photo"]') != z, 'Ctrl+= не увеличил колонку в фокусе')
    t.ck(pg.inner_text('[data-cmp-zoomlabel="doc"]') == '100%', 'Ctrl+= увеличил не ту колонку')
    # лист растёт при увеличении, а не упирается в ширину колонки (замечание
    # пользователя 25.09.2026: «в какой-то момент изображение перестаёт увеличиваться»)
    W = "() => document.querySelector('[data-cmp-stage=photo] .vpage').getBoundingClientRect().width"
    w0 = pg.evaluate(W)
    for _ in range(8):
        pg.keyboard.press('Control+Equal')
    t.ck(pg.evaluate(W) > w0 * 1.5, 'лист колонки не растёт при увеличении: %s → %s' % (w0, pg.evaluate(W)))
    # поворот, «по ширине» и «целиком» — в колонке в фокусе
    pg.keyboard.press('Control+Shift+Equal')
    t.ck('rotate(90deg)' in pg.get_attribute('[data-cmp-stage="photo"] [data-cmp-inner]', 'style'),
         'Ctrl+Shift+= не повернул лист колонки 1')
    t.ck('rotate(0deg)' in (pg.get_attribute('[data-cmp-stage="doc"] [data-cmp-inner]', 'style') or 'rotate(0deg)'),
         'поворот задел колонку 2')
    pg.keyboard.press('Control+Shift+Minus')
    pg.keyboard.press('Control+Digit2')
    t.ck(pg.inner_text('[data-cmp-zoomlabel="photo"]') == '100%', 'Ctrl+2 не вернул «по ширине»')
    pg.keyboard.press('Control+Digit0')
    t.ck(pg.evaluate("() => { const st = document.querySelector('[data-cmp-stage=photo]'); const p = st.querySelector('.vpage'); return p.getBoundingClientRect().height <= st.clientHeight; }"),
         'Ctrl+0 не вписал лист целиком по высоте')
    pg.keyboard.press('Control+Digit2')
    # масштаб ступенями, как у Acrobat: на крупном шаг больше (замечание
    # пользователя 25.09.2026: «увеличение слишком медленное на высоких процентах»)
    seen = []
    for _ in range(12):
        pg.keyboard.press('Control+Equal')
        seen.append(pg.inner_text('[data-cmp-zoomlabel="photo"]'))
    t.ck(seen[:3] == ['110%', '125%', '150%'] and seen[-1] == '500%', 'ступени масштаба не те: %s' % seen)
    # повёрнутый лист стоит по центру обёртки, а не съезжает вниз под соседнюю
    pg.keyboard.press('Control+Digit2')
    pg.keyboard.press('Control+Shift+Equal')
    gap = pg.evaluate("""() => { const st = document.querySelector('[data-cmp-stage=photo]'); st.scrollTop = 0;
      const p = st.querySelector('[data-cmp-inner]').getBoundingClientRect(); return Math.round(p.top - st.getBoundingClientRect().top); }""")
    t.ck(gap <= 14, 'повёрнутый лист съехал вниз: сверху %s px' % gap)
    pg.keyboard.press('Control+Shift+Minus')
    pg.keyboard.press('Alt+2')
    t.ck(pg.locator('[data-cmp-drop="right"].cmp-focus').count() == 1, 'Alt+2 не перевёл фокус на колонку 2')

    # --- щелчок по вкладке открывает в колонке в фокусе (сейчас 2) ------------------------
    pg.locator('.vtabs-list .vtab', has_text='Гос').click()
    t.wait_until("() => document.querySelector('[data-cmp-side=doc] .cmp-h').textContent.includes('Гос')")
    t.ck('Техпаспорт' in pg.evaluate(PICK, 'left'), 'колонка 1 сменилась при фокусе на 2: %r' % pg.evaluate(PICK, 'left'))

    # --- ⇄ меняет документы местами --------------------------------------------------------
    pg.click('[data-cmp-swap]')
    t.wait_until("() => document.querySelector('[data-cmp-pick=left]').selectedOptions[0].textContent.includes('Гос')")
    t.ck('Техпаспорт' in pg.evaluate(PICK, 'right'), '⇄ не поменял документы: %r' % pg.evaluate(PICK, 'right'))

    # --- выбор в шапке: «Фото» в колонке 1 ----------------------------------------------
    pg.select_option('[data-cmp-pick="left"]', 'photo')
    t.wait_until("() => document.querySelector('[data-cmp-pick=left]').value === 'photo'")
    t.ck(not pg.evaluate(PAIRED), 'при фото слева вкладка осталась помеченной')

    # --- перетаскивание на колонки -------------------------------------------------------
    r = pg.evaluate(DROP, ['Гос. акт', '[data-cmp-drop="left"]'])
    t.ck(r == 'ok', 'вкладка на колонку 1: %s' % r)
    t.wait_until("() => document.querySelector('[data-cmp-pick=left]').selectedOptions[0].textContent.includes('Гос. акт')")
    r = pg.evaluate(DROP, ['Гос. акт', '[data-cmp-drop="right"]'])
    t.ck(r == 'ok', 'вкладка на колонку 2: %s' % r)
    t.wait_until("() => document.querySelector('[data-cmp-pick=right]').selectedOptions[0].textContent.includes('Гос. акт')")
    t.ck('Техпаспорт' in pg.evaluate(PICK, 'left'), 'документы не поменялись местами: в колонке 1 %r' % pg.evaluate(PICK, 'left'))

    # --- в «Документах» вкладка на лист включает сравнение --------------------------------
    pg.click('[data-vmode="doc"]')
    t.wait_for('.vbody')
    r = pg.evaluate(DROP, ['Техпаспорт', '.viewer .vbody'])
    t.ck(r == 'ok', 'вкладка на лист в режиме «Документы»: %s' % r)
    t.wait_for('[data-cmp]')
    t.ck('Техпаспорт' in pg.evaluate(PICK, 'left'), 'брошенная вкладка не открылась в колонке 1: %r' % pg.evaluate(PICK, 'left'))
    t.ck('Гос. акт' in pg.evaluate(PICK, 'right'), 'основной документ сменился: %r' % pg.evaluate(PICK, 'right'))
