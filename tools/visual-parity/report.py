# Отчётность скриншотами: снимок экрана раскладывается в папки по смыслу.
#
# Требование пользователя 28.08.2026: если менялась страница — прикладывать
# скрин, а файлы хранить структурой
#     <комментарий текущего коммита> / <блок> / <тип ОЦ> / <тип ОИ>
# Так снимки одной правки лежат вместе, и через месяц понятно, что именно на них.
#
# Комментарий коммита берётся из git автоматически (последний коммит ветки) —
# его не нужно передавать руками, а значит и забыть нельзя. Имя папки
# транслитерируется в ASCII по тем же причинам, что и файлы графа знаний:
# кириллица в путях по-разному отображается в терминалах и git status.
#
# Примеры:
#   python tools/visual-parity/report.py --route "#/oc/civil/oc-cv-1" \
#       --oc civil --oi building --name plate
#   python tools/visual-parity/report.py --route "#/oc/civil/oc-cv-1" \
#       --click "tr[data-open-oi]" --oc civil --oi building --name floors --full-page
#   python tools/visual-parity/report.py --route "#/oc/land-plot/oc-lp-1" \
#       --click ".oi-land-open" --select "[data-land-buildings]|Есть" \
#       --clip ".card" --oc land-plot --oi land --name blok-03
#
# Итог: docs/screens/<коммит>/oc/civil/building/floors.png
import argparse
import os
import re
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BASE_DIR = os.path.join(ROOT, 'docs', 'screens')
PORT = 8931

# Блок системы. Пока в макете он один — объекты оценки; поле оставлено, потому
# что структура папок должна пережить появление следующих блоков.
BLOCKS = {'oc': 'Объекты оценки'}

TRANSLIT = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
    'я': 'ya',
}


def slug(text, limit=60):
    """Кириллица → ASCII, пробелы → дефисы. Пустая строка превращается в 'bez-nazvaniya'."""
    out = []
    for ch in str(text).lower():
        if ch in TRANSLIT:
            out.append(TRANSLIT[ch])
        elif ch.isalnum():
            out.append(ch)
        elif ch in ' _-/.,:;':
            out.append('-')
    s = re.sub(r'-+', '-', ''.join(out)).strip('-')
    return (s[:limit].strip('-') or 'bez-nazvaniya')


def commit_slug():
    """Комментарий текущего коммита — имя верхней папки."""
    try:
        msg = subprocess.check_output(
            ['git', 'log', '-1', '--pretty=%s'], cwd=ROOT, stderr=subprocess.DEVNULL,
        ).decode('utf-8', 'replace').strip()
    except Exception:
        msg = ''
    return slug(msg) if msg else 'bez-kommita'


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--route', default='', help='хэш-маршрут после app.html')
    ap.add_argument('--name', required=True, help='имя снимка: что именно показано (например, floors)')
    ap.add_argument('--block', default='oc', choices=sorted(BLOCKS), help='блок системы (пока только oc)')
    ap.add_argument('--oc', required=True, help='тип ОЦ: civil, apartment, residential-house, production, land-plot')
    ap.add_argument('--oi', default='', help='тип ОИ: building, apartment, land, movable; пусто — снимок уровня ОЦ')
    ap.add_argument('--wait', default='.card')
    ap.add_argument('--click', action='append', default=[])
    # Состояние блока часто зависит от значения в поле («Есть» открывает
    # зависимые поля), а снимок нужен именно в этом состоянии — иначе такие
    # экраны приходилось бы снимать мимо отчётности, разовым скриптом.
    ap.add_argument('--select', action='append', default=[], metavar='СЕЛЕКТОР|ЗНАЧЕНИЕ',
                    help='выбрать значение в select перед снимком')
    ap.add_argument('--clip', default='',
                    help='снять только этот элемент (например .card:nth-of-type(3)) — блок целиком, без остального экрана')
    ap.add_argument('--width', type=int, default=1600)
    ap.add_argument('--height', type=int, default=1000)
    ap.add_argument('--full-page', action='store_true')
    ap.add_argument('--settle-ms', type=int, default=400)
    args = ap.parse_args()

    parts = [commit_slug(), args.block, slug(args.oc)]
    if args.oi:
        parts.append(slug(args.oi))
    out_dir = os.path.join(BASE_DIR, *parts)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, slug(args.name) + '.png')

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

            pg.goto(f'http://127.0.0.1:{PORT}/app.html{args.route}')
            if args.wait:
                try:
                    pg.wait_for_selector(args.wait, timeout=8000)
                except Exception as e:
                    errs.append('WAIT: ' + str(e))
            pg.wait_for_timeout(args.settle_ms)

            for sel in args.click:
                try:
                    pg.locator(sel).first.click()
                except Exception as e:
                    errs.append(f'CLICK {sel}: {e}')
                pg.wait_for_timeout(args.settle_ms)

            for pair in args.select:
                sel, _, value = pair.partition('|')
                try:
                    pg.locator(sel).first.select_option(value)
                except Exception as e:
                    errs.append(f'SELECT {sel}: {e}')
                pg.wait_for_timeout(args.settle_ms)

            if args.clip:
                try:
                    el = pg.locator(args.clip).last
                    el.scroll_into_view_if_needed()
                    pg.wait_for_timeout(args.settle_ms)
                    el.screenshot(path=out_path)
                except Exception as e:
                    errs.append(f'CLIP {args.clip}: {e}')
                    pg.screenshot(path=out_path, full_page=args.full_page)
            else:
                pg.screenshot(path=out_path, full_page=args.full_page)
            b.close()
    finally:
        srv.terminate()

    print('снимок:', os.path.relpath(out_path, ROOT))
    print('ошибок консоли:', len(errs))
    for e in errs[:10]:
        print('  ', e)


if __name__ == '__main__':
    main()
