# Быстрый прогон новой сборки: реестр на объёме + карточки всех пяти модулей.
# Ловит ошибки консоли и делает скриншоты. Требует: playwright, pillow.
import subprocess, time, sys, os
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'visual-parity', 'out')
os.makedirs(OUT, exist_ok=True)
PORT = 8901

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '-d', ROOT],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
errs = []
BASE = f'http://127.0.0.1:{PORT}/app.html'

CASES = [
    ('rh', '#/oc/residential-house/oc-rh-1'),
    ('ap', '#/oc/apartment/oc-ap-1'),
    ('cv', '#/oc/civil/oc-cv-1'),
    ('pr', '#/oc/production/oc-pr-1'),
    ('lp', '#/oc/land-plot/oc-lp-1'),
]

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1720, 'height': 1000})
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE: ' + m.text) if m.type == 'error' else None)

        pg.goto(BASE); pg.wait_for_timeout(900)
        pg.screenshot(path=f'{OUT}/registry-seed.png')

        pg.select_option('[data-bulk-count]', '20000'); pg.wait_for_timeout(2200)
        pg.screenshot(path=f'{OUT}/registry-20k.png')
        print('всего в реестре:', pg.locator('.reg-count b').inner_text())

        for tag, url in CASES:
            pg.goto(BASE + url); pg.wait_for_selector('.card', timeout=8000); pg.wait_for_timeout(500)
            pg.screenshot(path=f'{OUT}/{tag}-oc.png')

        b.close()
finally:
    srv.terminate()

print('ошибок консоли:', len(errs))
for e in dict.fromkeys(errs):
    print('  !', e)
