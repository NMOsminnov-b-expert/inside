# -*- coding: utf-8 -*-
"""
Мост E•state ↔ приложение «Осмотр» (pages/osmotr/bridge.js): страница
осмотрщиков, приложение в рамке, запросы — сообщениями окну системы.

Решения пользователя 03.11.2026: учётная запись — E•state, в приложении только
назначенные объекты, снятое уходит по мере съёмки.

Что ловит сценарий:
  * «hello» не отдаёт человека из сессии или роль, которая не осматривает,
    считается осматривающей;
  * «assignments» отдаёт чужие или снятые назначения, теряет ОИ, координаты,
    состояние; литера — не «Литер <буква>» (по этой папке ищет разбор архива);
  * снимок из приложения не ложится в «Результаты осмотра» к своему ОИ или
    повторная отправка его удваивает;
  * первая отправка не переводит назначение «Назначено» → «В работе»;
  * «finish» не ставит «Осмотр закончен»;
  * запрос по чужому объекту выполняется;
  * сообщения не из своей рамки обрабатываются.
"""
from harness import use_cadastre_fixture
import cadastre_fixture as cf

NAME = 'мост E•state — приложение «Осмотр»'

TOUCHES = (
    'app/pages/osmotr/*', 'app/pages/inspector/archiveImport.js', 'app/pages/inspector/tasks.js',
    'app/kernel/inspections.js', 'app/kernel/inspectionResults.js', 'app/kernel/session.js',
    'app/kernel/cadastreGeo.js', 'app/kernel/cadastreTip.js', 'app/pages/inspector/results.js', 'app/kernel/viewer/photo.js',
)

# Запрос из окна рамки — так его шлёт приложение (glue.js, osmotrWeb.estate.ask).
ASK = """async ([t, body, withBlob]) => {
  const w = document.querySelector('.om-frame').contentWindow;
  const id = 'chk-' + Math.random().toString(36).slice(2);
  const got = new Promise((res) => w.addEventListener('message', (e) => {
    if (e.data && e.data.re === id) res({ ok: e.data.ok, body: e.data.body, error: e.data.error, blob: e.data.blob ? e.data.blob.size : 0 });
  }));
  w.__chkBlob = withBlob ? new w.Blob([new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70])], { type: 'image/jpeg' }) : null;
  w.eval(`parent.postMessage({ osmotr: 1, id: ${JSON.stringify(id)}, t: ${JSON.stringify(t)}, body: ${JSON.stringify(body)}, blob: window.__chkBlob }, location.origin)`);
  return await got;
}"""

KI = "await import('./app/kernel/inspections.js')"
KR = "await import('./app/kernel/inspectionResults.js')"


def run(t):
    pg = t.page
    use_cadastre_fixture(pg)  # записанные ответы Кадастра: сведения участка по демо-ЕНИ
    t.open('#/osmotr', wait='.om-frame, .om-none')
    if not t.ck(pg.locator('.om-frame').count() == 1, 'на странице осмотрщиков нет рамки приложения (нет сборки app/vendor/osmotr?)'):
        return

    # --- кто вошёл ---
    h = pg.evaluate(ASK, ['hello', {}, False])
    t.ck(h['ok'] and h['body']['person'] == pg.evaluate("async () => (await import('./app/kernel/session.js')).session.state.person"),
         'hello: не человек из сессии: %s' % h)
    t.ck(h['body'].get('system') == 'E•state' and h['body'].get('canInspect') is True, 'hello: роль «любая» не осматривает: %s' % h)

    # --- назначенные объекты: свои, без снятых; ОИ с папками ---
    a = pg.evaluate(ASK, ['assignments', {}, False])
    items = (a.get('body') or {}).get('items') or []
    t.ck(a['ok'] and len(items) > 0, 'assignments: пусто или отказ: %s' % (a.get('error') or ''))
    mine = pg.evaluate("""async () => { const k = %s; const p = (await import('./app/kernel/session.js')).session.state.person;
      return [...new Set(k.assignmentsOfPerson(p, { live: false }).filter((a) => a.state !== 'removed').map((a) => a.typeId + '|' + a.ocId))]; }""" % KI)
    ids = [x['id'] for x in items]
    t.ck(sorted(ids) == sorted(i for i in mine if i in ids) and len(ids) <= len(mine),
         'assignments: объекты не совпадают с назначениями человека: %d из %d' % (len(ids), len(mine)))
    t.ck(len(set(ids)) == len(ids), 'assignments: объект повторяется')
    letters = [o['path'] for x in items for o in x['ois'] if o['kind'] == 'building']
    t.ck(letters and all(p.startswith('Недвижимое/') for p in letters), 'литеры не в «Недвижимом»: %s' % letters[:5])
    t.ck(any(p.startswith('Недвижимое/Литера ') for p in letters), 'литера — не «Литера <буква>»: %s' % letters[:5])
    # Три сущности (решение 03.11.2026): объект-ТС — сама машина, участки — по ЕНИ, ТС — в «Транспортных средствах».
    ents = {x['typeId']: x['entity'] for x in items}
    t.ck(all(e == ('vehicle' if ty == 'vehicle' else 'inventory' if ty == 'mechanisms' else 'real') for ty, e in ents.items()), 'вид объекта не по виду ОЦ: %s' % ents)
    ts_obj = [o for x in items if x['entity'] == 'vehicle' for o in x['ois'] if o['kind'] == 'vehicle']
    t.ck(ts_obj and all(o['path'] == '' and o['depth'] == 0 for o in ts_obj), 'у объекта-ТС машина не сам объект: %s' % ts_obj[:2])
    lands = [o for x in items for o in x['ois'] if o['kind'] == 'land']
    t.ck(lands and all(o['path'].startswith('Недвижимое/Земельный участок/') and o['depth'] == 3 for o in lands), 'участок не своей папкой: %s' % lands[:2])
    multi = [x for x in items if sum(1 for o in x['ois'] if o['kind'] == 'land') > 1]
    t.ck(all(len({o['path'] for o in x['ois'] if o['kind'] == 'land'}) == sum(1 for o in x['ois'] if o['kind'] == 'land') for x in multi),
         'два участка одного объекта — в одной папке')
    tsin = [o for x in items if x['entity'] == 'real' for o in x['ois'] if o['kind'] == 'vehicle']
    t.ck(all(o['path'].startswith('Транспортные средства/') for o in tsin), 'ТС внутри недвижимости — не в «Транспортных средствах»: %s' % tsin[:2])
    t.ck(sum(1 for x in items if x['lat'] is not None) > 0, 'ни у одного объекта нет координат')
    # Сведения участка из Кадастра (04.11.2026: «максимум информации об участке… И о здании»): система сама
    # подтягивает их по ЕНИ в фоне и отдаёт строками «подпись — значение» для карточки на карте приложения.
    withEni = [x for x in items if ''.join(c for c in (x.get('eni') or '') if c.isdigit()) == cf.KNOWN_ENI]
    got = []
    for _ in range(30):
        b = (pg.evaluate(ASK, ['assignments', {}, False]).get('body') or {}).get('items') or []
        got = [x for x in b if x.get('parcel')]
        if got:
            break
        pg.wait_for_timeout(2000)
    if t.ck(withEni, 'у осмотрщика нет назначения с ЕНИ, известным записанному Кадастру (%s)' % cf.KNOWN_ENI):
        t.ck(got, 'ни у одного объекта с ЕНИ нет сведений участка из Кадастра (Кадастр недоступен?)')
        labels = {f['label'] for x in got for f in x['parcel']}
        t.ck({'Площадь по контуру'} <= labels and all(f['value'] for x in got for f in x['parcel']), 'сведения участка без площади или с пустыми значениями: %s' % sorted(labels))
        t.ck(all(x.get('contour') for x in got), 'сведения участка есть, а контура нет')
    t.ck(all(x['state'] in ('assigned', 'progress', 'done') for x in items), 'неизвестное состояние')
    ranks = [1 if x['state'] == 'done' else 0 for x in items]
    t.ck(ranks == sorted(ranks), 'законченные идут раньше незаконченных')

    # --- отправка снимка: в результаты, к своему ОИ, без удвоения; «В работу» ---
    live = [x for x in items if x['state'] == 'assigned' and any(o['kind'] in ('building', 'apartment') for o in x['ois'])]
    it = live[0] if live else next((x for x in items if any(o['kind'] in ('building', 'apartment') for o in x['ois'])), None)
    if not t.ck(it is not None, 'нет назначенного объекта с литерой или квартирой'):
        return
    oi = next(o for o in it['ois'] if o['kind'] in ('building', 'apartment'))
    typeId, ocId = it['id'].split('|')
    rel = '%s/Фасад/chk_20261103_101500_001.jpg' % oi['path']
    s1 = pg.evaluate(ASK, ['send', {'assignId': it['id'], 'rel': rel, 'oiId': oi['id'], 'depth': oi['depth']}, True])
    t.ck(s1['ok'] and s1['body']['photos'] == 1 and s1['body']['taken'] is True, 'снимок не принят: %s' % s1)
    got = pg.evaluate("async ([ty, oc, oi]) => (%s).resultsOf(ty, oc).photos.filter((p) => p.name === 'chk_20261103_101500_001.jpg').map((p) => [p.oiId, p.cat])" % KR,
                      [typeId, ocId, oi['id']])
    t.ck(got == [[oi['id'], 'Фасад']], 'снимок не у своего ОИ или не в «Фасаде»: %s' % got)
    s2 = pg.evaluate(ASK, ['send', {'assignId': it['id'], 'rel': rel, 'oiId': oi['id'], 'depth': oi['depth']}, True])
    t.ck(s2['ok'] and s2['body']['photos'] == 0 and s2['body']['repeated'] == 1 and s2['body']['taken'] is True, 'повторная отправка удвоила снимок: %s' % s2)
    # Документ любого формата из «Документов» ОИ — скан к этому ОИ (решение 03.11.2026: «Любые форматы куда угодно»).
    d1 = pg.evaluate(ASK, ['send', {'assignId': it['id'], 'rel': '%s/Документы/chk-справка.xlsx' % oi['path'], 'oiId': oi['id'], 'depth': oi['depth']}, True])
    sc = pg.evaluate("async ([ty, oc]) => (%s).resultsOf(ty, oc).scans.filter((s) => s.title === 'chk-справка.xlsx').map((s) => s.oiId)" % KR, [typeId, ocId])
    t.ck(d1['ok'] and d1['body']['taken'] and sc == [oi['id']], 'документ xlsx не принят к своему ОИ: %s %s' % (d1, sc))
    # Не принятое — с причиной, а не «успех».
    bad1 = pg.evaluate(ASK, ['send', {'assignId': it['id'], 'rel': '%s/Фасад/chk.mp4' % oi['path'], 'oiId': oi['id'], 'depth': oi['depth']}, True])
    t.ck(bad1['ok'] and bad1['body']['taken'] is False and bad1['body']['why'], 'не принятый файл не помечен отказом: %s' % bad1)
    # Удалено на телефоне — пометка в системе, снимок остаётся.
    dl = pg.evaluate(ASK, ['deleted', {'assignId': it['id'], 'rel': rel, 'oiId': oi['id']}, False])
    gone = pg.evaluate("async ([ty, oc]) => (%s).resultsOf(ty, oc).photos.filter((p) => p.name === 'chk_20261103_101500_001.jpg').map((p) => !!p.deletedByInspector)" % KR, [typeId, ocId])
    t.ck(dl['ok'] and dl['body']['n'] == 1 and gone == [True], 'удаление на телефоне не помечено: %s %s' % (dl, gone))
    if it['state'] == 'assigned':
        st = pg.evaluate("async ([ty, oc]) => { const k = %s; const p = (await import('./app/kernel/session.js')).session.state.person; return k.myAssignsOn(p, ty, oc).map((a) => a.state); }" % KI, [typeId, ocId])
        t.ck(st and all(x == 'progress' for x in st), 'первая отправка не перевела в «В работе»: %s' % st)

    # --- разбор присланного (аудит приложения 03.11.2026, пп. 13, 29, 30) ---
    imp = pg.evaluate("""async ([ty, oc, oiId]) => {
      const A = await import('./app/pages/inspector/archiveImport.js'); const R = await import('./app/kernel/registry.js');
      const K = await import('./app/kernel/inspectionResults.js'); const X = await import('./app/kernel/xlsx.js');
      const rec = R.getType(ty).records.loadRecord(oc);
      const blob = (t, type) => async () => new Blob([t], { type });
      // 13: objKind в значения не идёт, остальное — идёт.
      await A.applyEntries(ty, rec, [{ rel: 'x/params.json', oiId, depth: 1, read: blob(JSON.stringify({ objKind: 'Здание', chkNote: 'да' }), 'application/json') }], { source: 'приложение «Осмотр»' });
      const vals = K.valuesOf(ty, oc, oiId);
      // 29: выявленное из приложения и из архива — одно.
      const jpg = blob(new Uint8Array([255, 216, 255, 224]), 'image/jpeg');
      await A.applyEntries(ty, rec, [{ rel: 'Недвижимое/Литера Щ-проверка/Фасад/a_20261104_101500_001.jpg', read: jpg }], { source: 'приложение «Осмотр»' });
      await A.applyEntries(ty, rec, [{ rel: 'Недвижимое/Литера Щ-проверка/Фасад/a_20261104_101600_002.jpg', read: jpg }]);
      const found = K.resultsOf(ty, oc).found.filter((f) => f.name === 'Литера Щ-проверка').length;
      // 30: контакт по телефону — исправленное имя обновляет прежний, почта сохраняется.
      const book = (name) => async () => new Blob([await X.xlsxBytes([{ name: 'К', head: ['ФИО', 'Должность', 'Телефон', 'Почта'], rows: [[name, 'завхоз', '+996 700 11 22 33', 'zav@ex.kg']] }])]);
      await A.applyEntries(ty, rec, [{ rel: 'Контакты.xlsx', read: book('Проверочный Контакт') }]);
      await A.applyEntries(ty, rec, [{ rel: 'Контакты.xlsx', read: book('Проверочный Контакт Исправленный') }]);
      const cs = K.resultsOf(ty, oc).contacts.filter((c) => String(c.phone).replace(/\D/g, '').endsWith('700112233')).map((c) => [c.name, c.email || '']);
      // 9: комментарий папки и контакты из папки ОИ — принимаются.
      const txt = (t) => blob(t, 'text/plain');
      await A.applyEntries(ty, rec, [{ rel: 'Недвижимое/Литера Щ-проверка/Фасад/Комментарий.txt', read: txt('трещина у входа') }]);
      await A.applyEntries(ty, rec, [{ rel: 'Недвижимое/Литера Щ-проверка/Фасад/Комментарий.txt', read: txt('трещина у входа') }]);
      const note = String(K.resultsOf(ty, oc).note || '').split('\\n').filter((l) => l === 'Недвижимое / Литера Щ-проверка / Фасад: трещина у входа').length;
      const sub = await A.applyEntries(ty, rec, [{ rel: 'Недвижимое/Литера Щ-проверка/Контакты.xlsx', read: book('Проверочный Подпапка') }]);
      // 24: поворот снимка — и раньше снимка (ждёт его), и после.
      await A.applyEntries(ty, rec, [{ rel: 'x/Фасад/.t1_20261104_120000_001.jpg.поворот', oiId, depth: 1, read: txt('1') }]);
      await A.applyEntries(ty, rec, [{ rel: 'x/Фасад/t1_20261104_120000_001.jpg', oiId, depth: 1, read: jpg }]);
      await A.applyEntries(ty, rec, [{ rel: 'x/Фасад/t3_20261104_120100_002.jpg', oiId, depth: 1, read: jpg }]);
      await A.applyEntries(ty, rec, [{ rel: 'x/Фасад/.t3_20261104_120100_002.jpg.поворот', oiId, depth: 1, read: txt('3') }]);
      const turns = K.resultsOf(ty, oc).photos.filter((p) => /^t[13]_/.test(p.name)).map((p) => [p.name.slice(0, 2), p.turn || 0]);
      return { objKind: 'objKind' in vals, chk: vals.chkNote, found, contacts: cs, note, subTaken: sub.taken, turns };
    }""", [typeId, ocId, oi['id']])
    t.ck(not imp['objKind'] and imp['chk'] == 'да', 'objKind попал в значения осмотра или значения не приняты: %s' % imp)
    t.ck(imp['found'] == 1, 'выявленное из приложения и из архива заведено дважды: %s' % imp['found'])
    t.ck(imp['contacts'] == [['Проверочный Контакт Исправленный', 'zav@ex.kg']], 'контакт по телефону не обновился или потерял почту: %s' % imp['contacts'])
    t.ck(imp['note'] == 1, 'комментарий папки не принят или удвоился: %s' % imp['note'])
    t.ck(imp['subTaken'] == 1, 'контакты из папки ОИ не приняты')
    t.ck(sorted(imp['turns']) == [['t1', 1], ['t3', 3]], 'поворот снимка из приложения не записан: %s' % imp['turns'])

    # --- «Осмотр закончен» ---
    # После «закончен» и после снятия назначения снятое всё равно принимается (решение 03.11.2026).
    f = pg.evaluate(ASK, ['finish', {'assignId': it['id']}, False])
    t.ck(f['ok'] and f['body']['n'] >= 1, 'finish отказал: %s' % f)
    st = pg.evaluate("async ([ty, oc]) => { const k = %s; const p = (await import('./app/kernel/session.js')).session.state.person; return k.myAssignsOn(p, ty, oc).map((a) => a.state); }" % KI, [typeId, ocId])
    t.ck(st and all(x == 'done' for x in st), '«Осмотр закончен» не поставлен: %s' % st)
    late = pg.evaluate(ASK, ['send', {'assignId': it['id'], 'rel': '%s/Фасад/chk_20261103_120000_002.jpg' % oi['path'], 'oiId': oi['id'], 'depth': oi['depth']}, True])
    t.ck(late['ok'] and late['body']['taken'], 'после «Осмотр закончен» снятое не принято: %s' % late)

    # --- значения формы с точкой в ключе — вложенно, как в форме осмотра («f.mileage» → values.f.mileage) ---
    ts = next((x for x in items if any(o['kind'] == 'vehicle' for o in x['ois'])), None)
    if t.ck(ts is not None, 'нет назначенного объекта с ТС'):
        vo = next(o for o in ts['ois'] if o['kind'] == 'vehicle')
        jrel = (vo['path'] + '/' if vo['path'] else '') + 'chk_ts.json'
        js = pg.evaluate('''async ([body]) => {
          const w = document.querySelector('.om-frame').contentWindow;
          const id = 'j' + Math.random().toString(36).slice(2);
          const p = new Promise((res) => w.addEventListener('message', (e) => { if (e.data && e.data.re === id) res(e.data); }));
          w.__chkJson = new w.Blob([JSON.stringify({ 'f.mileage': '123456', 'f.mileage@unit': 'км', 'ts.addr': 'chk-адрес', bathroom: ['Внутри'] })], { type: 'application/json' });
          w.eval(`parent.postMessage({ osmotr: 1, id: ${JSON.stringify(id)}, t: 'send', body: ${JSON.stringify(body)}, blob: window.__chkJson }, location.origin)`);
          return await p; }''', [{'assignId': ts['id'], 'rel': jrel, 'oiId': vo['id'], 'depth': vo['depth']}])
        tty, toc = ts['id'].split('|')
        got = pg.evaluate("async ([ty, oc, oi]) => { const v = (%s).valuesOf(ty, oc, oi); return [v.f && v.f.mileage, v.f && v.f['mileage@unit'], v.ts && v.ts.addr, 'f.mileage' in v]; }" % KR, [tty, toc, vo['id']])
        t.ck(js.get('ok') and got == ['123456', 'км', 'chk-адрес', False], 'значения ТС легли не вложенно: %s %s' % (js.get('body'), got))

    # --- опись: книга в приложение, отметки и снимки обратно (решение 03.11.2026: «Обмен с системой») ---
    withinv = [x for x in items if x.get('inventories')]
    if t.ck(withinv, 'ни у одного назначенного объекта нет описи (описи назначения или механизмов-ОИ)'):
        x = next((y for y in withinv if any(i['kind'] == 'inv' for i in y['inventories'])), withinv[0])
        inv = next((i for i in x['inventories'] if i['kind'] == 'inv'), x['inventories'][0])
        t.ck(inv['folder'].startswith('Механизмы и оборудование/') and inv['count'] > 0, 'опись без папки или пустая: %s' % inv)
        bk = pg.evaluate(ASK, ['inventory', {'assignId': x['id'], 'id': inv['id']}, False])
        t.ck(bk['ok'] and bk['blob'] > 1000, 'книга описи не пришла: %s' % bk)
        if inv['kind'] == 'inv':
            first = pg.evaluate("async (id) => { const m = await import('./app/kernel/inventories.js'); const i = m.inventoryById(id).items[0]; return [i.id, i.inv]; }", inv['id'])
            SENDTXT = '''async ([body, text]) => {
              const w = document.querySelector('.om-frame').contentWindow;
              const id = 't' + Math.random().toString(36).slice(2);
              const p = new Promise((res) => w.addEventListener('message', (e) => { if (e.data && e.data.re === id) res({ ok: e.data.ok, body: e.data.body, error: e.data.error }); }));
              w.__chkB = new w.Blob([text], { type: text.startsWith('ÿ') ? 'image/jpeg' : 'text/plain' });
              w.eval(`parent.postMessage({ osmotr: 1, id: ${JSON.stringify(id)}, t: 'send', body: ${JSON.stringify(body)}, blob: window.__chkB }, location.origin)`);
              return await p; }'''
            r1 = pg.evaluate(SENDTXT, [{'assignId': x['id'], 'rel': inv['folder'] + '/Нерабочие.txt'}, first[1] + '\n'])
            m1 = pg.evaluate("async ([iv, it]) => ((await import('./app/kernel/inventories.js')).markOf(iv, it) || {}).cond", [inv['id'], first[0]])
            t.ck(r1['ok'] and r1['body']['taken'] and m1 == 'Нерабочее', '«Нерабочие.txt» не дал «Нерабочее»: %s %s' % (r1, m1))
            r2 = pg.evaluate(SENDTXT, [{'assignId': x['id'], 'rel': inv['folder'] + '/Нерабочие.txt'}, ''])
            m2 = pg.evaluate("async ([iv, it]) => ((await import('./app/kernel/inventories.js')).markOf(iv, it) || {}).cond", [inv['id'], first[0]])
            t.ck(r2['ok'] and m2 == '', 'снятая в приложении отметка не снялась: %s' % m2)
            r3 = pg.evaluate(SENDTXT, [{'assignId': x['id'], 'rel': inv['folder'] + '/1. ' + first[1] + '/chk_20261103_130000_001.jpg', 'items': [first[1]]}, 'ÿØÿ'])
            m3 = pg.evaluate("async ([iv, it]) => { const m = (await import('./app/kernel/inventories.js')).markOf(iv, it) || {}; return [m.state, (m.photos || []).map((p) => p.name)]; }", [inv['id'], first[0]])
            t.ck(r3['ok'] and r3['body']['taken'] and m3[0] == 'seen' and 'chk_20261103_130000_001.jpg' in m3[1], 'снимок предмета описи не лёг: %s %s' % (r3, m3))

    # --- осмотр не состоялся: событие с причиной и исход в результатах ---
    oc = pg.evaluate(ASK, ['outcome', {'assignId': it['id'], 'reason': 'Нет доступа', 'note': 'chk-закрыто'}, False])
    ev = pg.evaluate("async ([ty, oc]) => (%s).eventsOf({ typeId: ty, ocId: oc }).filter((e) => e.kind === 'outcome').map((e) => e.text)" % KI, [typeId, ocId])
    out = pg.evaluate("async ([ty, oc]) => ((%s).resultsOf(ty, oc).outcome || {}).reason" % KR, [typeId, ocId])
    t.ck(oc['ok'] and 'Нет доступа — chk-закрыто' in ev and out == 'Нет доступа', 'исход «не состоялся» не записан: %s %s %s' % (oc, ev, out))

    # --- чужое не выполняется ---
    bad = pg.evaluate(ASK, ['send', {'assignId': 'civil|нет-такого', 'rel': rel}, True])
    t.ck(not bad['ok'] and 'не назначен' in (bad.get('error') or ''), 'запрос по чужому объекту выполнен: %s' % bad)
    # Сообщение не из своей рамки (из самой страницы) — без ответа.
    stray = pg.evaluate("""() => new Promise((res) => {
      let answered = false; const on = (e) => { if (e.data && e.data.re === 'stray') answered = true; };
      window.addEventListener('message', on);
      window.postMessage({ osmotr: 1, id: 'stray', t: 'hello', body: {} }, location.origin);
      setTimeout(() => { window.removeEventListener('message', on); res(answered); }, 400);
    })""")
    t.ck(stray is False, 'ответ на сообщение не из рамки приложения')
