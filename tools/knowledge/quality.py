# -*- coding: utf-8 -*-
"""Качество графа знаний: замечания, числа, подсказки связей.

Задача пользователя 28.09.2026 «поищи, что можно использовать для улучшения
графа» → «Берём все». Практики и источники — запись графа
kak-uluchshat-graf-znaniy-atomarnost-slovar-svyazey-proverki-podskazki.

Замечания (warnings) — по образцу проверки формы SHACL: для каждого вида
записи — что в ней должно быть. В отличие от ошибок graph.py check они не
валят проверку: это работа на наполнение (пустые определения, записи без
связей), а не поломка.

Подсказки связей — локально, без внешних сервисов:
  * общие соседи — индекс Адамик — Адар: редкий общий сосед весит больше
    (у оглавления 40 соседей — через него пары почти ничего не значат);
  * сходство текста — TF-IDF по основам слов (первые 6 букв) и косинус.
Связь ставит человек: подсказка — кандидат, не решение.
"""
import collections
import math
import os
import re

# Связь «часть» и её прежние написания — для поиска циклов иерархии.
PART = {'часть', 'part_of', 'часть от', 'входит в'}
CONTAINS = {'содержит', 'contains', 'включает'}
REPLACES = {'заменяет', 'supersedes', 'заменило', 'отменяет'}
# Записи, у которых связь обязательна: решение и правило ни на что не
# опирающиеся и ни на что не влияющие — одиночки, их не найти от раздела.
NEED_LINKS = {'decisions', 'rules', 'practices', 'tasks'}
ACTIVE = {'действует', 'актуально', 'открыт'}
CLOSED = {'отменено'}


def text_of(r):
    return ' '.join([str(r.get('заголовок') or r.get('термин') or ''), str(r.get('определение') or '')]
                    + [str(p) for p in r.get('пункты') or []])


# Связи оглавления — навигация, а не смысл: в подсказках не в счёт.
NAV = {'раздел', 'якорь'}


def graph_of(recs, skip=()):
    """recs: [(folder, path, rec)] → ({id: (folder, rec)}, {id: set(соседи)});
    skip — виды связей, которые не считаются."""
    by = {r['id']: (f, r) for f, _p, r in recs if r.get('id')}
    adj = collections.defaultdict(set)
    for rid, (_f, r) in by.items():
        for l in r.get('связи') or []:
            t = l.get('куда')
            if t in by and t != rid and l.get('тип') not in skip:
                adj[rid].add(t)
                adj[t].add(rid)
    return by, adj


def warnings(recs, vocab=None, root=None):
    """[(вид замечания, id, текст)]."""
    by, adj = graph_of(recs)
    out = []
    for rid, (f, r) in by.items():
        if f in ('fields', 'concepts') and not str(r.get('определение') or '').strip():
            out.append(('пустое определение', rid, 'у %s «%s» нет определения' % (r.get('вид'), r.get('термин'))))
        if f in NEED_LINKS and not adj[rid] and r.get('статус') in ACTIVE:
            out.append(('без связей', rid, '%s без единой связи' % r.get('вид')))
        if vocab:
            for l in r.get('связи') or []:
                t = l.get('тип', '')
                if t not in vocab and not t.startswith('якорь'):
                    out.append(('вид связи не из словаря', rid, '«%s» → %s' % (t, l.get('куда'))))
        if r.get('статус') in ACTIVE and f in ('rules', 'code', 'tools'):
            for l in r.get('связи') or []:
                t = by.get(l.get('куда'))
                if t and t[1].get('статус') in CLOSED:
                    out.append(('ссылка на снятое', rid, '«%s» → %s (статус «отменено»)' % (l.get('тип'), l['куда'])))
    # Запись о коде, которого больше нет: заголовок — путь в репозитории.
    if root:
        for rid, (f, r) in by.items():
            t = str(r.get('заголовок') or r.get('термин') or '').strip()
            if f in ('code', 'tools', 'terms') and r.get('статус') in ACTIVE and '/' in t and ' ' not in t                     and '*' not in t and not os.path.exists(os.path.join(root, t)):
                out.append(('кода нет', rid, 'файла %s нет в репозитории — снять статусом «отменено»' % t))
    # Замена по образцу ADR: заменённое не переписывают, а снимают — статус
    # «отменено»; связь «заменяет» ставит новая запись.
    for rid, (f, r) in by.items():
        for l in r.get('связи') or []:
            t = by.get(l.get('куда'))
            if l.get('тип') in REPLACES and t and t[1].get('статус') not in CLOSED:
                out.append(('заменено, но действует', l['куда'], 'его заменяет %s, а статус «%s»' % (rid, t[1].get('статус'))))
    # Двойная связь: «A часть B» и «B содержит A» — одно и то же дважды.
    pairs = set()
    for rid, (f, r) in by.items():
        for l in r.get('связи') or []:
            if l.get('тип') in PART:
                pairs.add((rid, l.get('куда')))
    for rid, (f, r) in by.items():
        for l in r.get('связи') or []:
            if l.get('тип') in CONTAINS and (l.get('куда'), rid) in pairs:
                out.append(('двойная связь', rid, 'содержит %s, а та уже «часть» этой' % l['куда']))
    # Цикл по «часть»: иерархия не может замыкаться.
    up = collections.defaultdict(set)
    for rid, (f, r) in by.items():
        for l in r.get('связи') or []:
            if l.get('тип') in PART and l.get('куда') in by:
                up[rid].add(l['куда'])
            if l.get('тип') in CONTAINS and l.get('куда') in by:
                up[l['куда']].add(rid)
    state = {}
    def walk(v, path):
        state[v] = 1
        for w in up[v]:
            if state.get(w) == 1:
                out.append(('цикл иерархии', v, ' → '.join(path[path.index(w):] + [w]) if w in path else w))
            elif not state.get(w):
                walk(w, path + [w])
        state[v] = 2
    for v in list(up):
        if not state.get(v):
            walk(v, [v])
    return out


def numbers(recs):
    """Числа качества: связность, одиночки, центры, наполнение."""
    by, adj = graph_of(recs)
    seen, comps = set(), []
    for v in by:
        if v in seen:
            continue
        st, c = [v], 0
        seen.add(v)
        while st:
            x = st.pop()
            c += 1
            for y in adj[x]:
                if y not in seen:
                    seen.add(y)
                    st.append(y)
        comps.append(c)
    comps.sort(reverse=True)
    lonely = collections.Counter(by[v][0] for v in by if not adj[v])
    hubs = sorted(((len(adj[v]), v) for v in by), reverse=True)[:8]
    kinds = collections.Counter(l.get('тип') for _f, r in by.values() for l in r.get('связи') or []
                                if not str(l.get('тип', '')).startswith('якорь'))
    big = sorted(((len(r.get('пункты') or []), v) for v, (_f, r) in by.items() if len(r.get('пункты') or []) >= 10), reverse=True)
    terms = collections.Counter(str(r.get('термин')).lower() for _f, r in by.values() if r.get('термин'))
    return {
        'записей': len(by),
        'связей': sum(len(r.get('связи') or []) for _f, r in by.values()),
        'частей связности': len(comps),
        'самая большая часть': comps[0] if comps else 0,
        'записей без связей': sum(lonely.values()),
        'без связей по папкам': dict(lonely.most_common()),
        'центры (число соседей)': hubs,
        'видов связей': len(kinds),
        'записей с 10+ пунктами': len(big),
        'повтор термина': sum(1 for v in terms.values() if v > 1),
    }


def _vectors(by):
    # Служебный пункт, повторённый дословно во многих записях («запись создана
    # при сверке переноса…»), делает их «похожими» — такие пункты не в счёт.
    # Запись короче шести разных основ сравнивать не с чем.
    same = collections.Counter(str(p) for _f, r in by.values() for p in r.get('пункты') or [])
    def body(r):
        return ' '.join([str(r.get('заголовок') or r.get('термин') or ''), str(r.get('определение') or '')]
                        + [str(p) for p in r.get('пункты') or [] if same[str(p)] < 3])
    docs = {k: collections.Counter(w[:6] for w in re.findall(r'[а-яёa-z0-9]{3,}', body(r).lower()))
            for k, (_f, r) in by.items()}
    docs = {k: d for k, d in docs.items() if len(d) >= 6}
    df = collections.Counter(w for d in docs.values() for w in d)
    n = len(docs) or 1
    vec = {}
    for k, d in docs.items():
        v = {w: (1 + math.log(c)) * math.log(n / df[w]) for w, c in d.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1
        vec[k] = {w: x / norm for w, x in v.items() if x > 0}
    return vec


def suggest(recs, only=None, top=5, min_text=0.3, min_aa=1.0):
    """Кандидаты связей: [(id, id, по соседям, по тексту)] без уже связанных.
    only — id записи: кандидаты только для неё."""
    if only:
        # Для одной записи — лучшие кандидаты, пороги общего списка ниже.
        min_text, min_aa = 0.12, 0.3
    by, adj = graph_of(recs, NAV)
    # Снятые записи — история, в связи их не предлагаем; оглавление и карты
    # разделов (папка project) связываются через оглавление, не подсказками.
    live = {k for k, (f, r) in by.items() if r.get('статус') not in CLOSED and f != 'project'}
    # Вид связи между парой (в любую сторону): у «братьев» — модулей, что оба
    # «зависят от» ядра, — общий сосед достигается одним видом связи с обеих
    # сторон. Это сходство устройства, а не повод связывать (модули ОЦ
    # изолированы намеренно), поэтому такой сосед не в счёт.
    kind = {}
    for k, (_f, r) in by.items():
        for l in r.get('связи') or []:
            kind[(k, l.get('куда'))] = kind[(l.get('куда'), k)] = l.get('тип')
    aa = collections.Counter()
    for z in by:
        nb = sorted(adj[z] & live)
        if len(nb) < 2:
            continue
        w = 1 / math.log(len(adj[z]))
        for i in range(len(nb)):
            for j in range(i + 1, len(nb)):
                a, b = nb[i], nb[j]
                if b in adj[a] or (only is not None and only not in (a, b)):
                    continue
                if kind.get((a, z)) == kind.get((b, z)):
                    continue
                aa[(a, b)] += w
    vec = _vectors(by)
    inv = collections.defaultdict(list)
    for k, v in vec.items():
        for w, x in v.items():
            inv[w].append((k, x))
    sim = collections.Counter()
    for k in ([only] if only else vec):
        acc = collections.Counter()
        for w, x in vec.get(k, {}).items():
            for k2, x2 in inv[w]:
                if k2 != k:
                    acc[k2] += x * x2
        for k2, s in acc.items():
            if s >= min_text and k2 not in adj[k] and k in live and k2 in live:
                sim[tuple(sorted((k, k2)))] = s
    keys = set(p for p, v in aa.items() if v >= min_aa) | set(sim)
    rows = [(a, b, aa.get((a, b), 0.0), sim.get((a, b), 0.0)) for a, b in keys]
    # Порядок: сначала то, на что указывают оба признака.
    rows.sort(key=lambda x: -(min(x[2] / 3, 1) + x[3]))
    if only:
        return rows[:top]
    return rows
