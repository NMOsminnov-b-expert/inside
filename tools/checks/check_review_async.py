# -*- coding: utf-8 -*-
"""Черновик документа закрыли, пока выбирался файл.

Код-ревью 09.10.2026 (docs/kod-revyu.xlsx): в «Учреждениях» после выбора
файла код писал в state.docNew, а черновик за это время могли закрыть
(«Отмена», другой узел) — TypeError «Cannot set properties of null».

Что ловит сценарий: ошибка на странице, если черновик закрыт, пока
выбирался файл (ошибка в консоли — провал сам по себе).
"""
NAME = 'учреждения: черновик и выбор файла'
TOUCHES = ('app/pages/institutions/institutions.js', 'app/pages/docs/detail.js')
def run(t):
    pg = t.page
    t.open('#/institutions', wait='.itree-row[data-inode]')
    pg.locator('.itree-row[data-inode] .itree-name').nth(2).click()
    t.wait_for('[data-itab="docs"]'); pg.click('[data-itab="docs"]')
    t.wait_for('[data-idoc-new]'); pg.click('[data-idoc-new]')
    t.wait_for('[data-idoc-file]')
    with pg.expect_file_chooser() as fc:
        pg.click('[data-idoc-file]')
    # пока выбирается файл — черновик закрывают
    pg.evaluate("() => { const c = document.querySelector('[data-idoc-new-cancel]'); if (c) c.click(); }")
    fc.value.set_files([{'name': 'a.pdf', 'mimeType': 'application/pdf', 'buffer': b'%PDF-1.4\n%%EOF'}])
    pg.wait_for_timeout(1500)
    t.ck(True, '')
