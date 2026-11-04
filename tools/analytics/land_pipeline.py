# -*- coding: utf-8 -*-
"""Земли по айыл аймакам — точный расчёт по векторам (shapely), с очисткой.

Пользователь 04.11.2026: «Необходимо сейчас начать парсить данные
по-нормальному. Найти способ данные очистить по площадям и зонам. Например
сколько чего не занято. Так же на границах участков как будто считаются тоже
пустые зоны»; «Границы дорог и участков тоже. Действительно есть пустые зоны,
но нужно тонкие полоски исключать. Скорее всего они непригодны».

Для каждого аймака (контур — из app/data/analytics/land-seed.json, Дарек):
  1. участки Кадастра (ENI_WGS84, со сведениями) — квадратами 2 км карты,
     упёрся в предел ответа — квадрат делится; повтор при сбое;
  2. дороги и зоны OpenStreetMap — векторные плитки OpenFreeMap z14
     (transportation — линии с шириной коридора по классу; landuse, landcover,
     water, park — зоны);
  3. в метрах (местная проекция у центра аймака):
       занято   = участки ∩ аймак;
       дороги   = коридоры дорог ∩ аймак − участки;
       остаток  = аймак − участки − дороги;
       узкие    = остаток − «раскрытие» остатка на ширину STRIP (полосы уже
                  STRIP м: щели оцифровки между участками и вдоль дорог,
                  непригодны);
       клочки   = куски раскрытого остатка меньше MIN_PATCH м²;
       свободно = остальное — делится по зонам OSM (вода, лес, сельхозугодья,
                  луга, скалы и пески, застроенная территория, без зоны);
  4. итог — в land-seed.json (occ аймака), сведения участков — в
     land-parcels.json, свободная земля векторами по зонам — в
     app/data/analytics/free/<код>.json (для карты).
Сырые ответы — в кэше на диске (tools/analytics/.cache, вне git).

    python tools/analytics/land_pipeline.py                 # все аймаки из land-seed.json
    python tools/analytics/land_pipeline.py --aimak Талас   # один (по началу названия)
    python tools/analytics/land_pipeline.py --strip 6 --min-patch 200
"""
import argparse
import warnings
warnings.filterwarnings('ignore', category=DeprecationWarning)
import hashlib
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import mapbox_vector_tile
import numpy as np
import shapely
import shapely.prepared
from shapely.geometry import shape, mapping, LineString, Polygon, MultiPolygon, box
from shapely.ops import transform, unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'cadastre'))
import proxy  # noqa: E402  — запросы к порталу Кадастра (тот же код, что у сервера макета)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sources  # noqa: E402  — WorldCover, Copernicus DEM, Microsoft Buildings

DATA = os.path.join(ROOT, 'app', 'data', 'analytics')
SEED = os.path.join(DATA, 'land-seed.json')
PARCELS = os.path.join(DATA, 'land-parcels.json')
FREE_DIR = os.path.join(DATA, 'free')
CACHE = os.path.join(ROOT, 'tools', 'analytics', '.cache')

W = 20037508.34
TILE = 2048.0            # квадрат запроса участков, метров карты
MAX = 3000               # предел ответа картосервера
Z = 14
ROAD_W = {'motorway': 50, 'trunk': 40, 'primary': 32, 'secondary': 26, 'tertiary': 20,
          'minor': 16, 'busway': 16, 'raceway': 12, 'service': 10, 'track': 6}
PARCEL_PROPS = 'PROPCODE,NAZNACHENI,PROPFOR_NAME,PROPFORM_NAME,DATEINS,AMNESTIED,FROM_GPS,THE_GEOM'

# Вода (пользователь 04.11.2026: «Овраги водоемы и т.д. Тоже стоит учесть») —
# не свободная земля: водоёмы и болота контурами (OpenMapTiles water, landcover
# wetland), русла — линиями с шириной по классу (waterway).
WATERWAY_W = {'river': 25, 'canal': 10, 'stream': 5, 'drain': 4, 'ditch': 3}
# Рельеф, непригодный для застройки: овраги, обрывы, береговые уступы
# (линии), карьеры и осыпи (контуры) — из OpenStreetMap через Overpass (в
# векторных плитках их нет); ширина линии — оценка.
RELIEF_W = {'gully': 20, 'cliff': 10, 'earth_bank': 6, 'ravine': 20}
OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']

# Зоны свободной земли — по покрову ESA WorldCover (10 м): класс → зона.
ZONES = [
    ('wood', 'Деревья', (10,)),
    ('shrub', 'Кустарник', (20,)),
    ('grass', 'Луга и пастбища', (30, 100)),
    ('farm', 'Пашня', (40,)),
    ('built', 'Застроенная территория', (50,)),
    ('bare', 'Голая земля, скалы, снег', (60, 70)),
    ('none', 'Без класса', ()),
]
SLOPE = 12.0       # крутой склон, градусов (≈ 21 %): круче — непригоден
BLD_YARD = 3.0     # двор вокруг здания без ЕНИ, м
LANDCOVER = {'wood': 'wood', 'forest': 'wood', 'farmland': 'farm', 'grass': 'grass',
             'rock': 'bare', 'sand': 'bare', 'ice': 'bare'}
LANDUSE_BUILT = {'residential', 'commercial', 'industrial', 'retail', 'garages', 'railway', 'school', 'university',
                 'kindergarten', 'college', 'hospital', 'military', 'cemetery', 'stadium', 'bus_station', 'quarter', 'neighbourhood'}


# --- кэш на диске ----------------------------------------------------------
def cached(key, fetch, binary=False):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, hashlib.sha1(key.encode('utf-8')).hexdigest() + ('.bin' if binary else '.json'))
    if os.path.exists(path):
        with open(path, 'rb') as f:
            data = f.read()
        return data if binary else json.loads(data.decode('utf-8'))
    data = fetch()
    with open(path, 'wb') as f:
        f.write(data if binary else json.dumps(data, ensure_ascii=False).encode('utf-8'))
    return data


def merc(lon, lat):
    return lon * W / 180, math.log(math.tan((90 + lat) * math.pi / 360)) * W / math.pi


def unmerc(x, y):
    return x * 180 / W, (2 * math.atan(math.exp(y * math.pi / W)) - math.pi / 2) * 180 / math.pi


# --- участки Кадастра ------------------------------------------------------
def wfs(b):
    lon1, lat1 = unmerc(b[0], b[1])
    lon2, lat2 = unmerc(b[2], b[3])
    body = urllib.parse.urlencode({'service': 'WFS', 'version': '1.1.0', 'request': 'GetFeature', 'typename': 'ENI_WGS84',
                                   'propertyname': PARCEL_PROPS, 'srsname': 'EPSG:4326', 'outputFormat': 'application/json',
                                   'maxFeatures': str(MAX), 'bbox': '%r,%r,%r,%r,EPSG:3857' % tuple(merc(lon1, lat1) + merc(lon2, lat2))})

    def fetch():
        for attempt in range(4):
            try:
                code, ctype, data = proxy.portal('proxy.do?http://localhost/o2map/services/wfs', body.encode('utf-8'), 'application/x-www-form-urlencoded')
                if code == 200:
                    return json.loads(data.decode('utf-8')).get('features') or []
            except Exception as e:  # noqa: BLE001
                err = e
            time.sleep(2 + attempt * 3)
        raise RuntimeError('Кадастр не ответил на квадрат %s' % (b,))
    return cached('wfs|' + body, fetch)


def parcels_in(b, depth=0):
    fs = wfs(b)
    if len(fs) < MAX or depth >= 5:
        return fs
    mx, my = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    out = []
    for q in ((b[0], b[1], mx, my), (mx, b[1], b[2], my), (b[0], my, mx, b[3]), (mx, my, b[2], b[3])):
        out += parcels_in(q, depth + 1)
    return out


# --- плитки OpenFreeMap ------------------------------------------------------
_tmpl = None


def tile_url(x, y):
    global _tmpl
    if not _tmpl:
        tj = cached('ofm|tilejson|' + datetime.now().strftime('%Y-%m-%d'),
                    lambda: json.loads(urllib.request.urlopen(urllib.request.Request('https://tiles.openfreemap.org/planet', headers={'User-Agent': 'inside-maket'}), timeout=60).read()))
        _tmpl = tj['tiles'][0]
    return _tmpl.replace('{z}', str(Z)).replace('{x}', str(x)).replace('{y}', str(y))


def tile(x, y):
    url = tile_url(x, y)

    def fetch():
        for attempt in range(4):
            try:
                return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'inside-maket'}), timeout=60).read()
            except Exception:  # noqa: BLE001
                time.sleep(2 + attempt * 3)
        return b''
    raw = cached('ofm|' + url, fetch, binary=True)
    if not raw:
        return {}
    size = 2 * W / 2 ** Z
    left, top = -W + x * size, W - y * size

    def to_ll(g, extent):
        k = size / extent
        return transform(lambda px, py, z=None: unmerc(left + px * k, top - py * k), g)
    out = {}
    for name, layer in mapbox_vector_tile.decode(raw, default_options={'y_coord_down': True}).items():
        ext = layer.get('extent', 4096)
        out[name] = [(f['properties'], to_ll(shape(f['geometry']), ext)) for f in layer['features']]
    return out


# --- рельеф из OpenStreetMap (Overpass) ---------------------------------------
def relief(bounds):
    s, w, n, e = bounds[1], bounds[0], bounds[3], bounds[2]
    bb = '(%f,%f,%f,%f)' % (s, w, n, e)
    q = ('[out:json][timeout:120];('
         + 'way["natural"~"^(gully|cliff|earth_bank|ravine|scree)$"]' + bb + ';'
         + 'way["landuse"="quarry"]' + bb + ';'
         + 'way["man_made"="embankment"]' + bb + ';'
         + ');out geom;')

    def fetch():
        last = None
        for attempt in range(3):
            for url in OVERPASS:
                try:
                    req = urllib.request.Request(url, data=urllib.parse.urlencode({'data': q}).encode(),
                                                 headers={'User-Agent': 'inside-maket (land analytics)'})
                    r = urllib.request.urlopen(req, timeout=180).read()
                    return json.loads(r.decode('utf-8')).get('elements') or []
                except Exception as ex:  # noqa: BLE001
                    last = ex
            time.sleep(10 * (attempt + 1))
        raise RuntimeError('Overpass не ответил: %s' % last)
    return cached('overpass|' + q, fetch)


# --- расчёт аймака -----------------------------------------------------------
def local_proj(lon0, lat0):
    kx = 111320 * math.cos(math.radians(lat0))
    ky = 110540
    fwd = lambda x, y, z=None: ((x - lon0) * kx, (y - lat0) * ky)   # noqa: E731
    inv = lambda x, y, z=None: (x / kx + lon0, y / ky + lat0)        # noqa: E731
    return fwd, inv


def to_ll(g, inv):
    """Контур в долготу и широту, 6 знаков: чинится, округляется поточечно (без перестройки топологии)."""
    g = clean_geom(transform(inv, g))
    try:
        return mapping(shapely.set_precision(g, 1e-6, mode='pointwise'))
    except Exception:  # noqa: BLE001
        return mapping(shapely.transform(g, lambda c: np.round(c, 6)))


def clean_geom(g):
    g = shapely.make_valid(g)
    if g.geom_type == 'GeometryCollection':
        g = unary_union([p for p in g.geoms if p.geom_type in ('Polygon', 'MultiPolygon')])
    return g


def run_aimak(a, strip, min_patch, log):
    t0 = time.time()
    aim_ll = clean_geom(shape(a['geometry']))
    c = aim_ll.centroid
    fwd, inv = local_proj(c.x, c.y)
    aim = transform(fwd, aim_ll)
    mx1, my1 = merc(*aim_ll.bounds[:2])
    mx2, my2 = merc(*aim_ll.bounds[2:])
    # участки
    feats, seen = [], set()
    nx = int((mx2 - mx1) // TILE) + 1
    ny = int((my2 - my1) // TILE) + 1
    done = 0
    for i in range(nx):
        for j in range(ny):
            b = (mx1 + i * TILE, my1 + j * TILE, mx1 + (i + 1) * TILE, my1 + (j + 1) * TILE)
            lon1, lat1 = unmerc(b[0], b[1])
            lon2, lat2 = unmerc(b[2], b[3])
            if not aim_ll.intersects(box(lon1, lat1, lon2, lat2)):
                continue
            for f in parcels_in(b):
                k = (f.get('properties') or {}).get('PROPCODE') or json.dumps(f.get('geometry'))[:80]
                if k in seen or not f.get('geometry'):
                    continue
                seen.add(k)
                feats.append(f)
            done += 1
            if done % 25 == 0:
                log('  квадратов %d, участков %d' % (done, len(feats)))
    log('  участков всего %d (%.0f с)' % (len(feats), time.time() - t0))
    # сведения участков (участок — в аймаке центра контура)
    dct = {'form': [''], 'use': [''], 'purp': ['']}

    def ix(k, v):
        s = str(v if v is not None else '').strip()
        s = '' if s in ('None', '-9999', 'null') else s
        if s not in dct[k]:
            dct[k].append(s)
        return dct[k].index(s)
    rows, polys, db_parcels = [], [], []
    for f in feats:
        try:
            g = clean_geom(transform(fwd, shape(f['geometry'])))
        except Exception:  # noqa: BLE001
            continue
        if g.is_empty:
            continue
        polys.append(g)
        inside = aim.contains(g.representative_point())
        pr = f.get('properties') or {}
        db_parcels.append((str(pr.get('PROPCODE') or ''), pr, f['geometry'], g.area, inside))
        if inside:
            y = str(pr.get('DATEINS') or '')[:4]
            rows.append([round(g.area), ix('form', pr.get('PROPFORM_NAME')), ix('use', pr.get('PROPFOR_NAME')), ix('purp', pr.get('NAZNACHENI')),
                         int(y) if y.isdigit() else 0, 1 if str(pr.get('AMNESTIED')).lower() in ('true', '1') else 0,
                         1 if str(pr.get('FROM_GPS')).lower() in ('true', '1') else 0])
    parcels_u = unary_union(polys).intersection(aim) if polys else Polygon()
    log('  объединение участков (%.0f с)' % (time.time() - t0))
    # дороги и зоны OSM
    size = 2 * W / 2 ** Z
    tx1, tx2 = int((mx1 + W) // size), int((mx2 + W) // size)
    ty1, ty2 = int((W - my2) // size), int((W - my1) // size)
    roads, water = [], []
    for x in range(tx1, tx2 + 1):
        for y in range(ty1, ty2 + 1):
            tl = tile(x, y)
            for pr, g in tl.get('transportation', []):
                w = ROAD_W.get(pr.get('class'))
                if not w or pr.get('brunnel') == 'tunnel' or g.geom_type not in ('LineString', 'MultiLineString'):
                    continue
                roads.append(transform(fwd, g).buffer(w / 2, cap_style='flat', quad_segs=2))
            for pr, g in tl.get('water', []):
                if g.geom_type in ('Polygon', 'MultiPolygon'):
                    water.append(transform(fwd, g))
            for pr, g in tl.get('waterway', []):
                w = WATERWAY_W.get(pr.get('class'))
                if w and pr.get('brunnel') != 'tunnel' and g.geom_type in ('LineString', 'MultiLineString'):
                    water.append(transform(fwd, g).buffer(w / 2, cap_style='flat', quad_segs=2))
            for pr, g in tl.get('landcover', []):
                if pr.get('class') == 'wetland' and g.geom_type in ('Polygon', 'MultiPolygon'):
                    water.append(transform(fwd, g))
    # рельеф
    rel = []
    try:
        for el in relief(aim_ll.bounds):
            pts = [(p['lon'], p['lat']) for p in el.get('geometry') or []]
            if len(pts) < 2:
                continue
            tg = el.get('tags') or {}
            closed = pts[0] == pts[-1] and len(pts) >= 4
            if closed and (tg.get('landuse') == 'quarry' or tg.get('natural') in ('scree', 'gully', 'ravine')):
                rel.append(transform(fwd, Polygon(pts)).buffer(0))
            else:
                w = RELIEF_W.get(tg.get('natural'), 8)
                rel.append(transform(fwd, LineString(pts)).buffer(w / 2, cap_style='flat', quad_segs=2))
        relief_ok = True
    except Exception as ex:  # noqa: BLE001
        log('  рельеф не получен: %s' % ex)
        relief_ok = False
    def u(gs):
        gs = [clean_geom(g) for g in gs if g is not None and not g.is_empty]
        return clean_geom(unary_union(gs)).intersection(aim) if gs else Polygon()

    def minus(g, *others):
        for o in others:
            if g.is_empty:
                break
            if o is not None and not o.is_empty:
                g = clean_geom(g.difference(o))
        return g
    # --- другие источники: WorldCover (вода), Copernicus DEM (крутые склоны), Microsoft (здания) ---
    lo1, la1, lo2, la2 = aim_ll.bounds
    bb = (lo1 - 0.002, la1 - 0.002, lo2 + 0.002, la2 + 0.002)
    loc = lambda gs: [transform(fwd, g) for g in gs]   # noqa: E731
    wc, wct = sources.worldcover(bb, cached)
    water_wc = u(loc(sources.vectorize(np.isin(wc, (80, 90)), wct)))
    z, zt = sources.dem(bb, cached)
    steep = u(loc(sources.vectorize(sources.slope_deg(z, zt) > SLOPE, zt)))
    aim_prep = shapely.prepared.prep(aim_ll) if hasattr(shapely, 'prepared') else None
    blds = [g for g in sources.buildings(bb, cached) if aim_ll.contains(g.representative_point())]
    bld_loc = loc(blds)
    bld_u = u([g.buffer(BLD_YARD, quad_segs=2) for g in bld_loc])
    log('  источники: WorldCover, рельеф, зданий Microsoft %d (%.0f с)' % (len(blds), time.time() - t0))
    water_osm = u(water)
    rel_osm = u(rel)
    roads_u = u(roads)
    water_u = u([water_osm, water_wc])
    rel_u = u([rel_osm, steep])
    # Порядок: участки главнее всего; дальше дороги, вода, рельеф — без двойного счёта.
    roads_only = minus(roads_u, parcels_u)
    water_only = minus(water_u, parcels_u, roads_u)
    rel_only = minus(rel_u, parcels_u, roads_u, water_u)
    # Здания по снимкам вне участков с ЕНИ — фактически занято без ЕНИ.
    bld_only = minus(bld_u, parcels_u, roads_u, water_u, rel_u)
    rest = minus(aim, parcels_u, roads_u, water_u, rel_u, bld_u)
    # Сверка источников: сколько воды и рельефа знает каждый, сколько — только один.
    cmp = {
        'waterOsmHa': round(minus(water_osm, parcels_u).area / 1e4, 2), 'waterWcHa': round(minus(water_wc, parcels_u).area / 1e4, 2),
        'waterBothHa': round(clean_geom(minus(water_osm, parcels_u).intersection(water_wc)).area / 1e4, 2) if not water_osm.is_empty and not water_wc.is_empty else 0.0,
        'reliefOsmHa': round(minus(rel_osm, parcels_u).area / 1e4, 2), 'steepHa': round(minus(steep, parcels_u).area / 1e4, 2),
    }
    on_eni = [g.representative_point().within(parcels_u) for g in bld_loc]
    cmp['buildings'] = len(blds)
    cmp['buildingsNoEni'] = int(sum(1 for x in on_eni if not x))
    db_blds = [(mapping(g), gl.area, on) for g, gl, on in zip(blds, bld_loc, on_eni)]
    # Участки на воде (пользователь 04.11.2026: «Есть участки водные в частной собственности»):
    # доля площади участка на воде (OSM ∪ WorldCover); 20 % и больше — в сводку по формам собственности.
    water_share = [0.0] * len(polys)
    if not water_u.is_empty and polys:
        tree = shapely.STRtree(polys)
        for wp in getattr(water_u, 'geoms', [water_u]):
            for i in tree.query(wp, predicate='intersects'):
                try:
                    water_share[i] += polys[i].intersection(wp).area / max(polys[i].area, 1)
                except Exception:  # noqa: BLE001
                    pass
    wet = {}
    for i, sh in enumerate(water_share):
        if sh >= 0.2 and db_parcels[i][4]:
            form = str((db_parcels[i][1] or {}).get('PROPFORM_NAME') or '') or 'Без метки'
            x = wet.setdefault(form, [0, 0.0])
            x[0] += 1
            x[1] += polys[i].area / 1e4
    cmp['parcelsOnWater'] = {k: {'n': v[0], 'ha': round(v[1], 2)} for k, v in wet.items()}
    db_parcels = [t + (min(1.0, water_share[i]),) for i, t in enumerate(db_parcels)]
    log('  дороги и остаток (%.0f с)' % (time.time() - t0))
    # очистка: узкие полосы и клочки
    opened = rest.buffer(-strip / 2, quad_segs=2).buffer(strip / 2, quad_segs=2).intersection(rest)
    strips = rest.difference(opened)
    parts = list(opened.geoms) if hasattr(opened, 'geoms') else [opened]
    big = [p for p in parts if p.area >= min_patch]
    small = [p for p in parts if p.area < min_patch]
    free = unary_union(big) if big else Polygon()
    small_u = unary_union(small) if small else Polygon()
    log('  очистка (%.0f с)' % (time.time() - t0))
    # зоны свободной земли — по классам WorldCover (класс → маска → векторы ∩ свободное)
    left = free
    by_zone, free_feats, parts = {}, [], []
    # Маска свободной земли на сетке WorldCover (с запасом в пиксель) — классы переводятся в векторы только там.
    from rasterio.features import rasterize
    free_ll = transform(inv, free.buffer(12)) if not free.is_empty else None
    free_mask = rasterize([free_ll], out_shape=wc.shape, transform=wct, fill=0, default_value=1, all_touched=True).astype(bool) if free_ll is not None else np.zeros(wc.shape, bool)
    for k, label, codes in ZONES:
        if k == 'none':
            part = left
        else:
            zu = u(loc(sources.vectorize(np.isin(wc, codes) & free_mask, wct))) if codes else Polygon()
            part = clean_geom(left.intersection(zu)) if not zu.is_empty and not left.is_empty else Polygon()
            left = minus(left, zu)
        by_zone[k] = part.area / 1e4
        if not part.is_empty:
            simp = part.simplify(0.8, preserve_topology=True)
            gj = to_ll(simp, inv)
            free_feats.append({'type': 'Feature', 'properties': {'zone': k}, 'geometry': gj})
            parts.append({'kind': 'free', 'zone': k, 'area_ha': part.area / 1e4, 'geom': gj})
    # непригодное и занятое без ЕНИ — тоже векторами (для карты и базы)
    for k, g in (('roads', roads_only), ('water', water_only), ('relief', rel_only), ('bld', bld_only), ('strips', strips), ('small', small_u)):
        if not g.is_empty:
            gj = to_ll(g.simplify(0.8, preserve_topology=True), inv)
            free_feats.append({'type': 'Feature', 'properties': {'zone': k}, 'geometry': gj})
            parts.append({'kind': k, 'zone': '', 'area_ha': g.area / 1e4, 'geom': gj})
    parts.append({'kind': 'occupied', 'zone': '', 'area_ha': parcels_u.area / 1e4,
                  'geom': to_ll(parcels_u.simplify(0.5, preserve_topology=True), inv)})
    log('  зоны (%.0f с)' % (time.time() - t0))
    area = aim.area / 1e4
    ha = lambda g: (g.area / 1e4) if not g.is_empty else 0.0   # noqa: E731
    occ = {
        'share': ha(parcels_u) / area, 'occHa': round(ha(parcels_u), 2),
        'roadsShare': ha(roads_only) / area, 'roadsHa': round(ha(roads_only), 2), 'roadsMissing': 0,
        'waterHa': round(ha(water_only), 2), 'reliefHa': round(ha(rel_only), 2), 'reliefOk': relief_ok,
        'bldHa': round(ha(bld_only), 2), 'cmp': cmp, 'slope': SLOPE, 'bldYard': BLD_YARD,
        'stripsHa': round(ha(strips), 2), 'smallHa': round(ha(small_u), 2),
        'freeShare': ha(free) / area, 'freeHa': round(ha(free), 2),
        'zones': {k: round(v, 2) for k, v in by_zone.items()},
        'gfsuShare': (a.get('occ') or {}).get('gfsuShare', 0), 'gfsuHa': (a.get('occ') or {}).get('gfsuHa', 0),
        'parcels': len(feats), 'tiles': done, 'at': datetime.now(timezone.utc).isoformat(),
        'strip': strip, 'minPatch': min_patch,
        'by': ('векторный расчёт (shapely): участки — Кадастр (ENI_WGS84); дороги — OpenStreetMap; вода — OpenStreetMap и ESA WorldCover 2021; '
               'рельеф — OpenStreetMap (овраги, обрывы, карьеры) и Copernicus DEM (склон круче %g°); здания без ЕНИ — Microsoft Building Footprints (двор %g м); '
               'зоны свободной земли — ESA WorldCover; узкие полосы уже %g м и клочки меньше %g м² — непригодны') % (SLOPE, BLD_YARD, strip, min_patch),
    }
    log('  готово: занято %.1f га (%.1f %%), дороги %.1f, вода %.1f, рельеф %.1f, здания без ЕНИ %.1f, полосы %.1f, клочки %.1f, свободно %.1f га (%.0f с)' % (
        occ['occHa'], occ['share'] * 100, occ['roadsHa'], occ['waterHa'], occ['reliefHa'], occ['bldHa'], occ['stripsHa'], occ['smallHa'], occ['freeHa'], time.time() - t0))
    log('  сверка: %s' % json.dumps(cmp, ensure_ascii=False))
    return occ, {'dict': dct, 'rows': rows, 'at': occ['at']}, {'type': 'FeatureCollection', 'features': free_feats}, (db_parcels, db_blds, parts)


def darek_aimak(lat, lon):
    """Аймак в точке с карты «Дарек»: код, название, район, область, баланс, контур (как в land-seed.json)."""
    B = 'http://map.darek.kg/qgis/qgis_mapserv.fcgi.exe?map=' + urllib.parse.quote('C:/OSGeo4W64/projects/ГИСАР/ГИСАР.qgz')
    d = 0.0005
    q = {'SERVICE': 'WMS', 'VERSION': '1.3.0', 'REQUEST': 'GetFeatureInfo', 'LAYERS': 'Границы айылных аймаков', 'QUERY_LAYERS': 'Границы айылных аймаков',
         'CRS': 'CRS:84', 'BBOX': '%f,%f,%f,%f' % (lon - d, lat - d, lon + d, lat + d), 'WIDTH': 101, 'HEIGHT': 101, 'I': 50, 'J': 50,
         'INFO_FORMAT': 'application/json', 'FEATURE_COUNT': 1, 'WITH_GEOMETRY': 'true'}
    f = cached('darek|' + json.dumps(q, sort_keys=True), lambda: json.loads(urllib.request.urlopen(B + '&' + urllib.parse.urlencode(q), timeout=60).read()))['features'][0]
    p = f['properties']
    num = lambda v: float(str(v).replace(',', '.')) if v not in (None, '') else None   # noqa: E731
    parts = [('Земли сельскохозяйственного назначения (га)', 'Сельскохозяйственного назначения'), ('Земли населенных пунктов (га)', 'Населённых пунктов'),
             ('Земли промышленности, транспорта, связи, энергетики, обороны и иного назначения (га)', 'Промышленности, транспорта, связи, энергетики, обороны'),
             (' Земли лесного фонда (га)', 'Лесного фонда'), ('Земли водного фонда (га)', 'Водного фонда'),
             ('Земли особо охраняемых природных территорий (га)', 'Особо охраняемых природных территорий'), ('Земли запаса (га)', 'Запаса')]
    g = clean_geom(shape(f['geometry']))
    c = g.centroid
    fwd, _ = local_proj(c.x, c.y)
    return {'code': p['Код аймака'], 'aimak': p['Аймак'], 'district': p.get('Район') or '', 'oblast': p.get('Область') or '',
            'balance': {'total': num(p.get('Общая площадь (га)')), 'parts': [{'label': l, 'ha': num(p.get(k))} for k, l in parts if num(p.get(k)) is not None]},
            'geometry': f['geometry'], 'areaHa': round(transform(fwd, g).area / 1e4, 2), 'at': datetime.now(timezone.utc).isoformat()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--aimak', default='')
    ap.add_argument('--strip', type=float, default=6.0, help='ширина узкой полосы, м: уже — непригодна')
    ap.add_argument('--min-patch', type=float, default=200.0, help='клочок, м²: меньше — непригоден')
    ap.add_argument('--point', default='', help='добавить аймак по точке «широта,долгота» (контур и баланс — Дарек)')
    ap.add_argument('--no-db', action='store_true', help='не писать в базу lands (PostgreSQL + PostGIS)')
    ap.add_argument('--skip-done', action='store_true', help='пропустить аймаки, уже посчитанные векторным расчётом')
    args = ap.parse_args()
    log = lambda s: print(s, flush=True)   # noqa: E731
    seed = json.load(open(SEED, encoding='utf-8'))
    parcels = json.load(open(PARCELS, encoding='utf-8')) if os.path.exists(PARCELS) else {'aimaks': {}}
    os.makedirs(FREE_DIR, exist_ok=True)
    if args.point:
        lat, lon = [float(x) for x in args.point.split(',')]
        a = darek_aimak(lat, lon)
        seed['aimaks'] = [x for x in seed['aimaks'] if x['code'] != a['code']] + [a]
        args.aimak = a['aimak']
        log('аймак по точке: %s (%s), %s, %s' % (a['aimak'], a['code'], a['district'], a['oblast']))
    db = None
    if not args.no_db:
        try:
            import land_db
            db = land_db.connect()
        except Exception as ex:  # noqa: BLE001
            log('база lands недоступна — пишу только файлы: %s' % ex)
    todo = [a for a in seed['aimaks'] if a.get('geometry') and (not args.aimak or a['aimak'].lower().startswith(args.aimak.lower()))]
    if args.skip_done:
        todo = [a for a in todo if not (a.get('occ') or {}).get('zones')]
    failed = []
    for a in todo:
        log('%s (%s)' % (a['aimak'], a['code']))
        try:
            occ, pst, free, dbrows = run_aimak(a, args.strip, args.min_patch, log)
        except Exception as ex:  # noqa: BLE001
            import traceback
            log('  НЕ ПОСЧИТАН: %s' % ex)
            log(traceback.format_exc()[-1500:])
            failed.append(a['aimak'])
            continue
        if db is not None:
            land_db.save(db, a, occ, *dbrows)
            log('  в базе lands: участков %d, зданий %d, частей %d' % tuple(len(x) for x in dbrows))
        # Качество контура Дарека (пользователь 04.11.2026: «Это данные дарека такие? Или мы
        # не то спарсили?» — сверено: контур тот же при запросе из любой точки аймака, ошибки —
        # в слое Дарека): исправленный контур — в данные карты, пометка — фактами.
        raw = shape(a['geometry'])
        fixed = clean_geom(raw)
        nparts = len(getattr(fixed, 'geoms', [fixed]))
        bal = (a.get('balance') or {}).get('total')
        a['quality'] = {
            'valid': bool(raw.is_valid), 'parts': nparts,
            'balanceDiff': round((a.get('areaHa') or 0) / bal - 1, 4) if bal else None,
            'note': '; '.join(x for x in (
                '' if raw.is_valid else 'граница в слое Дарека пересекает сама себя — исправлена',
                'контур из %d частей' % nparts if nparts > 1 else '',
                'площадь по контуру отличается от баланса на %+.0f %%' % (((a.get('areaHa') or 0) / bal - 1) * 100) if bal and abs((a.get('areaHa') or 0) / bal - 1) > 0.05 else '',
            ) if x),
        }
        if not raw.is_valid:
            a['geometry'] = mapping(fixed)
        # Точка подписи — гарантированно внутри самой большой части (среднее вершин у
        # изрезанного контура уходило за его пределы: подпись «Ысык-Кол» стояла на озере).
        big = max(getattr(fixed, 'geoms', [fixed]), key=lambda g: g.area)
        lp = big.representative_point()
        a['label'] = [round(lp.x, 6), round(lp.y, 6)]
        old = a.get('occ') or {}
        if old.get('free'):
            occ['free'] = old['free']    # картинка издали — пока прежняя; векторы — в free/<код>.json
        a['occ'] = occ
        parcels['aimaks'][a['code']] = pst
        fn = os.path.join(FREE_DIR, a['code'].replace(',', '_') + '.json')
        with open(fn, 'w', encoding='utf-8') as f:
            json.dump(free, f, ensure_ascii=False, separators=(',', ':'))
        log('  векторы свободной земли: %s, %.1f МБ' % (os.path.relpath(fn, ROOT), os.path.getsize(fn) / 1e6))
        # сохраняем после каждого аймака — прерванный прогон не теряет посчитанное
        seed['at'] = datetime.now(timezone.utc).isoformat()
        with open(SEED, 'w', encoding='utf-8') as f:
            json.dump(seed, f, ensure_ascii=False, separators=(',', ':'))
        parcels['at'] = seed['at']
        with open(PARCELS, 'w', encoding='utf-8') as f:
            json.dump(parcels, f, ensure_ascii=False, separators=(',', ':'))
    log('ИТОГ: посчитано %d, не посчитано %d%s' % (len(todo) - len(failed), len(failed), (' — ' + ', '.join(failed)) if failed else ''))


if __name__ == '__main__':
    main()
