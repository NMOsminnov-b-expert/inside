# -*- coding: utf-8 -*-
"""«Перейти» в шапке на всех экранах (Ctrl+K) и документ описи на группу позиций.

Решения пользователя 06.11.2026: «На всех экранах» — одно поле «Перейти» в шапке каркаса:
объекты по ЕНИ и адресу, люди, разделы, сканы — с любого экрана; «Акт может быть составлен
на группу позиций» — документ описи относится к нескольким позициям.

Что ловит сценарий:
  * поля нет на странице документов, сканов или главной; Ctrl+K не ставит в него фокус;
  * объект не находится по ЕНИ, раздел — по названию; Enter не переходит;
  * в «Осмотрах (регионалы)» два поля «Перейти»;
  * скан на группу позиций принимается к одной позиции; в поиске документов группа — несколько строк.
"""
NAME = 'перейти (Ctrl+K) и акт на группу позиций'

TOUCHES = ('app/shell/goto.js', 'app/shell/shell.js', 'app/shell/shell.css', 'app/kernel/inventories.js',
           'app/kernel/allDocs.js', 'app/kernel/scanQueue.js', 'app/kernel/inspectionResults.js')

GIF = 'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='


def run(t):
    pg = t.page
    for route, wait in (('#/docs', '[data-docs-q]'), ('#/scans', '.sc-main'), ('', '[data-slice]')):
        t.open(route, wait=wait)
        t.ck(pg.locator('[data-goto]').count() == 1 and pg.locator('[data-goto]').is_visible(), 'нет поля «Перейти» на %r' % route)
    pg.locator('body').click(position={'x': 5, 'y': 5})
    pg.keyboard.press('Control+k')
    t.ck(t.wait_until("() => document.activeElement && document.activeElement.matches('[data-goto]')"), 'Ctrl+K не ставит фокус в «Перейти»')
    eni = pg.evaluate("""async () => { const R = await import('./app/kernel/registry.js'); const t = R.getType('civil');
      return t.records.queryRecords({ filter: {}, offset: 0, limit: 30 }).rows.find((s) => s.eni).eni; }""")
    pg.fill('[data-goto]', eni)
    t.ck(t.wait_until("(e) => [...document.querySelectorAll('.goto-list .goto-sep')].some((x) => /Объекты/i.test(x.textContent)) && (document.querySelector('.goto-list [role=option]') || {}).textContent.includes(e[0])", [eni]),
         'объект не найден по ЕНИ %s' % eni)
    pg.keyboard.press('Enter')
    t.ck(t.wait_until("() => location.hash.startsWith('#/oc/')"), 'Enter не открыл объект: %s' % pg.evaluate('location.hash'))
    pg.fill('[data-goto]', 'сканы')
    t.wait_until("() => /Сканы с осмотров/.test((document.querySelector('.goto-list') || {}).innerText || '')")
    pg.keyboard.press('Enter')
    t.ck(t.wait_until("() => location.hash.startsWith('#/scans')"), 'раздел «Сканы» не открыт из «Перейти»')
    t.open('#/inspections?s=people', wait='.ip-person-main')
    t.ck(pg.locator('[data-goto]').is_hidden() and pg.locator('[data-ip-jump]').count() == 1, 'в «Осмотрах» два поля «Перейти»')

    # Скан описи на группу позиций → документ у каждой позиции, в поиске — одна строка.
    st = pg.evaluate("""async () => { const I = await import('./app/kernel/inventories.js'); const IR = await import('./app/kernel/inspectionResults.js');
      const Q = await import('./app/kernel/scanQueue.js'); const R = await import('./app/kernel/registry.js');
      const inv = I.allInventories().find((x) => x.items.length >= 3); const ids = inv.items.slice(0, 3).map((x) => x.id);
      const oc = R.getType('civil').records.queryRecords({ filter: {}, offset: 0, limit: 3 }).rows[0].id;
      const b = Uint8Array.from(atob('%s'), (c) => c.charCodeAt(0));
      const s = IR.addResultScan('civil', oc, [new File([b], 'akt.gif', { type: 'image/gif' })], { title: 'Акт группы Проверка', by: 'Айдай', inv: { invId: inv.id, itemIds: ids } });
      const key = 'scan|civil|' + oc + '|' + s.id; const it = Q.scanQueue({}).find((x) => x.key === key);
      const doc = Q.acceptScan(key, { docType: 'Акт осмотра', title: 'Акт группы Проверка' });
      return { label: it.inv.item, per: ids.map((id) => I.itemDocsOf(inv.id, id).some((d) => d.id === doc.id)) }; }""" % GIF)
    t.ck(all(st['per']) and 'позиции' in st['label'], 'скан на группу позиций принят не ко всем позициям: %s' % st)
    t.open('#/docs', wait='[data-docs-q]')
    pg.fill('[data-docs-q]', 'Акт группы Проверка')
    t.wait_until("() => [...document.querySelectorAll('tbody tr')].some((r) => r.innerText.includes('Акт группы Проверка'))")
    rows = pg.eval_on_selector_all('tbody tr', "els => els.map((e) => e.innerText).filter((x) => x.includes('Акт группы Проверка'))")
    t.ck(len(rows) == 1 and 'позиции' in rows[0], 'документ группы в поиске — не одной строкой с позициями: %s' % rows)
