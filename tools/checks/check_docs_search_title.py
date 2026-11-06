# -*- coding: utf-8 -*-
"""Поиск по всем документам — по названию и имени файла; документ позиции описи открывается.

Решение пользователя 06.11.2026 на вопрос «Поиск документов — по названию или по имени
файла»: «По названию и имени файла» — поиск по названию, виду, номеру и имени файла;
документ позиции описи открывается из поиска.

Что ловит сценарий:
  * документ карточки не находится по названию, введённому ЦОД, — только по имени файла;
  * в столбце «Наименование» нет названия документа;
  * строка документа позиции описи не открывается (нет перехода и просмотра).
"""
NAME = 'документы: поиск по названию'

TOUCHES = ('app/kernel/allDocs.js', 'app/kernel/documentsRegistry.js', 'app/pages/docs/docs.js', 'app/pages/docs/docs.css')

GIF = 'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='


def search(t, pg, text):
    pg.fill('[data-docs-q]', text)
    t.wait_until("(s) => [...document.querySelectorAll('tbody tr')].some((r) => r.innerText.includes(s[0])) || /не найден|Нет документов/i.test(document.body.innerText)", [text])
    return pg.eval_on_selector_all('tbody tr', 'els => els.map((e) => e.innerText)')


def run(t):
    pg = t.page
    t.open('#/docs', wait='[data-docs-q]')
    # Документ карточки с названием, отличным от имени файла.
    pg.evaluate("""async () => { const R = await import('./app/kernel/registry.js'); const t = R.getType('civil');
      const rec = t.records.loadRecord(t.records.queryRecords({ filter: {}, offset: 0, limit: 5 }).rows[0].id);
      rec.docs = rec.docs || []; rec.docs.push({ id: 'chk-doc-1', type: 'Прочее', name: 'Паспорт принтера Проверка', date: '2026-11-06', status: 'Загружен',
        file: { name: 'test.png', mime: 'image/png', kind: 'image', dataUrl: 'data:image/gif;base64,%s', size: 43 } });
      const I = await import('./app/kernel/inventories.js'); const inv = I.allInventories()[0]; const item = inv.items[0];
      I.addItemDoc(inv.id, item.id, { id: 'chk-inv-doc', type: 'Акт осмотра', name: 'Акт позиции Проверка', date: '2026-11-06', status: 'Загружен',
        file: { name: 'akt.gif', mime: 'image/gif', kind: 'image', dataUrl: 'data:image/gif;base64,%s', size: 43 } });
      (await import('./app/kernel/allDocs.js')).resetCardDocuments(); }""" % (GIF, GIF))
    t.open('#/docs?x=1', wait='[data-docs-q]')
    t.open('#/docs', wait='[data-docs-q]')
    rows = search(t, pg, 'Паспорт принтера')
    t.ck(any('Паспорт принтера Проверка' in r for r in rows), 'документ не найден по названию: %s' % rows[:3])
    rows = search(t, pg, 'test.png')
    t.ck(any('Паспорт принтера Проверка' in r for r in rows), 'документ не найден по имени файла или нет названия в строке: %s' % rows[:3])
    # Документ позиции описи — открывается.
    rows = search(t, pg, 'Акт позиции Проверка')
    if t.ck(any('Акт позиции Проверка' in r for r in rows), 'документ позиции описи не найден по названию: %s' % rows[:3]):
        pg.locator('tbody tr', has_text='Акт позиции Проверка').first.click()
        t.ck(t.wait_until("() => decodeURIComponent(location.hash).startsWith('#/docs/inv:')"), 'строка документа описи не открывается: %s' % pg.evaluate('location.hash'))
        t.ck(t.wait_for('.docs-inv .viewer, .docs-inv [class*=viewer]'), 'у документа позиции описи нет просмотра')
        t.ck('Опись:' in pg.inner_text('.docs-inv-head'), 'не видно, из какой описи документ')
