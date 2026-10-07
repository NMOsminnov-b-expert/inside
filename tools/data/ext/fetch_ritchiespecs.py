# -*- coding: utf-8 -*-
"""Модели спецтехники из каталога RitchieSpecs — производитель, тип машины, модель.

Задача пользователя 07.10.2026: «собираем по маркам и моделям ряд по
интернету. Ищем наиболее полные каталоги и расширяемся… Учитываем и
комплектацию (что-то может быть и на гусеницах, и на колёсах)». RitchieSpecs —
открытый каталог спецификаций спецтехники (около 16 000 моделей, 250
производителей); тип машины в нём различает ходовую: crawler excavator /
wheel excavator, track loader / wheel loader. robots.txt разрешает всё.

Обход: список производителей → типы техники производителя → модели типа.
Пауза между запросами — DELAY секунд. Результат — кэш
tools/data/ext/cache/ritchiespecs.json: [{maker, type, model}]; повторный
запуск дописывает только недостающих производителей (--fresh — заново).

    python tools/data/ext/fetch_ritchiespecs.py
"""
import json
import os
import re
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'cache', 'ritchiespecs.json')
BASE = 'https://www.ritchiespecs.com'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
DELAY = 0.7


def get(path):
    for attempt in range(3):
        try:
            req = urllib.request.Request(BASE + path, headers={'User-Agent': UA})
            return urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
        except Exception as e:  # noqa: BLE001 — повтор при сбое сети
            print('  повтор', path, e, flush=True)
            time.sleep(5 * (attempt + 1))
    return ''


def text(s):
    return re.sub(r'\s+', ' ', s.replace('&amp;', '&')).strip()


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    rows = [] if '--fresh' in sys.argv or not os.path.exists(OUT) else json.load(open(OUT, encoding='utf-8'))
    done = {r['maker_slug'] for r in rows}
    page = get('/manufacturers')
    makers = sorted(set(re.findall(r'href="/manufacturer/([^"]+)"[^>]*>([^<]{1,80})<', page)))
    print('производителей', len(makers), 'уже есть', len(done), flush=True)
    for n, (slug, name) in enumerate(makers, 1):
        if slug in done:
            continue
        time.sleep(DELAY)
        mp = get('/manufacturer/' + slug)
        types = sorted(set(re.findall(r'href="/equipment/([^"/]+)/%s"[^>]*>([^<]{1,80})<' % re.escape(slug), mp)))
        got = 0
        for tslug, tname in types:
            time.sleep(DELAY)
            tp = get('/equipment/%s/%s' % (tslug, slug))
            for model in sorted(set(text(m) for m in re.findall(r'class="newtab_link">([^<]+)</div>', tp))):
                rows.append({'maker': text(name), 'maker_slug': slug, 'type': text(tname), 'type_slug': tslug,
                             'model': model})
                got += 1
        if not types:
            rows.append({'maker': text(name), 'maker_slug': slug, 'type': '', 'type_slug': '', 'model': ''})
        print('%3d/%d %-30s типов %2d моделей %4d' % (n, len(makers), name, len(types), got), flush=True)
        if n % 10 == 0:
            json.dump(rows, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    json.dump(rows, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('моделей всего', sum(1 for r in rows if r['model']), flush=True)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
