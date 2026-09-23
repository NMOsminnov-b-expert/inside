# -*- coding: utf-8 -*-
"""Справочник категоризации ТС → данные карточки ТС в макете.

Источник один — tools/docs/build_kategorii_ts.py: из него же собирается книга
docs/kategorii-ts-baza-modul.xlsx. Здесь его данные переводятся в вид, с которым
работает карточка: у каждого поля устойчивый ключ, вид значения, варианты и
пометка, откуда поле заполняется. Карточка и книга поэтому не расходятся:
поправили справочник — пересобрали оба.

    python tools/data/build_ts_catalog.py   # app/modules/vehicle/data/tsCatalog.js
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'app', 'modules', 'vehicle', 'data', 'tsCatalog.js')
sys.path.insert(0, os.path.join(ROOT, 'tools', 'docs'))
import build_kategorii_ts as B  # noqa: E402

# Ключ — имя, под которым значение лежит в записи. Меняется только вместе с
# данными: по ключу значение и находится.
KEYS = {
    'Марка': 'make', 'Модель': 'model', 'Год выпуска': 'year', 'Цвет': 'color',
    'Идентификационный номер (VIN)': 'vin', '№ кузова (коляски)': 'bodyNo', '№ шасси (рамы)': 'chassisNo',
    '№ двигателя': 'engineNo', 'Тип ТС, вид кузова': 'vtype', 'Руль': 'wheel', 'Количество мест': 'seats',
    'Тип топлива': 'fuel', 'Рабочий объём двигателя': 'engineVolume', 'Мощность двигателя': 'power',
    'Масса без нагрузки': 'massEmpty', 'Максимальная разрешённая масса': 'massMax',
    'Регистрационный номер': 'plate', 'Уникальный идентификатор (VID)': 'vid',
    'Фактический адрес': 'factAddr', 'Дата регистрации': 'regDate',
    'Серия и номер документа': 'docNo', 'Пробег': 'mileage', 'Моточасы': 'engineHours',
    'Колёсная формула': 'wheelFormula', 'Число осей': 'axles', 'Число управляемых осей': 'steerAxles',
    'Тип КПП': 'gearbox', 'Коробка отбора мощности': 'pto', 'Техническое состояние': 'state',
    'Комплектность': 'kit', 'Изготовитель': 'maker', 'Страна сборки': 'country',
    'Заводской № машины (рамы)': 'serialNo', 'Конструкционная масса': 'massDesign', 'Ходовая': 'run',
    'Способ поворота': 'turn', 'Изготовитель модуля': 'maker', 'Модель (индекс) установки': 'model',
    'Заводской номер': 'serialNo', 'Год выпуска модуля': 'year', 'Моточасы модуля': 'hours',
}

# Блок карточки, в котором стоит поле. Блоки — по смыслу, а не по источнику
# (указание пользователя 23.09.2026): откуда берётся значение, говорит метка у
# поля. Всё, что не названо, — сведения о самой машине.
BLOCK = {
    'plate': 'reg', 'vid': 'reg', 'factAddr': 'reg', 'regDate': 'reg',
    'docNo': 'reg', 'mileage': 'use', 'engineHours': 'use', 'hours': 'use', 'state': 'use', 'kit': 'use',
}

TRANSLIT = dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
                    ['a', 'b', 'v', 'g', 'd', 'e', 'e', 'zh', 'z', 'i', 'y', 'k', 'l', 'm', 'n', 'o', 'p', 'r',
                     's', 't', 'u', 'f', 'h', 'c', 'ch', 'sh', 'sch', '', 'y', '', 'e', 'yu', 'ya']))


def slug(label):
    words = re.findall(r'[а-яёa-z0-9]+', label.lower())
    out = ''.join(''.join(TRANSLIT.get(ch, ch) for ch in w).capitalize() for w in words)
    return out[:1].lower() + out[1:]


def cap(s):
    s = s.strip()
    return s[:1].upper() + s[1:]


def options(hint):
    """Варианты списка из пояснения: до первой «;» через запятую, иначе через «;»."""
    head = hint.split(';')[0]
    parts = head.split(',') if ',' in head else hint.split(';')
    return [cap(p.replace('…', '')) for p in parts if p.strip() and 'можно несколько' not in p]


UNITS = {'см³', 'кг', 'км', 'ч', 'м', 'мм', 'т', 'л'}

# Подсказки к «Тип ТС, вид кузова» — как это пишут на бланке (сверено по пяти
# свидетельствам 23.09.2026: «легковой, седан», «легковой универсал», «мото,
# мотоцикл»). Это не список выбора: значение переписывают как есть.
VTYPE_SUGGEST = ['легковой, седан', 'легковой, универсал', 'легковой, хэтчбек', 'легковой, внедорожник',
                 'грузовой, бортовой', 'грузовой, самосвал', 'грузовой, фургон', 'грузовой, тягач седельный',
                 'автобус', 'мото, мотоцикл', 'прицеп', 'полуприцеп', 'специальный']


def field(label, value, hint, source='', place=''):
    """Поле карточки по строке справочника (подпись, значение, пояснение)."""
    f = {'key': KEYS.get(label) or slug(label), 'label': label, 'hint': hint}
    if source:
        f['source'] = source
    if place:
        f['place'] = place
    v = value.strip()
    if label in ('Год выпуска', 'Год выпуска модуля'):
        f['type'] = 'year'
    elif v == 'год':
        f['type'] = 'year'
    elif v == 'дата':
        f['type'] = 'date'
    elif v == 'да / нет':
        f['type'] = 'yes'
    elif v == 'число':
        f['type'] = 'int'
    elif v == 'кВт или л.с.':
        f.update(type='num', units=['кВт', 'л.с.'])
    elif v in UNITS:
        f.update(type='int' if v in ('км', 'ч', 'см³', 'кг') else 'num', units=[v])
    elif v == 'несколько из списка':
        f.update(type='checks', options=options(hint))
    elif v == 'список':
        if label == 'Тип ТС, вид кузова':
            # На бланке это свободная запись («легковой универсал», «мото,
            # мотоцикл»): переписывают как есть, варианты — только подсказка.
            f.update(type='text', suggest=VTYPE_SUGGEST)
        elif label == 'Техническое состояние':
            f.update(type='select', options=['Отличное', 'Хорошее', 'Удовлетворительное', 'Требует ремонта',
                                             'Неудовлетворительное'])
        elif 'лист «Прицепные машины»' in hint:
            f.update(type='select', options=[t[0] for t in B.TOWED])
        else:
            f.update(type='select', options=options(hint))
    else:
        f['type'] = 'text'
    if label in ('Комплектность',):
        f['type'] = 'area'
    return f


def common(rows, skip):
    out = []
    for src, label, value, hint in rows:
        if label in skip:
            continue
        f = field(label, value, hint, source=src, place=B.blank_place(label))
        f['block'] = BLOCK.get(f['key'], 'machine')
        out.append(f)
    return out


def towed_fields(text):
    """Поля прицепной машины: «Ширина захвата, м; рядов; бункер, л»."""
    out = []
    for part in [p.strip() for p in text.split(';') if p.strip()]:
        m = re.match(r'^(.*?)\s*\((.*)\)$', part)
        if m:
            out.append({'key': slug(m.group(1)), 'label': cap(m.group(1)), 'type': 'select',
                        'options': [cap(x) for x in m.group(2).split(',')], 'hint': ''})
            continue
        name, _, unit = part.rpartition(', ')
        if name and unit in UNITS | {'га/ч', 'м³', 'см'}:
            out.append({'key': slug(name), 'label': cap(name), 'type': 'num', 'units': [unit], 'hint': ''})
        else:
            out.append({'key': slug(part), 'label': cap(part), 'type': 'text', 'hint': ''})
    return out


def group(rows, key_group, make):
    out, index = [], {}
    for r in rows:
        g = r[key_group]
        if g not in index:
            index[g] = {'group': g, 'items': []}
            out.append(index[g])
        index[g]['items'].append(make(r))
    return out


def build():
    cats = []
    for b in B.BASES:
        if b[0] not in cats:
            cats.append(b[0])
    special = {}
    for cat, base, label, value, hint in B.BASE_SPECIAL:
        special.setdefault(base, []).append(field(label, value, hint))

    data = {
        'TS_CATEGORIES': cats,
        'TS_BASES': [{'category': b[0], 'name': b[1], 'hint': b[2], 'examples': b[3]} for b in B.BASES],
        'TS_BASE_FIELDS': common(B.BASE_COMMON, {'Категория базы', 'Дополнительные параметры'}),
        'TS_SPECIAL': special,
        'TS_TOWED': [{'name': t[0], 'fields': towed_fields(t[1])} for t in B.TOWED],
        'TS_SELF_GROUPS': group(B.SELF, 0, lambda r: {'name': r[1], 'run': r[2], 'hint': r[3], 'examples': r[4]}),
        'TS_SELF_FIELDS': common(B.SELF_COMMON, {'Дополнительные параметры'}),
        'TS_MODULE_GROUPS': group(B.MODULES, 0, lambda r: {'name': r[1], 'hint': r[2], 'note': r[3]}),
        'TS_MODULE_FIELDS': common(B.MODULE_COMMON, {'Вид модуля', 'Дополнительные параметры'}),
    }

    head = ('// Справочник категоризации ТС для карточки: категории и базы, особые поля баз,\n'
            '// самоходные машины, модули и общие поля с пометкой, откуда их заполняют.\n'
            '//\n'
            '// ФАЙЛ СОБИРАЕТСЯ СКРИПТОМ — руками не править:\n'
            '//     python tools/data/build_ts_catalog.py\n'
            '// Источник — tools/docs/build_kategorii_ts.py, из него же книга\n'
            '// docs/kategorii-ts-baza-modul.xlsx.\n'
            '//\n'
            '// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: справочник, который правят без программиста; здесь он\n'
            '// в коде макета.\n')
    body = '\n'.join('export const %s = %s;\n' % (k, json.dumps(v, ensure_ascii=False, indent=2))
                     for k, v in data.items())
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(head + '\n' + body)
    return {k: (len(v) if not isinstance(v, dict) else sum(len(x) for x in v.values())) for k, v in data.items()}


if __name__ == '__main__':
    for k, v in build().items():
        print('%-18s %s' % (k, v))
