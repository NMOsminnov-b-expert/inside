# -*- coding: utf-8 -*-
"""Проверка: здание на участке с ЕНИ — по доле площади контура (land_pipeline.building_cover, порог BLD_ON).

Пользователь 04.11.2026: «не все срабатывания "Без ЕНИ" валидные… Стоит проверить и оттестировать
этот механизм»; «анализировать, касается ли здание участка. По процентам площади. Выше порога - на
участке» (порог 10 %).

    python tools/analytics/test_building_cover.py            # случаи с известным ответом
    python tools/analytics/test_building_cover.py --db 6-05-01  # сверка с PostGIS по аймаку из базы lands
"""
import math
import os
import sys

from shapely.geometry import box

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from land_pipeline import building_cover, BLD_ON  # noqa: E402

# Участки (метры): A 0..20 × 0..20, B 20..40 × 0..20 (сосед), C — копия A (дубль контура в Кадастре).
A = box(0, 0, 20, 20)
B = box(20, 0, 40, 20)
C = box(0, 0, 20, 20)
CASES = [
    ('целиком на участке', box(5, 5, 15, 15), [A], 1.0, True),
    ('снят со сдвигом: половина на участке', box(15, 5, 25, 15), [A], 0.5, True),
    ('на границе двух участков — оба считаются', box(15, 5, 25, 15), [A, B], 1.0, True),
    ('дубль контура не удваивает долю', box(5, 5, 15, 15), [A, C], 1.0, True),
    ('касается краем, 15 % — на участке', box(18.5, 5, 28.5, 15), [A], 0.15, True),
    ('касается краем, 5 % — без ЕНИ', box(19.5, 5, 29.5, 15), [A], 0.05, False),
    ('ровно на пороге 10 % — на участке', box(19, 5, 29, 15), [A], 0.10, True),
    ('в 30 м от участка — без ЕНИ', box(50, 5, 60, 15), [A], 0.0, False),
    ('участков нет — без ЕНИ', box(5, 5, 15, 15), [], 0.0, False),
]


def cases():
    bad = 0
    for name, b, parcels, want, on in CASES:
        got = building_cover([b], parcels)[0]
        ok = math.isclose(got, want, abs_tol=1e-6) and (got >= BLD_ON) == on
        bad += not ok
        print('%s %-45s доля %.3f (ждали %.3f) → %s' % ('ok  ' if ok else 'ПРОВАЛ', name, got, want, 'на участке' if got >= BLD_ON else 'без ЕНИ'))
    return bad


def db(code):
    """Сверка с PostGIS: та же доля, посчитанная базой по тем же контурам."""
    import land_db
    from shapely import from_wkb
    from shapely.ops import transform
    c = land_db.connect()
    P = [from_wkb(bytes(r[0])) for r in c.execute('select ST_AsBinary(geom) from parcel where aimak_code=%s', (code,))]
    rows = c.execute("""select ST_AsBinary(b.geom), coalesce((select ST_Area(ST_Intersection(b.geom, ST_Union(p.geom))::geography)
        from parcel p where p.aimak_code = b.aimak_code and ST_Intersects(b.geom, p.geom)), 0) / nullif(ST_Area(b.geom::geography), 0)
        from building b where b.aimak_code = %s""", (code,)).fetchall()
    B = [from_wkb(bytes(r[0])) for r in rows]
    lat0 = sum(g.centroid.y for g in B[:300]) / max(1, min(300, len(B)))
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110540
    fwd = lambda x, y, z=None: (x * kx, y * ky)   # noqa: E731
    mine = building_cover([transform(fwd, g) for g in B], [transform(fwd, g) for g in P])
    theirs = [r[1] or 0.0 for r in rows]
    diff = sum(1 for m, t in zip(mine, theirs) if (m >= BLD_ON) != (t >= BLD_ON))
    no = sum(1 for m in mine if m < BLD_ON)
    print('%s: зданий %d; без ЕНИ по порогу %d %% — %d (%.1f %%), с ЕНИ — %d (%.1f %%); расхождение с PostGIS по классу: %d'
          % (code, len(B), BLD_ON * 100, no, no / len(B) * 100, len(B) - no, (len(B) - no) / len(B) * 100, diff))
    return 1 if diff > len(B) * 0.002 else 0


if __name__ == '__main__':
    bad = cases()
    if '--db' in sys.argv:
        bad += db(sys.argv[sys.argv.index('--db') + 1])
    print('ИТОГ: %s' % ('провалов %d' % bad if bad else 'все проверки прошли'))
    sys.exit(1 if bad else 0)
