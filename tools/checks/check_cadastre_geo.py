# -*- coding: utf-8 -*-
"""Кадастр: рамка и контур участка по ЕНИ, адрес, соседние участки на карте.

Пользователь 23.10.2026: «рамки участков и запросы в кадастр нужны если что».
Ответы портала — записанные (cadastre_fixture.py, fixtures/cadastre.json):
остальным сценариям harness отдаёт пустую заглушку, этот включает записанные
ответы (harness.use_cadastre_fixture); сеть не нужна.

Ловит:
  * по ЕНИ нет рамки или контура участка (geoByEni), или адреса (addressByEni);
  * неизвестный ЕНИ не говорит «Кадастр не знает…», а молчит или падает;
  * поиск ЕНИ по адресу не находит участок демо-записи (eniByAddress);
  * Кадастр не ответил — нет внятного сообщения (обходы: свой прокси 8787,
    затем путь /cadastre/ того же адреса);
  * то же через путь /cadastre/, когда своего прокси нет (сборка для показа,
    Live Server);
  * карточка: «Получить по ЕНИ» не заполняет рамку участка;
  * карта задачи осмотра не запрашивает соседние участки и строения вокруг
    участка с известным контуром.
"""
import cadastre_fixture as cf
from harness import use_cadastre_fixture

NAME = 'Кадастр: рамки и запросы'

TOUCHES = (
    'app/kernel/cadastre.js', 'app/kernel/cadastreGeo.js', 'app/kernel/cadastreLayersGL.js',
    'app/kernel/cadastreLayers.js', 'app/kernel/cadastreForm.ctrl.js', 'app/kernel/mapgl.js',
    'tools/checks/cadastre_fixture.py', 'tools/checks/fixtures/cadastre.json', 'tools/checks/harness.py',
)

ENI = '1030700400754'
G = "import('./app/kernel/cadastreGeo.js')"
C = "import('./app/kernel/cadastre.js')"


def run(t):
    pg = t.page
    t.open('#/', wait='.reg-thead')
    use_cadastre_fixture(pg)

    # --- рамка и контур по ЕНИ -------------------------------------------------
    g = pg.evaluate("async (e) => await (await %s).geoByEni(e)" % G, ENI)
    ext = g.get('extent') or []
    t.ck(len(ext) == 4 and 74.6 < ext[0] < 74.63 and 42.86 < ext[1] < 42.88,
         'по ЕНИ нет рамки участка: %s' % str(g)[:200])
    t.ck(bool(g.get('contour')), 'по ЕНИ нет контура участка: %s' % str(g)[:200])

    # --- неизвестный ЕНИ — словами ---------------------------------------------
    u = pg.evaluate("async () => await (await %s).geoByEni('1030700401350')" % G)
    t.ck('не знает' in (u.get('error') or ''), 'неизвестный ЕНИ — не «Кадастр не знает…»: %s' % u)

    # --- адрес по ЕНИ -----------------------------------------------------------
    a = pg.evaluate("async (e) => await (await %s).addressByEni(e)" % C, ENI)
    t.ck('Суюмбаева' in str(a), 'адрес по ЕНИ не получен: %s' % a)

    # --- ЕНИ по адресу ----------------------------------------------------------
    by = pg.evaluate("""async () => await (await %s).eniByAddress({ city: 'г. Бишкек', street: 'Суюмбаева А.', house: '33', region: '', district: '' })""" % G)
    t.ck(any(c.get('eni') == ENI for c in (by.get('candidates') or [])), 'по адресу не найден ЕНИ участка: %s' % str(by)[:200])

    # --- без своего прокси: тот же результат через /cadastre/ -------------------
    # Прокси нет — соединение с 8787 отказывает; изображаем подменой fetch
    # (обрыв запроса пишет ошибку в консоль, а она для проверок — провал).
    fresh = pg.evaluate("""async (e) => { const orig = window.fetch;
        window.fetch = (u, o) => (/127\\.0\\.0\\.1:8787/.test(String(u)) ? Promise.reject(new TypeError('Failed to fetch')) : orig(u, o));
        try { const m = await import('./app/kernel/cadastreGeo.js?noproxy=' + Date.now()); return await m.geoByEni(e); }
        finally { window.fetch = orig; } }""", ENI)
    t.ck(len(fresh.get('extent') or []) == 4, 'через /cadastre/ (без своего прокси) нет рамки: %s' % str(fresh)[:200])
    a2 = pg.evaluate("""async (e) => { const orig = window.fetch;
        window.fetch = (u, o) => (/127\\.0\\.0\\.1:8787/.test(String(u)) ? Promise.reject(new TypeError('Failed to fetch')) : orig(u, o));
        try { const m = await import('./app/kernel/cadastre.js?noproxy=' + Date.now()); return await m.addressByEni(e); }
        finally { window.fetch = orig; } }""", ENI)
    t.ck('Суюмбаева' in str(a2), 'через /cadastre/ (без своего прокси) нет адреса по ЕНИ: %s' % a2)

    # --- Кадастр не ответил — сообщение, а не тишина ----------------------------
    # Сеть отказывает подменой fetch, а не обрывом запросов: обрыв пишет ошибку
    # загрузки в консоль, а она для проверок — провал сама по себе.
    err = pg.evaluate("""async () => { const orig = window.fetch;
        window.fetch = (u, o) => (/cadastre|8787/.test(String(u)) ? Promise.reject(new TypeError('Failed to fetch')) : orig(u, o));
        try { const m = await import('./app/kernel/cadastreGeo.js?down=' + Date.now()); const r = await m.geoByEni('1030700400754');
              return r.error || JSON.stringify(r).slice(0, 120); }
        catch (e) { return 'исключение: ' + e.message; } finally { window.fetch = orig; } }""")
    t.ck('Кадастр не ответил' in err or 'не ответил' in err, 'отказ Кадастра — без внятного сообщения: %s' % err)

    # --- карточка: «Получить по ЕНИ» --------------------------------------------
    t.open('#/oc/civil/oc-cv-1/form', wait='#btnGeoEni')
    pg.evaluate("""async () => { const S = await import('./app/modules/civil/data/store.js');
        const r = S.records.find((x) => x.id === 'oc-cv-1'); r.gps = ''; r.geo = null; }""")
    t.open('#/oc/civil/oc-cv-1', wait='[data-oc-head]')
    t.open('#/oc/civil/oc-cv-1/form', wait='#btnGeoEni')
    pg.click('#btnGeoEni')
    t.ck(t.wait_until("""async () => { const S = await import('./app/modules/civil/data/store.js');
        const r = S.records.find((x) => x.id === 'oc-cv-1'); return !!(r.geo && r.geo.extent) || /42\\.8/.test(r.gps || ''); }"""),
         '«Получить по ЕНИ» в карточке не заполнило рамку участка')
    t.ck(t.wait_until("() => /получены из Кадастра/.test(document.body.innerText)"),
         'после «Получить по ЕНИ» нет итога «Адрес и участок получены из Кадастра»')

    # --- карта задачи осмотра: соседние участки и строения ----------------------
    before = cf.CALLS['layer:ENI_WGS84'], cf.CALLS['layer:ENI_BUILDINGS']
    t.open('#/insp/civil/oc-cv-1', wait='[data-ins-map]')
    t.ck(t.wait_until("() => !!document.querySelector('[data-ins-map] canvas')"), 'на задаче осмотра нет карты')
    t.wait_until("() => !!document.querySelector('[data-ins-map] .maplibregl-canvas')")
    t.ck(_until(lambda: cf.CALLS['layer:ENI_WGS84'] > before[0] and cf.CALLS['layer:ENI_BUILDINGS'] > before[1], pg),
         'карта задачи не запросила соседние участки и строения: %s' % dict(cf.CALLS))


def _until(cond, pg, ms=8000):
    """Условие на стороне Python (счётчики подмены) — по факту, с опросом страницы."""
    step = 200
    for _ in range(ms // step):
        if cond():
            return True
        pg.wait_for_timeout(step)
    return cond()
