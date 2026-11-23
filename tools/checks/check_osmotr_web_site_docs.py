# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика (19.11.2026): связка запросов документов с объектами выезда — «Спросить на месте».
Пользователь: «нужно добавить связку запросов кадастра и организаций в которые едет осмотрщик, например у него в
кадастре нужно запросить тех паспорт по коду 7-08-19-1001-5447 и он едет в организацию с этим же кодом, то ему будет
высвечиваться что ему нужно спросить этот документ на месте». Ответы: запросы любые (чьи бы ни были), строки — все,
кроме полученных, осмотрщик отвечает на месте (скан или снимок — ответ «Получен»).

Что ловит сценарий:
  * у объекта выезда нет блока «Спросить на месте» при строке чужого запроса по нему (ждёт, «нет в кадастре»);
  * в «Выездах» у объекта не видно «Спросить на месте · N»;
  * (20.11.2026) под документом не только ЕНИ: остались вид и номер запроса или имя того, чей он;
  * строка подбирается не по ЕНИ: строка запроса только с ЕНИ ОИ объекта (без самого объекта) не видна;
  * видны полученные строки или строки закрытого запроса;
  * у объекта без строк есть блок;
  * снимок документа не закрывает строку ответом «Получен» с отметкой «на месте», автором — осмотрщиком и файлом;
    после ответа нет отметки «Получен на месте», осталась кнопка, счётчик в «Выездах» не уменьшился;
  * у законченного осмотра можно ответить.
"""
from urllib.parse import quote

from harness import use_cadastre_fixture

NAME = 'спросить на месте (веб)'

TOUCHES = ('app/pages/osmotr/*', 'app/kernel/inspections.js', 'app/kernel/inspectionsDemo.js')

PNG = bytes.fromhex('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
                    '1f15c4890000000d4944415478da63f8cfc0f01f0005000201a5c0a3d40000000049454e44ae426082')

# Объекты осмотрщика с ЕНИ записи и ОИ.
OBJS = """async () => { const d = await import('./app/pages/osmotr/data.js'); const T = await import('./app/pages/inspection/tasks.js');
  const s = (await import('./app/kernel/session.js')).session.state;
  return { me: s.person, objs: d.myObjects(s.person).map((o) => { const rec = T.loadTask(o.typeId, o.ocId);
    return { id: o.id, typeId: o.typeId, ocId: o.ocId, state: o.state, entity: o.entity, eni: (rec && rec.eni) || '', oiEni: (o.ois || []).map((x) => x.eni).filter(Boolean) }; }) }; }"""
REQ = """async (id) => { const r = (await import('./app/kernel/inspections.js')).cadRequest(id);
  return r && { person: r.person, rows: r.rows.map((x) => ({ id: x.id, typeId: x.typeId, ocId: x.ocId, eni: x.eni, doc: x.doc, result: x.result || '',
    onSite: !!x.onSite, by: x.answeredBy || '', file: !!x.file })) }; }"""
NEW = """async ([person, rows, closed]) => { const k = await import('./app/kernel/inspections.js');
  const r = k.createCadRequest({ person, kind: 'cadastre', rows }); if (closed) k.closeCadRequest(r.id); k.changed(); return r.id; }"""


def go(t, q, wait):
    t.page.evaluate("(q) => { location.hash = '#/osmotr?' + q; }", q)
    return t.wait_until("(w) => !!document.querySelector(w)", wait, timeout=5000)


def obj_q(o):
    return 'v=obj&id=' + quote(o, safe='')


def site_docs(pg):
    return pg.evaluate("() => [...document.querySelectorAll('#om-site .om-site-row')].map((r) => ({ doc: r.querySelector('b').textContent, chip: r.querySelector('.om-chip').textContent, btn: !!r.querySelector('[data-ask-file]') }))")


def trip_count(pg, t, oid):
    go(t, 'v=trips', '.om-app[data-v="trips"] .om-obj')
    return pg.evaluate("""(id) => { const a = [...document.querySelectorAll('a.om-obj')].find((x) => new URLSearchParams(x.getAttribute('href').split('?')[1]).get('id') === id);
      const b = a && a.querySelector('.om-site-n'); return a ? (b ? +b.textContent.replace(/\\D/g, '') : 0) : null; }""", oid)


def run(t):
    pg = t.page
    use_cadastre_fixture(pg)
    pg.set_viewport_size({'width': 400, 'height': 860})
    t.open('#/osmotr', wait='.om-app[data-v="today"]')
    info = pg.evaluate(OBJS)
    me, objs = info['me'], info['objs']
    by_id = {o['id']: o for o in objs}

    # --- демо: чужой запрос в кадастр по двум выездам осмотрщика ---
    req = pg.evaluate(REQ, 'demo-cr-4')
    if not t.ck(req and req['person'] != me and len(req['rows']) == 2, 'нет демо-запроса другого осмотрщика по выездам (demo-cr-4): %s' % req):
        return
    wait_row, none_row = req['rows']
    o1 = '%s|%s' % (wait_row['typeId'], wait_row['ocId'])
    o2 = '%s|%s' % (none_row['typeId'], none_row['ocId'])
    t.ck(o1 in by_id and o2 in by_id and by_id[o1]['state'] != 'done', 'объекты демо-запроса не среди незаконченных выездов осмотрщика')

    go(t, obj_q(o1), '.om-app[data-v="obj"] #om-site')
    rows = site_docs(pg)
    t.ck(rows == [{'doc': wait_row['doc'], 'chip': 'Ждёт', 'btn': True}], 'строка «ждёт» чужого запроса: %s' % rows)
    # В строке — только документ и ЕНИ, без вида и номера запроса и без имени (пользователь 20.11.2026).
    sub = pg.locator('#om-site .om-site-row .om-row-tx small').first.inner_text().strip()
    t.ck(sub and sub.replace('-', '').isdigit() and sub.replace('-', '') == ''.join(ch for ch in wait_row['eni'] if ch.isdigit()),
         'под документом не только ЕНИ строки: %r (ЕНИ %s)' % (sub, wait_row['eni']))
    site = pg.locator('#om-site').inner_text()
    t.ck(req['person'] not in site and 'Запрос в кадастр' not in site and '№' not in site, 'в «Спросить на месте» остались запрос или имя: %r' % site)
    go(t, obj_q(o2), '.om-app[data-v="obj"] #om-site')
    rows = site_docs(pg)
    t.ck(rows and rows[0]['doc'] == none_row['doc'] and rows[0]['chip'] == 'Нет в кадастре', 'строка «нет в кадастре»: %s' % rows)
    t.ck('сведений в кадастре нет' in pg.locator('#om-site').inner_text(), 'не видно пояснения Кадастра')
    t.ck(trip_count(pg, t, o1) == 1, 'в «Выездах» у объекта нет «Спросить на месте · 1»')

    # --- подбор по ЕНИ ОИ; полученное и закрытый запрос — не видны ---
    tgt = next((o for o in objs if o['state'] != 'done' and o['entity'] == 'real' and o['oiEni'] and o['id'] not in (o1, o2)), None)
    if t.ck(tgt, 'нет незаконченного объекта с ЕНИ ОИ — подбор по ЕНИ не проверить'):
        eni = tgt['oiEni'][0]
        dashed = '-'.join([eni[0], eni[1:3], eni[3:5], eni[5:9], eni[9:]]) if len(eni) == 13 else eni
        pg.evaluate(NEW, ['Другой осмотрщик (проверка)', [{'eni': dashed, 'doc': 'Справка по ЕНИ'}], False])
        got_id = pg.evaluate(NEW, ['Другой осмотрщик (проверка)', [{'eni': eni, 'doc': 'Уже полученный'}], False])
        pg.evaluate("""async (id) => { const k = await import('./app/kernel/inspections.js'); const r = k.cadRequest(id);
          Object.assign(r.rows[0], { result: 'got' }); k.changed(); }""", got_id)
        pg.evaluate(NEW, ['Другой осмотрщик (проверка)', [{'eni': eni, 'doc': 'Из закрытого запроса'}], True])
        go(t, obj_q(tgt['id']), '.om-app[data-v="obj"] #om-site')
        docs = [r['doc'] for r in site_docs(pg)]
        t.ck('Справка по ЕНИ' in docs, 'строка по ЕНИ ОИ (с дефисами, без объекта) не подобралась: %s' % docs)
        t.ck('Уже полученный' not in docs and 'Из закрытого запроса' not in docs, 'видна полученная строка или строка закрытого запроса: %s' % docs)
    plain = next((o for o in objs if o['entity'] == 'real' and o['id'] not in (o1, o2, (tgt or {}).get('id'))
                  and not o['eni'] and not o['oiEni']), None) or next((o for o in objs if o['entity'] == 'vehicle'), None)
    if plain:
        go(t, obj_q(plain['id']), '.om-app[data-v="obj"] .om-title')
        t.ck(pg.locator('#om-site').count() == 0, 'у объекта без строк запросов есть «Спросить на месте»')

    # --- ответ на месте ---
    go(t, obj_q(o1), '.om-app[data-v="obj"] #om-site [data-ask-file]')
    pg.locator('#om-site [data-ask-file]').first.set_input_files([{'name': 'tp.png', 'mimeType': 'image/png', 'buffer': PNG}])
    t.ck(t.wait_until("() => !!document.querySelector('#om-site .om-chip.om-t-green')"), 'после снимка нет отметки «Получен на месте»')
    row = next(x for x in pg.evaluate(REQ, 'demo-cr-4')['rows'] if x['id'] == wait_row['id'])
    t.ck(row['result'] == 'got' and row['onSite'] and row['by'] == me and row['file'], 'строка запроса не закрыта ответом «Получен» на месте: %s' % row)
    rows = site_docs(pg)
    t.ck(rows and rows[0]['chip'] == 'Получен на месте' and not rows[0]['btn'], 'после ответа: %s' % rows)
    t.ck(trip_count(pg, t, o1) == 0, 'в «Выездах» осталось «Спросить на месте» после ответа')

    # --- законченный осмотр — ответить нельзя ---
    pg.evaluate("""async (id) => { const [t, c] = id.split('|'); const k = await import('./app/kernel/inspections.js');
      const s = (await import('./app/kernel/session.js')).session.state; k.finishWork(s.person, t, c, true); k.changed(); }""", o2)
    go(t, obj_q(o2), '.om-app[data-v="obj"] #om-site')
    t.ck(pg.locator('#om-site [data-ask-file]').count() == 0, 'у законченного осмотра можно ответить на строку запроса')
