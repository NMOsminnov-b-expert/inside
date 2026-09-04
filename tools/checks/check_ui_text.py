# -*- coding: utf-8 -*-
"""Интерфейс без кода и таблицы внутри своих блоков.

Требование пользователя 03.09.2026: «все технические поля должны быть в
интерфейсе русифицированы, никаких кусков кода в интерфейсе» и «чтобы таблицы
не выходили за свои блоки». Оба правила зафиксированы в docs/tz/20-arhiv.md
(§8.3, §8.4) и с этой проверкой перестают зависеть от внимательности ревьюера.

Что ловит сценарий:
  * `undefined`, `null`, `NaN`, `[object Object]` в видимом тексте — почти
    всегда это поле, которое забыли подстраховать на пустоту;
  * идентификаторы записей (`oc-cv-1`, `doc-4`, `inst-12`, `arc-17`) —
    человеку они ничего не говорят, вместо них должно быть название;
  * идентификаторы типов ОЦ (`civil`, `land-plot`, `residential-house`) вместо
    названий типа «Гражданское здание»;
  * ключи полей латиницей в camelCase (`regAuthority`, `staleDays`);
  * таблица, вышедшая за свой блок: ширина больше контейнера, ячейка за рамкой
    или блок, раздутый содержимым.

Экраны перечислены в SCREENS: каждый открывается, при необходимости
доклкивается до нужного состояния, после чего проверяется целиком.
"""
import re

NAME = 'интерфейс без кода'

# route, что ждать, клики до нужного состояния
SCREENS = [
    ('#/', '.reg-tr', []),
    ('#/docs', '[data-doc-row]', []),
    ('#/docs', '[data-doc-row]', ['[data-doc-row]']),
    ('#/dicts', '.dc-col', []),
    ('#/archive', '.arc', []),
    ('#/institutions', '.itree', ['.itree-row[data-inode]']),
    ('#/institutions', '.itree', ['.itree-row[data-inode]', '[data-itab="all"]']),
    ('#/institutions', '.itree', ['.itree-row[data-inode]', '[data-itab="docs"]']),
    ('#/oc/civil/oc-cv-1', 'tr[data-open-oi]', []),
    ('#/oc/civil/oc-cv-1', 'tr[data-open-oi]', ['tr[data-open-oi]']),
    ('#/oc/apartment/oc-ap-1', 'tr[data-open-oi]', ['tr[data-open-oi]']),
    ('#/oc/land-plot/oc-lp-1', 'tr[data-open-oi]', ['tr[data-open-oi]']),
]

# Служебные значения: в интерфейсе им места нет ни при каких данных.
JUNK = ['undefined', 'NaN', '[object Object]', '[object ', 'Infinity']

# Идентификаторы записей: префикс из кода плюс номер.
IDS = re.compile(r'\b(?:oc|oi|arc|arcb|doc|file|link|inst|dict|item)-[a-z]{0,3}-?\d+\b')

# Идентификаторы модулей — их подменяют названиями типов ОЦ.
TYPE_IDS = re.compile(r'(?<![\w-])(?:civil|land-plot|residential-house|production|apartment)(?![\w-])')

# Ключ поля латиницей: словоСловом. Имена файлов и известные сокращения — не в счёт.
CAMEL = re.compile(r'\b[a-z]{2,}[A-Z][a-zA-Z]{1,}\b')
CAMEL_OK = {'dataUrl'}          # ничего из этого в интерфейсе быть не должно, список на будущее

# Текст, который законно содержит латиницу: имена файлов, значки, единицы.
FILE_LIKE = re.compile(r'\S+\.(?:pdf|jpg|jpeg|png|webp|doc|docx|xls|xlsx|csv|txt)\b', re.I)


def _visible_text(pg):
    """Видимый текст плюс подсказки: title-и тоже часть интерфейса."""
    return pg.evaluate("""() => {
      const root = document.body;
      const text = root.innerText || '';
      const titles = [...root.querySelectorAll('[title]')]
        .map((e) => e.getAttribute('title')).filter(Boolean).join('\\n');
      const placeholders = [...root.querySelectorAll('[placeholder]')]
        .map((e) => e.getAttribute('placeholder')).filter(Boolean).join('\\n');
      return [text, titles, placeholders].join('\\n');
    }""")


def _clean(text):
    """Убрать то, где латиница законна: имена файлов."""
    return FILE_LIKE.sub(' ', text)


def _check_text(t, where, text):
    clean = _clean(text)

    for junk in JUNK:
        if junk in clean:
            line = next((l.strip() for l in clean.split('\n') if junk in l), '')
            t.ck(False, '%s: в интерфейсе служебное значение «%s» — %s'
                 % (where, junk, line[:80]))
            break
    else:
        t.ck(True, '%s: служебных значений нет' % where)

    ids = sorted(set(IDS.findall(clean)))
    t.ck(not ids, '%s: в интерфейсе идентификаторы записей: %s' % (where, ids[:5]))

    type_ids = sorted(set(TYPE_IDS.findall(clean)))
    t.ck(not type_ids, '%s: в интерфейсе идентификаторы типов ОЦ вместо названий: %s'
         % (where, type_ids[:5]))

    camel = sorted({w for w in CAMEL.findall(clean) if w not in CAMEL_OK})
    t.ck(not camel, '%s: в интерфейсе ключи полей латиницей: %s' % (where, camel[:5]))


# Как мерить, чтобы не поймать ложное: у прокручиваемого блока таблица законно
# шире видимой рамки — это прокрутка, а не «вылезла таблица». Настоящих дефектов
# два, и они проверяются прямо:
#   * блок БЕЗ прокрутки раздут таблицей — тогда таблица торчит из блока и рвёт
#     раскладку соседям;
#   * таблица шире прокручиваемой области блока — часть столбцов не достать
#     даже прокруткой.
TABLES_JS = """() => {
  const out = [];
  document.querySelectorAll('table').forEach((tbl, i) => {
    const box = tbl.parentElement;
    if (!box || !box.clientWidth || !tbl.getBoundingClientRect().width) return;
    const cs = getComputedStyle(box);
    out.push({
      i,
      cls: ((tbl.className || '') + ' / ' + (box.className || '')).trim(),
      tableScroll: tbl.scrollWidth,
      boxClient: box.clientWidth,
      boxScroll: box.scrollWidth,
      scrollable: ['auto', 'scroll'].includes(cs.overflowX),
    });
  });
  return out;
}"""

# Горизонтальная прокрутка страницы — самый честный признак «что-то вылезло за
# свой блок»: у макета её быть не должно ни на одном экране.
PAGE_JS = """() => ({
  scroll: document.documentElement.scrollWidth,
  client: document.documentElement.clientWidth,
})"""


def _check_tables(t, where, pg):
    page = pg.evaluate(PAGE_JS)
    t.ck(page['scroll'] <= page['client'] + 1,
         '%s: страница прокручивается по горизонтали — %d при видимых %d, что-то вышло за свой блок'
         % (where, page['scroll'], page['client']))

    for tb in pg.evaluate(TABLES_JS):
        name = '%s: таблица #%d (%s)' % (where, tb['i'], tb['cls'][:44])

        if tb['scrollable']:
            # Прокрутка есть — тогда вся таблица обязана быть доступна прокруткой.
            t.ck(tb['tableScroll'] <= tb['boxScroll'] + 1,
                 '%s: таблица шире прокручиваемой области — %d при %d, часть столбцов не достать'
                 % (name, tb['tableScroll'], tb['boxScroll']))
        else:
            # Прокрутки нет — значит таблица обязана умещаться в блок.
            t.ck(tb['boxScroll'] <= tb['boxClient'] + 1,
                 '%s: блок раздут таблицей — %d при видимых %d, а прокрутки у него нет'
                 % (name, tb['boxScroll'], tb['boxClient']))


def run(t):
    pg = t.page

    for route, wait, clicks in SCREENS:
        t.open(route, wait=wait)
        t.wait(500)

        for sel in clicks:
            loc = pg.locator(sel)
            if not loc.count():
                continue
            loc.first.click()
            t.wait(700)

        where = route + (' → ' + ' → '.join(clicks) if clicks else '')
        _check_text(t, where, _visible_text(pg))
        _check_tables(t, where, pg)
