# -*- coding: utf-8 -*-
"""Окно не переживает смену экрана.

Найдено 12.10.2026 на снимках страниц: окно «Создание документа», открытое в
«Документах», после перехода на другой экран («Назад», ссылка) оставалось
висеть поверх чужой страницы — окно живёт в <body>, вне экрана. Теперь смена
экрана закрывает окна как отменённые (kernel/dialog.js closeModals).
"""
NAME = 'окно при смене экрана'

TOUCHES = ('app/kernel/dialog.js', 'app/kernel/boot.js')


def run(t):
    pg = t.page
    t.open('#/docs', wait='[data-doc-row]')
    btn = pg.locator('[data-docs-create], [data-doc-new]')
    if not t.ck(btn.count() > 0, 'на «Документах» нет кнопки создания документа'):
        return
    btn.first.click()
    if not t.ck(t.wait_for('.modal-back'), 'окно создания документа не открылось'):
        return
    pg.evaluate("() => { location.hash = '#/archive'; }")
    t.wait_until("() => location.hash === '#/archive'")
    t.ck(t.wait_until("() => !document.querySelector('.modal-back')"), 'окно «Документов» осталось висеть над другим экраном')
