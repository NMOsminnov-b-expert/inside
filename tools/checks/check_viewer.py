# -*- coding: utf-8 -*-
"""Просмотрщик документов на страницах «Документы» и «Учреждения».

С 21.09.2026 это тот же просмотрщик, что в карточках ОЦ (kernel/viewer/*,
обёртка kernel/viewer/pageViewer.js). Свой урезанный просмотрщик страниц
удалён вместе со своими стилями, поэтому сценарий держит две вещи сразу.

Первая — что стили просмотрщика доехали до страницы. Они лежали в cards.css
с префиксом body[data-module], то есть работали только внутри смонтированного
модуля ОЦ; на странице модуля нет, и просмотрщик разъезжался: лента теряла
высоту, колесо ничего не прокручивало, всё после первой страницы обрезалось.
Раньше тот же дефект давал недописанный комментарий в docViewer.css.

Вторая — сама работа (жалоба пользователя 03.09.2026: «в просмотрщике
учреждений не работают колесо мыши и горячие клавиши»): лента ограничена по
высоте и прокручивается, страниц столько же, сколько в файле, файлы документа
показаны вкладками, клавиши листают и меняют масштаб и НЕ срабатывают при
наборе в поле ввода. И то же самое в карточке документа реестра.
"""
NAME = 'просмотрщик документов'

# Файлы, после правки которых сценарий обязателен (отбор в run.py --changed).
TOUCHES = (
    'app/kernel/viewer/*', 'app/kernel/viewer.css', 'app/kernel/cards.css',
    'app/kernel/pdfRender.js', 'app/pages/docs/*', 'app/pages/institutions/*',
)


def _pdf(pages=6):
    """Минимальный валидный многостраничный PDF — чтобы не держать бинарь в репозитории."""
    objs = ['1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj']
    kids = ' '.join('%d 0 R' % (3 + i * 2) for i in range(pages))
    objs.append('2 0 obj<</Type/Pages/Kids[%s]/Count %d>>endobj' % (kids, pages))
    for i in range(pages):
        pid, cid = 3 + i * 2, 4 + i * 2
        objs.append('%d 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Contents %d 0 R>>endobj' % (pid, cid))
        stream = 'BT /F1 24 Tf 40 300 Td (Str %d) Tj ET' % (i + 1)
        objs.append('%d 0 obj<</Length %d>>stream\n%s\nendstream endobj' % (cid, len(stream), stream))
    return ('%PDF-1.4\n' + '\n'.join(objs) + '\ntrailer<</Root 1 0 R>>\n%%EOF\n').encode('latin-1')


def _open_doc_with_file(t):
    """Учреждение с документом, к которому прикреплён настоящий PDF."""
    pg = t.page
    t.open('#/institutions', wait='.itree')
    t.wait(600)

    rows = pg.locator('.itree-row[data-inode]')
    for i in range(min(rows.count(), 30)):
        rows.nth(i).click()
        t.wait(250)
        tab = pg.locator('[data-itab="docs"]')
        if not tab.count():
            continue
        tab.click()
        t.wait(350)
        if pg.locator('[data-idoc]').count():
            break
    else:
        return False

    if not pg.locator('[data-idoc]').count():
        return False

    pg.locator('[data-idoc]').first.click()
    t.wait(700)
    if not pg.locator('[data-idoc-addfile]').count():
        return False

    with pg.expect_file_chooser() as fc:
        pg.locator('[data-idoc-addfile]').first.click()
    fc.value.set_files({'name': 'skan.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf()})
    # Просмотрщик появляется после разбора файла (PDF.js грузится динамически),
    # а страница в это время не меняется — ждём саму ленту, а не время.
    t.wait_for('.vstage')
    return pg.locator('.vstage').count() == 1


def run(t):
    pg = t.page

    if not t.ck(_open_doc_with_file(t), 'не удалось открыть документ с файлом в учреждении'):
        return

    # --- 1. стили доехали: просмотрщик — flex-колонка на всю высоту области ---
    t.ck(pg.eval_on_selector('.viewer', 'e => getComputedStyle(e).display') == 'flex',
         'правило .viewer{display:flex} не применилось — стили просмотрщика '
         'не доехали до страницы (kernel/viewer.css без body[data-module])')
    t.ck(pg.eval_on_selector('.vbar', 'e => getComputedStyle(e).display') == 'flex',
         'панель просмотрщика без своих стилей')

    # Файл документа — вкладка: на странице их столько же, сколько файлов.
    t.ck(pg.locator('.vtabs [data-vtab]').count() == 1,
         'файл документа не показан вкладкой: вкладок %d' % pg.locator('.vtabs [data-vtab]').count())
    # Страницами на странице не управляют: ни крестика вкладки, ни «+», ни архива.
    for sel, what in (('[data-vtabclose]', 'крестик вкладки'), ('.vtab-add', 'кнопка «+»'),
                      ('[data-varchive]', 'кнопка архива'), ('[data-vdelpage]', 'удаление страницы'),
                      ('[data-vmode]', 'переключатель режимов')):
        t.ck(pg.locator(sel).count() == 0, 'на странице лишнее: %s' % what)

    # --- 2. лента ограничена по высоте и прокручивается ---
    box = pg.eval_on_selector('.vstage', 'e => ({ h: e.clientHeight, s: e.scrollHeight })')
    t.ck(box['h'] < box['s'],
         'лента не ограничена по высоте: видно %d из %d — прокручивать нечего' % (box['h'], box['s']))
    t.ck(pg.locator('[data-vpageblk]').count() == 6,
         'страниц в ленте не 6: %d' % pg.locator('[data-vpageblk]').count())
    t.ck(pg.locator('.vthumb').count() == 6,
         'миниатюр не 6: %d' % pg.locator('.vthumb').count())

    pg.locator('.vstage').first.hover()
    pg.mouse.wheel(0, 500)
    t.wait(400)
    scrolled = pg.eval_on_selector('.vstage', 'e => e.scrollTop')
    t.ck(scrolled > 0, 'колесо не прокручивает ленту')
    # Прокрутка не должна утекать на карточку: за это отвечает overscroll-behavior.
    t.ck(pg.evaluate('() => document.querySelector(".imain").scrollTop') == 0,
         'вместе с лентой прокрутилась вся карточка')

    # --- 3. горячие клавиши ---
    pg.keyboard.press('Home')
    t.wait(500)
    t.ck(pg.eval_on_selector('.vstage', 'e => e.scrollTop') < scrolled,
         'Home не возвращает к первой странице')

    pg.keyboard.press('End')
    t.wait(600)
    t.ck(pg.eval_on_selector('.vstage', 'e => e.scrollTop') > 100, 'End не листает в конец')

    # Вписывание: «по ширине» даёт лист шире, чем «страница целиком».
    pg.locator('[data-vfit="width"]').first.click()
    t.wait(400)
    wide = pg.eval_on_selector('.vstage .vpage', 'e => e.getBoundingClientRect().width')
    pg.locator('[data-vfit="page"]').first.click()
    t.wait(400)
    whole = pg.eval_on_selector('.vstage .vpage', 'e => e.getBoundingClientRect().width')
    t.ck(wide > whole, 'режимы вписывания не различаются: %d и %d' % (wide, whole))
    pg.locator('[data-vfit="width"]').first.click()
    t.wait(300)

    zoom = pg.locator('[data-zoomlabel]').first.inner_text()
    pg.keyboard.press('+')
    t.wait(400)
    bigger = pg.locator('[data-zoomlabel]').first.inner_text()
    t.ck(bigger != zoom, 'клавиша «+» не меняет масштаб: %s и %s' % (zoom, bigger))

    pg.keyboard.press('0')
    t.wait(400)
    t.ck(pg.locator('[data-zoomlabel]').first.inner_text() == '100%',
         'клавиша «0» не возвращает масштаб к 100%%: %s' % pg.locator('[data-zoomlabel]').first.inner_text())

    # --- 4. при печати в поле клавиши молчат ---
    before = pg.locator('[data-zoomlabel]').first.inner_text()
    pg.fill('[data-irowq]', '')
    pg.locator('[data-irowq]').first.click()
    pg.keyboard.type('0+-')
    t.wait(400)
    t.ck(pg.locator('[data-zoomlabel]').first.inner_text() == before,
         'набор в поле поиска дёргает масштаб просмотрщика')
    pg.fill('[data-irowq]', '')
    t.wait(300)

    # --- 5. то же в карточке документа реестра ---
    t.open('#/docs', wait='[data-doc-row]')
    t.wait(400)
    pg.locator('[data-doc-row]').first.click()
    t.wait(700)

    if pg.locator('[data-docs-attach]').count():
        with pg.expect_file_chooser() as fc:
            pg.locator('[data-docs-attach]').first.click()
        fc.value.set_files({'name': 'skan.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf()})
        # Ждём саму ленту и разобранные страницы, а не время: PDF.js грузится
        # ленивым import(), и при занятой машине он не успевал за отведённые
        # 2,2 с — сценарий падал через раз (конвенция «ожидание по факту»).
        t.wait_for('.vstage')
        t.wait_until("() => document.querySelectorAll('.vstage .vpage').length > 0")

        if t.ck(pg.locator('.vstage').count() == 1, 'в карточке документа нет ленты просмотрщика'):
            box = pg.eval_on_selector('.vstage', 'e => ({ h: e.clientHeight, s: e.scrollHeight })')
            t.ck(box['h'] < box['s'],
                 'в карточке документа лента не ограничена: %d из %d' % (box['h'], box['s']))
            pg.locator('.vstage').first.hover()
            pg.mouse.wheel(0, 400)
            t.wait(400)
            t.ck(pg.eval_on_selector('.vstage', 'e => e.scrollTop') > 0,
                 'в карточке документа колесо не прокручивает ленту')
