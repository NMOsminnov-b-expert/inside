# -*- coding: utf-8 -*-
"""Настоящие ЕНИ для ручных демо-записей (seed*.js) — по областям.

Указание пользователя 14.10.2026: «В тестовых данных оставляем только
реальные ЕНИ. Нужно — подбирай. По областям» и подсказка «Cadastre kg».
Ручные записи модулей (seed.js, seedProduction.js) несли выдуманные коды вида
1-47-56-…: по первой цифре это Бишкек, хотя записи стояли и в Оше, и в
Чуйской области, а Кадастр по ним ничего не находил. Записи демо-объёма
(bulk.js) уже берут настоящие участки из выгрузки Кадастра
(app/kernel/demoParcels.js, tools/cadastre/sample_parcels.py).

Утилита разносит ручные записи по областям (PLAN) и каждой даёт настоящий
участок выбранного места из той же выгрузки: ЕНИ, улицу, дом, координаты —
у записи и её ОИ. Участок подбирается по назначению (жилой дом, квартира,
нежилое, земельный участок). ОИ на одном участке делят его ЕНИ; второй и
следующие участки записи — свои настоящие участки; у сводных записей «-all»
у каждого ОИ свой участок (для показа свёрнутых кодов). У движимого (ТС,
механизмы, прежнее «движимое») ЕНИ нет. Каждый ЕНИ проверяется на портале
Кадастра через свой прокси (адрес по ЕНИ).

    python tools/cadastre/proxy.py          # в другом окне
    python tools/cadastre/real_seed_eni.py  # правит app/modules/*/data/seed*.js
"""
import glob
import io
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PARCELS = os.path.join(ROOT, 'app', 'kernel', 'demoParcels.js')
PROXY = 'http://127.0.0.1:8787/eni?code='

# Место выгрузки → поля адреса записи (область, город, район) — значения
# справочника областей (REGIONS); у Бишкека и Оша области нет: город сам
# себе область, а адрес иначе читается «г. Бишкек, г. Бишкек».
PLACE = {
    'г. Бишкек': ('', 'г. Бишкек', ''),
    'г. Ош': ('', 'г. Ош', ''),
    'г. Каракол': ('Иссык-Кульская область', 'г. Каракол', ''),
    'г. Талас': ('Таласская область', 'г. Талас', ''),
    'г. Баткен': ('Баткенская область', 'г. Баткен', ''),
    'г. Нарын': ('Нарынская область', 'г. Нарын', ''),
    'г. Токмок': ('Чуйская область', 'г. Токмок', ''),
    'г. Джалал-Абад': ('Джалал-Абадская область', 'г. Джалал-Абад', ''),
    'г. Кант': ('Чуйская область', 'г. Кант', 'Ысык-Атинский р-н'),
    'г. Карабалта': ('Чуйская область', 'г. Кара-Балта', 'Жайылский р-н'),
    'Чуйская обл., Аламудунский р-н': ('Чуйская область', '', 'Аламудунский р-н'),
    'Чуйская обл., Сокулукский р-н': ('Чуйская область', '', 'Сокулукский р-н'),
    'Ошская обл., Кара-Сууйский р-н': ('Ошская область', '', 'Кара-Сууйский р-н'),
    'Таласская обл., Манасский р-н': ('Таласская область', '', 'Манасский р-н'),
}

# Запись → место: все восемь областей (Бишкек, Ош, Иссык-Куль, Талас, Баткен,
# Нарын, Чуй, Жалал-Абад) и районы.
PLAN = {
    'oc-ap-1': 'г. Бишкек', 'oc-ap-2': 'г. Джалал-Абад', 'oc-ap-all': 'г. Нарын',
    'oc-cv-1': 'г. Бишкек', 'oc-cv-2': 'г. Ош', 'oc-cv-all': 'г. Каракол',
    'oc-pr-1': 'г. Кант', 'oc-pr-2': 'г. Токмок', 'oc-pr-all': 'г. Карабалта',
    'oc-lp-1': 'Чуйская обл., Аламудунский р-н', 'oc-lp-2': 'Таласская обл., Манасский р-н', 'oc-lp-all': 'Ошская обл., Кара-Сууйский р-н',
    'oc-rh-1': 'Чуйская обл., Сокулукский р-н', 'oc-rh-2': 'г. Баткен', 'oc-rh-3': 'г. Ош', 'oc-rh-all': 'г. Талас',
}

# Назначение участка по типу записи / виду ОИ — по порядку предпочтения.
USE = {
    'apartment': ('многоквартирный дом', 'квартира', 'жилой дом'),
    'residential-house': ('жилой дом',),
    'civil': ('нежилое помещение', 'административное здание', 'офис', 'магазин', 'жилой дом'),
    'land-plot': ('земельный участок',),
    'land': ('земельный участок',),
}
MOVABLE = ('vehicle', 'mech', 'movable')


def load_parcels():
    s = io.open(PARCELS, encoding='utf-8').read()
    i = s.index('{', s.index('DEMO_PARCELS'))
    return json.JSONDecoder().raw_decode(s[i:])[0]


def split_addr(addr):
    m = re.match(r'^(.*?)\s*д\.\s*(\S+)', addr or '')
    if not m:
        return re.sub(r'^ул\.\s*', '', addr or '').strip(), ''
    street = re.sub(r'^ул\.\s*', '', m.group(1)).strip()
    house = '' if m.group(2).lower() in ('бн', 'б/н') else m.group(2)
    return street, house


def clean(p):
    """Аккуратный адрес: дом с цифрой, без «кв.» и «квартал»."""
    street, house = split_addr(p['addr'])
    return bool(street and re.search(r'\d', house or '') and 'кв' not in p['addr'])


def center(p):
    x1, y1, x2, y2 = p['ext']
    return '%.4f, %.4f' % ((y1 + y2) / 2, (x1 + x2) / 2)


class Picker:
    def __init__(self, parcels):
        self.parcels = parcels
        self.used = set()

    def take(self, place, uses):
        lst = self.parcels[place]
        # С конца списка: генератор демо-объёма берёт участки с начала.
        for want in uses + ('',):
            for p in reversed(lst):
                if p['eni'] in self.used or not clean(p):
                    continue
                if want and want not in (p['use'] or '').lower():
                    continue
                self.used.add(p['eni'])
                return p
        raise SystemExit('нет свободного участка: %s %s' % (place, uses))


def blocks(s, indent):
    """Позиции объектов с id на данном отступе."""
    return [m.start() for m in re.finditer(r"\n%sid: '" % (' ' * indent), s)]


def set_field(blk, indent, key, value, insert_after=None):
    pat = re.compile(r"(\n%s%s: )'[^']*'" % (' ' * indent, re.escape(key)))
    if pat.search(blk):
        return pat.sub(lambda m: "%s'%s'" % (m.group(1), value.replace("'", "\\'")), blk, count=1)
    if insert_after:
        p2 = re.compile(r"(\n%s%s: '[^']*',)" % (' ' * indent, re.escape(insert_after)))
        if p2.search(blk):
            return p2.sub(lambda m: "%s\n%s%s: '%s'," % (m.group(1), ' ' * indent, key, value.replace("'", "\\'")), blk, count=1)
    return blk


def fix_record(blk, typeId, rid, picker, log):
    place = PLAN[rid]
    region, city, district = PLACE[place]
    whole = rid.endswith('-all')
    # ОИ записи — по отступу 10.
    starts = blocks(blk, 10)
    ois = []
    for i, st in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(blk)
        ob = blk[st:end]
        oid = re.search(r"id: '([^']+)'", ob).group(1)
        card = (re.search(r"\n {10}card: '([^']+)'", ob) or [None, 'building'])[1]
        land = (re.search(r"\n {10}landId: '([^']+)'", ob) or [None, ''])[1]
        ois.append([st, end, oid, card, land])
    main = picker.take(place, USE.get(typeId, ()))
    by_oi = {}
    first_land = True
    for o in ois:
        card = o[3]
        if card in MOVABLE:
            continue
        if whole:
            by_oi[o[2]] = main if not by_oi else picker.take(place, USE.get(card, USE.get(typeId, ())))
        elif card == 'land':
            by_oi[o[2]] = main if first_land else picker.take(place, USE['land'])
            first_land = False
    for o in ois:
        if o[3] in MOVABLE or o[2] in by_oi:
            continue
        by_oi[o[2]] = by_oi.get(o[4]) or main
    # ОИ — с конца, чтобы позиции не сбивались.
    out = blk
    for st, end, oid, card, land in reversed(ois):
        ob = out[st:end]
        if card in MOVABLE:
            # ЕНИ у движимого нет, а стоит оно там же, где здание: адрес и
            # координаты — участка записи.
            ob = set_field(ob, 10, 'eni', '')
            street, house = split_addr(main['addr'])
            ob = set_field(ob, 10, 'street', street)
            ob = set_field(ob, 10, 'house', house)
            ob = set_field(ob, 10, 'gps', center(main))
        else:
            p = by_oi[oid]
            street, house = split_addr(p['addr'])
            ob = set_field(ob, 10, 'eni', p['eni'])
            ob = set_field(ob, 10, 'street', street)
            ob = set_field(ob, 10, 'house', house)
            ob = set_field(ob, 10, 'gps', center(p))
            log.append((rid, oid, card, p['eni'], p['addr'], p['use']))
        out = out[:st] + ob + out[end:]
    rec_eni = (by_oi.get(ois[0][2]) if whole and ois else None) or main
    street, house = split_addr(rec_eni['addr'])
    head_end = ois[0][0] if ois else len(out)
    head = out[:head_end]
    head = set_field(head, 6, 'eni', rec_eni['eni'])
    head = set_field(head, 6, 'region', region, insert_after='eni')
    head = set_field(head, 6, 'city', city, insert_after='region')
    head = set_field(head, 6, 'district', district, insert_after='city')
    head = set_field(head, 6, 'micro', '')
    head = set_field(head, 6, 'street', street)
    head = set_field(head, 6, 'house', house)
    head = set_field(head, 6, 'gps', center(rec_eni))
    log.append((rid, '(запись)', typeId, rec_eni['eni'], rec_eni['addr'], place))
    return head + out[head_end:]


def verify(enis):
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    bad = []
    for e in sorted(enis):
        try:
            r = json.loads(op.open(PROXY + e, timeout=30).read().decode('utf-8'))
            if not r.get('address'):
                bad.append((e, r.get('error') or 'адреса нет'))
        except Exception as ex:
            bad.append((e, str(ex)[:60]))
    return bad


def main():
    picker = Picker(load_parcels())
    log = []
    for f in sorted(glob.glob(os.path.join(ROOT, 'app', 'modules', '*', 'data', 'seed*.js'))):
        typeId = os.path.basename(os.path.dirname(os.path.dirname(f)))
        s = io.open(f, encoding='utf-8').read()
        starts = blocks(s, 6)
        out = s
        for i in reversed(range(len(starts))):
            st = starts[i]
            end = starts[i + 1] if i + 1 < len(starts) else len(s)
            rid = re.search(r"id: '([^']+)'", s[st:end]).group(1)
            if rid not in PLAN:
                continue
            out = out[:st] + fix_record(out[st:end], typeId, rid, picker, log) + out[end:]
        if out != s:
            io.open(f, 'w', encoding='utf-8', newline='\n').write(out)
    for row in sorted(log):
        print(' | '.join(row))
    enis = {r[3] for r in log}
    bad = verify(enis)
    print('ЕНИ: %d, проверено на портале Кадастра, не найдено: %d %s' % (len(enis), len(bad), bad[:5]))


if __name__ == '__main__':
    main()
