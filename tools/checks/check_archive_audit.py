# -*- coding: utf-8 -*-
"""Лог действий при архивировании и возврате (ТЗ docs/tz/20-arhiv.md, §9).

До этого архивирование/возврат документа, объекта и литеры не оставляли следа
в логе объекта («Логи» на карточке ОЦ) — только сам факт исчезновения записи.
Теперь каждое из этих действий пишет строку в лог того же объекта, а лог
уезжает в архив вместе со снимком и виден снова после возврата.

Что держит сценарий:
  * документ, убранный в архив из карточки ОЦ, — строка «Убрано в архив» в
    логе объекта; после возврата — «Возвращено из архива»;
  * объект, убранный в архив, — строка «убран в архив (N документов,
    M литер)» в его собственном логе, который сохраняется в снимке и снова
    виден после возврата вместе с записью «возвращён из архива»;
  * литера, убранная в архив, — к обычному постатейному диффу добавляется
    итоговая строка «убрана в архив» (pushOiDeletionLog, дополненная флагом);
  * справочник, убранный в архив и возвращённый, — обе строки в «Журнале»
    раздела справочников.
"""
import os

NAME = 'лог действий архива'

PDF_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_tmp_check_audit.pdf')


def make_pdf(path):
    """Минимальный валидный однострочный PDF — чтобы не держать бинарь в git."""
    objs = ['<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] '
            '/Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>']
    stream = 'BT /F1 24 Tf 40 200 Td (STRANICA) Tj ET'
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


def _open_audit_tab(pg):
    tab = pg.locator('[data-tab="audit"]')
    if tab.count():
        tab.first.click()
        pg.wait_for_timeout(500)


def _open_acc(pg, key):
    """Строки лога лежат в свёрнутом по умолчанию аккордеоне на объект
    (audit/view.js, .acc-body{display:none} пока не .open) — раскрываем
    нужный, иначе Playwright не увидит текст внутри как невидимый."""
    toggle = pg.locator('[data-acc-toggle="%s"]' % key)
    if toggle.count():
        toggle.first.click()
        pg.wait_for_timeout(300)


def run(t):
    try:
        _run(t)
    finally:
        if os.path.exists(PDF_PATH):
            os.remove(PDF_PATH)


def _run(t):
    pg = t.page

    t.open('', wait='.reg-thead')
    role = pg.locator('[data-role]')
    if role.count():
        role.first.select_option('admin')
        pg.wait_for_timeout(500)

    # --- 1. документ карточки: архивирование и возврат пишутся в лог ОЦ ---
    # Берём документ без страниц (пустая карточка) — у него нет кнопки «В
    # архив» (нечего архивировать, см. parts/viewer/doc.js). Поэтому сначала
    # прикрепляем настоящий файл — как в check_archive.py — и уже открытый
    # после прикрепления просмотрщик даёт кнопку архивирования.
    t.open('#/oc/civil/oc-cv-1', wait='.card')
    pg.wait_for_timeout(600)
    make_pdf(PDF_PATH)

    attach_btn = pg.locator('button:has-text("Прикрепить файл")')
    if t.ck(attach_btn.count() > 0, 'нет кнопки «Прикрепить файл» для проверки лога документа'):
        attach_btn.first.click()
        pg.wait_for_timeout(500)
        with pg.expect_file_chooser() as fc:
            pg.locator('[data-modal-opt]').first.click()
        fc.value.set_files(PDF_PATH)
        pg.wait_for_timeout(2500)

        archive_btn = pg.locator('[data-varchive]')
        if t.ck(archive_btn.count() > 0, 'в просмотрщике нет кнопки «Убрать в архив»'):
            archive_btn.first.click()
            pg.wait_for_timeout(500)
            pg.locator('[data-modal-ok], .modal-foot .btn-primary').first.click()
            pg.wait_for_timeout(700)

            _open_audit_tab(pg)
            _open_acc(pg, 'audit-obj|oc')
            log_text = pg.locator('.audit-tbl').first.inner_text() if pg.locator('.audit-tbl').count() else ''
            t.ck('Убрано в архив' in log_text, 'архивирование документа не появилось в логе объекта: %r' % log_text[:200])

    # --- 2. возврат документа — «Возвращено из архива» в том же логе ---
    t.open('#/archive', wait='.arc')
    pg.wait_for_timeout(500)
    doc_restore = pg.locator('[data-arc-kind="document"] [data-arc-restore]').first
    if t.ck(doc_restore.count() > 0, 'нет архивной записи документа для проверки возврата'):
        doc_restore.click()
        pg.wait_for_timeout(900)

        t.open('#/oc/civil/oc-cv-1', wait='.card')
        pg.wait_for_timeout(600)
        _open_audit_tab(pg)
        _open_acc(pg, 'audit-obj|oc')
        log_text = pg.locator('.audit-tbl').first.inner_text() if pg.locator('.audit-tbl').count() else ''
        t.ck('Возвращено из архива' in log_text, 'возврат документа не появился в логе объекта: %r' % log_text[:200])

    # --- 3. объект: лог архивирования уезжает со снимком и виден после возврата ---
    t.open('#/oc/civil/oc-cv-1', wait='.card')
    pg.wait_for_timeout(600)
    btn = pg.locator('#btnDelOc')
    if t.ck(btn.count() > 0, 'в карточке объекта нет кнопки убрать в архив'):
        btn.first.click()
        pg.wait_for_timeout(500)
        pg.locator('[data-modal-ok], .modal-foot .btn-primary').first.click()
        pg.wait_for_timeout(1200)

        t.open('#/archive', wait='.arc')
        pg.wait_for_timeout(500)
        oc_restore = pg.locator('[data-arc-kind="oc"] [data-arc-restore]').first
        if t.ck(oc_restore.count() > 0, 'объект не появился в архиве после убирания'):
            oc_restore.click()
            pg.wait_for_timeout(1200)

            t.open('#/oc/civil/oc-cv-1', wait='.card')
            pg.wait_for_timeout(600)
            _open_audit_tab(pg)
            _open_acc(pg, 'audit-obj|oc')
            log_text = pg.locator('.audit-tbl').first.inner_text() if pg.locator('.audit-tbl').count() else ''
            t.ck('убран в архив' in log_text, 'в логе вернувшегося объекта нет строки архивирования: %r' % log_text[:200])
            t.ck('Возвращено из архива' in log_text, 'в логе вернувшегося объекта нет строки возврата: %r' % log_text[:200])

    # --- 4. литера: диффу добавлена итоговая строка «убрана в архив» ---
    t.open('#/oc/civil/oc-cv-1', wait='tr[data-open-oi]')
    pg.wait_for_timeout(600)
    oi_row = pg.locator('tr[data-open-oi]').first
    oi_id = oi_row.get_attribute('data-open-oi') if oi_row.count() else None
    del_oi = oi_row.locator('[data-del-oi]')
    if t.ck(del_oi.count() > 0, 'в перечне ОИ нет кнопки убрать литеру'):
        del_oi.first.click()
        pg.wait_for_timeout(500)
        modal_text = pg.locator('.modal').inner_text() if pg.locator('.modal').count() else ''
        t.ck('архив' in modal_text.lower(), 'диалог удаления литеры не упоминает архив: %r' % modal_text)
        pg.locator('[data-modal-ok], .modal-foot .btn-primary').first.click()
        pg.wait_for_timeout(800)

        _open_audit_tab(pg)
        _open_acc(pg, 'audit-obj|' + oi_id if oi_id else '')
        log_text = pg.locator('.audit-tbl, .audit-row').first.inner_text() if pg.locator('.audit-tbl, .audit-row').count() else t.text()
        t.ck('убрана в архив' in log_text.lower() or 'убрано в архив' in log_text.lower(),
             'в логе после удаления литеры нет строки «убрана в архив»: %r' % log_text[:200])

    # --- 5. справочник: обе строки в журнале раздела ---
    t.open('#/dicts', wait='.dc-steps, .dc-tree')
    pg.wait_for_timeout(500)
    pg.locator('[data-dc-new]').first.click()
    pg.wait_for_timeout(300)
    pg.fill('[data-dc-new-name]', 'Проверка лога справочников')
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(600)

    del_btn = pg.locator('[data-dc-del]')
    if t.ck(del_btn.count() > 0, 'нет кнопки убрать справочник в архив — журнал нечем проверить'):
        del_btn.first.click()
        pg.wait_for_timeout(400)
        pg.locator('[data-modal-ok]').first.click()
        pg.wait_for_timeout(500)

        pg.locator('[data-dc-log]').first.click()
        pg.wait_for_timeout(400)
        log_text = pg.locator('.modal').inner_text() if pg.locator('.modal').count() else ''
        t.ck('Проверка лога справочников' in log_text and 'архив' in log_text.lower(),
             'архивирование справочника не появилось в журнале раздела: %r' % log_text[:300])
        pg.locator('[data-modal-cancel]').first.click()
        pg.wait_for_timeout(300)

    t.open('#/archive', wait='.arc')
    pg.wait_for_timeout(500)
    dict_row = pg.locator('[data-arc-kind="dict"]').filter(has_text='Проверка лога справочников')
    if t.ck(dict_row.count() == 1, 'справочник для проверки журнала не нашёлся в архиве'):
        dict_row.locator('[data-arc-restore]').first.click()
        pg.wait_for_timeout(900)

        t.open('#/dicts', wait='.dc-steps, .dc-tree')
        pg.wait_for_timeout(400)
        pg.locator('[data-dc-log]').first.click()
        pg.wait_for_timeout(400)
        log_text = pg.locator('.modal').inner_text() if pg.locator('.modal').count() else ''
        t.ck('возвращён из архива' in log_text.lower(),
             'возврат справочника не появился в журнале раздела: %r' % log_text[:300])
