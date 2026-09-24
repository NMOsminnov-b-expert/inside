# -*- coding: utf-8 -*-
"""Перенос техпаспорта в систему: графы страниц техпаспорта стрелками к блокам
и полям рабочей системы.

Исходники — локальная папка «Примеры доков» (в .gitignore: реальный документ
учреждения и снимки рабочей системы): сканы техпаспорта и госакта в PDF и снимки
блоков системы в «Фото системы». Результат ложится туда же — в git не попадает.

Правила переноса (граф знаний: ref:tehpasport-sostav, ответы пользователя
24.09.2026) определяют, какие графы связаны со стрелками; сами правила в
документ не пишутся — в нём только связи «графа → блок (поле)».

Координаты рамок заданы в пикселях страницы, отрисованной при 110 dpi
(910 × 1287), и в пикселях снимков системы — по их исходному размеру.

    python tools/docs/build_tp_v_sistemu.py

На выходе — «Примеры доков/Перенос техпаспорта в систему.docx» и картинки в
«Примеры доков/Перенос техпаспорта в систему/».
"""
import itertools
import os

import fitz
from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.shared import Cm, Pt
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'Примеры доков')
SHOTS = os.path.join(SRC, 'Фото системы')
PDF = os.path.join(SRC, '0190 г.Кант ул.Куттубека Тагаева 3-ДС МИС_техпаспорт.pdf')
GOSAKT = os.path.join(SRC, 'Госакт Б 028723.pdf')
TP2015 = os.path.join(SRC, 'с. Чет Булак, ул. Чет Булак 1, д. 7 Баня 0183 нет пуд_техпаспорт.pdf')
OUT_DOCX = os.path.join(SRC, 'Разметка техпаспорта (хар-ка строений и сооружений).docx')
OUT_DIR = os.path.join(SRC, 'Перенос техпаспорта в систему')
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
        ((58, 140, 720, 174), OC_PLACE, (18, 66, 934, 142), 'Идентификационный код',
         'Объект оценки · Местоположение · Код ЕНИ'),
        ((58, 226, 792, 270), OC_PLACE, (15, 158, 932, 327), 'Адрес',
         'Объект оценки · Местоположение · Область, Город или село, Район, Улица, Дом'),
        ((58, 360, 792, 424), LIT_GEN, (288, 208, 562, 270), 'Назначение недвижимости',
         'Литера · Общие параметры · Назначение по тех паспорту'),
        ((66, 450, 787, 762), OC_PARTIES, (6, 158, 702, 197), 'Собственник, часть (доля), документы на право '
         'собственности', 'Объект оценки · Учреждение, собственники и ответственные · Собственник: наименование, '
         'доля, ПУД'),
        ((66, 783, 787, 967), OC_PARTIES, (6, 199, 702, 239), 'Пользователь, часть (доля), документы на право '
         'пользования', 'Объект оценки · Учреждение, собственники и ответственные · Пользователь'),
    ]),
    ('Экспликация к плану основных строений, 1 этаж', 3, (30, 130, 415, 700), [
        ((214, 650, 404, 678), LIT_AREAS, (63, 421, 414, 454), 'Итого по этажу (1 этаж), общая площадь',
         'Литера · Площади и этажность · Надземные, строка «1 этаж», по внутреннему обмеру'),
    ]),
    ('Экспликация к плану основных строений, 2 этаж и всего', 4, (30, 130, 415, 900), [
        ((208, 782, 400, 806), LIT_AREAS, (63, 457, 414, 491), 'Всего по этажу (2 этаж), общая площадь',
         'Литера · Площади и этажность · Надземные, строка «2 этаж», по внутреннему обмеру'),
        ((208, 854, 400, 880), LIT_AREAS, (493, 38, 979, 97), 'Всего, общая площадь',
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
        ((190, 876, 560, 906), LIT_GEN, (4, 63, 332, 137), 'Наименование строения, литера',
         'Литера · Общие параметры · Литера, Наименование'),
        ((560, 876, 670, 906), LIT_AREAS_H, (6, 116, 489, 166), 'Площадь',
         'Литера · Площади и этажность · Площадь по внешним замерам'),
        ((670, 876, 770, 906), LIT_AREAS_H, (6, 590, 489, 640), 'Высота',
         'Литера · Площади и этажность · Высота по внешним замерам'),
        ((770, 876, 880, 906), LIT_GEN, (8, 138, 284, 194), 'Год постройки',
         'Литера · Общие параметры · Год постройки'),
        ((190, 908, 670, 1196), LIT_ANNEX, (152, 48, 692, 110), 'Строки пристроек: наименование, литера, площадь',
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
GAP = 260          # поле между страницей и снимками — под стрелки
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


def badge(draw, x, y, num, color):
    r = 17
    draw.ellipse((x - r, y - r, x + r, y + r), fill=color, outline='white', width=3)
    f = font(20, True)
    w = draw.textlength(str(num), font=f)
    draw.text((x - w / 2, y - 13), str(num), fill='white', font=f)


def arrow(draw, a, b, color):
    draw.line([a, b], fill=color, width=4)
    import math
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    L, W = 22, 11
    p1 = (b[0] - L * math.cos(ang) + W * math.sin(ang), b[1] - L * math.sin(ang) - W * math.cos(ang))
    p2 = (b[0] - L * math.cos(ang) - W * math.sin(ang), b[1] - L * math.sin(ang) + W * math.cos(ang))
    draw.polygon([b, p1, p2], fill=color)


def shot_image(shot):
    img = Image.open(os.path.join(SHOTS, shot[0])).convert('RGB')
    crop = shot[2] if len(shot) > 2 else (0, 0, img.width, img.height)
    return img.crop(crop), crop


# Место под картинку на листе, см: книжный и альбомный лист A4 с полями 1,5 см.
PORTRAIT_BOX = (18.0, 22.0)
LANDSCAPE_BOX = (26.7, 16.5)


def fit_on_sheet(w, h):
    """Лучший лист для картинки w x h: (книжный ли, см на пиксель картинки)."""
    fp = min(PORTRAIT_BOX[0] / w, PORTRAIT_BOX[1] / h)
    fl = min(LANDSCAPE_BOX[0] / w, LANDSCAPE_BOX[1] / h)
    return (True, fp) if fp > fl else (False, fl)


def figure(doc, links, page, crop, under=()):
    """Картинка «кусок страницы → снимки системы» в одной раскладке.

    under — снимки, которые встают под кусок страницы; прочие идут колонкой
    справа. Возвращает картинку, книжный ли лист и оценку: сколько
    сантиметров листа приходится на пиксель самого мелкого из исходников
    (страницы или снимка) — чем больше, тем крупнее и читаемее.
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
    # Ширина левой колонки: всё под страницей — 1300, часть под страницей —
    # 1150 (по снимку), иначе страница до 820, остальное снимкам справа.
    col_w = 1300 if not right else (1150 if below else 820)
    s_tp = min(col_w / tp.width, PAGE_H / tp.height, 2.2)
    tp = tp.resize((int(tp.width * s_tp), int(tp.height * s_tp)), Image.LANCZOS)
    col_w = max(col_w, tp.width) if below else tp.width

    # Стрелки идут как на схеме соединений, не поперёк страницы:
    #   к снимку под страницей — вниз до своей полосы под страницей, влево до
    #   своего коридора у левого края и горизонтально в поле;
    #   к снимку справа — вправо (если правее рамки пусто), вверх или вниз до
    #   своей полосы, по коридору между колонками и горизонтально в поле.
    LANE = 20
    boxes = [[(v - crop[k % 2]) * s_tp for k, v in enumerate(l[0])] for l in links]

    def exit_of(i):
        bx = boxes[i]
        if links[i][1] in below:
            return 'left'
        tall = (bx[3] - bx[1]) > (bx[2] - bx[0])
        blocked = any(o is not bx and o[0] >= bx[2] - 2 and o[1] < bx[3] and o[3] > bx[1] for o in boxes)
        if not tall and not blocked and bx[2] >= 0.78 * tp.width:
            return 'right'
        if tall or (bx[1] + bx[3]) / 2 < tp.height / 2:
            return 'up'
        return 'down'
    exits = [exit_of(i) for i in range(len(links))]
    ups = sorted((i for i, e in enumerate(exits) if e == 'up'), key=lambda i: boxes[i][0])
    downs = sorted((i for i, e in enumerate(exits) if e == 'down'), key=lambda i: boxes[i][0])
    lefts = [i for i, e in enumerate(exits) if e == 'left']
    top_m = (LANE * len(ups) + 14) if ups else 0
    bot_n = len(downs) + len(lefts)
    bot_m = (LANE * bot_n + 14) if bot_n else 0
    lstep = 22
    left_g = (40 + lstep * len(lefts)) if lefts else 0

    cap_f = font(22, True)
    placed, blocks = {}, []
    src_x, src_y = PAD + left_g, PAD + top_m
    page_bot = src_y + tp.height

    def put(shot, x, y, w):
        img, scrop = shot_image(shot)
        k = w / img.width
        img = img.resize((w, int(img.height * k)), Image.LANCZOS)
        blocks.append((shot, img, x, y))
        placed[shot] = (x - scrop[0] * k, y + 34 - scrop[1] * k, k)
        return y + 34 + img.height + 40

    y = page_bot + bot_m + 20
    for shot in below:
        y = put(shot, src_x, y, col_w)
    left_bot = y
    right_x = src_x + col_w + GAP
    y = PAD
    for shot in right:
        y = put(shot, right_x, y, SHOT_W)
    height = max(page_bot + bot_m + PAD, left_bot, y)
    width = (right_x + SHOT_W if right else src_x + col_w) + PAD
    portrait, fit = fit_on_sheet(width, height)
    score = fit * min([s_tp] + [placed[sh][2] for sh in shots])

    canvas = Image.new('RGB', (int(width), int(height)), 'white')
    canvas.paste(tp, (src_x, src_y))
    d = ImageDraw.Draw(canvas)
    for shot, img, x, top in blocks:
        d.text((x, top), shot[1], fill='#1F3A4D', font=cap_f)
        canvas.paste(img, (int(x), int(top + 34)))
        d.rectangle((x - 1, top + 33, x + img.width, top + 34 + img.height), outline='#B8C4CE', width=1)

    targets = []
    for box, shot, sbox, *_ in links:
        sx, sy, k = placed[shot]
        targets.append((sx + sbox[0] * k, sy + sbox[1] * k, sx + sbox[2] * k, sy + sbox[3] * k))
    cy = lambda i: (targets[i][1] + targets[i][3]) / 2
    lane_y, gutter = {}, {}
    for k, i in enumerate(ups):
        lane_y[i] = PAD + 6 + k * LANE
    # Левые коридоры: полю ниже всех — внешний коридор и верхняя полоса, тогда
    # полосы не режут коридоры, а входы в поля — чужие коридоры.
    lefts.sort(key=lambda i: -cy(i))
    for k, i in enumerate(lefts):
        lane_y[i] = page_bot + 8 + k * LANE
        gutter[i] = PAD + 12 + k * lstep
    for k, i in enumerate(downs):
        lane_y[i] = page_bot + 8 + (len(lefts) + len(downs) - 1 - k) * LANE
    rights = sorted((i for i in range(len(links)) if exits[i] != 'left'), key=lambda i: -cy(i))
    step = min(26, (GAP - 70) / max(len(rights) - 1, 1))
    for g, i in enumerate(rights):
        gutter[i] = src_x + col_w + 30 + g * step

    for i, (box, shot, sbox, what, where) in enumerate(links):
        color = COLORS[i % len(COLORS)]
        x0, y0, x1, y1 = boxes[i]
        x0, x1, y0, y1 = x0 + src_x, x1 + src_x, y0 + src_y, y1 + src_y
        d.rectangle((x0, y0, x1, y1), outline=color, width=4)
        a0, b0, a1, b1 = targets[i]
        d.rectangle((a0, b0, a1, b1), outline=color, width=4)
        gx, ty = gutter[i], (b0 + b1) / 2
        if exits[i] == 'right':
            pts = [(x1, (y0 + y1) / 2), (gx, (y0 + y1) / 2)]
        else:
            cx = (x0 + x1) / 2
            pts = [(cx, y0 if exits[i] == 'up' else y1), (cx, lane_y[i]), (gx, lane_y[i])]
        pts.append((gx, ty))
        d.line(pts, fill=color, width=4, joint='curve')
        arrow(d, (gx, ty), (a0 - 4, ty), color)
    return canvas, portrait, score, (boxes, targets, src_x, src_y)


def best_figure(doc, chapter, name, title, page, crop, links, start):
    """Перебирает раскладки (какие снимки под страницей, какие справа) и
    оставляет ту, где самый мелкий исходник выходит на листе крупнее всего."""
    shots = []
    for _, shot, *_ in links:
        if shot not in shots:
            shots.append(shot)
    best = None
    for r in range(len(shots) + 1):
        for under in itertools.combinations(shots, r):
            res = figure(doc, links, page, crop, under)
            if best is None or res[2] > best[2] * 1.0001:
                best = res
    canvas, portrait, _, (boxes, targets, src_x, src_y) = best
    d = ImageDraw.Draw(canvas)
    rows = []
    for i, (box, shot, sbox, what, where) in enumerate(links):
        n, color = start + i, COLORS[i % len(COLORS)]
        badge(d, boxes[i][0] + src_x, boxes[i][1] + src_y, n, color)
        badge(d, targets[i][0], targets[i][1], n, color)
        rows.append((n, what, where))
    path = os.path.join(OUT_DIR, '%d. %s, стр. %02d — %s.png' % (chapter, name, page, title))
    canvas.save(path)
    return path, rows, portrait


def set_page(sec, portrait):
    sec.orientation = WD_ORIENT.PORTRAIT if portrait else WD_ORIENT.LANDSCAPE
    sec.page_width, sec.page_height = (Cm(21.0), Cm(29.7)) if portrait else (Cm(29.7), Cm(21.0))
    for side in ('left_margin', 'right_margin', 'top_margin', 'bottom_margin'):
        setattr(sec, side, Cm(1.5))


def build():
    os.makedirs(OUT_DIR, exist_ok=True)
    # Папка картинок целиком собирается сборщиком — старые снимки убираются.
    for f in os.listdir(OUT_DIR):
        if f.endswith('.png'):
            os.remove(os.path.join(OUT_DIR, f))
    doc = Document()
    doc.styles['Normal'].font.name = 'Calibri'
    doc.styles['Normal'].font.size = Pt(10)
    total, first = 0, True
    for c, (chapter, pdf_path, name, figures) in enumerate(CHAPTERS):
        pdf = fitz.open(pdf_path)
        n = 1
        for i, (title, page, crop, links) in enumerate(figures):
            path, rows, portrait = best_figure(pdf, c + 1, name, title, page, crop, links, n)
            n += len(links)
            # Каждая картинка — на своём листе: высокая на книжном, широкая на альбомном.
            sec = doc.sections[0] if first else doc.add_section(WD_SECTION.NEW_PAGE)
            first = False
            set_page(sec, portrait)
            if i == 0:
                doc.add_heading(chapter, level=1)
            doc.add_heading('%s (стр. %d)' % (title, page), level=2)
            # Картинка вписывается в лист; таблица связей идёт следом и при
            # нехватке места уходит на следующий лист.
            box_w, box_h = PORTRAIT_BOX if portrait else LANDSCAPE_BOX
            with Image.open(path) as im:
                ratio = im.width / im.height
            if ratio >= box_w / box_h:
                doc.add_picture(path, width=Cm(box_w))
            else:
                doc.add_picture(path, height=Cm(box_h))
            t = doc.add_table(rows=1, cols=3)
            t.style = 'Light Grid Accent 1'
            for cell, text in zip(t.rows[0].cells, ('№', name, 'Система')):
                cell.text = text
            for num, what, where in rows:
                cells = t.add_row().cells
                cells[0].text, cells[1].text, cells[2].text = str(num), what, where
            widths = (Cm(1.2), Cm(6), Cm(10.8)) if portrait else (Cm(1.2), Cm(9), Cm(16.5))
            for row in t.rows:
                for cell, w in zip(row.cells, widths):
                    cell.width = w
        total += n - 1
    doc.save(OUT_DOCX)
    return total


if __name__ == '__main__':
    print('связей:', build())
    print(OUT_DOCX)
