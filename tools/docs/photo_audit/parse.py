"""Разбор пути к папке с фото относительно идеала «адрес → литера → категория».

Для каждой папки из перечня:
  obj_i   — индекс уровня-объекта (папки с адресом) или None
  lits    — литеры, к которым относятся фото
  cats    — категории (по справочнику макета)
  tier    — уровень автоимпорта (A/B/C/D, X-ТС, X-DOC, X-EQP)
  devs    — перечень отклонений (коды из DEV)
"""
from common import *
from classify import roles

# Отклонения: код → (подпись, вес). Вес — насколько отклонение мешает импорту:
# 0 — снимается правилом без потерь; 1 — правилом, но с риском ошибки; 3 — только руками.
DEV = {
    'SVC_ABOVE':   ('Служебные уровни над адресом (заказчик, «Документы», «Осмотрено», группы)', 0),
    'WRAP':        ('Обёртка между адресом и литерой («Фото», «Осмотр», «фото с осмотра»)', 0),
    'DUP_OBJ':     ('Объект повторён ещё одной папкой (адрес, затем название объекта)', 0),
    'LIT_SPELL':   ('Литера записана не как «Литер А» (лит, литера, голая буква, объект, блок)', 0),
    'CAT_SPELL':   ('Категория с опечаткой или своим словом (теретория, внеш вид, общий вид)', 0),
    'MERGED':      ('Литера и этаж/категория слиты в одно имя папки', 0),
    'MARKS':       ('Пометки в имени (+, (+-), «осмотрено», «не полн»)', 0),
    'FLOOR_AS_CAT':('Этаж вместо категории (относится к внутренним помещениям)', 0),
    'INVERTED':    ('Категория выше литеры («Общие виды помещений → Литер А»)', 1),
    'OBJ_IN_LIT':  ('Название объекта или адрес внутри имени литеры', 1),
    'PHOTO_IN_MID':('Фото лежат в промежуточной папке, у которой есть вложенные', 1),
    'ADDR_PLACE':  ('Адрес только до населённого пункта, без улицы и номера', 1),
    'NO_CAT':      ('Нет категории: фото литеры одной кучей', 1),
    'NO_LIT':      ('Нет литеры: фото всего объекта одной кучей', 3),
    'BLD_NO_LIT':  ('Строение без литеры (котельная, туалет, навес, «здание»)', 3),
    'NODOC':       ('Строение помечено «нет на чертежах / нет в техпаспорте»', 3),
    'MULTI_LIT':   ('Несколько литер в одной папке («Литер Ж,З», «Б-В»)', 3),
    'NO_ADDR':     ('Нет адреса: объект назван только по имени', 3),
    'UNREAD':      ('Нераспознанные уровни ниже объекта', 3),
    'DOC_PHOTO':   ('Фото документов среди фото объекта', 0),
    'VEH':         ('Транспорт', 0),
    'EQP':         ('Оборудование, движимое имущество', 0),
    'NESTED_OBJ':  ('Внутри папки объекта — папка другого объекта со своим номером дома', 1),
    'LIT_AMBIG':   ('«Литер А 1»: литера А1 или этаж 1 — не различить', 1),
    'NUMBERED':    ('Папки пронумерованы без смысла («1», «фото 2»)', 1),
}
OBJ_ROLES = {'ADDR', 'OBJ', 'LAND', 'PERS'}
BELOW_ROLES = {'LIT', 'FLOOR', 'CAT', 'BLD', 'DOC', 'NODOC', 'NUM', 'VEH', 'EQP'}
MARK_RX = re.compile(r'\+|\(\s*[+\-=]+\s*\)|осмотрено|не\s*полн')
CANON_LIT = re.compile(r'^литер\s+[а-я]\d{0,2}$')
CANON_CAT = {'территория', 'фасад', 'внутренние помещения', 'кровля', 'конструкции', 'земельный участок', 'прочее',
             'внутр. помещения', 'снаружи', 'внутри', 'подвал'}


def house_nums(seg):
    """Номера домов в имени: без кодов из 4+ цифр (ЕНИ, внутренние номера) и без номеров этажей."""
    s = re.sub(r'\d+\s*[-–]?\s*(?:й|ой|ый)?\s*эт\w*', ' ', norm(seg))
    return {n for n in re.findall(r'\d+', s) if len(n) <= 3}


def parse(x, has_kids):
    segs = x[2:]
    R = []
    for i, s in enumerate(segs):
        r, info = roles(s, i + 2)
        R.append((set(r), info))
    res = dict(obl=x[0], dist=x[1], segs=segs, roles=R, devs=set(), lits=[], cats=[], floor=None,
               obj_i=None, eni=None, addr_q=None, kind='RE')
    n = len(segs)
    # транспорт/оборудование — где угодно в пути
    veh_i = next((i for i, (r, _) in enumerate(R) if 'VEH' in r), None)
    grp_veh = next((i for i, (r, _) in enumerate(R) if 'GRP' in r and re.search(r'тс|ts|tc|авто|транспорт|траспорт|техник|машин', norm(segs[i]))), None)
    eqp_i = next((i for i, (r, _) in enumerate(R) if 'EQP' in r), None)
    # объект — самый глубокий уровень с полным адресом (или ЕНИ) выше первой литеры
    first_lit = next((i for i, (r, _) in enumerate(R) if 'LIT' in r), n)
    full = [i for i in range(min(first_lit + 1, n)) if R[i][0] & OBJ_ROLES and 'GRP' not in R[i][0]
            and (R[i][1].get('addr') == 'full' or R[i][1].get('eni'))
            and not (i == first_lit and not R[i][0] & {'OBJ'} and R[i][1].get('addr') != 'full')]
    # граница для объектов без полного адреса: первый уровень, описывающий часть объекта
    k = n
    for i, (r, info) in enumerate(R):
        if (r & (BELOW_ROLES - {'BLD'}) and not (r & OBJ_ROLES and not r & {'LIT', 'FLOOR', 'CAT'})) or ('BLD' in r and not r & OBJ_ROLES and i > 0 and any(R[j][0] & OBJ_ROLES for j in range(i))):
            k = i; break
        if 'WRAP' in r and not r & OBJ_ROLES and i > 0 and any(R[j][0] & OBJ_ROLES for j in range(i)):
            k = i; break
    if len(full) > 1 and full[-1] == first_lit:
        full = full[:-1]
    if full:
        oi = full[-1]
        while oi - 1 in full and 'ORG' not in R[oi - 1][0]:
            # «адрес → название с тем же адресом»: объект — верхний; но если ниже номер дома,
            # которого нет выше, это другой объект (квартира лицея, школа внутри школы) — остаётся нижний
            if house_nums(segs[oi]) - house_nums(segs[oi - 1]):
                res['devs'].add('NESTED_OBJ'); break
            oi -= 1
        res['addr_q'] = 'full'
        # адрес в имени заказчика, а объект — отдельной папкой ниже: объект — она
        if 'ORG' in R[oi][0]:
            deeper = [j for j in range(oi + 1, k) if R[j][0] & OBJ_ROLES and 'WRAP' not in R[j][0] and 'GRP' not in R[j][0]]
            if deeper:
                oi = deeper[-1]
                if not (R[oi][1].get('addr') == 'full' or R[oi][1].get('eni')):
                    res['addr_q'] = 'place'
    else:
        cand = [i for i in range(k) if R[i][0] & OBJ_ROLES and 'GRP' not in R[i][0]]
        if any('WRAP' not in R[i][0] for i in cand):
            cand = [i for i in cand if 'WRAP' not in R[i][0]]
        place = [i for i in cand if R[i][1].get('addr') == 'place']
        if place:
            oi = place[-1]; res['addr_q'] = 'place'
            if cand[-1] > oi:
                oi = cand[-1]                 # «с. Такое / Школа №5» — объект глубже, адрес выше
        elif cand:
            oi = cand[-1]; res['addr_q'] = 'name'
        else:
            oi = None
    # физлица из «0. Оценка» — адрес уровнем ниже
    res['obj_i'] = oi
    for i, (r, info) in enumerate(R):
        if info.get('eni'):
            res['eni'] = info['eni']
    if veh_i is not None or (grp_veh is not None and eqp_i is None):
        res['kind'] = 'VEH'; res['devs'].add('VEH'); res['tier'] = 'X-ТС'
        return res
    if eqp_i is not None:
        res['kind'] = 'EQP'; res['devs'].add('EQP'); res['tier'] = 'X-EQP'
        return res
    # над объектом
    top = oi if oi is not None else k
    if any(R[i][0] & {'ORG', 'GRP', 'NUM', 'UNK', 'ORGNAME', 'WRAP'} for i in range(top)) or top > 0:
        res['devs'].add('SVC_ABOVE')
    if oi is None:
        res['devs'].add('NO_ADDR')
    elif res['addr_q'] == 'place':
        res['devs'].add('ADDR_PLACE')
    elif res['addr_q'] == 'name':
        res['devs'].add('NO_ADDR')
    # под объектом
    start = oi if oi is not None else k
    below = list(range(start, n))
    lit_seen = False; cat_before_lit = False
    for i in below:
        r, info = R[i]
        s = norm(segs[i])
        if MARK_RX.search(segs[i]):
            res['devs'].add('MARKS')
        if i == oi:
            if 'LIT' in r and info.get('lits'):
                res['lits'].extend(L for L in info['lits'] if L not in res['lits'])
                res['devs'].add('OBJ_IN_LIT'); lit_seen = True
            if 'CAT' in r:
                res['cats'].extend(c for c in info['cat'] if c not in res['cats'])
            if 'FLOOR' in r:
                res['floor'] = info.get('floor'); res['devs'].add('FLOOR_AS_CAT')
            continue
        if 'LIT' in r:
            if info.get('lits'):
                for L in info['lits']:
                    if L not in res['lits']:
                        res['lits'].append(L)
            lit_seen = True
            if not CANON_LIT.match(re.sub(r'\s*\+$', '', s)):
                res['devs'].add('LIT_SPELL')
            if r & {'FLOOR', 'CAT'}:
                res['devs'].add('MERGED')
            if r & {'OBJ', 'ADDR', 'BLD'}:
                res['devs'].add('OBJ_IN_LIT')
            if cat_before_lit:
                res['devs'].add('INVERTED')
        if 'CAT' in r:
            for c in info['cat']:
                if c not in res['cats']:
                    res['cats'].append(c)
            if not lit_seen and any('LIT' in R[j][0] for j in below if j > i):
                cat_before_lit = True
            core = re.sub(r'^(?:фото\s*)', '', re.sub(r'\s*\+$', '', s))
            if core not in CANON_CAT and 'LIT' not in r:
                res['devs'].add('CAT_SPELL')
        if 'FLOOR' in r:
            res['floor'] = info.get('floor')
            res['devs'].add('FLOOR_AS_CAT')
            if not lit_seen and any('LIT' in R[j][0] for j in below if j > i):
                cat_before_lit = True
        if 'WRAP' in r and not r & (BELOW_ROLES | OBJ_ROLES):
            res['devs'].add('WRAP')
        elif 'WRAP' in r:
            res['devs'].add('WRAP')
        if r & OBJ_ROLES and not r & {'LIT', 'CAT', 'FLOOR', 'BLD'} and oi is not None:
            res['devs'].add('DUP_OBJ')
        # «Здание», «Общий вид здания» — основное здание целиком, а не отдельное строение без литеры
        if 'BLD' in r and 'LIT' not in r and 'WRAP' not in r and not r & OBJ_ROLES                 and not re.match(r'^здани[еяй]', info.get('bld', '')):
            res['bld'] = segs[i]
        if 'NODOC' in r:
            res['devs'].add('NODOC')
        if 'DOC' in r and not r & {'LIT', 'CAT', 'FLOOR', 'BLD'}:
            res['doc'] = True
            # «Подтв. док / Литер А», «Поэтажные чертежи / Литера В» — снимки документов, разложенные по литерам;
            # «По старому техпаспорту / Литер А» — фото, разложенные по литерам старого техпаспорта
            if i != oi and not r & OBJ_ROLES and not re.search(r'по\s+(?:нов|стар)\w*\s+тех', s):
                res['doc_strict'] = True
        if 'LIT' in r and re.search(r'(?:(?:литт?ер(?:ий|[аы])?|лит\.?)\s+|^)[а-я]\s+\d{1,2}\s*$', s):
            res['devs'].add('LIT_AMBIG')
        if 'NUM' in r:
            res['devs'].add('NUMBERED')
        if r == {'WRAP', 'UNK'}:
            res['devs'].add('DUP_OBJ')        # «Фото здании судэксперт» — обёртка с названием объекта
        elif r <= {'UNK', 'ORG', 'ORGNAME'} and ('UNK' in r or 'ORGNAME' in r):
            res['devs'].add('UNREAD')
    if cat_before_lit:
        res['devs'].add('INVERTED')
    if has_kids:
        res['devs'].add('PHOTO_IN_MID')
    # что именно лежит в этой папке
    last_r = R[-1][0] if R else set()
    if res.get('doc_strict') or (res.get('doc') and not res['lits'] and not res['cats']):
        res['kind'] = 'DOC'; res['devs'].add('DOC_PHOTO'); res['tier'] = 'X-DOC'
        return res
    land_obj = oi is not None and 'LAND' in R[oi][0] and not res['lits']
    if len(res['lits']) > 1:
        res['devs'].add('MULTI_LIT')
    if not res['lits']:
        if 'NODOC' in res['devs']:
            pass
        elif res['cats'] == ['Земельный участок'] or (land_obj and not res['cats'] and not res.get('bld')):
            pass
        elif res.get('bld'):
            res['devs'].add('BLD_NO_LIT')                              # участок — сам по себе ОИ, литера не нужна
        else:
            res['devs'].add('NO_LIT')
    elif not res['cats'] and not res['floor']:
        res['devs'].add('NO_CAT')
    # уровень импорта
    addr_ok = oi is not None and res['addr_q'] in ('full', 'place')
    one_lit = len(res['lits']) == 1
    land_ok = (not res['lits']) and (res['cats'] == ['Земельный участок'] or (land_obj and not res['cats'] and not res.get('bld'))) and 'NODOC' not in res['devs']
    org_i = [i for i in range(len(R)) if 'ORG' in R[i][0] and (oi is None or i <= oi)]
    res['org'] = segs[org_i[-1]] if org_i else None
    if not addr_ok:
        # адреса нет, но есть код заказчика и понятная раскладка ниже: объект = заказчик
        tier = 'D-ЗАК' if org_i and (one_lit or land_ok or res['cats'] or res['floor']) else 'D'
    elif (one_lit and (res['cats'] or res['floor'])) or land_ok:
        tier = 'A'
    elif one_lit:
        tier = 'B'
    else:
        tier = 'C'                            # в том числе объект найден, а ниже — непонятные имена
    if tier in 'AB' and res['addr_q'] == 'place':
        tier = tier + '*'
    res['tier'] = tier
    return res


TIER = {
    'A':  'Авто полностью: адрес, одна литера, категория (или участок)',
    'A*': 'Авто полностью, но адрес только до населённого пункта',
    'B':  'Авто до литеры, категория «Прочее»',
    'B*': 'Авто до литеры, адрес только до населённого пункта',
    'C':  'Авто до объекта, литеру выбирать руками',
    'D-ЗАК': 'Адреса нет, объект — сам заказчик: авто, если у заказчика один объект',
    'D':  'Руками: нет адреса или путь не распознан',
    'X-ТС': 'Транспорт — отдельный маршрут импорта',
    'X-EQP': 'Оборудование — отдельный маршрут импорта',
    'X-DOC': 'Фото документов — в документы, не в фото',
}


# Почему папку не разложить автоматически (одна главная причина на папку) и что проверить у авторазбора.
MANUAL = [
    ('D-ADDR', 'Объект не определяется: нет адреса', 'Найти объект по названию и заказчику, разложить руками.'),
    ('D-ЗАК', 'Адреса нет, объект — сам заказчик', 'Если у заказчика в базе один объект — фото уходят в него автоматически.'),
    ('C-MULTI', 'Несколько литер в одной папке («Литер Ж,З», «БВГД»)', 'Разнести снимки по литерам.'),
    ('C-NODOC', 'Строения нет на чертежах или в техпаспорте', 'Завести литеру или решить, куда относить снимки.'),
    ('C-BLD', 'Строение без литеры (котельная, туалет, навес, склад)', 'Выбрать литеру строения.'),
    ('C-FLOOR', 'Этаж без литеры («Фото / 2 этаж»)', 'Выбрать литеру; если литера у объекта одна — автоматически.'),
    ('C-CAT', 'Категория без литеры («Общий вид здания», «Снаружи»)', 'Выбрать литеру; если литера у объекта одна — автоматически.'),
    ('C-UNREAD', 'Объект найден, ниже — непонятные имена папок', 'Посмотреть снимки, выбрать литеру; пополнить словари.'),
    ('C-HEAP', 'Фото всего объекта одной кучей', 'Выбрать литеру по снимкам; если литера у объекта одна — автоматически.'),
]
CHECK = [
    ('PLACE', 'Адрес только до населённого пункта', 'Сверить найденный объект: сопоставление по селу и названию.'),
    ('NESTED', 'Внутри объекта — папка другого объекта со своим номером дома', 'Сверить, к какой карточке ОЦ относится.'),
    ('AMBIG', '«Литер А 1»: литера А1 или этаж 1', 'Если у объекта нет литеры А1 — это этаж литеры А.'),
]


def manual_reason(p):
    """Код главной причины ручного разбора или None для авторазбора и отдельных маршрутов."""
    t, d = p['tier'], p['devs']
    if t == 'D':
        return 'D-ADDR'
    if t == 'D-ЗАК':
        return 'D-ЗАК'
    if t != 'C':
        return None
    if 'MULTI_LIT' in d:
        return 'C-MULTI'
    if 'NODOC' in d:
        return 'C-NODOC'
    if 'BLD_NO_LIT' in d:
        return 'C-BLD'
    if 'UNREAD' in d:
        return 'C-UNREAD'
    if p['floor']:
        return 'C-FLOOR'
    if p['cats']:
        return 'C-CAT'
    return 'C-HEAP'


def check_reasons(p):
    """Что сверить у папки, которая разбирается автоматически."""
    if p['tier'] not in ('A', 'A*', 'B', 'B*'):
        return []
    out = []
    if p['tier'].endswith('*'):
        out.append('PLACE')
    if 'NESTED_OBJ' in p['devs']:
        out.append('NESTED')
    if 'LIT_AMBIG' in p['devs']:
        out.append('AMBIG')
    return out


def object_key(p):
    """Объект, к которому относится папка: путь до папки объекта (или до родителя, если объект не найден)."""
    end = p['obj_i'] + 1 if p['obj_i'] is not None else max(len(p['segs']) - 1, 1)
    return (p['obl'], p['dist']) + tuple(p['segs'][:end])


def parse_all():
    parts = load()
    kids = set()
    for x in parts:
        for i in range(1, len(x)):
            kids.add(tuple(x[:i]))
    P = [parse(x, tuple(x) in kids) for x in parts]
    # заказчик, у которого больше половины папок — оборудование, — это инвентарная опись целиком
    # (Бишкекская ТЭЦ: «Лаб мет», «ОКИТ», «Автоучасток» — тоже оборудование); транспорт остаётся транспортом
    by_top = C.defaultdict(list)
    for q in P:
        by_top[(q['obl'], q['dist'], q['segs'][0] if q['segs'] else '')].append(q)
    for xs in by_top.values():
        if sum(q['tier'] == 'X-EQP' for q in xs) > len(xs) / 2:
            for q in xs:
                if q['tier'] not in ('X-EQP', 'X-ТС'):
                    q['tier'], q['kind'] = 'X-EQP', 'EQP'
                    q['devs'] = {'EQP'}
    return P
