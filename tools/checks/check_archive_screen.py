# -*- coding: utf-8 -*-
"""Экран архива: столбцы, группировка, панель содержимого, флажки (ТЗ
docs/tz/20-arhiv.md, §7-§8, этап 6).

check_ui_text.py сканирует #/archive тоже, но архив при старте пуст (демо
записей нет — §16), поэтому его сканирование ни разу не видит настоящую
таблицу/группы/панель содержимого этого экрана. Здесь — то же самое (текст
без кода/id, таблица не шире блока), но на РЕАЛЬНЫХ записях нескольких видов,
плюс сама механика экрана:

  * столбцы (kernel/columns.js): меню состава, сброс, сортировка кликом по
    шапке — обязаны отражаться на реально показанных столбцах;
  * группировка «по объекту»: сумма записей в группах равна плоскому списку;
  * панель содержимого открывается по клику на строку и показывает разный
    снимок для разных видов записи (документ/литера/объект/справочник) без
    утечки кода/id в тексте;
  * флажки и панель групповых действий: счётчик выбранного, снятие выбора;
  * фасет-счётчики самоисключаются (§7.3): включение фильтра «Вид записи»
    не обнуляет сам этот фасет.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_ui_text import _check_text, _check_tables, _visible_text  # noqa: E402

NAME = 'экран архива'

PDF_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_tmp_check_screen.pdf')


def make_pdf(path):
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


def run(t):
    try:
        _run(t)
    finally:
        if os.path.exists(PDF_PATH):
            os.remove(PDF_PATH)


def _run(t):
    pg = t.page

    # --- собрать записи нескольких видов -----------------------------------
    t.open('#/oc/civil/oc-cv-1', wait='.card')
    pg.wait_for_timeout(600)
    make_pdf(PDF_PATH)
    attach = pg.locator('button:has-text("Прикрепить файл")')
    if attach.count():
        attach.first.click()
        pg.wait_for_timeout(400)
        with pg.expect_file_chooser() as fc:
            pg.locator('[data-modal-opt]').first.click()
        fc.value.set_files(PDF_PATH)
        pg.wait_for_timeout(2200)
        arc = pg.locator('[data-varchive]')
        if arc.count():
            arc.first.click()
            pg.wait_for_timeout(400)
            pg.locator('[data-modal-ok], .modal-foot .btn-primary').first.click()
            pg.wait_for_timeout(700)

    t.open('#/oc/civil/oc-cv-1', wait='tr[data-open-oi]')
    pg.wait_for_timeout(500)
    del_oi = pg.locator('tr[data-open-oi] [data-del-oi]')
    if del_oi.count():
        del_oi.first.click()
        pg.wait_for_timeout(400)
        pg.locator('[data-modal-ok], .modal-foot .btn-primary').first.click()
        pg.wait_for_timeout(700)

    t.open('#/oc/civil/oc-cv-2', wait='.card')
    pg.wait_for_timeout(500)
    btn = pg.locator('#btnDelOc')
    if btn.count():
        btn.first.click()
        pg.wait_for_timeout(400)
        pg.locator('[data-modal-ok], .modal-foot .btn-primary').first.click()
        pg.wait_for_timeout(900)

    t.open('#/dicts', wait='.dc-steps, .dc-tree')
    pg.wait_for_timeout(400)
    new_btn = pg.locator('[data-dc-new]')
    if new_btn.count():
        new_btn.first.click()
        pg.wait_for_timeout(300)
        pg.fill('[data-dc-new-name]', 'Проверка экрана архива')
        pg.keyboard.press('Enter')
        pg.wait_for_timeout(500)
        del_btn = pg.locator('[data-dc-del]')
        if del_btn.count():
            del_btn.first.click()
            pg.wait_for_timeout(300)
            pg.locator('[data-modal-ok]').first.click()
            pg.wait_for_timeout(400)

    # --- экран архива: список из нескольких видов ---------------------------
    t.open('#/archive', wait='.arc')
    pg.wait_for_timeout(600)
    rows = pg.locator('[data-arc-row]')
    total_flat = rows.count()
    t.ck(total_flat >= 3, 'в архиве меньше записей, чем должно быть после подготовки: %d' % total_flat)

    where = '#/archive (заполненный)'
    _check_text(t, where, _visible_text(pg))
    _check_tables(t, where, pg)

    # --- столбцы: меню, сортировка -------------------------------------------
    dd = pg.locator('[data-dd-toggle]')
    if t.ck(dd.count() > 0, 'нет кнопки меню столбцов'):
        dd.first.click()
        pg.wait_for_timeout(300)
        eni_opt = pg.locator('[data-column="eni"]')
        if t.ck(eni_opt.count() > 0, 'в меню столбцов нет пункта «ЕНИ»'):
            eni_opt.first.check()
            pg.wait_for_timeout(400)
            t.ck(pg.locator('[data-sort="eni"]').count() > 0, 'столбец «ЕНИ» не появился в шапке после включения')
        reset = pg.locator('[data-col-reset]')
        if reset.count():
            reset.first.click()
            pg.wait_for_timeout(400)
            t.ck(pg.locator('[data-sort="eni"]').count() == 0, 'сброс столбцов не спрятал обратно «ЕНИ»')

    # Меню столбцов остаётся открытым, пока не кликнут вне него (то же
    # поведение, что в реестре ОЦ, ocMenu.js) — закрываем явно, иначе оно
    # перекрывает шапку и следующий клик по сортировке не проходит.
    pg.locator('.arc-head h2').click()
    pg.wait_for_timeout(300)

    sort_by = pg.locator('[data-sort="archivedBy"]')
    if sort_by.count():
        before = rows.first.get_attribute('data-arc-row')
        sort_by.first.click()
        pg.wait_for_timeout(400)
        sort_by.first.click()
        pg.wait_for_timeout(400)
        t.ck(pg.locator('.reg-sort').count() > 0, 'нет значка направления сортировки после клика по шапке')

    # --- группировка по объекту: сумма сходится с плоским списком -----------
    grp = pg.locator('[data-arc-group]')
    if t.ck(grp.count() > 0, 'нет переключателя группировки «по объекту»'):
        grp.first.click()
        pg.wait_for_timeout(500)
        grouped_data_rows = pg.locator('[data-arc-row]').count()
        t.ck(grouped_data_rows == total_flat,
             'при группировке пропали или задвоились записи: %d вместо %d' % (grouped_data_rows, total_flat))
        t.ck(pg.locator('.arc-group-head').count() > 0, 'группировка включена, но заголовков групп не появилось')

        where = '#/archive (группировка по объекту)'
        _check_text(t, where, _visible_text(pg))
        _check_tables(t, where, pg)

        grp.first.click()
        pg.wait_for_timeout(400)

    # --- панель содержимого: разный снимок для разных видов -----------------
    for kind, must_have in [
        ('document', 'Тип'),
        ('oi', 'Литера'),
        ('oc', 'ЕНИ'),
        ('dict', 'Позиций'),
    ]:
        row = pg.locator('[data-arc-kind="%s"]' % kind).first
        if not row.count():
            continue
        row.click()
        pg.wait_for_timeout(500)
        panel_text = pg.locator('.arc-content').inner_text()
        t.ck(must_have in panel_text, 'панель содержимого для вида «%s» не показывает «%s»: %r'
             % (kind, must_have, panel_text[:200]))
        where = '#/archive (панель · %s)' % kind
        _check_text(t, where, _visible_text(pg))

    # --- флажки и панель групповых действий ----------------------------------
    select_all = pg.locator('[data-arc-select-all]')
    if t.ck(select_all.count() > 0, 'нет флажка «выбрать все видимые» в шапке'):
        select_all.first.check()
        pg.wait_for_timeout(400)
        bulk = pg.locator('.arc-bulk')
        t.ck(bulk.count() > 0, 'флажки выбраны, но полосы групповых действий не появилось')
        if bulk.count():
            n_selected = pg.locator('[data-arc-select]:checked').count()
            t.ck(str(n_selected) in bulk.first.inner_text(),
                 'счётчик выбранного не совпадает с числом отмеченных строк: %r' % bulk.first.inner_text())

        clear = pg.locator('[data-arc-bulk="clear"]')
        if clear.count():
            clear.first.click()
            pg.wait_for_timeout(300)
            t.ck(pg.locator('.arc-bulk').count() == 0, 'снятие выделения не убрало полосу групповых действий')

    # --- фасеты самоисключаются: включение «Вид записи» не обнуляет его же --
    kind_opt = pg.locator('[data-arc-f-kind]')
    if kind_opt.count() >= 1:
        first_kind_cb = kind_opt.first
        first_kind_cb.check()
        pg.wait_for_timeout(400)
        # После включения фильтра ровно этот же фасет не должен показывать 0 —
        # самоисключение считает по ОСТАЛЬНЫМ условиям, не по себе самому.
        still_present = pg.locator('[data-arc-f-kind]').count() >= 1
        t.ck(still_present, 'после выбора фильтра «Вид записи» сам фасет пропал целиком (нулевые счётчики себя)')
        shown = pg.locator('[data-arc-row]').count()
        t.ck(shown > 0, 'после фильтра по виду записи список стал пустым — фильтр не соответствует своим счётчикам')
        first_kind_cb.uncheck()
        pg.wait_for_timeout(300)

    # --- выгрузка CSV (§7.7) --------------------------------------------------
    export_btn = pg.locator('[data-arc-export]')
    if t.ck(export_btn.count() > 0, 'нет кнопки «Экспорт CSV»'):
        with pg.expect_download() as dl_info:
            export_btn.first.click()
        t.ck(dl_info.value.suggested_filename.endswith('.csv'), 'выгрузка не .csv-файл')

    # --- групповой возврат (§7.7, §5.2): отчёт и пометка «возвращено» --------
    select_all2 = pg.locator('[data-arc-select-all]')
    if select_all2.count():
        select_all2.first.check()
        pg.wait_for_timeout(300)
        restore_btn = pg.locator('[data-arc-bulk="restore"]')
        if t.ck(restore_btn.count() > 0, 'нет кнопки «Вернуть выбранное»'):
            restore_btn.first.click()
            pg.wait_for_timeout(1200)
            t.ck(pg.locator('.arc-bulk').count() == 0, 'после группового возврата выбор не сброшен')

            show_restored = pg.locator('[data-arc-show-restored]')
            if show_restored.count():
                show_restored.first.check()
                pg.wait_for_timeout(400)
                t.ck(pg.locator('.arc-restored-note').count() > 0,
                     'после группового возврата ни одна запись не помечена «возвращено»')
                where = '#/archive (возвращённые записи показаны)'
                _check_text(t, where, _visible_text(pg))
