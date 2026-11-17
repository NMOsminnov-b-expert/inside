# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика (17.11.2026): прикреплённые файлы — открыть и открепить (пользователь: «нужна возможность
открепить прикрепленный скан… например при запросах в кадастр. Ну и так же открыть его просмотр»; ответы: открепили —
«Строка снова ждёт»; принятый ЦОД — «Нельзя»).

Что ловит сценарий:
  * у ответа «Получен» не видно прикреплённого скана карточкой (имя, вид) или его нельзя открыть;
  * просмотр не показывает файл; открепление без подтверждения; после открепления строка не ждёт ответа,
    скан остаётся у строки или в очереди ЦОД «Сканы с осмотров»;
  * скан, принятый ЦОД, можно открепить;
  * выбранный, но не отправленный файл нельзя открыть или убрать до отправки;
  * ответ «Получен» с уже прикреплённым сканом требует файл заново;
  * снимок позиции описи не открывается и не удаляется (органическая опись и механизмы);
  * на 360 пикселях экраны прокручиваются вбок.
"""
from urllib.parse import quote

from harness import use_cadastre_fixture

NAME = 'прикреплённые файлы (веб)'

TOUCHES = ('app/pages/osmotr/*', 'app/kernel/inspections.js', 'app/kernel/inventories.js', 'app/kernel/scanQueue.js')

PNG = bytes.fromhex('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
                    '1f15c4890000000d4944415478da63f8cfc0f01f0005000201a5c0a3d40000000049454e44ae426082')
ROW = """async ([q, r]) => { const k = await import('./app/kernel/inspections.js'); return (k.allCadRequests().find((x) => x.id === q).rows.find((x) => x.id === r)) || {}; }"""
QUEUE = """async ([q, r]) => (await import('./app/kernel/scanQueue.js')).scanQueue().some((x) => x.key === 'cad|' + q + '|' + r)"""


def run(t):
    pg = t.page
    use_cadastre_fixture(pg)
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    req = pg.evaluate("""async () => { const k = await import('./app/kernel/inspections.js'); const s = (await import('./app/kernel/session.js')).session.state;
      const a = k.assignmentsOfPerson(s.person)[0];
      const r = k.createCadRequest({ person: s.person, branch: 'kb-osh', rows: ['Техпаспорт', 'Выписка', 'Акт'].map((doc) => ({ typeId: a.typeId, ocId: a.ocId, doc })) });
      return { id: r.id, rows: r.rows.map((x) => x.id) }; }""")
    rid, r1, r2, r3 = req['id'], req['rows'][0], req['rows'][1], req['rows'][2]
    cad = '#/osmotr?v=cad&r=' + rid

    # Выбранный файл до отправки — карточкой, «Убрать» его снимает.
    t.open(cad, wait='[data-cad-open]')
    pg.locator('[data-cad-open="%s"]' % r1).click()
    f = pg.locator('form[data-row="%s"]' % r1)
    f.locator('input[value=got]').check(force=True)
    f.locator('[data-cad-file]').set_input_files([{'name': 'tp.png', 'mimeType': 'image/png', 'buffer': PNG}])
    t.ck(t.wait_until("() => /будет отправлен/.test(document.querySelector('.om-cad-pick')?.textContent || '')"), 'выбранный файл не показан карточкой')
    t.ck(pg.evaluate("() => { const a = document.querySelectorAll('.om-cad-pick a[target=_blank]'); return a.length === 3 && [...a].every((x) => x.href.startsWith('blob:')); }"),
         'у выбранного файла нет «Открыть» (миниатюра, имя, кнопка)')
    f.locator('[data-cad-file-clear]').click()
    t.ck(pg.evaluate("() => document.querySelector('form [data-cad-file]').files.length === 0 && document.querySelector('.om-cad-pick').hidden"), '«Убрать» не снял выбранный файл')
    f.locator('[data-cad-file]').set_input_files([{'name': 'tp.png', 'mimeType': 'image/png', 'buffer': PNG}])
    f.locator('button[type=submit]').click()
    t.ck(t.wait_until("async (a) => { const x = await (%s)(a); return x.result === 'got' && !!x.file; }" % ROW, [rid, r1]), 'ответ со сканом не дошёл')
    t.ck(t.wait_until("async (a) => await (%s)(a)" % QUEUE, [rid, r1]), 'скан ответа не попал в очередь ЦОД')

    # Карточка прикреплённого скана; ответ «Получен» без нового файла — принимается.
    t.open(cad + '&f=done', wait='[data-cad-open]')
    pg.locator('[data-cad-open="%s"]' % r1).click()
    card = pg.locator('form[data-row="%s"] .om-file' % r1)
    t.ck(t.wait_until("(r) => !!document.querySelector('form[data-row=\"' + r + '\"] .om-file')", r1), 'у ответа нет карточки прикреплённого скана')
    t.ck('tp.png' in card.inner_text() and 'Снимок' in card.inner_text(), 'в карточке нет имени и вида файла')
    t.ck(pg.locator('[data-cad-open="%s"] .om-clip' % r1).count() == 1, 'в строке нет значка прикреплённого скана')
    pg.locator('form[data-row="%s"] textarea[name=answer]' % r1).fill('уточнение')
    pg.locator('form[data-row="%s"] button[type=submit]' % r1).click()
    t.ck(t.wait_until("async (a) => { const x = await (%s)(a); return x.answer === 'уточнение' && !!x.file; }" % ROW, [rid, r1]), 'повторный ответ без нового файла не принят')

    # Просмотр.
    t.open('#/osmotr?v=file&src=cad&r=%s&row=%s' % (rid, r1), wait='.om-app[data-v="file"]')
    t.ck(t.wait_until("() => !!document.querySelector('.om-docimg') && document.querySelector('.om-docimg').naturalWidth > 0"), 'просмотр не показал скан')
    t.ck(pg.locator('.om-file-bar a[download]').count() == 1, 'в просмотре нет «Скачать»')

    # Открепить — из просмотра, с подтверждением.
    pg.locator('[data-detach-ask="view"]').click()
    t.ck(t.wait_until("() => !!document.querySelector('.om-file-ask [data-cad-detach]')"), 'открепление без подтверждения')
    t.ck(pg.evaluate(ROW, [rid, r1]).get('file'), 'скан откреплён до подтверждения')
    pg.locator('.om-file-ask [data-cad-detach]').click()
    t.ck(t.wait_until("async (a) => { const x = await (%s)(a); return !x.file && x.result === ''; }" % ROW, [rid, r1]), 'после открепления строка не ждёт ответа')
    t.ck(t.wait_until("async (a) => !(await (%s)(a))" % QUEUE, [rid, r1]), 'откреплённый скан остался в очереди ЦОД')
    t.ck(t.wait_until("() => /v=cad/.test(location.hash)"), 'после открепления не вернулись к запросу')

    # Открепить — из строки запроса.
    pg.evaluate("""async ([q, r]) => { const k = await import('./app/kernel/inspections.js');
      const f = new File([new Uint8Array([37, 80, 68, 70])], 'vyp.pdf', { type: 'application/pdf' });
      await k.answerCadRow(q, r, { result: 'got', file: f, fileName: 'vyp.pdf' }); }""", [rid, r2])
    t.open(cad + '&f=all', wait='[data-cad-open]')
    pg.locator('[data-cad-open="%s"]' % r2).click()
    t.ck(t.wait_until("(r) => /PDF/.test(document.querySelector('form[data-row=\"' + r + '\"] .om-file')?.textContent || '')", r2), 'PDF не показан как PDF')
    pg.locator('form[data-row="%s"] [data-detach-ask]' % r2).click()
    pg.locator('form[data-row="%s"] [data-cad-detach]' % r2).click()
    t.ck(t.wait_until("async (a) => { const x = await (%s)(a); return !x.file && x.result === ''; }" % ROW, [rid, r2]), 'открепление из строки не сработало')

    # Принятый ЦОД — не открепляется.
    pg.evaluate("""async ([q, r]) => { const k = await import('./app/kernel/inspections.js');
      const f = new File([new Uint8Array([1])], 'akt.png', { type: 'image/png' });
      const row = await k.answerCadRow(q, r, { result: 'got', file: f, fileName: 'akt.png' }); row.review = { state: 'accepted' }; k.changed(); }""", [rid, r3])
    t.open(cad + '&f=all', wait='[data-cad-open]')
    pg.locator('[data-cad-open="%s"]' % r3).click()
    t.ck(t.wait_until("(r) => /Принят ЦОД/.test(document.querySelector('form[data-row=\"' + r + '\"] .om-file')?.textContent || '')", r3), 'у принятого скана нет пометки «Принят ЦОД»')
    t.ck(pg.locator('form[data-row="%s"] [data-detach-ask]' % r3).count() == 0, 'принятый ЦОД скан можно открепить')
    t.ck(pg.evaluate("async () => !(await import('./app/kernel/inspections.js')).detachCadFile('%s', '%s')" % (rid, r3)), 'ядро открепляет принятый скан')

    # Снимок позиции описи — открыть и удалить (органическая опись).
    inv = pg.evaluate("""async () => { const d = await import('./app/pages/osmotr/data.js'); const s = (await import('./app/kernel/session.js')).session.state;
      for (const o of d.myObjects(s.person)) for (const x of o.inventories) { if (x.kind !== 'inv' || o.state === 'done') continue;
        const v = d.inventoryOf(s.person, o.id, x.id); const it = v.items.find((i) => i.own !== false && !/^вне\\s*тз$/i.test(i.list || ''));
        if (it) return { obj: o.id, inv: x.id, it: it.id }; } return null; }""")
    if t.ck(inv, 'нет открытой описи с позицией — снимок позиции не проверен'):
        item = '#/osmotr?v=item&id=%s&inv=%s&it=%s' % (quote(inv['obj'], safe=''), quote(inv['inv'], safe=''), quote(inv['it'], safe=''))
        t.open(item, wait='[data-mk-shoot]')
        pg.locator('[data-mk-shoot]').first.set_input_files([{'name': 'pos.png', 'mimeType': 'image/png', 'buffer': PNG}])
        t.ck(t.wait_until("() => !!document.querySelector('a.om-thumb[href*=\"v=file\"]')"), 'снимок позиции — не ссылка на просмотр')
        pg.locator('a.om-thumb').first.click()
        t.ck(t.wait_until("() => /v=file/.test(location.hash) && !!document.querySelector('.om-docimg')"), 'снимок позиции не открылся')
        pg.locator('[data-detach-ask="view"]').click()
        pg.locator('[data-inv-ph-del]').click()
        t.ck(t.wait_until("() => /v=item/.test(location.hash) && !document.querySelector('a.om-thumb')"), 'снимок позиции не удалён')
        t.ck(pg.evaluate("async ([i, it]) => ((await import('./app/kernel/inventories.js')).markOf(i, it) || {}).photos.every((p) => p.deleted)", [inv['inv'], inv['it']]),
             'удалённый снимок не помечен в описи')

    pg.set_viewport_size({'width': 360, 'height': 780})
    for route in (cad + '&f=all', '#/osmotr?v=file&src=cad&r=%s&row=%s' % (rid, r3)):
        t.open(route, wait='.om-app .om-title')
        if 'v=cad' in route:
            pg.locator('[data-cad-open="%s"]' % r3).click()
        over = pg.evaluate("() => { const s = document.querySelector('.om-scr'); return s.scrollWidth - s.clientWidth; }")
        t.ck(over <= 0, '%s на 360 px прокручивается вбок на %d px' % (route, over))
