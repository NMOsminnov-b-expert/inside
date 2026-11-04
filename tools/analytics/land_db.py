# -*- coding: utf-8 -*-
"""База земель на ПК — PostgreSQL + PostGIS (база «lands»).

Пользователь 04.11.2026: «В идеале и вовсе сохранять в базу на пк. psql может
быть подойдет на пк»; «PostGIS ставим спокойно». Сервер — тот же переносной
PostgreSQL 17, что у графа знаний (%LOCALAPPDATA%/semsearch/pgsql), учётная
запись — та же (tools/knowledge/store.py).

Таблицы (контуры — geometry(…, 4326) с пространственным индексом):
  aimak         — айыл аймак: код, название, район, область, площадь, баланс, контур;
  parcel        — участок Кадастра: ЕНИ, форма собственности, вид
                  использования, назначение, дата внесения, амнистия, GPS,
                  площадь по контуру, аймак (центр контура), контур;
  building      — здание по снимкам (Microsoft): площадь, на участке с ЕНИ или нет, контур;
  land_part     — части аймака: свободно по зонам (wood, shrub, grass, farm,
                  built, bare, none), roads, water, relief, bld (здания без ЕНИ),
                  strips (узкие полосы), small (клочки) — площадь и контур;
  aimak_result  — итоги и сверка источников (occ), пороги, когда посчитано.
Пишет tools/analytics/land_pipeline.py после каждого аймака.

Примеры запросов:
  select form, count(*), sum(area_m2)/1e4 га from parcel group by 1 order by 2 desc;
  select a.name, p.kind, p.zone, p.area_ha from land_part p join aimak a on a.code = p.aimak_code;
"""
import json
import os
import sys

import psycopg

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'knowledge'))
import store  # noqa: E402  — подключение к серверу графа (порт, учётная запись)

DB = 'lands'

SCHEMA = """
create extension if not exists postgis;
create table if not exists aimak (
  code text primary key, name text, district text, oblast text, area_ha double precision,
  balance jsonb, geom geometry(MultiPolygon, 4326), updated_at timestamptz default now());
create table if not exists parcel (
  propcode text primary key, aimak_code text references aimak(code), form text, use_kind text, purpose text,
  dateins text, amnestied boolean, from_gps boolean, area_m2 double precision,
  geom geometry(MultiPolygon, 4326), fetched_at timestamptz default now());
alter table if exists parcel add column if not exists water_share double precision;
create index if not exists parcel_geom on parcel using gist (geom);
create index if not exists parcel_aimak on parcel (aimak_code);
create table if not exists building (
  id bigserial primary key, aimak_code text references aimak(code), on_eni boolean, area_m2 double precision,
  source text default 'Microsoft Building Footprints', geom geometry(Polygon, 4326));
create index if not exists building_geom on building using gist (geom);
create index if not exists building_aimak on building (aimak_code);
create table if not exists land_part (
  id bigserial primary key, aimak_code text references aimak(code), kind text, zone text,
  area_ha double precision, geom geometry(MultiPolygon, 4326));
create index if not exists land_part_geom on land_part using gist (geom);
create index if not exists land_part_aimak on land_part (aimak_code);
create table if not exists aimak_result (
  aimak_code text primary key references aimak(code), occ jsonb, params jsonb, computed_at timestamptz default now());
"""


def connect():
    pw = store._password()
    with psycopg.connect(host='localhost', port=5432, user='postgres', password=pw, dbname='postgres', autocommit=True) as c:
        if not c.execute('select 1 from pg_database where datname = %s', (DB,)).fetchone():
            c.execute('create database %s' % DB)
    conn = psycopg.connect(host='localhost', port=5432, user='postgres', password=pw, dbname=DB, application_name='land_pipeline')
    conn.execute(SCHEMA)
    conn.commit()
    return conn


def _multi(geom_json):
    return 'ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)), 3))'


def save(conn, a, occ, parcels, buildings, parts):
    """a — аймак (как в land-seed.json); parcels — [(propcode, props, geojson_ll, area_m2, inside)];
    buildings — [(geojson_ll, area_m2, on_eni)]; parts — [{'kind','zone','area_ha','geom'}]."""
    code = a['code']
    cur = conn.cursor()
    cur.execute('insert into aimak (code, name, district, oblast, area_ha, balance, geom, updated_at) values (%s, %s, %s, %s, %s, %s, '
                + _multi(None) + ', now()) on conflict (code) do update set name = excluded.name, district = excluded.district, '
                'oblast = excluded.oblast, area_ha = excluded.area_ha, balance = excluded.balance, geom = excluded.geom, updated_at = now()',
                (code, a.get('aimak'), a.get('district'), a.get('oblast'), a.get('areaHa'), json.dumps(a.get('balance'), ensure_ascii=False),
                 json.dumps(a['geometry'])))
    rows = []
    for pc, pr, gj, m2, inside, wshare in parcels:
        y = str(pr.get('DATEINS') or '')[:10] or None
        rows.append((pc, code if inside else None, pr.get('PROPFORM_NAME'), pr.get('PROPFOR_NAME'), pr.get('NAZNACHENI'), y,
                     str(pr.get('AMNESTIED')).lower() in ('true', '1'), str(pr.get('FROM_GPS')).lower() in ('true', '1'), m2, wshare, json.dumps(gj)))
    cur.executemany('insert into parcel (propcode, aimak_code, form, use_kind, purpose, dateins, amnestied, from_gps, area_m2, water_share, geom, fetched_at) '
                    'values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, ' + _multi(None) + ', now()) on conflict (propcode) do update set '
                    'aimak_code = coalesce(excluded.aimak_code, parcel.aimak_code), form = excluded.form, use_kind = excluded.use_kind, '
                    'purpose = excluded.purpose, dateins = excluded.dateins, amnestied = excluded.amnestied, from_gps = excluded.from_gps, '
                    'area_m2 = excluded.area_m2, water_share = excluded.water_share, geom = excluded.geom, fetched_at = now()', rows)
    cur.execute('delete from building where aimak_code = %s', (code,))
    cur.executemany('insert into building (aimak_code, on_eni, area_m2, geom) values (%s, %s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))',
                    [(code, on, m2, json.dumps(gj)) for gj, m2, on in buildings])
    cur.execute('delete from land_part where aimak_code = %s', (code,))
    cur.executemany('insert into land_part (aimak_code, kind, zone, area_ha, geom) values (%s, %s, %s, %s, ' + _multi(None) + ')',
                    [(code, p['kind'], p['zone'], p['area_ha'], json.dumps(p['geom'])) for p in parts])
    cur.execute('insert into aimak_result (aimak_code, occ, params, computed_at) values (%s, %s, %s, now()) on conflict (aimak_code) do update '
                'set occ = excluded.occ, params = excluded.params, computed_at = now()',
                (code, json.dumps({k: v for k, v in occ.items() if k != 'free'}, ensure_ascii=False),
                 json.dumps({'strip': occ.get('strip'), 'minPatch': occ.get('minPatch'), 'slope': occ.get('slope'), 'bldYard': occ.get('bldYard')})))
    conn.commit()
