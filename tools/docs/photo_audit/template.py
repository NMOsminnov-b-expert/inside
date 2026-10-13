"""Шаблон пути: цепочка ролей уровней, по которой строится правило импорта."""
from parse import *


def tok(r, info, is_obj, addr_q):
    if is_obj:
        base = {'full': 'АДРЕС', 'place': 'НАС.ПУНКТ', 'name': 'НАЗВАНИЕ'}.get(addr_q, 'НАЗВАНИЕ')
        if 'LIT' in r:
            base += '+литер'
        return base
    if 'VEH' in r: return 'ТС'
    if 'EQP' in r: return 'ОБОРУД'
    if 'LIT' in r:
        t = 'литер'
        if 'FLOOR' in r: t += '+этаж'
        elif 'CAT' in r: t += '+категория'
        return t
    if 'NODOC' in r: return 'нет-в-техпаспорте'
    if 'FLOOR' in r: return 'этаж'
    if 'CAT' in r: return 'категория'
    if 'DOC' in r: return 'документ'
    if 'BLD' in r and not r & {'ADDR', 'OBJ'}: return 'строение'
    if r & {'ADDR', 'OBJ', 'LAND', 'PERS'}: return 'объект-повтор'
    if 'WRAP' in r: return 'фото'
    if 'ORG' in r: return 'заказчик'
    if 'GRP' in r: return 'группа'
    if 'NUM' in r: return 'номер'
    return '?'


def template(p, above=True):
    toks = []
    for i, (r, info) in enumerate(p['roles']):
        is_obj = i == p['obj_i']
        if p['obj_i'] is not None and i < p['obj_i'] and not above:
            continue
        t = tok(r, info, is_obj, p['addr_q'])
        if p['obj_i'] is not None and i < p['obj_i']:
            t = {'заказчик': 'заказчик', 'группа': 'группа'}.get(t, 'группа')
        if toks and toks[-1] == t and t in ('группа', 'фото', 'объект-повтор'):
            continue
        toks.append(t)
    return ' / '.join(toks)


if __name__ == '__main__':
    import sys
    P = parse_all()
    RE = [p for p in P if p['tier'] not in ('X-ТС', 'X-EQP')]
    tot = C.Counter(template(p, above=False) for p in RE)
    print(len(tot), 'шаблонов ниже объекта')
    for k, v in tot.most_common(40): print(v, k)
    print()
    for obl in sorted({p['obl'] for p in RE}):
        xs = [p for p in RE if p['obl'] == obl]
        c = C.Counter(template(p, above=False) for p in xs)
        print('===', obl, len(xs), 'шаблонов', len(c))
        for k, v in c.most_common(8): print(f'   {v/len(xs):5.1%} {v:5} {k}')
        c2 = C.Counter(' / '.join(template(p).split(' / ')[:template(p).split(' / ').index(next(t for t in template(p).split(' / ') if t not in ('заказчик','группа')))]) if any(t not in ('заказчик','группа') for t in template(p).split(' / ')) else template(p) for p in xs)
        print('   над объектом:', [(k or '—', f'{v/len(xs):.0%}') for k, v in c2.most_common(4)])
