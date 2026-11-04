# -*- coding: utf-8 -*-
"""Файл готовых данных страницы «Аналитика» — app/data/analytics/land-seed.json.

Пользователь 04.11.2026: «Все расчеты и данные сохрани… Что бы на
демонстрации не ждать 10 минут». Скрипт поднимает сервер макета (tools/serve.py
— Кадастр через его порт /cadastre/) на свободном порту с пустой папкой правок,
открывает #/analytics, ждёт привязки ОЦ к аймакам (Дарек), жмёт «Посчитать
показанные» и сохраняет снимок страницы (аймаки, занятость, картинки незанятой
земли, привязки ОЦ) в файл. Нужна сеть: Кадастр и карта «Дарек».

    python tools/analytics/build_land_seed.py            # посчитать всё и сохранить
    python tools/analytics/build_land_seed.py --keep     # уже посчитанное из файла не пересчитывать
"""
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'app', 'data', 'analytics', 'land-seed.json')
# Сведения участков для экрана «Участки» — отдельным файлом (большой; читается по запросу).
OUT_P = os.path.join(ROOT, 'app', 'data', 'analytics', 'land-parcels.json')


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def main():
    from playwright.sync_api import sync_playwright
    port = free_port()
    data = tempfile.mkdtemp(prefix='land-seed-')
    srv = subprocess.Popen([sys.executable, '-u', os.path.join(ROOT, 'tools', 'serve.py'), '--port', str(port), '--name', 'land seed', '--data', data],
                           cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen('http://127.0.0.1:%d/app.html' % port, timeout=2)
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.3)
        with sync_playwright() as p:
            br = p.chromium.launch()
            page = br.new_page(viewport={'width': 1600, 'height': 1000})
            if '--keep' not in sys.argv:
                page.route('**/app/data/analytics/land-seed.json', lambda r: r.fulfill(status=404, body=''))
            page.goto('http://127.0.0.1:%d/app.html#/analytics' % port)
            page.wait_for_selector('.an-page', timeout=60000)
            page.wait_for_function("() => document.querySelector('[data-an-status]') && !document.querySelector('[data-an-status]').textContent.includes('идёт привязка')"
                                   " && document.querySelector('[data-an-status]').textContent.includes('аймаков')", timeout=600000, polling=2000)
            print(page.inner_text('[data-an-status]'))
            btn = page.locator('[data-an-batch]')
            if btn.count() and btn.is_enabled():
                t = time.time()
                btn.click()
                page.wait_for_function("() => !document.querySelector('[data-an-batch-stop]') && !document.querySelector('.an-run')", timeout=3600000, polling=3000)
                print('посчитано за %d с' % (time.time() - t))
            snap = page.evaluate('() => window.__anExport()')
            parcels = page.evaluate('() => window.__anExportParcels()')
            br.close()
        done = [a for a in snap['aimaks'] if a.get('occ')]
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, 'w', encoding='utf-8') as f:
            json.dump(snap, f, ensure_ascii=False, separators=(',', ':'))
        with open(OUT_P, 'w', encoding='utf-8') as f:
            json.dump(parcels, f, ensure_ascii=False, separators=(',', ':'))
        print('участки: %s — аймаков %d, участков %d, %.1f МБ' % (os.path.relpath(OUT_P, ROOT), len(parcels['aimaks']),
              sum(len(v['rows']) for v in parcels['aimaks'].values()), os.path.getsize(OUT_P) / 1e6))
        print('сохранено: %s — аймаков %d (посчитано %d), привязок ОЦ %d, %.1f МБ' % (
            os.path.relpath(OUT, ROOT), len(snap['aimaks']), len(done), len(snap['adm']), os.path.getsize(OUT) / 1e6))
    finally:
        srv.terminate()


if __name__ == '__main__':
    main()
