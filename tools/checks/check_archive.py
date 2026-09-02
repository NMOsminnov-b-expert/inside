# -*- coding: utf-8 -*-
"""Архив документов: убрать, найти, вернуть, права доступа.

Решение пользователя 2026-09-02: документ из карточки не удаляется, а уходит в
архив; архив виден администратору и сотрудникам по их учреждениям.
"""
import os

NAME = 'архив документов'

PDF_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_tmp_check.pdf')


def make_pdf(path, pages=3):
    """Минимальный валидный многостраничный PDF — чтобы не держать бинарь в git."""
    objs = ['<< /Type /Catalog /Pages 2 0 R >>']
    kids = ' '.join('%d 0 R' % (4 + i * 2) for i in range(pages))
    objs.append('<< /Type /Pages /Kids [%s] /Count %d >>' % (kids, pages))
    objs.append('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    for i in range(pages):
        objs.append('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] '
                    '/Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>' % (5 + i * 2))
        stream = 'BT /F1 24 Tf 40 200 Td (STRANICA %d) Tj ET' % (i + 1)
        objs.append('<< /Length %d >>\nstream\n%s\nendstream' % (len(stream), stream))

    out = '%PDF-1.4\n'
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += '%d 0 obj\n%s\nendobj\n' % (i, body)
    xref = len(out)
    out += 'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1)
    for off in offsets:
        out += '%010d 00000 n \n' % off
    out += 'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, xref)
    open(path, 'wb').write(out.encode('latin-1'))


def run(t):
    pg = t.page
    make_pdf(PDF_PATH)

    try:
        # --- прикрепляем документ ---
        t.open('#/oc/civil/oc-cv-1')
        pg.locator('button:has-text("Прикрепить файл")').first.click()
        pg.wait_for_timeout(500)
        with pg.expect_file_chooser() as fc:
            pg.locator('[data-modal-opt]').first.click()
        fc.value.set_files(PDF_PATH)
        pg.wait_for_timeout(2500)
        t.ck('_tmp_check.pdf' in pg.locator('.vtitle').first.inner_text(),
             'документ не открылся после прикрепления')

        # --- убираем в архив ---
        arc = pg.locator('[data-varchive]')
        if not t.ck(arc.count() > 0, 'в просмотрщике нет кнопки «В архив»'):
            return
        arc.first.click()
        pg.wait_for_timeout(500)
        t.ck(pg.locator('.modal-head').count() > 0, 'архивация прошла без подтверждения')
        pg.locator('.modal-foot .btn-primary, [data-modal-ok]').first.click()
        pg.wait_for_timeout(900)

        # --- документ в архиве, со всем контекстом ---
        t.open('#/archive', wait='.arc')
        rows = pg.locator('[data-arc-row]')
        if not t.ck(rows.count() == 1, 'в архиве %d документов вместо одного' % rows.count()):
            return
        text = rows.first.inner_text()
        t.ck('_tmp_check.pdf' in text, 'в архиве не тот документ')
        t.ck('1-47-56' in text, 'в строке архива нет кода ЕНИ объекта')
        t.ck('Объект оценки' in text, 'в строке архива не указано, откуда документ')

        # --- поиск и фильтр ---
        pg.locator('[data-arc-q]').fill('заведомо-нет-такого')
        pg.wait_for_timeout(600)
        t.ck(pg.locator('[data-arc-row]').count() == 0, 'поиск в архиве ничего не фильтрует')

        pg.locator('[data-arc-q]').fill('_tmp_check')
        pg.wait_for_timeout(600)
        t.ck(pg.locator('[data-arc-row]').count() == 1, 'поиск по имени файла не нашёл документ')
        pg.locator('[data-arc-q]').fill('')
        pg.wait_for_timeout(500)

        chip = pg.locator('[data-facet="docType"]').first
        if chip.count():
            chip.click()
            pg.wait_for_timeout(600)
            t.ck(pg.locator('[data-arc-row]').count() == 1,
                 'фильтр по типу документа спрятал документ этого же типа')
            pg.locator('[data-facet="docType"]').first.click()
            pg.wait_for_timeout(400)

        # --- возвращаем ---
        pg.locator('[data-arc-restore]').first.click()
        pg.wait_for_timeout(900)
        t.ck(pg.locator('[data-arc-row]').count() == 0, 'документ остался в архиве после возврата')

        t.open('#/oc/civil/oc-cv-1')
        sb = pg.locator('[data-vsb-toggle]')
        if sb.count():
            sb.first.click()
            pg.wait_for_timeout(600)
        docs = pg.evaluate("""() => [...document.querySelectorAll('[data-vsb-doc]')]
            .map((b) => b.innerText)""")
        t.ck(any('_tmp_check' in d for d in docs), 'документ не вернулся в карточку')

        # --- права ---
        t.open('', wait='.reg-thead')
        role = pg.locator('[data-role]')
        if role.count():
            role.first.select_option('insp')
            pg.wait_for_timeout(700)
            hidden = pg.evaluate("""() => { const b = document.querySelector('[data-nav="archive"]');
                return b ? b.hidden : null; }""")
            t.ck(hidden is True, 'пункт «Архив» виден роли без закреплённых учреждений')

            t.open('#/archive', wait='.card')
            t.ck('Архив доступен' in t.text(), 'прямая ссылка на архив открылась без прав')

            # сотруднику с учреждением архив виден
            t.open('', wait='.reg-thead')
            inst = pg.locator('[data-institutions]')
            if inst.count():
                inst.first.fill('Министерство для ТЕСТА')
                inst.first.dispatch_event('change')
                pg.wait_for_timeout(700)
                hidden2 = pg.evaluate("""() => { const b = document.querySelector('[data-nav="archive"]');
                    return b ? b.hidden : null; }""")
                t.ck(hidden2 is False, 'пункт «Архив» скрыт от сотрудника с учреждением')
    finally:
        if os.path.exists(PDF_PATH):
            os.remove(PDF_PATH)
