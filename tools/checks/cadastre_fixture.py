# -*- coding: utf-8 -*-
"""Кадастр для автопроверок — записанные ответы портала вместо сети.

Пользователь 23.10.2026: «рамки участков и запросы в кадастр нужны если что».
До этого проверки получали от «Кадастра» пустой ответ: карта осмотра не
падала, но и не проверялось, рисует ли она рамки и соседние участки. Теперь
каждый сценарий (harness.run_one) получает настоящие ответы портала, записанные
для демо-ЕНИ, — без сети и без зависимости от даты:

  * свой прокси макета  http://127.0.0.1:8787/portal/<путь>, /eni?code=…
  * путь того же адреса  /cadastre/<путь>  (tools/serve.py, прокси Live Server)

Что известно (fixtures/cadastre.json):
  * ЕНИ 1030700400754 (демо oc-cv-1) — рамка, контур, адрес; поиск ЕНИ по
    адресу «г. Бишкек, ул. Суюмбаева А., д. 33»;
  * ЕНИ 1030700401350 и любой другой — портал отвечает пустой рамкой
    («Кадастр не знает участка с таким ЕНИ»);
  * соседние участки (ENI_WGS84, 197) и строения (ENI_BUILDINGS, 72) вокруг
    oc-cv-1 — на любую рамку карты.
Незнакомый запрос — пустой FeatureCollection и строка в CALLS['unknown'].

    python tools/checks/cadastre_fixture.py --record   # записать заново (нужна сеть)
"""
import json
import os
import re
import urllib.parse
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
FILE = os.path.join(HERE, 'fixtures', 'cadastre.json')
EMPTY_FC = '{"type":"FeatureCollection","features":[]}'
JSON = 'application/json;charset=UTF-8'

_fix = None
# Сколько раз что спрашивали — по ним сценарий видит, что карта сходила за слоями.
CALLS = Counter()


def fixture():
    global _fix
    if _fix is None:
        _fix = json.load(open(FILE, encoding='utf-8'))
    return _fix


def answer(method, path, post):
    """(тип, тело) на запрос к порталу по пути после /cadastre/."""
    fx = fixture()
    post = post or ''
    tn = re.search(r'typename=([A-Z_0-9]+)', post)
    if tn and tn.group(1) in fx['layers']:
        CALLS['layer:' + tn.group(1)] += 1
        return JSON, fx['layers'][tn.group(1)]
    for e in fx['exact']:
        if e['method'] == method and e['path'] == path and (e['post'] or '') == post:
            CALLS[path.split('?')[0]] += 1
            return e['type'] or JSON, e['body']
    if path.startswith('getFeatureExtent.do'):
        CALLS['extent:unknown'] += 1
        return JSON, fx['extent_empty']
    CALLS['unknown'] += 1
    return JSON, EMPTY_FC


def _handle(route):
    req = route.request
    url = req.url
    if ':8787/eni' in url:
        code = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get('code', [''])[0]
        addr = fixture()['eni_address'].get(code)
        CALLS['eni'] += 1
        body = {'eni': code, 'address': addr} if addr else {'eni': code, 'error': 'не найдено'}
        return route.fulfill(status=200, content_type=JSON, body=json.dumps(body, ensure_ascii=False),
                             headers={'Access-Control-Allow-Origin': '*'})
    if ':8787/' in url and '/portal/' not in url:
        return route.fulfill(status=200, content_type=JSON, body='{"ok": true}', headers={'Access-Control-Allow-Origin': '*'})
    path = url.split('/portal/', 1)[1] if ':8787/portal/' in url else url.split('/cadastre/', 1)[1]
    ctype, body = answer(req.method, path, req.post_data)
    route.fulfill(status=200, content_type=ctype, body=body, headers={'Access-Control-Allow-Origin': '*'})


def install(context):
    """Подменить Кадастр на весь контекст браузера (и на всплывающие окна)."""
    context.route('http://127.0.0.1:8787/**', _handle)
    context.route('**/cadastre/**', _handle)


def record():
    """Записать ответы портала заново: tools/serve.py (путь /cadastre/) и сеть."""
    import subprocess
    import sys
    import tempfile
    import time
    from playwright.sync_api import sync_playwright
    root = os.path.dirname(os.path.dirname(HERE))
    srv = subprocess.Popen([sys.executable, os.path.join(root, 'tools', 'serve.py'), '--port', '5596',
                            '--data', tempfile.mkdtemp(prefix='cadrec-')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    log = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page()

            def on_resp(r):
                if '/cadastre/' in r.url:
                    log.append({'method': r.request.method, 'path': r.url.split('/cadastre/', 1)[1],
                                'post': r.request.post_data or '', 'type': r.headers.get('content-type'), 'body': r.text()})
            pg.on('response', on_resp)
            pg.goto('http://127.0.0.1:5596/app.html#/')
            pg.wait_for_timeout(1500)
            pg.evaluate("""async () => { const G = await import('./app/kernel/cadastreGeo.js'); const C = await import('./app/kernel/cadastre.js');
               const g = await G.geoByEni('1030700400754'); await G.geoByEni('1030700401350');
               const e = g.extent, d = 0.0015, box = [e[0] - d, e[1] - d, e[2] + d, e[3] + d];
               await G.featuresInBox('ENI_WGS84', box, 'PROPCODE,DOMCODE,ADDRESS,NAZNACHENI,THE_GEOM', 800);
               await G.featuresInBox('ENI_BUILDINGS', box, 'PROPCODE,BUILD_TYPE,NAZNACHENI,ADDRESS,THE_GEOM', 800);
               await C.addressByEni('1030700400754');
               await G.eniByAddress({ city: 'г. Бишкек', street: 'Суюмбаева А.', house: '33', region: '', district: '' }); }""")
            b.close()
    finally:
        srv.kill()
    fx = fixture()
    exact, layers, empty = [], {}, fx['extent_empty']
    for e in log:
        tn = re.search(r'typename=([A-Z_0-9]+)', e['post'])
        if tn and tn.group(1) in ('ENI_WGS84', 'ENI_BUILDINGS'):
            layers[tn.group(1)] = e['body']
            continue
        if e['path'].startswith('getFeatureExtent.do') and len(e['body']) < 40:
            empty = e['body']
        exact.append(e)
    fx.update(exact=exact, layers=layers, extent_empty=empty)
    json.dump(fx, open(FILE, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('записано запросов: %d, слоёв: %s' % (len(exact), list(layers)))


if __name__ == '__main__':
    import sys
    if '--record' in sys.argv:
        record()
    else:
        print(__doc__)
