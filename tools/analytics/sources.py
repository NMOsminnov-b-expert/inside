# -*- coding: utf-8 -*-
"""Открытые источники для расчёта земель по аймакам — кроме Кадастра, Дарека и OSM.

Пользователь 04.11.2026: «Овраги водоемы и т.д. … подтягивать и сверять не
только с гос порталами. Нужны еще источники данных»; «Грубо говоря как мы
поступили с OSM, cadastre и darek».

  * ESA WorldCover 2021 v200 (10 м, Европейское космическое агентство, лицензия
    CC BY 4.0) — покров земли: 10 деревья, 20 кустарник, 30 луга, 40 пашня,
    50 застройка, 60 голая земля, 70 снег и лёд, 80 вода, 90 болота,
    95 мангры, 100 мох и лишайник. Листы 3°×3° — COG на AWS (без ключа).
  * Copernicus DEM GLO-30 (30 м, ESA / Airbus) — высоты; уклон считается здесь.
    Листы 1°×1° — COG на AWS (без ключа).
  * Microsoft Global ML Building Footprints (ODbL) — контуры зданий по снимкам;
    листы по квадратам (quadkey 9), выпуск 2026-02.
Читается только окно под аймак; ответы — в кэше на диске (land_pipeline.cached).
"""
import gzip
import io
import json
import math
import os
import urllib.request

import numpy as np
import rasterio
from rasterio.features import shapes
from rasterio.merge import merge
from shapely.geometry import shape, box

WC = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{ns}{lat:02d}{ew}{lon:03d}_Map.tif'
DEM = 'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM/Copernicus_DSM_COG_10_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM.tif'
MS_LINKS = 'https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv'
WC_CLASS = {10: 'Деревья', 20: 'Кустарник', 30: 'Луга', 40: 'Пашня', 50: 'Застройка', 60: 'Голая земля', 70: 'Снег и лёд',
            80: 'Вода', 90: 'Болота', 95: 'Мангры', 100: 'Мох и лишайник'}
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_HTTP_MAX_RETRY='4', GDAL_HTTP_RETRY_DELAY='3')


def _names(tmpl, b, step):
    lon1, lat1, lon2, lat2 = b
    out = []
    for la in range(int(math.floor(lat1 / step) * step), int(math.floor(lat2 / step) * step) + 1, step):
        for lo in range(int(math.floor(lon1 / step) * step), int(math.floor(lon2 / step) * step) + 1, step):
            out.append(tmpl.format(ns='N' if la >= 0 else 'S', lat=abs(la), ew='E' if lo >= 0 else 'W', lon=abs(lo)))
    return out


def _mosaic(urls, b, cached, key):
    """Окно растров под рамку b (lon/lat): (массив, transform). В кэше — как .npz."""
    def fetch():
        with rasterio.Env(**ENV):
            dss = [rasterio.open('/vsicurl/' + u) for u in urls]
            try:
                arr, tr = merge(dss, bounds=b)
            finally:
                for d in dss:
                    d.close()
        bio = io.BytesIO()
        np.savez_compressed(bio, a=arr[0], t=np.array(tuple(tr)[:6]))
        return bio.getvalue()
    raw = cached(key, fetch, binary=True)
    z = np.load(io.BytesIO(raw))
    return z['a'], rasterio.Affine(*z['t'])


def worldcover(b, cached):
    return _mosaic(_names(WC, b, 3), b, cached, 'wc|%r' % (tuple(round(x, 5) for x in b),))


def dem(b, cached):
    return _mosaic(_names(DEM, b, 1), b, cached, 'dem|%r' % (tuple(round(x, 5) for x in b),))


def slope_deg(z, tr):
    """Уклон, градусы: шаг сетки — в метрах у средней широты окна."""
    lat = tr.f + tr.e * z.shape[0] / 2
    dx = abs(tr.a) * 111320 * math.cos(math.radians(lat))
    dy = abs(tr.e) * 110540
    gy, gx = np.gradient(z.astype('float64'), dy, dx)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def refine(z, tr, k=3):
    """Сгущение сетки в k раз с билинейным переходом (пользователь 04.11.2026: «Нужна большая
    точность»; клетки рельефа 30 м давали ступенчатые склоны): (массив, transform)."""
    from rasterio.warp import reproject, Resampling
    out = np.empty((z.shape[0] * k, z.shape[1] * k), dtype='float32')
    t2 = rasterio.Affine(tr.a / k, tr.b, tr.c, tr.d, tr.e / k, tr.f)
    reproject(z.astype('float32'), out, src_transform=tr, src_crs='EPSG:4326', dst_transform=t2, dst_crs='EPSG:4326', resampling=Resampling.bilinear)
    return out, t2


def vectorize(mask, tr):
    """Маска → многоугольники в lon/lat."""
    if not mask.any():
        return []
    return [shape(g) for g, v in shapes(mask.astype('uint8'), mask=mask, transform=tr) if v == 1]


# --- Microsoft Building Footprints -------------------------------------------
def _quadkey(x, y, z):
    q = ''
    for i in range(z, 0, -1):
        d = 0
        m = 1 << (i - 1)
        if x & m:
            d += 1
        if y & m:
            d += 2
        q += str(d)
    return q


def _tile_xy(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def buildings(b, cached, region='Kyrgyzstan'):
    """Контуры зданий в рамке b (lon/lat): [shapely Polygon]."""
    links = cached('ms|links', lambda: urllib.request.urlopen(MS_LINKS, timeout=120).read(), binary=True).decode('utf-8').splitlines()
    by_qk = {}
    for ln in links[1:]:
        p = ln.split(',')
        if len(p) >= 3 and p[0] == region:
            by_qk.setdefault(p[1], []).append(p[2])
    x1, y1 = _tile_xy(b[0], b[3], 9)
    x2, y2 = _tile_xy(b[2], b[1], 9)
    bb = box(*b)
    out = []
    for x in range(x1, x2 + 1):
        for y in range(y1, y2 + 1):
            for url in by_qk.get(_quadkey(x, y, 9), []):
                raw = cached('ms|' + url, lambda u=url: urllib.request.urlopen(u, timeout=300).read(), binary=True)
                for line in gzip.decompress(raw).decode('utf-8').splitlines():
                    if not line.strip():
                        continue
                    f = json.loads(line)
                    # Быстрая отсечка по первой точке контура — до разбора геометрии (листы — сотни тысяч зданий).
                    c0 = f['geometry']['coordinates'][0][0]
                    if not (b[0] <= c0[0] <= b[2] and b[1] <= c0[1] <= b[3]):
                        continue
                    out.append(shape(f['geometry']))
    return out
