# -*- coding: utf-8 -*-
"""Сверка выгрузки разметки со сканами — после сценария export_layouts.

Требование пользователя 29.09.2026: «потери качества недопустимы». Ловит:
  * длинный разворот (страницы PDF столбиком или в ряд) выгружен не в
    исходном масштабе — прежде его урезал потолок 16000 точек / 120 Мп;
  * страница легла в выгрузке со сдвигом на долю пикселя и размылась;
  * части PNG длинного разворота не складываются в разворот целиком;
  * в HTML не все развороты и куски, в Excel не все связи.

    python tools/razmetka/checks/run.py export_layouts
    python tools/razmetka/checks/export_verify.py
"""
import base64, glob, io, json, os, re, sys, tempfile, zipfile
from PIL import Image, ImageChops, ImageStat

sys.stdout.reconfigure(encoding='utf-8')
Image.MAX_IMAGE_PIXELS = None
D = os.path.join(tempfile.gettempdir(), 'razmetka-check', 'export_layouts')
p = json.load(open(os.path.join(D, 'all.json'), encoding='utf-8'))
bad = []


def ck(ok, msg):
    print(('ок   ' if ok else 'НЕ ТАК ') + msg)
    if not ok:
        bad.append(msg)


def asset(l):
    f = p['assets'][l['asset']]['file']
    for root in ('proj', 'fresh'):
        q = os.path.join(D, root, 'images', f)
        if os.path.exists(q):
            return Image.open(q).convert('L')
    return None


def glue(name, tall):
    parts = sorted(glob.glob(os.path.join(D, name + '-*.png')), key=lambda f: int(re.findall(r'-(\d+)\.png$', f)[0]))
    ims = [Image.open(f).convert('L') for f in parts]
    if not ims:
        return Image.open(os.path.join(D, name + '.png')).convert('L'), 1
    W = ims[0].width if tall else sum(i.width for i in ims)
    H = sum(i.height for i in ims) if tall else ims[0].height
    out = Image.new('L', (W, H), 255)
    o = 0
    for i in ims:
        out.paste(i, (0, o) if tall else (o, 0))
        o += i.height if tall else i.width
    return out, len(ims)


def sheet_of(title):
    return [c for c in p['chapters'] if c['title'] == title][0]['sheets'][0]


for name, title, tall in (('column', 'Столбик', True), ('row', 'Ряд', False), ('single', 'По разворотам', True)):
    s = sheet_of(title)
    ls = [l for l in s['layers'] if l['kind'] == 'image' and not l['hidden']]
    k = max(l['crop']['w'] / l['w'] for l in ls)
    img, n = glue(name, tall)
    # Начало выгрузки: верхний левый угол самой подробной картинки — в целом пикселе.
    ref = max(ls, key=lambda l: l['crop']['w'] / l['w'])
    bx = min(l['x'] for l in ls) - 40
    by = min(l['y'] for l in ls) - 70
    import math
    x0 = ref['x'] - math.ceil((ref['x'] - bx) * k - 1e-6) / k
    y0 = ref['y'] - math.ceil((ref['y'] - by) * k - 1e-6) / k
    worst = 0
    for l in ls:
        src = asset(l)
        ox, oy = (l['x'] - x0) * k, (l['y'] - y0) * k
        ck(abs(ox - round(ox)) < 0.02 and abs(oy - round(oy)) < 0.02,
           '%s: «%s» в целых пикселях (%.2f, %.2f)' % (name, l['name'], ox, oy))
        cx, cy, cw, ch = (int(l['crop'][q]) for q in ('x', 'y', 'w', 'h'))
        a = src.crop((cx, cy, cx + cw, cy + ch))
        b = img.crop((round(ox), round(oy), round(ox) + cw, round(oy) + ch))
        d = ImageChops.difference(a, b)
        # Внутри страницы — точь-в-точь; крайние 3 точки по контуру
        # сглаживаются о белый фон разворота (край листа, не содержимое).
        inner = d.crop((3, 3, d.width - 3, d.height - 3))
        worst = max(worst, inner.getextrema()[1])
        # ±1 уровень — округление цвета при отрисовке WPF у отдельных цветных сканов
        # (найдено 27.10.2026), не размытие и не сдвиг.
        ck(inner.getextrema()[1] <= 1, '%s: «%s» внутри совпадает со сканом (наибольшее отличие %d из 255)'
           % (name, l['name'], inner.getextrema()[1]))
    print('     %s: частей %d, %dx%d точек' % (name, n, img.width, img.height))

# HTML: все развороты, у каждого — куски; куски складываются в область разворота.
html = open(os.path.join(D, 'all.html'), encoding='utf-8').read()
m = re.search(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', html, re.S)
data = json.loads(m.group(1).replace('<\\/', '</'))
nsheets = sum(len(c['sheets']) for c in p['chapters'])
ck(len(data['sheets']) == nsheets, 'HTML: разворотов %d из %d' % (len(data['sheets']), nsheets))
ck(all(s['tiles'] for s in data['sheets']), 'HTML: у каждого разворота есть картинка')
for s in data['sheets']:
    right = max(t['x'] + t['w'] for t in s['tiles'])
    bottom = max(t['y'] + t['h'] for t in s['tiles'])
    if right + 0.5 < s['w'] or bottom + 0.5 < s['h']:
        ck(False, 'HTML: куски «%s» не покрывают разворот' % s['title'])
nlinks = sum(len(sh['links']) for c in p['chapters'] for sh in c['sheets'])
ck(sum(len(s['links']) for s in data['sheets']) == nlinks, 'HTML: связей %d' % nlinks)
# Excel: строка на каждую связь.
with zipfile.ZipFile(os.path.join(D, 'all.xlsx')) as z:
    rows = z.read('xl/worksheets/sheet1.xml').decode('utf-8').count('<row ') - 1
ck(rows == nlinks, 'Excel: строк %d, связей %d' % (rows, nlinks))
print('всё в порядке' if not bad else 'провалы: %d' % len(bad))
sys.exit(1 if bad else 0)
