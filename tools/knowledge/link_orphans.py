# -*- coding: utf-8 -*-
"""Связать записи без связей с ближайшими по смыслу.

Решение пользователя 29.09.2026 («Связать автоматически»): у записи без
единой связи (ни своей, ни на неё) ставится связь «относится к» на самую
похожую запись по индексу поиска по смыслу (.graf/semantic.json, выгрузка
tools/knowledge/semantic_export.py), если сходство не ниже MIN_SIM. Ниже —
запись остаётся одиночкой: слабое сходство дало бы ложную связь.

В пункты записи ничего не пишется: связь видна в LINKS, а повод — в
описании коммита (журнал графа — история коммитов).

    python tools/knowledge/link_orphans.py          # показать, что будет
    python tools/knowledge/link_orphans.py apply    # записать
"""
import json
import re
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import graph  # noqa: E402

MIN_SIM = 0.84
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main(apply):
    sys.stdout.reconfigure(encoding='utf-8')
    recs = graph.load_all()
    by = {r['id']: (f, r) for f, _, r in recs}
    linked = set()
    for _, _, r in recs:
        for l in r.get('связи') or []:
            if l.get('куда') in by:
                linked.add(r['id'])
                linked.add(l['куда'])
    near = json.load(open(os.path.join(ROOT, '.graf', 'semantic.json'), encoding='utf-8'))['neighbors']
    made = skipped = 0
    made_struct = [0]
    # Поля — по устройству, а не по смыслу: у записей полей один шаблон, и
    # близость их текстов — это шаблон («Балансовая стоимость» ↔ «Квартира»
    # 0,92). Поле связывается «часть» с понятием-блоком карточки, где оно
    # стоит (встречается → блок, без номера), — это правда из снимка макета.
    blocks = {str(r.get('термин', '')).strip().lower(): r['id'] for f, _, r in recs
              if f == 'concepts' and r.get('вид_понятия') == 'блок карточки'}
    for f, _, r in recs:
        if f != 'fields':
            continue
        names = {re.sub(r'^\d+\s*', '', str(w.get('блок', ''))).strip().lower() for w in r.get('встречается') or []}
        targets = sorted({blocks[n] for n in names if n in blocks})
        have = {l.get('куда') for l in r.get('связи') or []}
        new = [t for t in targets if t not in have]
        if not new:
            continue
        print('%-10s %-55s → %s' % (f, r['id'][:55], ', '.join(new)))
        if apply:
            r['связи'] = (r.get('связи') or []) + [{'тип': 'часть', 'куда': t, 'папка': 'concepts'} for t in new]
            graph.save(f, r)
        linked.add(r['id'])
        linked.update(new)
        made_struct[0] += 1

    # Понятия — тоже по устройству: блок — часть карточки своего объекта
    # («встречается» → экран «карточка «Квартира»» → понятие «Квартира»;
    # «Объект оценки» — основное понятие); тип ОЦ и вид ОИ относятся к
    # основным понятиям «Объект оценки» и «Объект имущества».
    by_term = {str(r.get('термин', '')).strip(): r['id'] for f, _, r in recs if f == 'concepts'}
    base = {'тип объекта оценки': by_term.get('Объект оценки'), 'вид объекта имущества': by_term.get('Объект имущества')}
    for f, _, r in recs:
        if f != 'concepts':
            continue
        kind = r.get('вид_понятия')
        if kind == 'блок карточки':
            objs = {re.sub(r'^карточка «(.+)»$', r'\1', str(w.get('экран', ''))) for w in r.get('встречается') or []}
            targets, ltype = sorted({by_term[o] for o in objs if o in by_term}), 'часть'
        elif kind in base and base[kind]:
            targets, ltype = [base[kind]], 'относится к'
        else:
            continue
        have = {l.get('куда') for l in r.get('связи') or []}
        new = [t for t in targets if t not in have and t != r['id']]
        if not new:
            continue
        print('%-10s %-55s → %s' % (f, r['id'][:55], ', '.join(new)))
        if apply:
            r['связи'] = (r.get('связи') or []) + [{'тип': ltype, 'куда': t, 'папка': 'concepts'} for t in new]
            graph.save(f, r)
        linked.add(r['id'])
        linked.update(new)
        made_struct[0] += 1

    for f, _, r in recs:
        rid = r['id']
        # Поля и понятия по смыслу не связываются — шаблон записи.
        if rid in linked or r.get('статус') == 'отменено' or f in ('fields', 'concepts'):
            continue
        best = next(((n, s) for n, s in near.get(rid, []) if n in by and n != rid and by[n][1].get('статус') != 'отменено'), None)
        if not best or best[1] < MIN_SIM:
            skipped += 1
            continue
        n, sim = best
        print('%-10s %-55s → %-55s %.2f' % (f, rid[:55], n[:55], sim))
        if apply:
            r['связи'] = (r.get('связи') or []) + [{'тип': 'относится к', 'куда': n, 'папка': by[n][0]}]
            graph.save(f, r)
        # Пара одиночек не связывается дважды (A → B и B → A).
        linked.add(rid)
        linked.add(n)
        made += 1
    print('полей и понятий связано по устройству: %d' % made_struct[0])
    print('связано по смыслу: %d, осталось одиночками (сходство ниже %.2f или нет соседей): %d%s'
          % (made, MIN_SIM, skipped, '' if apply else ' — показ, apply — записать'))


if __name__ == '__main__':
    main(len(sys.argv) > 1 and sys.argv[1] == 'apply')
