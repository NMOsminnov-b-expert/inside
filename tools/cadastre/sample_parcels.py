# -*- coding: utf-8 -*-
"""Настоящие участки Кадастра для демо-объектов макета.

Указание пользователя 13.10.2026: «подтяни реальные ЕНИ в примеры. Чтобы
макет стал функциональным». Синтетические объекты демо-объёма получали
случайный ЕНИ и адрес — по ним Кадастр ничего не находил, координат не было,
карта «Осмотров» стояла пустой. Утилита берёт в Кадастре настоящие участки по
городам пула демо-данных (ЕНИ, адрес, назначение, рамка) и пишет их в
app/kernel/demoParcels.js; генераторы демо-объёма берут оттуда ЕНИ, адрес и
координаты.

В Кадастр уходят только рамки поиска вокруг центров городов (ЕНИ и адреса —
открытые сведения; разрешение пользователя 13.10.2026). Нужен свой прокси:

    python tools/cadastre/proxy.py                     # в другом окне
    python tools/cadastre/sample_parcels.py [--per 120]

ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: демо-выгрузки нет — объекты приходят с настоящими ЕНИ.
"""
import argparse
import io
import json
import math
import os
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'app', 'kernel', 'demoParcels.js')
PORTAL = 'http://127.0.0.1:8787/portal/proxy.do?http://localhost/o2map/services/wfs'

# Города пула демо-данных (bulkPools.js модулей) — центр поиска (широта,
# долгота) и полуширина рамки, км. Районы — вокруг районного центра.
PLACES = {
    'г. Бишкек': (42.8746, 74.6122, 3.0),
    'г. Ош': (40.5140, 72.8161, 2.0),
    'г. Каракол': (42.4907, 78.3936, 1.5),
    'г. Талас': (42.5228, 72.2427, 1.5),
    'г. Баткен': (40.0629, 70.8194, 1.5),
    'г. Нарын': (41.4287, 75.9911, 1.5),
    'г. Токмок': (42.8421, 75.3015, 1.5),
    'г. Джалал-Абад': (40.9333, 73.0017, 1.5),
    'г. Кант': (42.8911, 74.8508, 1.2),
    'г. Карабалта': (42.8142, 73.8481, 1.5),
    'Чуйская обл., Аламудунский р-н': (42.9000, 74.6300, 1.5),
    'Чуйская обл., Сокулукский р-н': (42.8592, 74.3020, 1.5),
    'Ошская обл., Кара-Сууйский р-н': (40.7036, 72.8711, 1.5),
    'Таласская обл., Манасский р-н': (42.5150, 72.0300, 1.5),
}
R = 6378137


def merc(lon, lat):
    return R * lon * math.pi / 180, R * math.log(math.tan(math.pi / 4 + lat * math.pi / 360))


def box(lat, lon, km):
    dlat = km / 111.32
    dlon = km / (111.32 * math.cos(lat * math.pi / 180))
    x1, y1 = merc(lon - dlon, lat - dlat)
    x2, y2 = merc(lon + dlon, lat + dlat)
    return '%f,%f,%f,%f,EPSG:3857' % (x1, y1, x2, y2)


def fetch(lat, lon, km, n):
    body = urllib.parse.urlencode({
        'service': 'WFS', 'version': '1.1.0', 'request': 'GetFeature', 'typename': 'ENI_WGS84',
        'propertyname': 'PROPCODE,ADDRESS,NAZNACHENI,THE_GEOM', 'srsname': 'EPSG:4326',
        'outputFormat': 'application/json', 'maxFeatures': str(n), 'bbox': box(lat, lon, km),
    }).encode()
    req = urllib.request.Request(PORTAL, data=body, headers={'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode('utf-8')).get('features') or []


def extent(geom):
    pts = []

    def walk(c):
        if c and isinstance(c[0], (int, float)):
            pts.append(c)
        else:
            for x in c:
                walk(x)
    walk(geom.get('coordinates') or [])
    if not pts:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return [round(min(xs), 6), round(min(ys), 6), round(max(xs), 6), round(max(ys), 6)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--per', type=int, default=120, help='участков на город')
    a = ap.parse_args()
    out = {}
    for place, (lat, lon, km) in PLACES.items():
        try:
            feats = fetch(lat, lon, km, a.per * 3)
        except Exception as e:   # noqa: BLE001 — город пропускается, остальные пишутся
            print('%-34s не ответил: %s' % (place, e))
            continue
        rows, seen = [], set()
        for f in feats:
            pr = f.get('properties') or {}
            code = ''.join(ch for ch in str(pr.get('PROPCODE') or '') if ch.isdigit())[:13]
            ext = extent(f.get('geometry') or {})
            addr = ' '.join(str(pr.get('ADDRESS') or '').split())
            if len(code) != 13 or not ext or not addr or code in seen:
                continue
            seen.add(code)
            rows.append({'eni': code, 'addr': addr, 'use': ' '.join(str(pr.get('NAZNACHENI') or '').split()), 'ext': ext})
            if len(rows) >= a.per:
                break
        out[place] = rows
        print('%-34s %d' % (place, len(rows)))
    head = ('// Настоящие участки Кадастра для демо-объектов (выгрузка '
            'tools/cadastre/sample_parcels.py; указание пользователя 13.10.2026 «подтяни реальные ЕНИ\n'
            '// в примеры»). Город пула → [{ eni, addr, use, ext: [minLon, minLat, maxLon, maxLat] }].\n'
            '// Файл собирается утилитой — руками не править.\n'
            '//\n'
            '// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: не нужен — объекты приходят с настоящими ЕНИ.\n')
    body = 'export const DEMO_PARCELS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
    body += """
// Участок для демо-объекта: по городу пула и номеру записи — всегда один и тот
// же. Нет выгрузки по городу — null (объект остаётся с синтетическим ЕНИ).
export function demoParcel(city, i) {
  const list = DEMO_PARCELS[city];
  return list && list.length ? list[Math.abs(i | 0) % list.length] : null;
}
"""
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(head + body)
    print('записано: %s (%d КБ)' % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT) // 1024))


if __name__ == '__main__':
    sys.exit(main())
