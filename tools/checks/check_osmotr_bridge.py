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
NAME = 'мост E•state — приложение «Осмотр»'

TOUCHES = (
    'app/pages/osmotr/*', 'app/pages/inspector/archiveImport.js', 'app/pages/inspector/tasks.js',
    'app/kernel/inspections.js', 'app/kernel/inspectionResults.js', 'app/kernel/session.js',
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
    letters = [o['folder'] for x in items for o in x['ois'] if o['kind'] == 'building']
    t.ck(letters and all(f.startswith('Литер ') or f for f in letters), 'литеры без папок: %s' % letters[:5])
    t.ck(any(f.startswith('Литер ') for f in letters), 'литера — не «Литер <буква>»: %s' % letters[:5])
    t.ck(sum(1 for x in items if x['lat'] is not None) > 0, 'ни у одного объекта нет координат')
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
    rel = '%s/%s/Фасад/chk_20261103_101500_001.jpg' % (oi['top'], oi['folder'])
    s1 = pg.evaluate(ASK, ['send', {'assignId': it['id'], 'rel': rel, 'oiId': oi['id']}, True])
    t.ck(s1['ok'] and s1['body']['photos'] == 1, 'снимок не принят: %s' % s1)
    got = pg.evaluate("async ([ty, oc, oi]) => (%s).resultsOf(ty, oc).photos.filter((p) => p.name === 'chk_20261103_101500_001.jpg').map((p) => [p.oiId, p.cat])" % KR,
                      [typeId, ocId, oi['id']])
    t.ck(got == [[oi['id'], 'Фасад']], 'снимок не у своего ОИ или не в «Фасаде»: %s' % got)
    s2 = pg.evaluate(ASK, ['send', {'assignId': it['id'], 'rel': rel, 'oiId': oi['id']}, True])
    t.ck(s2['ok'] and s2['body']['photos'] == 0 and s2['body']['repeated'] == 1, 'повторная отправка удвоила снимок: %s' % s2)
    if it['state'] == 'assigned':
        st = pg.evaluate("async ([ty, oc]) => { const k = %s; const p = (await import('./app/kernel/session.js')).session.state.person; return k.myAssignsOn(p, ty, oc).map((a) => a.state); }" % KI, [typeId, ocId])
        t.ck(st and all(x == 'progress' for x in st), 'первая отправка не перевела в «В работе»: %s' % st)

    # --- «Осмотр закончен» ---
    f = pg.evaluate(ASK, ['finish', {'assignId': it['id']}, False])
    t.ck(f['ok'] and f['body']['n'] >= 1, 'finish отказал: %s' % f)
    st = pg.evaluate("async ([ty, oc]) => { const k = %s; const p = (await import('./app/kernel/session.js')).session.state.person; return k.myAssignsOn(p, ty, oc).map((a) => a.state); }" % KI, [typeId, ocId])
    t.ck(st and all(x == 'done' for x in st), '«Осмотр закончен» не поставлен: %s' % st)

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
