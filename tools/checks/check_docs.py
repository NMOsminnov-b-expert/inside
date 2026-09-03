# -*- coding: utf-8 -*-
"""Реестр документов: фильтры, сортировка и карточка документа.

Что держит сценарий (задачи пользователя 03.09.2026):
  * фильтрация по типу, статусу, учреждению, периоду даты и тексту, сброс;
  * сортировка по столбцу в обе стороны;
  * карточка документа: возврат туда, откуда открыли (из реестра — в реестр,
    из учреждения — в учреждение), путь в крошках и переключение между
    соседними документами без возврата в список.
"""
NAME = 'документы'


def _rows(t):
    return t.page.locator('[data-doc-row]').count()


def run(t):
    pg = t.page

    # --- 1. фильтры реестра ---
    t.open('#/docs', wait='[data-doc-row]')
    pg.wait_for_timeout(400)

    total = _rows(t)
    t.ck(total > 5, 'в реестре документов всего %d строк' % total)

    pg.select_option('[data-docs-type]', 'Техпаспорт')
    pg.wait_for_timeout(400)
    by_type = _rows(t)
    t.ck(0 < by_type < total, 'фильтр по типу не сработал: %d из %d' % (by_type, total))

    pg.select_option('[data-docs-type]', '')
    pg.wait_for_timeout(300)

    insts = pg.eval_on_selector_all('[data-docs-inst] option',
                                    'els => els.map((e) => e.textContent.trim())')
    t.ck(len(insts) > 2, 'в фильтре «от кого» нет учреждений')
    pg.select_option('[data-docs-inst]', insts[1])
    pg.wait_for_timeout(400)
    by_inst = _rows(t)
    t.ck(0 < by_inst < total, 'фильтр «от кого» не сработал: %d из %d' % (by_inst, total))

    pg.select_option('[data-docs-inst]', '')
    pg.wait_for_timeout(300)

    # Период даты: документ без даты в выборку по периоду не попадает.
    pg.fill('[data-docs-from]', '2010-01-01')
    pg.dispatch_event('[data-docs-from]', 'change')
    pg.fill('[data-docs-to]', '2011-12-31')
    pg.dispatch_event('[data-docs-to]', 'change')
    pg.wait_for_timeout(500)
    by_date = _rows(t)
    t.ck(0 < by_date < total, 'фильтр по периоду не сработал: %d из %d' % (by_date, total))

    dates = pg.eval_on_selector_all('[data-doc-row] td:nth-child(5)',
                                    'els => els.map((e) => e.textContent.trim())')
    t.ck(all('2010' in d or '2011' in d for d in dates),
         'в выборку по периоду попали чужие даты: %s' % dates[:4])

    pg.locator('[data-docs-reset]').first.click()
    pg.wait_for_timeout(500)
    t.ck(_rows(t) == total, 'сброс фильтров не вернул все строки')

    # --- 2. сортировка ---
    pg.locator('th[data-docs-sort="date"]').first.click()
    pg.wait_for_timeout(400)
    asc = pg.eval_on_selector_all('[data-doc-row] td:nth-child(5)',
                                  'els => els.map((e) => e.textContent.trim()).filter((x) => x !== "—")')
    pg.locator('th[data-docs-sort="date"]').first.click()
    pg.wait_for_timeout(400)
    desc = pg.eval_on_selector_all('[data-doc-row] td:nth-child(5)',
                                   'els => els.map((e) => e.textContent.trim()).filter((x) => x !== "—")')
    t.ck(asc and desc and asc[0] != desc[0],
         'сортировка по дате не меняет порядок: %s / %s' % (asc[:2], desc[:2]))
    t.ck(asc == sorted(asc), 'по возрастанию даты идут не по порядку: %s' % asc[:4])

    # --- 3. карточка: возврат в реестр и переход к соседям ---
    pg.locator('[data-doc-row]').first.click()
    pg.wait_for_timeout(800)
    t.ck('/docs/' in pg.evaluate('() => location.hash'), 'карточка документа не открылась')

    crumbs = pg.locator('#crumbs').inner_text()
    t.ck('Документы' in crumbs, 'в пути нет раздела «Документы»: %s' % crumbs.replace('\n', ' '))

    strip = pg.locator('.dd-strip-item').count()
    t.ck(strip > 1, 'в карточке нет ленты соседних документов')
    t.ck(pg.locator('.dd-nav-count').count() == 1, 'нет счётчика «N из M»')

    before = pg.locator('.dd-nav-count').inner_text()
    pg.locator('[data-docs-next-doc]').first.click()
    pg.wait_for_timeout(800)
    t.ck(pg.locator('.dd-nav-count').inner_text() != before,
         'кнопка «следующий документ» не переключает')

    pg.locator('[data-docs-back]').first.click()
    pg.wait_for_timeout(700)
    t.ck(pg.evaluate('() => location.hash').endswith('/docs'),
         'возврат из карточки увёл не в реестр документов')

    # --- 4. карточка, открытая из учреждения ---
    t.open('#/institutions', wait='.itree')
    pg.wait_for_timeout(500)

    rows = pg.locator('.itree-row[data-inode]')
    opened = False
    for i in range(min(rows.count(), 30)):
        rows.nth(i).click()
        pg.wait_for_timeout(400)
        tab = pg.locator('[data-itab="docs"]')
        if not tab.count():
            continue
        tab.click()
        pg.wait_for_timeout(400)
        if pg.locator('[data-idoc]').count():
            opened = True
            break

    if t.ck(opened, 'не нашёл учреждение с документами'):
        name = pg.locator('.ihead h2').inner_text().strip()
        # Щелчок по строке открывает предпросмотр рядом, а стрелка «↗» уводит в
        # карточку документа целиком — её и проверяем.
        pg.locator('[data-idoc]').first.hover()
        pg.wait_for_timeout(200)
        pg.locator('[data-idoc-goto]').first.click()
        pg.wait_for_timeout(900)

        crumbs = pg.locator('#crumbs').inner_text().replace('\n', ' ')
        t.ck('Учреждения' in crumbs and name[:18] in crumbs,
             'путь документа не ведёт через учреждение: %s' % crumbs)

        active = pg.eval_on_selector_all('.nav-item.active', 'els => els.map((e) => e.dataset.nav)')
        t.ck(active == ['inst'], 'подсвечен не тот раздел сайдбара: %s' % active)

        pg.locator('[data-docs-back]').first.click()
        pg.wait_for_timeout(900)
        t.ck('institutions' in pg.evaluate('() => location.hash'),
             'возврат из документа увёл не в учреждение')
        t.ck(pg.locator('.ihead h2').inner_text().strip() == name,
             'возврат открыл другое учреждение')

    # --- 5. предпросмотр при прикреплении файла ---
    #
    # Пользователь 03.09.2026: «в документах добавь возможность просмотра
    # документов при прикреплении». До этого о содержимом судили по имени файла.
    t.open('#/docs', wait='[data-doc-row]')
    pg.wait_for_timeout(400)

    pg.locator('[data-docs-create]').first.click()
    pg.wait_for_timeout(500)
    t.ck(pg.locator('.docs-modal').count() == 1, 'форма создания документа не открылась')
    t.ck(pg.locator('.df-preview').count() == 0, 'предпросмотр показан до выбора файла')

    pdf = (b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
           b'2 0 obj<</Type/Pages/Kids[3 0 R 5 0 R]/Count 2>>endobj\n'
           b'3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Contents 4 0 R>>endobj\n'
           b'4 0 obj<</Length 44>>stream\nBT /F1 24 Tf 40 300 Td (Str 1) Tj ET\nendstream endobj\n'
           b'5 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Contents 6 0 R>>endobj\n'
           b'6 0 obj<</Length 44>>stream\nBT /F1 24 Tf 40 300 Td (Str 2) Tj ET\nendstream endobj\n'
           b'trailer<</Root 1 0 R>>\n%%EOF\n')

    with pg.expect_file_chooser() as fc:
        pg.locator('[data-df-pick]').first.click()
    fc.value.set_files({'name': 'proverka.pdf', 'mimeType': 'application/pdf', 'buffer': pdf})
    pg.wait_for_timeout(1600)

    t.ck(pg.locator('.df-preview .viewer').count() == 1,
         'после выбора файла нет предпросмотра')
    t.ck(pg.locator('.df-preview [data-vthumb]').count() == 2,
         'в предпросмотре не видно страниц файла: %d'
         % pg.locator('.df-preview [data-vthumb]').count())
    t.ck(pg.locator('.df-preview [data-vzoom-in]').count()
         + pg.locator('.df-preview .tool-btn').count() > 0,
         'у предпросмотра нет управления (зум, поворот, страницы)')

    pg.locator('[data-modal-cancel]').first.click()
    pg.wait_for_timeout(400)
