# -*- coding: utf-8 -*-
"""Сканы: выбор готового файла, предпросмотр, все страницы принятого документа
(решение пользователя 29.10.2026: «В сканы возвращаем выбор. На кнопку подгрузки.
На фото открываем google scan»; «В карточке показываем все страницы. Не по 1
фотаем. Предпросмотр тоже нужен если что. Обязательно»).

Что ловит сценарий:
  * у блока сканов нет двух кнопок «Сфотографировать» и «Загрузить файл» или они
    ниже 44 px;
  * загруженные снимки не становятся страницами черновика; PDF не раскладывается
    на страницы-картинки (по одной на страницу файла);
  * файл не того вида (не снимок и не PDF) принимается молча;
  * у черновика из файла есть «К страницам» (страниц редактора у него нет);
  * касание миниатюры черновика не открывает предпросмотр нужной страницы, у
    предпросмотра не листаются страницы;
  * отправленный скан не открывается предпросмотром со всеми страницами;
  * «Загрузить файл» у возвращённого скана не заменяет его страницы;
  * принятый многостраничный скан в просмотрщике карточки — одна страница
    (kernel/fileUpload.js ensureDocPages, kernel/viewer/doc.js docPageHTML), у
    осмотрщика в документах — одна страница (pages/inspector/docViewer.js docPages);
  * прокрутка вбок на 360 и 1280; ошибки консоли.
"""
from urllib.parse import quote

from check_inspector_scan import png, choose, no_hscroll

NAME = 'сканы: загрузка файла и все страницы'

TOUCHES = (
    'app/pages/inspector/*', 'app/kernel/viewer/pdf.js', 'app/kernel/viewer/doc.js', 'app/kernel/fileUpload.js',
    'app/kernel/scanQueue.js', 'app/kernel/inspectionResults.js', 'app/kernel/viewer.css',
)

ME = 'Осминнов Н.'
TYPE, OC = 'civil', 'oc-cv-1'
DOCS = '#/insp/civil/oc-cv-1/docs?as=' + quote(ME)


def pdf(pages):
    """Настоящий PDF на pages страниц — у каждой свой прямоугольник."""
    objs = ['<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [%s] /Count %d >>' % (' '.join('%d 0 R' % (3 + 2 * i) for i in range(pages)), pages)]
    for i in range(pages):
        body = '0 0 0 rg %d 20 120 200 re f' % (20 + 20 * i)
        objs.append('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents %d 0 R /Resources << >> >>' % (4 + 2 * i))
        objs.append('<< /Length %d >>\nstream\n%s\nendstream' % (len(body), body))
    out, offs = b'%PDF-1.4\n', []
    for n, o in enumerate(objs, 1):
        offs.append(len(out))
        out += ('%d 0 obj\n%s\nendobj\n' % (n, o)).encode('latin-1')
    xref = len(out)
    out += ('xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1)).encode('latin-1')
    out += ''.join('%010d 00000 n \n' % o for o in offs).encode('latin-1')
    out += ('trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, xref)).encode('latin-1')
    return out


SCANS = "([ty, oc]) => import('./app/pages/inspector/tasks.js').then((T) => T.scansOf(ty, oc).map((s) => ({ id: s.id, title: s.title, pages: s.pages.length, types: s.pages.map((p) => p.type) })))"


def run(t):
    pg = t.page
    pg.set_viewport_size({'width': 390, 'height': 860})
    t.open(DOCS, wait='[data-scan-upload]')
    start = pg.locator('.ins-scan-start .ins-btn')
    t.ck(start.count() == 2 and 'Сфотографировать' in start.nth(0).inner_text() and 'Загрузить файл' in start.nth(1).inner_text(),
         'нет двух кнопок «Сфотографировать» и «Загрузить файл»')
    t.ck(all(start.nth(i).bounding_box()['height'] >= 44 for i in range(2)), 'кнопки начала скана ниже 44 px')
    no_hscroll(t, 'блок сканов 390')
    before = len(pg.evaluate(SCANS, [TYPE, OC]))

    # Не снимок и не PDF — отказ.
    choose(pg, '[data-scan-upload]', [{'name': 'x.txt', 'mimeType': 'text/plain', 'buffer': b'hello'}])
    t.ck(t.wait_until("() => /не снимок и не PDF/.test(document.body.innerText)"), 'текстовый файл принят молча')
    t.ck(pg.locator('[data-scan-save]').count() == 0, 'черновик из текстового файла создан')

    # «Загрузить файл» — окно прикрепления, как в документах карточки (решение
    # 29.10.2026): несколько файлов, у каждого — название, вид, к чему
    # относится, миниатюра и предпросмотр; каждый файл — свой скан.
    choose(pg, '[data-scan-upload]', [{'name': 'Акт обмера.pdf', 'mimeType': 'application/pdf', 'buffer': pdf(3)},
                                      {'name': 'Свидетельство.png', 'mimeType': 'image/png', 'buffer': png(300, 400)}])
    t.ck(t.wait_for('.modal.vattach.with-place'), 'загрузка не открыла окно прикрепления')
    rows = pg.locator('.vattach-row')
    t.ck(rows.count() == 2, 'в окне не два файла')
    t.ck(pg.locator('[data-att-name]').count() == 2 and pg.locator('[data-att-type]').count() == 2
         and pg.locator('[data-att-place]').count() == 2, 'у файлов нет своих названия, вида и «К чему относится»')
    t.ck(t.wait_until("() => document.querySelector('[data-att-peek=\"0\"] img')", 15000), 'у PDF нет миниатюры первой страницы')
    t.ck(all(pg.locator('.vattach-thumb').nth(k).bounding_box()['height'] >= 44 for k in range(2)), 'миниатюра ниже 44 px')
    no_hscroll(t, 'окно прикрепления 390')
    # Предпросмотр PDF — все три страницы.
    pg.click('[data-att-peek="0"]')
    t.ck(t.wait_until("() => document.querySelectorAll('.vattach-peek-body figure').length === 3", 15000),
         'предпросмотр PDF не на три страницы')
    pg.click('[data-att-back]')
    t.wait_for('[data-att-name]')
    # Параметры каждому своему.
    pg.fill('[data-att-name="0"]', 'Акт обмера')
    pg.select_option('[data-att-type="0"]', index=0)
    t0 = pg.input_value('[data-att-type="0"]')
    opts = pg.eval_on_selector_all('[data-att-place="1"] option', 'els => els.map((e) => e.value)')
    if len(opts) > 1:
        pg.select_option('[data-att-place="1"]', opts[1])
    pg.fill('[data-att-name="1"]', 'Свидетельство')
    pg.click('[data-att-ok]')
    t.ck(t.wait_until("() => !document.querySelector('.modal.vattach')"), 'окно не закрылось после «Отправить»')
    t.wait_until("async ([ty, oc, n]) => (await import('./app/pages/inspector/tasks.js')).scansOf(ty, oc).length === n", [TYPE, OC, before + 2], 15000)
    scans = pg.evaluate(SCANS, [TYPE, OC])
    act = [s for s in scans if s['title'] == 'Акт обмера']
    sv = [s for s in scans if s['title'] == 'Свидетельство']
    t.ck(len(scans) == before + 2, 'два файла не стали двумя сканами: %d → %d' % (before, len(scans)))
    t.ck(act and act[0]['pages'] == 3 and set(act[0]['types']) == {'image/jpeg'}, 'скан из PDF не на 3 страницы-картинки: %s' % act)
    t.ck(sv and sv[0]['pages'] == 1, 'снимок не стал сканом в 1 страницу: %s' % sv)
    meta = pg.evaluate("""async ([ty, oc]) => (await import('./app/pages/inspector/tasks.js')).scansOf(ty, oc)
      .filter((s) => ['Акт обмера', 'Свидетельство'].includes(s.title)).map((s) => ({ t: s.title, type: s.docType || '', oi: s.oiId || '' }))""", [TYPE, OC])
    by = {m['t']: m for m in meta}
    t.ck(by.get('Акт обмера', {}).get('type') == t0, 'вид документа из окна не сохранился в скане: %s' % meta)
    if len(opts) > 1:
        t.ck(by.get('Свидетельство', {}).get('oi') == opts[1], '«К чему относится» из окна не сохранилось: %s' % meta)
    # ЦОД видит предложенный вид первым.
    qtype = pg.evaluate("""async ([ty, oc]) => { const Q = await import('./app/kernel/scanQueue.js');
      return Q.scanQueue({ source: 'осмотр' }).filter((x) => x.ocId === oc && x.title === 'Акт обмера').map((x) => x.docType); }""", [TYPE, OC])
    t.ck(qtype == [t0], 'в очереди ЦОД нет вида, предложенного осмотрщиком: %s' % qtype)
    new = act

    # Отправленный скан — предпросмотр всех страниц по касанию названия.
    sid = new[0]['id'] if new else ''
    pg.click('[data-scan-peek="scan-%s|0"]' % sid)
    t.ck(t.wait_until("() => /1 \/ 3/.test((document.querySelector('.ins-viewer-pages') || {}).textContent || '')"),
         'отправленный скан не открывается предпросмотром на 3 страницы')
    pg.click('[data-doc-close]')

    # Возвращённый скан — «Загрузить файл» заменяет страницы (черновик с предпросмотром).
    choose(pg, '[data-scan-retake-upload]', [{'name': 'Договор.pdf', 'mimeType': 'application/pdf', 'buffer': pdf(2)}])
    t.ck(t.wait_until("() => document.querySelectorAll('[data-scan-peek^=\"scan-draft|\"]').length === 2", 15000),
         'загрузка у возвращённого скана не дала черновик на 2 страницы')
    t.ck(pg.locator('[data-scan-back]').count() == 0, 'у черновика из файла есть «К страницам»')
    pg.click('[data-scan-peek="scan-draft|1"]')
    t.ck(t.wait_until("() => /2 \/ 2/.test((document.querySelector('.ins-viewer-pages') || {}).textContent || '')"),
         'предпросмотр черновика открылся не на второй странице')
    pg.click('[data-doc-close]')
    pg.click('[data-scan-save]')
    t.ck(t.wait_until("() => !document.querySelector('[data-scan-save]')"), 'пересъёмка файлом не отправилась')
    ret = pg.evaluate("""async ([ty, oc]) => (await import('./app/pages/inspector/tasks.js')).scansOf(ty, oc)
      .filter((s) => s.title === 'Договор аренды').map((s) => ({ pages: s.pages.length, retake: !!s.retake }))""", [TYPE, OC])
    t.ck(ret == [{'pages': 2, 'retake': False}], 'загрузка файлом не заменила страницы возвращённого скана: %s' % ret)

    # Принятый многостраничный скан — все страницы в просмотрщике карточки и у осмотрщика.
    res = pg.evaluate("""async ([ty, oc, id]) => {
      const Q = await import('./app/kernel/scanQueue.js');
      const F = await import('./app/kernel/fileUpload.js');
      const V = await import('./app/kernel/viewer/doc.js');
      const D = await import('./app/pages/inspector/docViewer.js');
      const doc = Q.acceptScan(`scan|${ty}|${oc}|${id}`, { docType: 'Акт обмера' });
      const d = { ...doc, pages: null };
      F.ensureDocPages(d);
      const html = d.pages.map((_, i) => V.docPageHTML(d, i + 1));
      return { pages: d.pages.length, imgs: html.filter((h) => /<img class="vimg" src="blob:/.test(h)).length,
               distinct: new Set(html).size, insp: D.docPages(doc).length };
    }""", [TYPE, OC, sid])
    t.ck(res['pages'] == 3 and res['imgs'] == 3 and res['distinct'] == 3,
         'просмотрщик карточки показывает не все страницы принятого скана: %s' % res)
    t.ck(res['insp'] == 3, 'у осмотрщика в документах не все страницы принятого скана: %s' % res)

    pg.set_viewport_size({'width': 360, 'height': 800})
    no_hscroll(t, 'блок сканов 360')
    pg.set_viewport_size({'width': 1280, 'height': 900})
    no_hscroll(t, 'блок сканов 1280')
