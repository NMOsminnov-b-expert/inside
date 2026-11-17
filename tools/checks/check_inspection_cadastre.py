# -*- coding: utf-8 -*-
"""Запросы документов: регионал просит, осмотрщик отвечает, файл — в карточке.

ТЗ рабочего дня осмотрщика, раздел 5 (запись графа tz-rabota-osmotrschika).

Осмотрщик отвечает в приложении «Осмотр» (мост — cadastre / cadAnswer →
kernel/inspections.js answerCadRow); прежний экран осмотрщика #/insp с формой
ответа убран 16.11.2026. Ответ здесь кладётся той же функцией ядра.

Что ловит сценарий:
  * запрос в кадастр можно отдать осмотрщику без доступа в кадастр;
  * запрос без строк или без осмотрщика создаётся молча;
  * ответ «Получен» теряет итог, дату сканирования или файл; файл ложится в
    документы объекта без проверки ЦОД;
  * регионал не видит итог строки; отчёт по запросу — не xlsx;
  * в консоли ошибки.
"""
import base64
import os
import tempfile

from check_archive import make_pdf

NAME = 'запросы документов'

TOUCHES = ('app/pages/osmotr/*', 'app/pages/inspections/*', 'app/kernel/inspections.js',
           'app/kernel/inspectionsDemo.js', 'app/kernel/institutions.js')

K = "import('./app/kernel/inspections.js')"


def run(t):
    pg = t.page
    pdf = os.path.join(tempfile.gettempdir(), '_tmp_check_cad.pdf')
    make_pdf(pdf, pages=1)
    try:
        t.open('#/inspections', wait='[data-ip-section]')
        pg.click('[data-ip-section="cadastre"]')
        pg.click('[data-ip-cad-new]')
        t.wait_for('[data-ip-cad-create]')
        pg.click('[data-ip-cad-create]')
        t.ck(t.wait_until("() => /объект/.test(document.querySelector('[data-ip-cad-err]')?.textContent || '')"),
             'запрос без строк не остановился')

        with_access = pg.evaluate("async () => { const k = await %s; return k.profileNames().filter((n) => k.profileOf(n).cadastre); }" % K)
        without = pg.evaluate("async () => { const k = await %s; return k.profileNames().filter((n) => !k.profileOf(n).cadastre); }" % K)
        if not t.ck(with_access and without, 'в демо нет осмотрщиков с доступом в кадастр и без него: %s / %s' % (with_access, without)):
            return
        t.ck(pg.locator('[data-ip-cadf="person"] option[value="%s"][disabled]' % without[0]).count() == 1,
             'осмотрщика без доступа в кадастр можно выбрать для запроса в кадастр')
        who = with_access[0]

        pg.fill('[data-ip-cad-q]', '1030700')
        t.wait_for('[data-ip-cad-add]')
        pg.locator('[data-ip-cad-add]').first.click()
        t.ck(t.wait_for('[data-ip-cad-row="0"][data-k="doc"]'), 'объект не добавился строкой запроса')
        pg.click('[data-ip-cad-create]')
        t.ck(t.wait_until("() => /осмотрщик/i.test(document.querySelector('[data-ip-cad-err]')?.textContent || '')"),
             'запрос без осмотрщика не остановился')
        pg.select_option('[data-ip-cadf="person"]', who)
        pg.fill('[data-ip-cad-row="0"][data-k="note"]', 'проверка')
        # Филиал Кадастра (16.11.2026): по умолчанию — филиал области объекта; без филиала запрос не создаётся.
        branch = pg.eval_on_selector('[data-ip-cadf="branch"]', 'e => e.value')
        t.ck(branch.startswith('kb-bish'), 'филиал не подставился по объекту из Бишкека: %r' % branch)
        pg.select_option('[data-ip-cadf="branch"]', '')
        pg.click('[data-ip-cad-create]')
        t.ck(t.wait_until("() => /филиал/i.test(document.querySelector('[data-ip-cad-err]')?.textContent || '')"),
             'запрос в кадастр без филиала не остановился')
        pg.select_option('[data-ip-cadf="branch"]', 'kb-bish-2')
        t.ck(t.wait_until("() => /Токтогулов/.test(document.querySelector('.ip-cadform')?.textContent || '')"), 'у выбранного филиала не видно ответственного')
        pg.click('[data-ip-cad-create]')
        t.ck(t.wait_until("() => /№ \\d+/.test(document.querySelector('.ip-card h1')?.textContent || '')"), 'запрос не создан')
        req = pg.evaluate("async () => { const r = (await %s).allCadRequests()[0]; return [r.id, r.rows[0].id, r.rows[0].typeId, r.rows[0].ocId, r.rows[0].eni, r.rows[0].doc]; }" % K)
        rid, rowid, type_id, oc_id, eni, doc = req
        t.ck(pg.evaluate("async () => (await %s).allCadRequests()[0].branch" % K) == 'kb-bish-2', 'филиал не записался в запрос')

        # --- правка и без повторов (решение пользователя 05.11.2026 «Правка и без повторов») ---
        pg.click('[data-ip-cad-new]')
        pg.fill('[data-ip-cad-q]', '1030700')
        t.wait_for('[data-ip-cad-add]')
        pg.locator('[data-ip-cad-add]').first.click()
        t.wait_for('[data-ip-cad-row="0"][data-k="doc"]')
        pg.fill('[data-ip-cad-q]', '1030700')
        t.wait_for('[data-ip-cad-add]')
        pg.locator('[data-ip-cad-add]').first.click()
        t.wait_for('[data-ip-cad-row="1"][data-k="doc"]')
        d2 = [pg.input_value('[data-ip-cad-row="%d"][data-k="doc"]' % i) for i in (0, 1)]
        t.ck(d2[0] != d2[1], 'один объект дважды добавился с одним и тем же документом: %s' % d2)
        pg.select_option('[data-ip-cadf="person"]', who)
        pg.click('[data-ip-cad-create]')
        t.ck(t.wait_until("() => /уже ждёт ответа в запросе/.test(document.querySelector('[data-ip-cad-err]')?.textContent || '')"),
             'пара «объект + документ» из открытого запроса добавилась во второй запрос')
        pg.click('[data-ip-cad-cancel]')
        pg.click('[data-ip-cad="%s"]' % rid)
        pg.click('[data-ip-cad-edit="%s"]' % rid)
        t.wait_for('[data-ip-cadf="due"]')
        pg.fill('[data-ip-cadf="due"]', '2099-04-04')
        pg.dispatch_event('[data-ip-cadf="due"]', 'change')
        pg.click('[data-ip-cad-create]')
        ed = pg.evaluate("async (id) => { const r = (await %s).cadRequest(id); return [r.due, r.rows.length, (r.log || []).map((x) => x.kind)]; }" % K, rid)
        t.ck(ed[0] == '2099-04-04' and ed[1] == 1 and 'edit' in ed[2], 'правка открытого запроса не записалась: %s' % ed)
        t.ck(t.wait_for('[data-ip-cad-remind="%s"]' % rid), 'у открытого запроса нет «Напомнить»')
        pg.click('[data-ip-cad-remind="%s"]' % rid)
        t.ck(t.wait_until("() => /напомнено/.test(document.querySelector('.ip-cad-log')?.textContent || '')"), 'напоминание не отмечено в запросе')

        # --- осмотрщик отвечает (как мост cadAnswer) --------------------------------
        b64 = base64.b64encode(open(pdf, 'rb').read()).decode()
        pg.evaluate("""async ([rid, rowid, b64]) => { const k = await %s;
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const file = new File([bytes], 'документ.pdf', { type: 'application/pdf' });
          return !!(await k.answerCadRow(rid, rowid, { result: 'got', scanDate: '2026-10-01', file, fileName: file.name })); }""" % K, [rid, rowid, b64])

        got = pg.evaluate("""async ([rid, rowid, tid, oid]) => {
          const k = await %s; const reg = await import('./app/kernel/registry.js');
          const row = k.cadRequest(rid).rows.find((x) => x.id === rowid);
          const rec = reg.getType(tid).records.loadRecord(oid);
          const d = (rec.docs || []).find((x) => x.id === (row.file || {}).docId);
          return [row.result, row.scanDate, (row.file || {}).name, d ? [d.date, d.type, d.name, !!d.file] : null, !!(row.file || {}).attached];
        }""" % K, [rid, rowid, type_id, oc_id])
        t.ck(got[0] == 'got' and got[1] == '2026-10-01', 'итог строки сохранён неверно: %s' % got)
        t.ck(bool(got[2]) and got[2].endswith('.pdf'), 'у ответа нет файла: %s' % got[2])
        # Решение 27.10.2026 (В2): файл ждёт проверки ЦОД, в документы записи сам не ложится.
        t.ck(got[3] is None and got[4], 'ответ кадастра попал в документы объекта без проверки ЦОД: %s' % (got,))

        # --- регионал видит итог и выгружает отчёт ------------------------------------
        t.open('#/inspections', wait='[data-ip-section]')
        pg.click('[data-ip-section="cadastre"]')
        pg.click('[data-ip-cad="%s"]' % rid)
        t.ck(t.wait_until("() => [...document.querySelectorAll('.ip-cadtbl .ip-rmark.ok')].length === 1"), 'регионал не видит «Получен» в строке запроса')
        with pg.expect_download(timeout=15000) as dl:
            pg.click('[data-ip-cad-xlsx="%s"]' % rid)
        out = os.path.join(tempfile.gettempdir(), '_tmp_check_cad.xlsx')
        dl.value.save_as(out)
        import openpyxl
        ws = openpyxl.load_workbook(out).active
        t.ck(ws.freeze_panes == 'A2' and ws.max_row == 2 and ws.cell(2, 7).value == 'Получен', 'отчёт по запросу неверен')
        # Закрыть — запрос «закрыт» в списке, «Открыть снова» возвращает.
        pg.click('[data-ip-cad-close="%s"]' % rid)
        t.ck(t.wait_until("(id) => /закрыт/.test(document.querySelector('[data-ip-cad=\"' + id + '\"]')?.textContent || '')", rid), 'закрытый запрос не помечен «закрыт» в списке')
        pg.click('[data-ip-cad-reopen="%s"]' % rid)
        t.ck(t.wait_for('[data-ip-cad-close="%s"]' % rid), '«Открыть снова» не вернуло запрос в работу')
        os.remove(out)
        t.ck(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'страница прокручивается вбок')
    finally:
        try:
            os.remove(pdf)
        except OSError:
            pass
