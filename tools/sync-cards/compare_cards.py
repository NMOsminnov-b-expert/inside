# -*- coding: utf-8 -*-
"""Сравнение одноимённых карточек ОИ между типами объекта оценки.

Зачем. Пять модулей ОЦ изолированы друг от друга, и карточку одного и того же
вида имущества каждый несёт свою. Литера в квартирном ОЦ и литера в гражданском
здании должны описываться одинаково — но правки вносились в разное время и в
разные модули, поэтому наборы полей разъехались. Ищем именно это: чего нет там,
где должно быть.

Что с чем сравнивается (по фактическим импортам в oi/<карточка>/index.js):

    участок  — одна общая карточка из land-plot на все пять модулей, сравнивать
               нечего по определению;
    квартира — своя в apartment и residential-house, остальные берут из
               apartment;
    литера   — своя во ВСЕХ пяти модулях, главный источник расхождений;
    движимое — своё в civil и production.

Как собирается состав карточки. Разбором кода отрисовки, а не рендером в
браузере: состав полей зависит от условий (тип участка, категория ОИ, признак
производственного строения), и в браузере видна только одна ветка из нескольких.
Разбор берёт ВСЁ, что карточка вообще может показать, — для сравнения это и
нужно.

Карточка собирается вместе со своими частями: view.js тянет floors.view.js,
heating.js, parts/struct/ms.js и прочее, и эти файлы у каждого модуля СВОИ —
именно там и прячется половина расхождений. Обход рекурсивный, по относительным
импортам внутри модуля; выход за пределы модуля (kernel, другой модуль) не
считается своим — это общий код, одинаковый по определению.

Запуск:

    python tools/sync-cards/compare_cards.py            — отчёт по всем карточкам
    python tools/sync-cards/compare_cards.py литера     — только по одной
    python tools/sync-cards/compare_cards.py --md        — в формате Markdown
"""
import io
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODULES = ['apartment', 'residential-house', 'civil', 'production', 'land-plot']

# Короткие имена модулей для таблицы: полные не влезают в строку терминала.
SHORT = {
    'apartment': 'кварт',
    'residential-house': 'жил.дом',
    'civil': 'гражд',
    'production': 'произв',
    'land-plot': 'участок',
}

CARDS = {
    'квартира': 'apartment',
    'литера': 'building',
    'движимое': 'movable',
    'участок': 'land',
}


# --- сбор файлов карточки ---------------------------------------------------
def own_card(mod, card):
    """Своя ли это карточка у модуля (а не импорт из чужого)."""
    idx = os.path.join(ROOT, 'app', 'modules', mod, 'oi', card, 'index.js')
    if not os.path.exists(idx):
        return False
    src = io.open(idx, encoding='utf-8').read()
    m = re.search(r"from '([^']*view\.js)'", src)
    return bool(m) and m.group(1).startswith('./')


def module_files(mod, card):
    """view.js карточки и все её части внутри того же модуля, рекурсивно."""
    start = os.path.join(ROOT, 'app', 'modules', mod, 'oi', card, 'view.js')
    if not os.path.exists(start):
        return []

    limit = os.path.join(ROOT, 'app', 'modules', mod)
    seen = []
    queue = [start]

    while queue:
        path = queue.pop(0)
        if path in seen or not os.path.exists(path):
            continue
        seen.append(path)

        src = io.open(path, encoding='utf-8').read()
        for rel in re.findall(r"from '(\.[^']+)'", src):
            nxt = os.path.normpath(os.path.join(os.path.dirname(path), rel))
            # Только внутри своего модуля: kernel и чужие модули общие для всех,
            # и расхождением быть не могут.
            if nxt.startswith(limit) and nxt.endswith('.js'):
                queue.append(nxt)

    return seen


# --- разбор состава --------------------------------------------------------
#
# У поля два признака, и сравниваются они отдельно:
#   ключ    — data-атрибут в разметке или ключ конструктива. Отвечает на вопрос
#             «есть ли такое поле вообще»;
#   подпись — то, что читает человек. Отвечает на вопрос «одинаково ли оно
#             называется».
# Одного признака мало: одно и то же поле в двух модулях называлось «Общая по
# ПУД, м²» и «Общая по правоустанавливающим документам, м²» — по подписям это
# выглядит как два разных отсутствующих поля, хотя поле одно.

# Блок поля целиком: подпись и следующий за ней ввод с data-атрибутом.
FIELD_BLOCK = re.compile(
    r'<label[^>]*>(.*?)</label>(.*?)(?=<label|</div>\s*</div>|$)', re.S)
# Ключ поля — атрибут вместе со значением, если значение постоянное:
# data-area="pud" и data-area="tp" — РАЗНЫЕ поля (площадь по ПУД и по
# техпаспорту), без значения они склеивались в одно.
DATA_ATTR = re.compile(r'\bdata-([a-z0-9-]+)(?:="([^"${]*)")?')

# Приставки, которые говорят про модуль, а не про поле: одно и то же право на
# строение записано как data-bld-rights в одном модуле и data-rights в другом.
MODULE_PREFIX = re.compile(r'^(bld|apt|mov|head|oi)-')


def norm_key(attr, value=''):
    key = MODULE_PREFIX.sub('', attr)
    return '%s=%s' % (key, value) if value else key

# Помощники разметки. У каждого своя позиция подписи, поэтому разбираются
# по отдельности, а не одной регуляркой на всех.
HELPER_LABEL_FIRST = re.compile(
    r"(?:selectField|multiField|numField|textField)\(\s*'([^']+)'\s*,\s*'([^']+)'")
HELPER_STRUCT = re.compile(
    r"(?:structField|structMS)\(\s*oi\s*,\s*'([^']+)'\s*,\s*'([^']+)'")

SEC_HEAD = re.compile(r'<div class="sec-h[^"]*"[^>]*>([^<${]+?)(?:</div>|\$\{)')
CARD_HEAD = re.compile(r'<h3>([^<${]+?)</h3>')

# Технические подписи, не относящиеся к составу данных.
SKIP_LABELS = {'', '—', '·'}

# data-атрибуты, которые не являются полями: кнопки, переключатели, разметка.
SKIP_KEYS = re.compile(
    r'^(del|add|open|toggle|acc|card|tab|sort|filter|drag|drop|dd|pick|modal|'
    r'menu|viewer|photo|doc|page|zoom|rot|mode|save|cancel|ok|edit|letter-|'
    # ms-control — обёртка мультивыбора (parts/struct/ms.js), одна на все такие
    # поля: как ключ она склеивает отопление с температурным режимом.
    r'ms-)')


def clean(text):
    t = re.sub(r'\s+', ' ', text).strip()
    t = t.replace('*', '').strip()
    return t


def label_text(raw):
    """Текст подписи без вложенной разметки, значка заметки и подстановок."""
    t = re.sub(r'\$\{[^}]*\}', ' ', raw)      # ${devNote(...)} и прочее
    t = re.sub(r'<[^>]*>', ' ', t)             # вложенные теги
    return clean(t)


def parse_card(files):
    """Состав карточки: поля (ключ → подписи), разделы, заголовки блоков."""
    fields = {}          # ключ поля → множество подписей
    labels = set()       # все подписи, даже если ключ не опознан
    secs, heads = set(), set()

    def add(key, text):
        if not text or text in SKIP_LABELS:
            return
        labels.add(text)
        if key:
            fields.setdefault(key, set()).add(text)

    for path in files:
        src = io.open(path, encoding='utf-8').read()

        for m in FIELD_BLOCK.finditer(src):
            text = label_text(m.group(1))
            attrs = [norm_key(a, v) for a, v in DATA_ATTR.findall(m.group(2))
                     if not SKIP_KEYS.match(a)]
            add(attrs[0] if attrs else None, text)

        for m in HELPER_LABEL_FIRST.finditer(src):
            add(norm_key(m.group(2).replace('data-', '')), clean(m.group(1)))

        # У конструктива ключ первый, подпись вторая.
        for m in HELPER_STRUCT.finditer(src):
            add('struct.' + m.group(1), clean(m.group(2)))

        for m in SEC_HEAD.finditer(src):
            t = clean(m.group(1))
            if t not in SKIP_LABELS:
                secs.add(t)

        for m in CARD_HEAD.finditer(src):
            t = clean(m.group(1))
            if t not in SKIP_LABELS:
                heads.add(t)

    return {'поля': labels, 'ключи': set(fields), 'подписи': fields,
            'разделы': secs, 'блоки': heads}


# --- отчёт -----------------------------------------------------------------
def compare(card_ru, card_dir):
    owners = [m for m in MODULES if own_card(m, card_dir)]
    data = {m: parse_card(module_files(m, card_dir)) for m in owners}
    return owners, data


def diff_lines(owners, data, kind):
    """Строки, которые есть не у всех владельцев карточки."""
    everything = sorted(set().union(*[data[m][kind] for m in owners])) if owners else []
    rows = []
    for name in everything:
        have = [m for m in owners if name in data[m][kind]]
        if len(have) != len(owners):
            rows.append((name, have))
    return rows, everything


def label_conflicts(owners, data):
    """Одно поле — разные подписи в разных модулях."""
    keys = sorted(set().union(*[data[m]['ключи'] for m in owners]))
    out = []
    for key in keys:
        by_label = {}
        for m in owners:
            for label in data[m]['подписи'].get(key, ()):
                by_label.setdefault(label, []).append(m)
        if len(by_label) > 1:
            out.append((key, by_label))
    return out


def table(rows, owners, as_md, first_col):
    """Строки вида (название, кто имеет) — таблицей."""
    if as_md:
        print('\n| %s | %s |' % (first_col, ' | '.join(SHORT[m] for m in owners)))
        print('|---|%s' % ('---|' * len(owners)))
        for name, have in rows:
            marks = ' | '.join('✔' if m in have else '—' for m in owners)
            print('| %s | %s |' % (name, marks))
        return

    width = max(len(n) for n, _ in rows)
    print('  %-*s  %s' % (width, '', '  '.join(SHORT[m] for m in owners)))
    for name, have in rows:
        cells = ['+'.center(len(SHORT[m])) if m in have else '.'.center(len(SHORT[m]))
                 for m in owners]
        print('  %-*s  %s' % (width, name, '  '.join(cells)))


def print_report(as_md=False, only=None):
    for card_ru, card_dir in CARDS.items():
        if only and only not in card_ru:
            continue

        owners, data = compare(card_ru, card_dir)

        print(('\n## Карточка «%s»' % card_ru) if as_md
              else ('\n=== КАРТОЧКА «%s» ===' % card_ru.upper()))

        if len(owners) < 2:
            who = ', '.join(owners) if owners else 'нет'
            print('одна общая реализация (%s) — расхождений быть не может' % who)
            continue

        print('своя реализация в: %s' % ', '.join(owners))

        # 1. Чего нет: сравниваем по КЛЮЧАМ полей и по структуре карточки.
        for kind, title in (('блоки', 'Блок'), ('разделы', 'Раздел'),
                            ('ключи', 'Поле (ключ данных)')):
            rows, everything = diff_lines(owners, data, kind)
            print('\n%s: всего %d, расходится %d' % (kind, len(everything), len(rows)))
            if rows:
                # Ключ данных сам по себе человеку ничего не говорит — рядом
                # ставим подпись из того модуля, где поле есть.
                named = []
                for key, have in rows:
                    labels = set()
                    for m in have:
                        labels |= data[m]['подписи'].get(key, set())
                    label = sorted(labels)[0] if labels else ''
                    named.append(('%s — %s' % (label, key) if label else key, have))
                table(named if kind == 'ключи' else rows, owners, as_md, title)

        # 2. Одно поле — разные подписи. Отдельный вид расхождения: поле есть
        #    везде, но человек видит разные названия и не понимает, одно это
        #    поле или разные.
        conflicts = label_conflicts(owners, data)
        print('\nодно поле — разные подписи: %d' % len(conflicts))
        for key, by_label in conflicts:
            print('  %s:' % key)
            for label, mods in sorted(by_label.items()):
                print('      «%s» — %s' % (label, ', '.join(SHORT[m] for m in mods)))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    print_report(as_md='--md' in sys.argv, only=args[0].lower() if args else None)
    return 0


if __name__ == '__main__':
    sys.exit(main())
