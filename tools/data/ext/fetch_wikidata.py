# -*- coding: utf-8 -*-
"""Модели ТС из Викиданных — класс модели, производитель или марка, названия.

Задача пользователя 07.10.2026: «собираем по маркам и моделям ряд по
интернету». Викиданные — открытая база (CC0): модели легковых, грузовиков,
автобусов, тракторов, мото и части спецтехники с производителем и русским
названием. Классы — CLASSES (сняты запросом подклассов «модели транспортного
средства» 07.10.2026; самолёты, суда, вагоны и подобное не берутся).

Результат — кэш tools/data/ext/cache/wikidata.json:
[{class, item, ru, en, maker, maker_ru}]; запросы — по классу, страницами.

    python tools/data/ext/fetch_wikidata.py
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'cache', 'wikidata.json')
UA = 'inside-mockup-catalog/1.0 (local research; python urllib)'
PAGE = 4000

# Класс Викиданных → наш вид (как в tools/data/build_ts_model_catalog.py).
CLASSES = {
    'Q3231690': 'легковой', 'Q21546143': 'грузовик', 'Q23039057': 'автобус',
    'Q23038372': 'кузов автобуса', 'Q55725952': 'трактор', 'Q23866334': 'мотоцикл', 'Q23868001': 'мопед',
    'Q23867828': 'скутер', 'Q110218430': 'квадроцикл', 'Q113459497': 'мотоцикл', 'Q55902242': 'комбайн',
    'Q108822776': 'экскаватор', 'Q111941996': 'кран', 'Q109732509': 'каток', 'Q123632011': 'мини-погрузчик',
}

QUERY = '''SELECT ?i ?ru ?en ?maker ?makerRu WHERE {
  ?i wdt:P31 wd:%s .
  OPTIONAL { ?i rdfs:label ?ru FILTER(LANG(?ru) = "ru") }
  OPTIONAL { ?i rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?i wdt:P176|wdt:P1716 ?m .
             OPTIONAL { ?m rdfs:label ?maker FILTER(LANG(?maker) = "en") }
             OPTIONAL { ?m rdfs:label ?makerRu FILTER(LANG(?makerRu) = "ru") } }
} ORDER BY ?i LIMIT %d OFFSET %d'''


def run(q):
    url = 'https://query.wikidata.org/sparql?format=json&query=' + urllib.parse.quote(q)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            return json.load(urllib.request.urlopen(req, timeout=180))['results']['bindings']
        except Exception as e:  # noqa: BLE001 — повтор при перегрузке сервиса
            print('  повтор', e, flush=True)
            time.sleep(15 * (attempt + 1))
    raise SystemExit('Викиданные не ответили')


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    rows = []
    for cls, kind in CLASSES.items():
        off, got = 0, 0
        while True:
            page = run(QUERY % (cls, PAGE, off))
            for b in page:
                v = lambda k: b[k]['value'] if k in b else ''
                rows.append({'class': kind, 'item': v('i').rsplit('/', 1)[-1], 'ru': v('ru'), 'en': v('en'),
                             'maker': v('maker'), 'maker_ru': v('makerRu')})
            got += len(page)
            if len(page) < PAGE:
                break
            off += PAGE
            time.sleep(2)
        print('%-16s %s строк %d' % (kind, cls, got), flush=True)
        time.sleep(2)
    json.dump(rows, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('всего строк', len(rows), flush=True)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
