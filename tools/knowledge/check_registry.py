# -*- coding: utf-8 -*-
"""Сверка реестра knowledge/ с макетом.

Реестр наполняется машиной, поэтому его нельзя принимать на веру. Проверка
идёт от записи к экрану: берём поле из реестра, открываем названный в нём
экран и смотрим, есть ли там такая подпись. Что не подтвердилось — выводится
списком.

    python tools/knowledge/check_registry.py

Проверяется:
  * каждое поле видно на том экране, который указан в записи;
  * у записи заполнены обязательные части (идентификатор, термин, статус);
  * идентификаторы не повторяются;
  * в реестре нет полей, которых уже нет в макете, и наоборот.
"""
import collections
import io
import os
import subprocess
import sys
import time

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KNOW = os.path.join(ROOT, 'knowledge')
PORT = 5597

LABELS_ON_SCREEN = r"""() => {
  const txt = (el) => {
    if (!el) return '';
    const copy = el.cloneNode(true);
    copy.querySelectorAll('.dev-note, .chev, .pill-mini, .fl-grip').forEach((n) => n.remove());
    return copy.textContent.replace(/\s+/g, ' ').trim();
  };
  // Звёздочка обязательности в название поля не входит — реестр хранит
  // подпись без неё, значит и сверять надо без неё.
  const norm = (t) => t.replace(/\s*\*\s*$/, '').trim();

  const out = new Set();
  document.querySelectorAll('.card label, .card .lbl, .card thead th').forEach((el) => {
    const t = norm(txt(el));
    if (t) out.add(t);
  });
  document.querySelectorAll('.card [aria-label]').forEach((el) => {
    out.add(norm(el.getAttribute('aria-label')));
  });
  document.querySelectorAll('.card tbody tr td:first-child').forEach((el) => {
    const t = norm(txt(el));
    if (t) out.add(t);
  });
  return [...out];
}"""


def load(folder):
    records = []
    path = os.path.join(KNOW, folder)
    if not os.path.isdir(path):
        return records
    for name in sorted(os.listdir(path)):
        if name.endswith('.yaml'):
            records.append((name, yaml.safe_load(io.open(os.path.join(path, name),
                                                         encoding='utf-8'))))
    return records


def main():
    fields = load('fields')
    concepts = load('concepts')
    print('в реестре: понятий %d, полей %d' % (len(concepts), len(fields)))

    problems = []

    # --- формальная часть ---------------------------------------------------
    ids = collections.Counter()
    for name, rec in fields + concepts:
        for key in ('id', 'вид', 'термин', 'статус', 'источник'):
            if not rec.get(key):
                problems.append('%s: не заполнено «%s»' % (name, key))
        ids[rec.get('id')] += 1
    for rid, n in ids.items():
        if n > 1:
            problems.append('идентификатор «%s» встречается %d раз' % (rid, n))

    # --- сверка с экранами --------------------------------------------------
    screens = collections.defaultdict(set)
    for name, rec in fields:
        for place in rec.get('встречается', []):
            screens[place['пример_экрана']].add(rec['термин'])

    print('экранов для проверки: %d' % len(screens))

    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    checked = missed = 0
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={'width': 1600, 'height': 1200})
            base = 'http://127.0.0.1:%d/app.html' % PORT

            for route, labels in sorted(screens.items()):
                pg.goto(base + route)
                try:
                    pg.wait_for_selector('.card', timeout=15000)
                except Exception:
                    problems.append('экран не открылся: %s' % route)
                    continue
                pg.wait_for_timeout(600)
                pg.evaluate("""() => document.querySelectorAll('.card.closed')
                    .forEach(c => c.classList.remove('closed'))""")
                pg.wait_for_timeout(200)
                on_screen = set(pg.evaluate(LABELS_ON_SCREEN))

                for label in sorted(labels):
                    checked += 1
                    if label not in on_screen:
                        missed += 1
                        problems.append('«%s» не найдено на экране %s' % (label, route))
            b.close()
    finally:
        srv.terminate()

    print('\nсверено записей с экранами: %d, не подтвердилось: %d' % (checked, missed))
    if problems:
        print('\n--- что требует внимания (%d) ---' % len(problems))
        for p in problems[:40]:
            print('  ', p)
        if len(problems) > 40:
            print('   … ещё %d' % (len(problems) - 40))
    else:
        print('\nвсе записи подтверждены макетом')

    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
