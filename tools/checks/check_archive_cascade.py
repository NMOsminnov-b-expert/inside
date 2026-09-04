# -*- coding: utf-8 -*-
"""Возврат из архива поднимает всю ветку выше — подведку, главное учреждение
(docs/tz/20-arhiv.md, §4.2, §4.4; уточнение пользователя 04.09.2026).

До этого возврат каждого вида записи «останавливался» на своём уровне:
  * подведка возвращалась, «перепрыгивая» через ещё-архивное главное
    учреждение сразу к первому живому предку (например, к корню дерева) —
    главное учреждение оставалось в архиве, хотя формально было «на пути»;
  * объект оценки, чьё учреждение (или подведка) в архиве, становился
    нераспределённым — учреждение приходилось поднимать отдельно вручную,
    без автоматической повторной привязки объекта к нему;
  * документ, чей объект оценки в архиве, вообще отказывался возвращаться
    («Объект оценки не найден — вернуть документ некуда»).

Пользователь явно потребовал другое: возврат ЛЮБОГО уровня поднимает всю
цепочку выше сам, а не оставляет «сироту» или требует ручных дополнительных
действий. Сценарий проверяет все три уровня цепочки:
  1. подведка → тянет за собой главное учреждение;
  2. объект оценки → тянет подведку (если был в ней) и главное учреждение;
  3. документ → тянет объект оценки, подведку и главное учреждение.

Ограничение специально не распространено на литеру (объект имущества,
kind:'oi') — та по ТЗ §4.3 остаётся заблокированной, пока не вернут её
объект оценки: пользователь просил только про подведку/ОЦ/документ.

Уточнение того же дня (04.09.2026), сразу после первой версии: «поднимает
объект» — НЕ значит «поднимает вместе с ним и все остальные документы,
которые были у объекта». kernel/archive.js: buildOcEntries теперь ИЗЫМАЕТ
документы из снимка объекта при архивировании (раньше оставлял «БЕЗ
изъятия» — они и так были внутри снимка, и объект восстанавливался бы сразу
со всеми документами разом). restoreRecordEntry получил opts.skipDocs — для
случая, когда объект понадобился только как площадка под ОДИН документ
(ensureOcLive), остальные документы того же объекта остаются в архиве и
восстанавливаются по отдельности, когда до них дойдёт черед. Проверяется
шагом 4.
"""
import os

NAME = 'каскад возврата вверх по иерархии'

PDF_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_tmp_check_cascade.pdf')


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


def _open_institutions(t):
    t.open('#/institutions', wait='.itree')
    t.page.wait_for_timeout(500)


def _tree_has(t, name):
    return name in t.page.locator('.itree').inner_text()


def _new_branch(t, root_name, sub_name):
    """Корень + подведка под первым узлом дерева — общая подготовка для всех трёх случаев."""
    pg = t.page
    _open_institutions(t)
    pg.locator('.itree-row[data-inode]').first.click()
    pg.wait_for_timeout(400)
    pg.locator('[data-inew]').first.click()
    pg.wait_for_timeout(300)
    pg.fill('[data-iform-name]', root_name)
    pg.locator('[data-iform-save]').first.click()
    pg.wait_for_timeout(700)
    t.ck(pg.locator('.ihead h2').inner_text().strip() == root_name, 'корень ветки не создался: %s' % root_name)

    pg.locator('[data-inew]').first.click()
    pg.wait_for_timeout(300)
    pg.fill('[data-iform-name]', sub_name)
    pg.locator('[data-iform-save]').first.click()
    pg.wait_for_timeout(700)
    t.ck(pg.locator('.ihead h2').inner_text().strip() == sub_name, 'подведка ветки не создалась: %s' % sub_name)


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
        role.first.select_option('any')
        pg.wait_for_timeout(400)

    # --- 1. подведка тянет за собой главное учреждение -----------------------
    _new_branch(t, 'Каскад1-Главное', 'Каскад1-Подвед')
    pg.locator('.itree-row').filter(has_text='Каскад1-Главное').first.click()
    pg.wait_for_timeout(500)
    pg.locator('[data-idel]').first.click()
    pg.wait_for_timeout(500)
    pg.locator('[data-modal-ok], .modal-foot .btn-primary').first.click()
    pg.wait_for_timeout(1000)

    t.open('#/archive', wait='.arc')
    pg.wait_for_timeout(500)
    sub_row = pg.locator('[data-arc-kind="institution"]').filter(has_text='Каскад1-Подвед')
    if t.ck(sub_row.count() == 1, 'подведка «Каскад1-Подвед» не нашлась в архиве отдельной записью'):
        sub_row.first.locator('[data-arc-restore]').first.click()
        pg.wait_for_timeout(1200)

        _open_institutions(t)
        t.ck(_tree_has(t, 'Каскад1-Подвед'), 'сама подведка не вернулась')
        t.ck(_tree_has(t, 'Каскад1-Главное'),
             'подведка вернулась, но главное учреждение — нет (должна тянуть его за собой)')

    # --- 2. объект оценки тянет подведку и главное учреждение -----------------
    _new_branch(t, 'Каскад2-Главное', 'Каскад2-Подвед')
    pg.locator('[data-attach-open]').first.click()
    pg.wait_for_timeout(600)
    picks = pg.locator('[data-attach-pick]')
    if t.ck(picks.count() > 0, 'нет кандидатов на привязку объекта — шаг 2 некому проверить'):
        picks.first.check()
        pg.locator('[data-attach-apply]').first.click()
        pg.wait_for_timeout(800)
        t.ck(pg.locator('[data-itab="oc"] b').inner_text().strip() == '1',
             'объект не привязался к подведке «Каскад2-Подвед»')

        pg.locator('.itree-row').filter(has_text='Каскад2-Главное').first.click()
        pg.wait_for_timeout(500)
        pg.locator('[data-idel]').first.click()
        pg.wait_for_timeout(500)
        pg.locator('[data-modal-ok], .modal-foot .btn-primary').first.click()
        pg.wait_for_timeout(1200)

        t.open('#/archive', wait='.arc')
        pg.wait_for_timeout(500)
        oc_row = pg.locator('[data-arc-kind="oc"]').filter(has_text='Каскад2')
        if t.ck(oc_row.count() == 1, 'объект узла «Каскад2» не нашёлся в архиве'):
            oc_row.first.locator('[data-arc-restore]').first.click()
            pg.wait_for_timeout(1500)

            _open_institutions(t)
            t.ck(_tree_has(t, 'Каскад2-Подвед'), 'после возврата объекта подведка «Каскад2-Подвед» не вернулась')
            t.ck(_tree_has(t, 'Каскад2-Главное'), 'после возврата объекта главное учреждение «Каскад2-Главное» не вернулось')

    # --- 3. документ тянет объект, подведку и главное учреждение -------------
    _new_branch(t, 'Каскад3-Главное', 'Каскад3-Подвед')
    pg.locator('[data-attach-open]').first.click()
    pg.wait_for_timeout(600)
    picks3 = pg.locator('[data-attach-pick]')
    if t.ck(picks3.count() > 0, 'нет кандидатов на привязку объекта — шаг 3 некому проверить'):
        picks3.first.check()
        pg.locator('[data-attach-apply]').first.click()
        pg.wait_for_timeout(800)

        oc_link = pg.locator('[data-oc-row]')
        if t.ck(oc_link.count() > 0, 'привязанный объект не показался ссылкой в карточке подведки'):
            oc_link.first.click()
            pg.wait_for_timeout(700)
            make_pdf(PDF_PATH)
            attach = pg.locator('button:has-text("Прикрепить файл")')
            if t.ck(attach.count() > 0, 'в карточке объекта нет кнопки «Прикрепить файл»'):
                attach.first.click()
                pg.wait_for_timeout(400)
                with pg.expect_file_chooser() as fc:
                    pg.locator('[data-modal-opt]').first.click()
                fc.value.set_files(PDF_PATH)
                pg.wait_for_timeout(2200)
                t.ck(pg.locator('.vtitle').count() > 0 and '_tmp_check_cascade.pdf' in pg.locator('.vtitle').first.inner_text(),
                     'документ для шага 3 не прикрепился')

        _open_institutions(t)
        pg.locator('.itree-row').filter(has_text='Каскад3-Главное').first.click()
        pg.wait_for_timeout(500)
        pg.locator('[data-idel]').first.click()
        pg.wait_for_timeout(500)
        pg.locator('[data-modal-ok], .modal-foot .btn-primary').first.click()
        pg.wait_for_timeout(1200)

        t.open('#/archive', wait='.arc')
        pg.wait_for_timeout(500)
        doc_row = pg.locator('[data-arc-kind="document"]').filter(has_text='_tmp_check_cascade')
        if t.ck(doc_row.count() == 1, 'документ шага 3 не нашёлся в архиве'):
            doc_row.first.locator('[data-arc-restore]').first.click()
            pg.wait_for_timeout(1500)

            _open_institutions(t)
            t.ck(_tree_has(t, 'Каскад3-Подвед'), 'после возврата документа подведка «Каскад3-Подвед» не вернулась')
            t.ck(_tree_has(t, 'Каскад3-Главное'), 'после возврата документа главное учреждение «Каскад3-Главное» не вернулось')

            t.open('#/archive', wait='.arc')
            pg.wait_for_timeout(500)
            oc_left = pg.locator('[data-arc-kind="oc"]').filter(has_text='Каскад3')
            t.ck(oc_left.count() == 0,
                 'после возврата документа объект оценки остался в архиве — должен был подняться сам')

    # --- 4. возврат ОДНОГО документа не возвращает остальные документы того же
    # объекта — уточнение 04.09.2026 (см. docstring файла). oc-cv-1 в синтетике
    # несёт 2 настоящих документа («Гос. акт» и «Паспорт котла») — так проще
    # и надёжнее, чем прикреплять второй файл в один сеанс через интерфейс.
    t.open('#/oc/civil/oc-cv-1', wait='.card')
    pg.wait_for_timeout(500)
    sb = pg.locator('[data-vsb-toggle]')
    if sb.count() and 'on' not in (sb.first.get_attribute('class') or ''):
        sb.first.click()
        pg.wait_for_timeout(300)
    live_docs_before = pg.locator('[data-vsb-doc]').count()
    t.ck(live_docs_before >= 2, 'у oc-cv-1 меньше 2 документов в синтетике — шаг 4 некому проверить: %d' % live_docs_before)

    if live_docs_before >= 2:
        btn4 = pg.locator('#btnDelOc')
        btn4.first.click()
        pg.wait_for_timeout(400)
        pg.locator('[data-modal-ok], .modal-foot .btn-primary').first.click()
        pg.wait_for_timeout(1200)

        t.open('#/archive', wait='.arc')
        pg.wait_for_timeout(500)
        doc_rows4 = pg.locator('[data-arc-kind="document"]').filter(has_text='Киевская')
        if t.ck(doc_rows4.count() == live_docs_before,
                'в архиве не все документы объекта: %d вместо %d' % (doc_rows4.count(), live_docs_before)):
            doc_rows4.first.locator('[data-arc-restore]').first.click()
            pg.wait_for_timeout(1500)

            t.open('#/oc/civil/oc-cv-1', wait='.card')
            pg.wait_for_timeout(600)
            sb2 = pg.locator('[data-vsb-toggle]')
            if sb2.count() and 'on' not in (sb2.first.get_attribute('class') or ''):
                sb2.first.click()
                pg.wait_for_timeout(300)
            live_docs_after = pg.locator('[data-vsb-doc]').count()
            t.ck(live_docs_after == 1,
                 'возврат одного документа вернул не ровно один: %d документов на карточке вместо 1' % live_docs_after)

            t.open('#/archive', wait='.arc')
            pg.wait_for_timeout(500)
            show_restored4 = pg.locator('[data-arc-show-restored]')
            if show_restored4.count():
                show_restored4.first.check()
                pg.wait_for_timeout(500)
            doc_rows4_after = pg.locator('[data-arc-kind="document"]').filter(has_text='Киевская')
            restored_n = sum(1 for i in range(doc_rows4_after.count())
                              if 'arc-restored' in (doc_rows4_after.nth(i).get_attribute('class') or ''))
            t.ck(restored_n == 1,
                 'помечено возвращённым не ровно %d документ, а %d из %d' % (1, restored_n, doc_rows4_after.count()))
