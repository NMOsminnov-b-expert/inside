# Быстрый скриншот произвольного экрана макета — для правки дизайна и
# самопроверки перед тем, как показывать результат пользователю.
# Требуется: playwright (pip install playwright; python -m playwright install chromium).
#
# Примеры:
#   python tools/visual-parity/screenshot.py --route "#/oc/apartment/oc-ap-1" --out oi-list.png
#   python tools/visual-parity/screenshot.py --route "#/oc/residential-house/oc-rh-1" \
#       --click "tr[data-open-oi]:nth-of-type(1)" --out building-card.png --full-page
#
# --click можно указывать несколько раз — клики выполняются по порядку до скриншота.
# По умолчанию скриншот сохраняется в tools/visual-parity/out/<--out>.
# Печатает все ошибки консоли/страницы (PAGEERROR/CONSOLE) — 0 ошибок означает чистый прогон.
import argparse
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join(ROOT, 'tools', 'visual-parity', 'out')
PORT = 8930


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--route', default='', help='хэш-маршрут после app.html, например "#/oc/apartment/oc-ap-1"')
    ap.add_argument('--out', required=True, help='имя файла скриншота (сохраняется в tools/visual-parity/out/)')
    ap.add_argument('--wait', default='.card', help='CSS-селектор, дождаться перед действиями (по умолчанию .card)')
    ap.add_argument('--click', action='append', default=[], help='CSS-селектор для клика перед скриншотом; можно указать несколько раз по порядку')
    ap.add_argument('--width', type=int, default=1600)
    ap.add_argument('--height', type=int, default=1000)
    ap.add_argument('--full-page', action='store_true')
    ap.add_argument('--settle-ms', type=int, default=400, help='пауза после каждого действия/загрузки, мс')
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, args.out)

    srv = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(PORT), '-d', ROOT],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1.2)
    errs = []

    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={'width': args.width, 'height': args.height})
            pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
            pg.on('console', lambda m: errs.append('CONSOLE: ' + m.text) if m.type == 'error' else None)

            url = f'http://127.0.0.1:{PORT}/app.html{args.route}'
            print('navigating to:', url)
            pg.goto(url)
            if args.wait:
                try:
                    pg.wait_for_selector(args.wait, timeout=8000)
                except Exception:
                    debug_path = os.path.join(OUT_DIR, '_debug_timeout.png')
                    pg.screenshot(path=debug_path)
                    print('TIMEOUT waiting for', args.wait, '-> debug screenshot:', debug_path)
                    print('page url:', pg.url)
                    raise
            pg.wait_for_timeout(args.settle_ms)

            for sel in args.click:
                pg.locator(sel).first.click()
                pg.wait_for_timeout(args.settle_ms)

            pg.screenshot(path=out_path, full_page=args.full_page)
            b.close()
    finally:
        srv.terminate()

    print('screenshot:', out_path)
    print('ошибок консоли:', len(errs))
    for e in dict.fromkeys(errs):
        print('  !', e)


if __name__ == '__main__':
    main()
