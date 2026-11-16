# -*- coding: utf-8 -*-
"""Сканы: принятый многостраничный скан — все страницы в просмотрщике карточки
(решение пользователя 29.10.2026: «В карточке показываем все страницы. Не по 1
фотаем»).

Сканы приходят из приложения «Осмотр» через мост (сканы описи и документов —
kernel/inspectionResults.js addResultScan). Блок сканов прежнего экрана
осмотрщика #/insp (съёмка, загрузка файла, черновик, предпросмотр, пересъёмка
файлом) убран 16.11.2026; здесь скан кладётся той же функцией ядра.

Что ловит сценарий:
  * принятый многостраничный скан в просмотрщике карточки — одна страница
    (kernel/fileUpload.js ensureDocPages, kernel/viewer/doc.js docPageHTML);
  * у страниц нет своих картинок или страницы повторяются;
  * в консоли ошибки.
"""
NAME = 'сканы: загрузка файла и все страницы'

TOUCHES = (
    'app/kernel/viewer/pdf.js', 'app/kernel/viewer/doc.js', 'app/kernel/fileUpload.js',
    'app/kernel/scanQueue.js', 'app/kernel/inspectionResults.js', 'app/kernel/viewer.css',
)

ME = 'Осминнов Н.'
TYPE, OC = 'civil', 'oc-cv-1'


def run(t):
    pg = t.page
    t.open('#/oc/%s/%s' % (TYPE, OC), wait='[data-oc-head]')
    # Три страницы-снимка — разные по содержимому (по байту в конце), как три кадра одного документа.
    sid = pg.evaluate("""async ([ty, oc, me]) => { const R = await import('./app/kernel/inspectionResults.js');
      const head = [137, 80, 78, 71, 13, 10, 26, 10];
      const files = [1, 2, 3].map((n) => new File([new Uint8Array([...head, n])], 'стр' + n + '.png', { type: 'image/png' }));
      R.addResultScan(ty, oc, files, { title: 'Договор аренды', by: me }); R.saveResults();
      const s = R.resultsOf(ty, oc).scans.filter((x) => x.title === 'Договор аренды').pop(); return s && s.id; }""", [TYPE, OC, ME])
    if not t.ck(bool(sid), 'скан не лёг в результаты осмотра'):
        return
    res = pg.evaluate("""async ([ty, oc, id]) => {
      const Q = await import('./app/kernel/scanQueue.js');
      const F = await import('./app/kernel/fileUpload.js');
      const V = await import('./app/kernel/viewer/doc.js');
      const doc = Q.acceptScan(`scan|${ty}|${oc}|${id}`, { docType: 'Акт обмера' });
      const d = { ...doc, pages: null };
      F.ensureDocPages(d);
      const html = d.pages.map((_, i) => V.docPageHTML(d, i + 1));
      return { pages: d.pages.length, imgs: html.filter((h) => /<img class="vimg" src="blob:/.test(h)).length, distinct: new Set(html).size };
    }""", [TYPE, OC, sid])
    t.ck(res['pages'] == 3 and res['imgs'] == 3 and res['distinct'] == 3,
         'просмотрщик карточки показывает не все страницы принятого скана: %s' % res)
