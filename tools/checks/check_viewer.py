# -*- coding: utf-8 -*-
"""Просмотрщик документов вне карточек ОЦ (kernel/docViewer.js).

Что держит сценарий (жалоба пользователя 03.09.2026: «в просмотрщике
учреждений не работают колесо мыши и горячие клавиши»):

  * лента страниц ОГРАНИЧЕНА по высоте и прокручивается колесом. Ломалось это
    неочевидно: в docViewer.css комментарий содержал путь со «звёздочка-слэш»,
    комментарий закрывался досрочно и съедал следующее правило —
    .viewer{display:flex}. Просмотрщик переставал быть flex-колонкой, лента
    вырастала во весь документ, колесо ничего не прокручивало, а всё после
    первой страницы обрезалось. Поэтому здесь проверяется не только поведение,
    но и сам факт, что правило доехало до браузера;
  * горячие клавиши листания и зума работают и НЕ срабатывают, когда человек
    печатает в поле ввода;
  * то же самое в карточке документа реестра — просмотрщик там общий.
"""
NAME = 'просмотрщик документов'


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
    pg.wait_for_timeout(600)

    rows = pg.locator('.itree-row[data-inode]')
    for i in range(min(rows.count(), 30)):
        rows.nth(i).click()
        pg.wait_for_timeout(250)
        tab = pg.locator('[data-itab="docs"]')
        if not tab.count():
            continue
        tab.click()
        pg.wait_for_timeout(350)
        if pg.locator('[data-idoc]').count():
            break
    else:
        return False

    if not pg.locator('[data-idoc]').count():
        return False

    pg.locator('[data-idoc]').first.click()
    pg.wait_for_timeout(700)
    if not pg.locator('[data-idoc-addfile]').count():
        return False

    with pg.expect_file_chooser() as fc:
        pg.locator('[data-idoc-addfile]').first.click()
    fc.value.set_files({'name': 'skan.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf()})
    pg.wait_for_timeout(2200)
    return pg.locator('.vstage').count() == 1


def run(t):
    pg = t.page

    if not t.ck(_open_doc_with_file(t), 'не удалось открыть документ с файлом в учреждении'):
        return

    # --- 1. правило доехало: просмотрщик — flex-колонка ---
    t.ck(pg.eval_on_selector('.viewer', 'e => getComputedStyle(e).display') == 'flex',
         'правило .viewer{display:flex} не применилось — проверьте комментарии в docViewer.css')

    # --- 2. лента ограничена по высоте и прокручивается ---
    box = pg.eval_on_selector('.vstage', 'e => ({ h: e.clientHeight, s: e.scrollHeight })')
    t.ck(box['h'] < box['s'],
         'лента не ограничена по высоте: видно %d из %d — прокручивать нечего' % (box['h'], box['s']))
    t.ck(pg.locator('[data-vpageblk]').count() == 6,
         'страниц в ленте не 6: %d' % pg.locator('[data-vpageblk]').count())

    pg.locator('.vstage').first.hover()
    pg.mouse.wheel(0, 500)
    pg.wait_for_timeout(400)
    scrolled = pg.eval_on_selector('.vstage', 'e => e.scrollTop')
    t.ck(scrolled > 0, 'колесо не прокручивает ленту')
    # Прокрутка не должна утекать на карточку: за это отвечает overscroll-behavior.
    t.ck(pg.evaluate('() => document.querySelector(".imain").scrollTop') == 0,
         'вместе с лентой прокрутилась вся карточка')

    # --- 3. горячие клавиши ---
    pg.keyboard.press('Home')
    pg.wait_for_timeout(500)
    t.ck(pg.eval_on_selector('.vstage', 'e => e.scrollTop') < scrolled,
         'Home не возвращает к первой странице')

    pg.keyboard.press('End')
    pg.wait_for_timeout(600)
    t.ck(pg.eval_on_selector('.vstage', 'e => e.scrollTop') > 100, 'End не листает в конец')

    zoom = pg.locator('[data-zoomlabel]').first.inner_text()
    pg.keyboard.press('+')
    pg.wait_for_timeout(400)
    bigger = pg.locator('[data-zoomlabel]').first.inner_text()
    t.ck(bigger != zoom, 'клавиша «+» не меняет масштаб: %s и %s' % (zoom, bigger))

    pg.keyboard.press('0')
    pg.wait_for_timeout(400)
    t.ck(pg.locator('[data-zoomlabel]').first.inner_text() == '100%',
         'клавиша «0» не возвращает масштаб к 100%%: %s' % pg.locator('[data-zoomlabel]').first.inner_text())

    # --- 4. при печати в поле клавиши молчат ---
    before = pg.locator('[data-zoomlabel]').first.inner_text()
    pg.fill('[data-irowq]', '')
    pg.locator('[data-irowq]').first.click()
    pg.keyboard.type('0+-')
    pg.wait_for_timeout(400)
    t.ck(pg.locator('[data-zoomlabel]').first.inner_text() == before,
         'набор в поле поиска дёргает масштаб просмотрщика')
    pg.fill('[data-irowq]', '')
    pg.wait_for_timeout(300)

    # --- 5. то же в карточке документа реестра ---
    t.open('#/docs', wait='[data-doc-row]')
    pg.wait_for_timeout(400)
    pg.locator('[data-doc-row]').first.click()
    pg.wait_for_timeout(700)

    if pg.locator('[data-docs-attach]').count():
        with pg.expect_file_chooser() as fc:
            pg.locator('[data-docs-attach]').first.click()
        fc.value.set_files({'name': 'skan.pdf', 'mimeType': 'application/pdf', 'buffer': _pdf()})
        pg.wait_for_timeout(2200)

        if t.ck(pg.locator('.vstage').count() == 1, 'в карточке документа нет ленты просмотрщика'):
            box = pg.eval_on_selector('.vstage', 'e => ({ h: e.clientHeight, s: e.scrollHeight })')
            t.ck(box['h'] < box['s'],
                 'в карточке документа лента не ограничена: %d из %d' % (box['h'], box['s']))
            pg.locator('.vstage').first.hover()
            pg.mouse.wheel(0, 400)
            pg.wait_for_timeout(400)
            t.ck(pg.eval_on_selector('.vstage', 'e => e.scrollTop') > 0,
                 'в карточке документа колесо не прокручивает ленту')
