# -*- coding: utf-8 -*-
"""Перенос документов в систему: графы страниц техпаспорта и госакта стрелками
к блокам и полям рабочей системы — одна страница HTML.

Исходники — локальная папка «Примеры доков» (в .gitignore: реальный документ
учреждения и снимки рабочей системы): сканы техпаспорта и госакта в PDF и снимки
блоков системы в «Фото системы». Результат ложится туда же — в git не попадает.

Правила переноса (граф знаний: ref:tehpasport-sostav, ответы пользователя
24.09.2026) определяют, какие графы связаны со стрелками; сами правила в
документ не пишутся — в нём только связи «графа → блок (поле)».

Координаты рамок заданы в пикселях страницы, отрисованной при 110 dpi
(910 × 1287), и в пикселях снимков системы — по их исходному размеру.

    python tools/docs/build_tp_v_sistemu.py

На выходе — «Примеры доков/Перенос документов в систему.html»: один файл,
картинки внутри, открывается в браузере без интернета. Оглавление по главам,
подсветка связи при наведении на строку таблицы или стрелку, просмотр
разворота крупно (колесо — масштаб, перетаскивание — сдвиг).
"""
import base64
import heapq
import html
import io
import itertools
import math
import os

import fitz
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'Примеры доков')
SHOTS = os.path.join(SRC, 'Фото системы')
PDF = os.path.join(SRC, '0190 г.Кант ул.Куттубека Тагаева 3-ДС МИС_техпаспорт.pdf')
GOSAKT = os.path.join(SRC, 'Госакт Б 028723.pdf')
TP2015 = os.path.join(SRC, 'с. Чет Булак, ул. Чет Булак 1, д. 7 Баня 0183 нет пуд_техпаспорт.pdf')
OUT_HTML = os.path.join(SRC, 'Перенос документов в систему.html')
DPI = 110

# Снимки системы: файл → подпись над снимком (чей это блок).
OC_PARTIES = ('Screenshot 2026-09-24 144331.png', 'Объект оценки · 01 Учреждение, собственники и ответственные', (0, 0, 941, 248))
OC_PLACE = ('Screenshot 2026-09-24 144339.png', 'Объект оценки · 02 Местоположение', (0, 0, 952, 336))
OC_LIST = ('Screenshot 2026-09-24 144351.png', 'Объект оценки · 03 Перечень ОИ')
LIT_GEN = ('Screenshot 2026-09-24 144400.png', 'Литера · 01 Общие параметры')
LIT_AREAS = ('Литера — 02 Площади и этажность.png', 'Литера · 02 Площади и этажность', (0, 0, 990, 526))
LIT_AREAS_TOP = ('Литера — 02 Площади и этажность.png', 'Литера · 02 Площади и этажность', (0, 0, 990, 262))
LIT_STRUCT_FULL = ('Screenshot 2026-09-24 144429.png', 'Литера · 03 Конструктив и износ', (0, 0, 847, 492))
LIT_AREAS_H = ('Литера — 02 Площади и этажность.png', 'Литера · 02 Площади и этажность', (0, 0, 990, 646))
LIT_ANNEX = ('Литера — 05 Пристройки.png', 'Литера · 05 Пристройки')
LAND_MAIN = ('Screenshot 2026-09-24 144646.png', 'Земельный участок · 01 Основные параметры')
# Куски снимков для госакта: только поля, на которые идут стрелки.
LAND_MAIN_TOP = LAND_MAIN + ((0, 0, 987, 200),)
LAND_MAIN_ENI = LAND_MAIN + ((0, 0, 987, 125),)
LAND_MAIN_RIGHTS = LAND_MAIN + ((0, 500, 987, 586),)
LAND_AREAS_GA = ('Screenshot 2026-09-24 144652.png', 'Земельный участок · 02 Площади', (0, 0, 979, 116))
LIT_STRUCT = ('Screenshot 2026-09-24 144429.png', 'Литера · 03 Конструктив и износ', (0, 0, 847, 330))
LAND_AREAS = ('Screenshot 2026-09-24 144652.png', 'Земельный участок · 02 Площади')

# Страницы: (заголовок, страница PDF, связи). Связь: (рамка на странице,
# снимок, рамка на снимке, графа техпаспорта, блок и поле системы).
TP_FIGURES = [
    ('Титульный лист', 1, None, [
        ((285, 140, 722, 170), OC_PLACE, (18, 66, 934, 142), 'Идентификационный код',
         'Объект оценки · Местоположение · Код ЕНИ'),
        ((115, 221, 610, 248), OC_PLACE, (15, 158, 932, 327), 'Адрес',
         'Объект оценки · Местоположение · Область, Город или село, Район, Улица, Дом'),
        ((366, 360, 524, 398), LIT_GEN, (288, 208, 562, 270), 'Назначение недвижимости',
         'Литера · Общие параметры · Назначение по тех паспорту'),
        ((60, 588, 860, 672), OC_PARTIES, (6, 158, 702, 197), 'Собственник, часть (доля), документы на право '
         'собственности', 'Объект оценки · Учреждение, собственники и ответственные · Собственник: наименование, '
         'доля, ПУД'),
        ((66, 808, 787, 958), OC_PARTIES, (6, 199, 702, 239), 'Пользователь, часть (доля), документы на право '
         'пользования', 'Объект оценки · Учреждение, собственники и ответственные · Пользователь'),
    ]),
    ('Экспликация к плану основных строений, 1 этаж', 3, (30, 130, 415, 700), [
        ((352, 650, 404, 678), LIT_AREAS, (63, 421, 414, 454), 'Итого по этажу (1 этаж), общая площадь',
         'Литера · Площади и этажность · Надземные, строка «1 этаж», по внутреннему обмеру'),
    ]),
    ('Экспликация к плану основных строений, 2 этаж и всего', 4, (30, 130, 415, 900), [
        ((352, 782, 402, 806), LIT_AREAS, (63, 457, 414, 491), 'Всего по этажу (2 этаж), общая площадь',
         'Литера · Площади и этажность · Надземные, строка «2 этаж», по внутреннему обмеру'),
        ((352, 854, 402, 880), LIT_AREAS, (493, 38, 979, 97), 'Всего, общая площадь',
         'Литера · Площади и этажность · Площадь по внутреннему обмеру'),
    ]),
    ('Характеристика строений и сооружений по наружным замерам', 9, (50, 70, 800, 560), [
        ((61, 260, 357, 286), LIT_GEN, (4, 63, 332, 137), 'Литера А, наименование строения',
         'Литера · Общие параметры · Литера, Наименование'),
        ((355, 260, 435, 286), LIT_GEN, (8, 138, 284, 194), 'Год постройки',
         'Литера · Общие параметры · Год постройки'),
        ((433, 260, 695, 286), LIT_STRUCT, (13, 80, 834, 324), 'Фундамент, стены, кровля',
         'Литера · Конструктив и износ · Фундамент, Наружные стены, Кровля'),
        ((693, 260, 782, 286), LIT_AREAS_TOP, (6, 110, 489, 174), 'Площадь',
         'Литера · Площади и этажность · Площадь по внешним замерам'),
        ((61, 358, 782, 414), OC_LIST, (18, 193, 987, 547), 'Литеры Б, В, Г',
         'Объект оценки · Перечень ОИ · литеры, статус «Вспомогательное»'),
    ]),
    ('Экспликация земельного участка', 10, (80, 80, 850, 320), [
        ((95, 220, 257, 260), LAND_AREAS, (8, 50, 489, 106), 'По правоустанавливающим документам',
         'Земельный участок · Площади · По правоустанавливающим документам'),
        ((255, 258, 382, 290), LAND_AREAS, (8, 128, 489, 182), 'Фактически (последняя запись)',
         'Земельный участок · Площади · По факту'),
        ((380, 258, 602, 290), LAND_AREAS, (491, 128, 972, 182), 'Застроенная (последняя запись)',
         'Земельный участок · Площади · Застроенная площадь'),
    ]),
]

# Техпаспорт 2015 г.: таблицы 6–9. Таблицы по большей части пустые — рамка
# стоит на колонке целиком (шапка и строки), в других техпаспортах там значения.
AN_NAME, AN_LIT, AN_OUT = (425, 48, 574, 110), (152, 48, 420, 110), (580, 48, 692, 110)
AN_FOUND, AN_WALLS, AN_ROOF = (150, 116, 976, 150), (150, 155, 976, 189), (150, 194, 976, 228)
TP2015_FIGURES = [
    ('Таблица № 6. Описание материала конструкций основных строений', 5, (30, 40, 890, 402), [
        ((205, 58, 322, 400), LIT_STRUCT_FULL, (12, 82, 690, 484), 'Колонка «Литер»: материалы по элементам',
         'Литера · Конструктив и износ · Материал: Фундамент, Цоколь/подвал, Наружные стены, Внутренние стены, '
         'Перекрытия, Кровля, Полы, Окна, Двери, Отопление'),
    ]),
    ('Таблица № 7. Описание пристроек, примыкающих к основному строению', 5, (30, 440, 890, 765), [
        ((40, 470, 275, 760), LIT_ANNEX, AN_NAME, 'Наименование пристроек', 'Литера · Пристройки · Вид'),
        ((275, 470, 332, 760), LIT_ANNEX, AN_LIT, 'Литер', 'Литера · Пристройки · Литера'),
        ((332, 470, 396, 760), LIT_ANNEX, AN_FOUND, 'Фундамент', 'Литера · Пристройки · Фундамент'),
        ((465, 470, 536, 760), LIT_ANNEX, AN_WALLS, 'Стены', 'Литера · Пристройки · Стены'),
        ((650, 470, 702, 760), LIT_ANNEX, AN_ROOF, 'Кровли', 'Литера · Пристройки · Кровля'),
    ]),
    ('Таблица № 8. Наружные параметры основного строения и примыкающих пристроек', 5, (30, 790, 890, 1200), [
        ((188, 882, 540, 914), LIT_GEN, (4, 63, 332, 137), 'Наименование строения, литера',
         'Литера · Общие параметры · Литера, Наименование'),
        ((536, 880, 648, 910), LIT_AREAS_H, (6, 116, 489, 166), 'Площадь',
         'Литера · Площади и этажность · Площадь по внешним замерам'),
        ((652, 877, 760, 907), LIT_AREAS_H, (6, 590, 489, 640), 'Высота',
         'Литера · Площади и этажность · Высота по внешним замерам'),
        ((770, 870, 880, 900), LIT_GEN, (8, 138, 284, 194), 'Год постройки',
         'Литера · Общие параметры · Год постройки'),
        ((188, 912, 648, 1196), LIT_ANNEX, (152, 48, 692, 110), 'Строки пристроек: наименование, литера, площадь',
         'Литера · Пристройки · Литера, Вид, По внешним замерам'),
    ]),
    ('Таблица № 9. Сооружения и мелкие постройки', 6, (30, 40, 880, 668), [
        ((140, 75, 325, 662), LIT_ANNEX, AN_NAME, 'Наименование', 'Литера · Пристройки · Вид'),
        ((325, 75, 390, 662), LIT_ANNEX, AN_LIT, 'Литеры', 'Литера · Пристройки · Литера'),
        ((390, 95, 460, 662), LIT_ANNEX, AN_FOUND, 'Фундамент', 'Литера · Пристройки · Фундамент'),
        ((460, 95, 530, 662), LIT_ANNEX, AN_WALLS, 'Стены', 'Литера · Пристройки · Стены'),
        ((670, 95, 740, 662), LIT_ANNEX, AN_ROOF, 'Кровли', 'Литера · Пристройки · Кровля'),
        ((740, 75, 805, 662), LIT_ANNEX, AN_OUT, 'Основная площадь', 'Литера · Пристройки · По внешним замерам'),
    ]),
]

GA_FIGURES = [
    ('Площадь и целевое назначение', 2, (40, 650, 890, 1215), [
        ((675, 682, 771, 713), LAND_AREAS_GA, (491, 50, 972, 106), 'Площадь участка',
         'Земельный участок · Площади · По правоудостоверяющим документам'),
        ((255, 1160, 411, 1191), LAND_MAIN_TOP, (14, 160, 972, 190), 'Целевое назначение и категория',
         'Земельный участок · Основные параметры · Назначение по правоудостоверяющему документу'),
    ]),
    ('Идентификационный номер', 3, (330, 60, 690, 250), [
        ((400, 176, 586, 207), LAND_MAIN_ENI, (14, 84, 248, 115), 'Идентификационный номер',
         'Земельный участок · Основные параметры · ЕНИ'),
    ]),
    ('Ограничение права собственности на земельный участок', 6, (40, 240, 890, 960), [
        ((65, 485, 872, 940), LAND_MAIN_RIGHTS, (336, 545, 650, 576), 'Ограничения права',
         'Земельный участок · Основные параметры · Наличие сервитутов и обременений'),
    ]),
]

# Главы документа: (заголовок, PDF, как назван документ в таблице, страницы).
CHAPTERS = [
    ('Перенос техпаспорта в систему', PDF, 'Техпаспорт', TP_FIGURES),
    ('Перенос техпаспорта в систему: конструкции, пристройки и постройки', TP2015, 'Техпаспорт', TP2015_FIGURES),
    ('Перенос госакта в систему', GOSAKT, 'Госакт', GA_FIGURES),
]

COLORS = ['#D1495B', '#2E86AB', '#EDAE49', '#3B8B5A', '#8E5BB5', '#D9772B', '#1B998B']
PAGE_H = 1400      # высота страницы техпаспорта на картинке
SHOT_W = 1150      # ширина снимка системы на картинке
GAP = 230          # поле между страницей и снимками — под стрелки
PAD = 24


def font(size, bold=False):
    for name in (('segoeuib.ttf' if bold else 'segoeui.ttf'), 'arial.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def page_image(doc, n):
    pix = doc[n - 1].get_pixmap(dpi=DPI)
    return Image.frombytes('RGB', (pix.width, pix.height), pix.samples)


def shot_image(shot):
    img = Image.open(os.path.join(SHOTS, shot[0])).convert('RGB')
    crop = shot[2] if len(shot) > 2 else (0, 0, img.width, img.height)
    return img.crop(crop), crop


# Раскладка подбирается под широкий экран: оценка — сколько точек экрана
# приходится на пиксель самого мелкого исходника, когда разворот вписан в
# область VIEW_W x VIEW_H.
VIEW_W, VIEW_H = 1600, 1000
# Ширины куска страницы, из которых выбирается раскладка, пиксели разворота.
SOURCE_WIDTHS = (600, 820, 1050, 1300)
# Поля вокруг разворота и зазор между страницей и снимками под ней — под стрелки.
MARGIN = 60
BELOW_GAP = 110


def layout(doc, links, page, crop, under=(), src_w=820):
    """Один вариант раскладки разворота «кусок страницы → снимки системы».

    under — снимки, которые встают под кусок страницы; прочие идут колонкой
    справа. Возвращает (оценка, картинка, рамки на странице, рамки на
    снимках, прямоугольники картинок) — стрелки прокладывает route_links.
    """
    tp = page_image(doc, page)
    crop = crop or (0, 0, tp.width, tp.height)
    tp = tp.crop(crop)
    shots = []
    for _, shot, *_ in links:
        if shot not in shots:
            shots.append(shot)
    below = [sh for sh in shots if sh in under]
    right = [sh for sh in shots if sh not in below]
    s_tp = min(src_w / tp.width, PAGE_H / tp.height, 2.2)
    tp = tp.resize((int(tp.width * s_tp), int(tp.height * s_tp)), Image.LANCZOS)
    col_w = max(src_w, tp.width) if below else tp.width

    placed, blocks = {}, []
    src_x, src_y = MARGIN, MARGIN
    page_bot = src_y + tp.height

    def put(shot, x, y, w):
        img, scrop = shot_image(shot)
        k = w / img.width
        img = img.resize((w, int(img.height * k)), Image.LANCZOS)
        blocks.append((shot, img, x, y))
        placed[shot] = (x - scrop[0] * k, y + 34 - scrop[1] * k, k)
        return y + 34 + img.height + 40

    y = page_bot + BELOW_GAP
    for shot in below:
        y = put(shot, src_x, y, col_w)
    left_bot = y
    right_x = src_x + col_w + GAP
    y = MARGIN
    for shot in right:
        y = put(shot, right_x, y, SHOT_W)
    height = int(max(page_bot, left_bot - 40, y - 40) + MARGIN)
    width = int((right_x + SHOT_W if right else src_x + col_w) + MARGIN)
    fit = min(VIEW_W / width, VIEW_H / height)
    score = fit * min([s_tp] + [placed[sh][2] for sh in shots])

    canvas = Image.new('RGB', (width, height), 'white')
    canvas.paste(tp, (src_x, src_y))
    d = ImageDraw.Draw(canvas)
    cap_f = font(22, True)
    images = [(src_x, src_y, src_x + tp.width, page_bot)]
    for shot, img, x, top in blocks:
        d.text((x, top), shot[1], fill='#1F3A4D', font=cap_f)
        canvas.paste(img, (int(x), int(top + 34)))
        d.rectangle((x - 1, top + 33, x + img.width, top + 34 + img.height), outline='#B8C4CE', width=1)
        images.append((x, top, x + img.width, top + 34 + img.height))

    boxes = [tuple((v - crop[k % 2]) * s_tp + (src_x if k % 2 == 0 else src_y) for k, v in enumerate(l[0]))
             for l in links]
    targets = []
    for box, shot, sbox, *_ in links:
        sx, sy, k = placed[shot]
        targets.append((sx + sbox[0] * k, sy + sbox[1] * k, sx + sbox[2] * k, sy + sbox[3] * k))
    return score, canvas, boxes, targets, images


# Прокладка стрелок по сетке с шагом STEP: у каждой стрелки кратчайший путь
# с учётом цены — поворот, проход по картинке (там текст), пересечение
# чужой стрелки дороже простого шага; чужие рамки и наложение на чужую
# стрелку запрещены. Стрелка выходит из любой стороны рамки на странице и
# входит в поле с любой стороны. Сначала прокладываются короткие связи,
# затем каждая перекладывается ещё раз при уже проложенных остальных.
STEP = 10
COST_BEND = 10
COST_IMAGE = 6
COST_CROSS = 14
COST_NEAR = 3
DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))


def route_links(size, boxes, targets, images):
    W, H = size
    nx, ny = W // STEP + 1, H // STEP + 1
    base = bytearray([1]) * (nx * ny)
    for r in images:
        for iy in range(max(0, int(r[1] // STEP)), min(ny, int(r[3] // STEP) + 1)):
            for ix in range(max(0, int(r[0] // STEP)), min(nx, int(r[2] // STEP) + 1)):
                base[iy * nx + ix] = COST_IMAGE

    def cells(r, m):
        x0, y0, x1, y1 = r[0] - m, r[1] - m, r[2] + m, r[3] + m
        out = set()
        for iy in range(max(0, int(y0 // STEP)), min(ny, int(y1 // STEP) + 2)):
            cyp = iy * STEP
            if not (y0 <= cyp <= y1):
                continue
            for ix in range(max(0, int(x0 // STEP)), min(nx, int(x1 // STEP) + 2)):
                if x0 <= ix * STEP <= x1:
                    out.add(iy * nx + ix)
        return out

    all_rects = list(boxes) + list(targets)
    near = [cells(r, 12) for r in all_rects]
    own = [cells(r, 5) for r in all_rects]
    edge = set()
    for ix in range(nx):
        edge.add(ix); edge.add((ny - 1) * nx + ix)
    for iy in range(ny):
        edge.add(iy * nx); edge.add(iy * nx + nx - 1)
    n_links = len(boxes)

    def search(i, occ):
        src, tgt = boxes[i], targets[i]
        blocked = set(edge)
        for j, r in enumerate(near):
            if j != i and j != n_links + i:
                blocked |= r
        s_own, t_own = own[i], own[n_links + i]
        blocked |= s_own | t_own
        tx0, ty0, tx1, ty1 = [v / STEP for v in cells_bounds(tgt)]

        def h(idx):
            x, y = idx % nx, idx // nx
            return (max(tx0 - x, 0, x - tx1) + max(ty0 - y, 0, y - ty1))

        heap, best, parent = [], {}, {}
        scx, scy = (src[0] + src[2]) / 2, (src[1] + src[3]) / 2
        for c in s_own:
            x, y = c % nx, c // nx
            for d, (dx, dy) in enumerate(DIRS):
                n = (y + dy) * nx + (x + dx)
                if 0 <= x + dx < nx and 0 <= y + dy < ny and n not in blocked and n not in occ:
                    # выход ближе к середине стороны — дешевле
                    off = abs(n % nx * STEP - scx) if dy else abs(n // nx * STEP - scy)
                    g = 0.15 * off
                    key = n * 4 + d
                    if g < best.get(key, 1e18):
                        best[key] = g; parent[key] = None
                        heapq.heappush(heap, (g + h(n), g, key))
        goal = None
        while heap:
            f, g, key = heapq.heappop(heap)
            if key == -1:
                goal = g; break
            if g > best.get(key, 1e18):
                continue
            idx, d = divmod(key, 4)
            x, y = idx % nx, idx // nx
            for d2, (dx, dy) in enumerate(DIRS):
                if (d2 ^ 1) == d and d2 // 2 == d // 2:
                    continue  # назад
                x2, y2 = x + dx, y + dy
                if not (0 <= x2 < nx and 0 <= y2 < ny):
                    continue
                n = y2 * nx + x2
                turn = d2 != d
                if turn and idx in occ:
                    continue  # поворот на чужой стрелке — наложение
                if n in t_own:
                    if turn:
                        continue
                    g2 = g + 1
                    if g2 < best.get(-1, 1e18):
                        best[-1] = g2; parent[-1] = key
                        heapq.heappush(heap, (g2, g2, -1))
                    continue
                if n in blocked:
                    continue
                o = 'h' if d2 < 2 else 'v'
                c = base[n]
                if n in occ:
                    if o in occ[n] or 'c' in occ[n]:
                        continue
                    c += COST_CROSS
                if o == 'h':
                    if 'h' in occ.get(n - nx, ()) or 'h' in occ.get(n + nx, ()):
                        c += COST_NEAR
                elif 'v' in occ.get(n - 1, ()) or 'v' in occ.get(n + 1, ()):
                    c += COST_NEAR
                g2 = g + c + (COST_BEND if turn else 0)
                k2 = n * 4 + d2
                if g2 < best.get(k2, 1e18):
                    best[k2] = g2; parent[k2] = key
                    heapq.heappush(heap, (g2 + h(n), g2, k2))
        if goal is None:
            return None
        path, key = [], parent[-1]
        while key is not None:
            path.append(divmod(key, 4)); key = parent[key]
        path.reverse()
        return path

    def mark(path, occ):
        for k, (idx, d) in enumerate(path):
            s = occ.setdefault(idx, set())
            s.add('h' if d < 2 else 'v')
            if k + 1 < len(path) and path[k + 1][1] != d:
                s.add('c')
        if path:
            occ.setdefault(path[0][0], set()).add('c')
            occ.setdefault(path[-1][0], set()).add('c')

    def build_occ(paths, skip):
        occ = {}
        for j, p in enumerate(paths):
            if j != skip and p:
                mark(p, occ)
        return occ

    order = sorted(range(n_links), key=lambda i: abs((boxes[i][0] + boxes[i][2]) / 2 - (targets[i][0] + targets[i][2]) / 2)
                   + abs((boxes[i][1] + boxes[i][3]) / 2 - (targets[i][1] + targets[i][3]) / 2))
    paths = [None] * n_links
    for i in order:
        paths[i] = search(i, build_occ(paths, i))
    for _ in range(2):
        for i in order:
            p = search(i, build_occ(paths, i))
            if p:
                paths[i] = p

    geo = []
    for i in range(n_links):
        src, tgt, path = boxes[i], targets[i], paths[i]
        if not path:
            raise RuntimeError('стрелка %d не проложена' % (i + 1))
        pts = [((idx % nx) * STEP, (idx // nx) * STEP) for idx, _ in path]
        # начало — на стороне рамки, конец — на стороне поля
        (x0, y0), d0 = pts[0], path[0][1]
        start = {0: (src[2], y0), 1: (src[0], y0), 2: (x0, src[3]), 3: (x0, src[1])}[d0]
        (x1, y1), d1 = pts[-1], path[-1][1]
        end = {0: (tgt[0], y1), 1: (tgt[2], y1), 2: (x1, tgt[1]), 3: (x1, tgt[3])}[d1]
        pts = [start] + pts + [end]
        simple = [pts[0]]
        for k in range(1, len(pts) - 1):
            a, b, c = simple[-1], pts[k], pts[k + 1]
            if (a[0] == b[0] == c[0]) or (a[1] == b[1] == c[1]):
                continue
            simple.append(b)
        simple.append(pts[-1])
        geo.append((src, tgt, simple))
    return geo


def cells_bounds(r):
    return (r[0], r[1], r[2], r[3])


def best_layout(doc, page, crop, links):
    """Перебирает раскладки (ширина куска страницы; какие снимки под ним,
    какие справа) и оставляет ту, где самый мелкий исходник выходит на
    широком экране крупнее всего; затем прокладывает стрелки."""
    shots = []
    for _, shot, *_ in links:
        if shot not in shots:
            shots.append(shot)
    best = None
    for src_w in SOURCE_WIDTHS:
        for r in range(len(shots) + 1):
            for under in itertools.combinations(shots, r):
                res = layout(doc, links, page, crop, under, src_w)
                if best is None or res[0] > best[0] * 1.0001:
                    best = res
    _, canvas, boxes, targets, images = best
    return canvas, route_links(canvas.size, boxes, targets, images)


def esc(text):
    return html.escape(str(text), quote=True)


def badge_points(box, tgt, pts):
    """Где стоят номера связи: у рамки на странице — на стрелке сразу за
    рамкой (значение под рамкой не закрыто); у поля — в правом верхнем углу,
    где у поля нет подписи."""
    (ax, ay), (bx, by) = pts[0], pts[1]
    seg = math.hypot(bx - ax, by - ay) or 1
    d = min(26, seg)
    src = (ax + (bx - ax) * d / seg, ay + (by - ay) * d / seg)
    return src, (tgt[2] - 18, tgt[1])


def svg_links(geo, start):
    """Слой стрелок поверх разворота: у каждой связи своя группа, чтобы её
    можно было подсветить из таблицы."""
    out = []
    for i, (box, tgt, pts) in enumerate(geo):
        n, color = start + i, COLORS[i % len(COLORS)]
        line = ' '.join('%.0f,%.0f' % p for p in pts)
        (ax, ay), (bx, by) = pts[-2], pts[-1]
        ang = math.atan2(by - ay, bx - ax)
        L, W = 22, 11
        head = [(bx, by),
                (bx - L * math.cos(ang) + W * math.sin(ang), by - L * math.sin(ang) - W * math.cos(ang)),
                (bx - L * math.cos(ang) - W * math.sin(ang), by - L * math.sin(ang) + W * math.cos(ang))]
        rect = lambda r: '<rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" rx="3"/>' % (
            r[0], r[1], r[2] - r[0], r[3] - r[1])
        badge_svg = lambda x, y: ('<g class="badge"><circle cx="%.0f" cy="%.0f" r="17"/>'
                                  '<text x="%.0f" y="%.0f">%d</text></g>' % (x, y, x, y + 7, n))
        out.append(
            '<g class="lk" data-link="%d" style="--c:%s">%s%s<polyline points="%s"/>'
            '<polygon points="%s"/>%s%s</g>' % (
                n, color, rect(box), rect(tgt), line,
                ' '.join('%.0f,%.0f' % p for p in head),
                badge_svg(*badge_points(box, tgt, pts)[0]), badge_svg(*badge_points(box, tgt, pts)[1])))
    return ''.join(out)


def build():
    parts, toc = [], []
    total = 0
    for c, (chapter, pdf_path, name, figures) in enumerate(CHAPTERS):
        pdf = fitz.open(pdf_path)
        cid = 'ch%d' % (c + 1)
        toc.append('<li class="toc-ch"><a href="#%s">%s</a><ol>' % (cid, esc(chapter)))
        parts.append('<section class="chapter" id="%s"><h2>%s</h2>' % (cid, esc(chapter)))
        n = 1
        for i, (title, page, crop, links) in enumerate(figures):
            canvas, geo = best_layout(pdf, page, crop, links)
            buf = io.BytesIO()
            canvas.save(buf, 'JPEG', quality=86, optimize=True)
            data = base64.b64encode(buf.getvalue()).decode()
            fid = '%s-%d' % (cid, i + 1)
            toc.append('<li><a href="#%s">%s <span>стр. %d</span></a></li>' % (fid, esc(title), page))
            rows = ''.join(
                '<tr data-link="%d"><td class="num"><span style="--c:%s">%d</span></td><td>%s</td><td>%s</td></tr>' % (
                    n + k, COLORS[k % len(COLORS)], n + k, esc(l[3]), esc(l[4]))
                for k, l in enumerate(links))
            parts.append(
                '<article class="fig" id="%s"><header><h3>%s</h3><span class="page">%s, стр. %d</span></header>'
                '<div class="stage" tabindex="0" title="Открыть крупно">'
                '<svg viewBox="0 0 %d %d" role="img" aria-label="%s">'
                '<image href="data:image/jpeg;base64,%s" width="%d" height="%d"/>%s</svg></div>'
                '<table class="links"><thead><tr><th>№</th><th>%s</th><th>Система</th></tr></thead>'
                '<tbody>%s</tbody></table></article>' % (
                    fid, esc(title), esc(name), page, canvas.width, canvas.height, esc(title),
                    data, canvas.width, canvas.height, svg_links(geo, n), esc(name), rows))
            n += len(links)
        total += n - 1
        toc.append('</ol></li>')
        parts.append('</section>')
    page_html = TEMPLATE.replace('{{TOC}}', ''.join(toc)).replace('{{BODY}}', ''.join(parts))
    with io.open(OUT_HTML, 'w', encoding='utf-8') as f:
        f.write(page_html)
    return total


TEMPLATE = '''<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Перенос документов в систему</title>
<style>
:root{
  --bg:#EEF2F5; --card:#FFFFFF; --ink:#1C2A35; --muted:#5F7180; --line:#D5DDE3;
  --accent:#1F5F8B; --accent-soft:#E3EEF6; --shadow:0 1px 2px rgba(20,40,60,.06),0 4px 16px rgba(20,40,60,.06);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:16px}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.5 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif}
.layout{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:100vh}
nav{position:sticky;top:0;height:100vh;overflow:auto;padding:24px 18px 32px;
  background:var(--card);border-right:1px solid var(--line)}
nav h1{font-size:18px;line-height:1.3;margin:0 0 18px;text-wrap:balance}
nav ol{list-style:none;margin:0;padding:0}
.toc-ch{margin:0 0 16px}
.toc-ch>a{display:block;font-weight:600;font-size:13px;letter-spacing:.02em;color:var(--muted);
  text-decoration:none;margin-bottom:6px;text-transform:uppercase}
.toc-ch ol a{display:block;padding:6px 10px;border-radius:6px;color:var(--ink);text-decoration:none;font-size:14px}
.toc-ch ol a span{display:block;color:var(--muted);font-size:12px}
.toc-ch ol a:hover{background:var(--accent-soft)}
.toc-ch ol a.on{background:var(--accent-soft);color:var(--accent);font-weight:600}
main{padding:28px 32px 80px;max-width:1800px}
.chapter>h2{font-size:22px;margin:8px 0 18px;text-wrap:balance}
.chapter+.chapter{margin-top:44px}
.fig{background:var(--card);border-radius:10px;box-shadow:var(--shadow);padding:18px 20px 20px;margin:0 0 28px}
.fig header{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 16px;margin-bottom:12px}
.fig h3{font-size:17px;margin:0;text-wrap:balance}
.fig .page{color:var(--muted);font-size:13px}
.stage{cursor:zoom-in;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:#fff}
.stage:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.stage svg{display:block;width:100%;height:auto}
.lk rect{fill:none;stroke:var(--c);stroke-width:4}
.lk polyline{fill:none;stroke:var(--c);stroke-width:4;stroke-linejoin:round}
.lk polygon{fill:var(--c)}
.lk .badge circle{fill:var(--c);stroke:#fff;stroke-width:3}
.lk .badge text{fill:#fff;font:700 20px "Segoe UI",Arial,sans-serif;text-anchor:middle}
.lk{transition:opacity .15s}
svg.hl .lk{opacity:.12}
svg.hl .lk.on{opacity:1}
svg.hl .lk.on polyline,svg.hl .lk.on rect{stroke-width:7}
table.links{width:100%;border-collapse:collapse;margin-top:14px;font-size:14px}
.links th{text-align:left;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);
  font-weight:600;padding:6px 10px;border-bottom:1px solid var(--line)}
.links td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.links th:first-child,.links td.num{width:52px}
.links th:nth-child(2){width:38%}
.links td.num span{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;
  border-radius:13px;background:var(--c);color:#fff;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums}
.links tr{cursor:default}
.links tr.on td{background:var(--accent-soft)}
/* Просмотр крупно */
.viewer{position:fixed;inset:0;background:rgba(18,28,36,.92);display:none;z-index:10}
.viewer.open{display:block}
.viewer .top{position:absolute;left:0;right:0;top:0;height:60px;display:flex;align-items:center;gap:16px;
  padding:0 14px 0 20px;background:#15212B;z-index:2}
.viewer .pane{position:absolute;left:0;right:0;top:60px;bottom:0;overflow:hidden;cursor:grab}
.viewer .pane.drag{cursor:grabbing}
.viewer svg{position:absolute;left:0;top:0;transform-origin:0 0;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.4)}
.viewer .bar{display:flex;gap:8px;margin-left:auto}
.viewer .title{color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.viewer .hint{color:#9FB2C0;font-size:13px;white-space:nowrap}
.viewer button{font:600 14px "Segoe UI",Arial,sans-serif;min-width:40px;height:40px;padding:0 12px;border:0;border-radius:8px;
  background:#fff;color:var(--ink);cursor:pointer}
.viewer button:hover{background:var(--accent-soft)}
.viewer button:focus-visible{outline:3px solid #8FC3E8}
@media (max-width:900px){
  .layout{grid-template-columns:1fr}
  nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}
  main{padding:16px}
  .fig{padding:14px}
}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.lk{transition:none}}
@media print{nav,.viewer{display:none}.layout{display:block}.fig{break-inside:avoid;box-shadow:none}}
</style>
</head>
<body>
<div class="layout">
<nav aria-label="Оглавление"><h1>Перенос документов в систему</h1><ol>{{TOC}}</ol></nav>
<main>{{BODY}}</main>
</div>
<div class="viewer" role="dialog" aria-modal="true" aria-label="Разворот крупно">
  <div class="top">
  <div class="title"></div>
  <div class="hint">Колесо — масштаб · перетаскивание — сдвиг · двойной щелчок — по окну</div>
  <div class="bar">
    <button type="button" data-z="out" title="Мельче (−)">−</button>
    <button type="button" data-z="fit" title="По размеру окна (0)">По окну</button>
    <button type="button" data-z="in" title="Крупнее (+)">+</button>
    <button type="button" data-z="close" title="Закрыть (Esc)">✕</button>
  </div>
  </div>
  <div class="pane"></div>
</div>
<script>
(function(){
  // Подсветка связи: строка таблицы <-> стрелка на развороте.
  function mark(fig, n){
    fig.querySelectorAll('svg').forEach(function(s){ s.classList.toggle('hl', !!n); });
    fig.querySelectorAll('[data-link]').forEach(function(el){
      el.classList.toggle('on', !!n && el.getAttribute('data-link') === n);
    });
  }
  document.querySelectorAll('.fig').forEach(function(fig){
    fig.addEventListener('mouseover', function(e){
      var el = e.target.closest('[data-link]');
      mark(fig, el ? el.getAttribute('data-link') : null);
    });
    fig.addEventListener('mouseleave', function(){ mark(fig, null); });
  });

  // Оглавление: отмечается разворот, который сейчас на экране.
  var tocLinks = {};
  document.querySelectorAll('nav ol ol a').forEach(function(a){ tocLinks[a.getAttribute('href').slice(1)] = a; });
  if ('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if (en.isIntersecting){
          Object.keys(tocLinks).forEach(function(k){ tocLinks[k].classList.toggle('on', k === en.target.id); });
        }
      });
    }, {rootMargin:'-40% 0px -55% 0px'});
    document.querySelectorAll('.fig').forEach(function(f){ io.observe(f); });
  }

  // Просмотр крупно: масштаб колесом к точке под курсором, сдвиг перетаскиванием.
  var viewer = document.querySelector('.viewer'), pane = viewer.querySelector('.pane');
  var svg = null, W = 0, H = 0, z = 1, x = 0, y = 0, lastFocus = null;
  function apply(){ svg.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + z + ')'; }
  function fit(){
    var r = pane.getBoundingClientRect();
    z = Math.min((r.width - 40) / W, (r.height - 40) / H);
    x = (r.width - W * z) / 2; y = (r.height - H * z) / 2; apply();
  }
  function zoomAt(k, cx, cy){
    var nz = Math.min(6, Math.max(0.1, z * k));
    x = cx - (cx - x) * nz / z; y = cy - (cy - y) * nz / z; z = nz; apply();
  }
  function open(fig){
    var src = fig.querySelector('svg');
    svg = src.cloneNode(true);
    var vb = src.viewBox.baseVal; W = vb.width; H = vb.height;
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    pane.innerHTML = ''; pane.appendChild(svg);
    viewer.querySelector('.title').textContent = fig.querySelector('h3').textContent;
    lastFocus = document.activeElement;
    viewer.classList.add('open'); document.body.style.overflow = 'hidden';
    fit(); viewer.querySelector('[data-z="close"]').focus();
  }
  function close(){
    viewer.classList.remove('open'); document.body.style.overflow = ''; pane.innerHTML = '';
    if (lastFocus) lastFocus.focus();
  }
  document.querySelectorAll('.stage').forEach(function(st){
    st.addEventListener('click', function(){ open(st.closest('.fig')); });
    st.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(st.closest('.fig')); } });
  });
  viewer.querySelector('.bar').addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    var r = pane.getBoundingClientRect(), a = b.getAttribute('data-z');
    if (a === 'close') close();
    else if (a === 'fit') fit();
    else zoomAt(a === 'in' ? 1.25 : 0.8, r.width / 2, r.height / 2);
  });
  pane.addEventListener('wheel', function(e){
    e.preventDefault();
    var r = pane.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  }, {passive:false});
  var drag = null;
  pane.addEventListener('pointerdown', function(e){
    drag = {px:e.clientX, py:e.clientY, x:x, y:y}; pane.setPointerCapture(e.pointerId); pane.classList.add('drag');
  });
  pane.addEventListener('pointermove', function(e){
    if (!drag) return; x = drag.x + e.clientX - drag.px; y = drag.y + e.clientY - drag.py; apply();
  });
  pane.addEventListener('pointerup', function(){ drag = null; pane.classList.remove('drag'); });
  pane.addEventListener('dblclick', fit);
  document.addEventListener('keydown', function(e){
    if (!viewer.classList.contains('open')) return;
    var r = pane.getBoundingClientRect();
    if (e.key === 'Escape') close();
    else if (e.key === '+' || e.key === '=') zoomAt(1.25, r.width / 2, r.height / 2);
    else if (e.key === '-') zoomAt(0.8, r.width / 2, r.height / 2);
    else if (e.key === '0') fit();
  });
  window.addEventListener('resize', function(){ if (viewer.classList.contains('open')) fit(); });
})();
</script>
</body>
</html>
'''


if __name__ == '__main__':
    print('связей:', build())
    print(OUT_HTML)
