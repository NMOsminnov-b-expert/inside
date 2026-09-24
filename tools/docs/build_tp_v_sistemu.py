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

Рамки и стрелки правятся мышью прямо на странице («Править разметку»);
«Сохранить в файл» перезаписывает сам HTML, правки лежат в нём блоком
box-edits. При пересборке сборщик читает этот блок и ставит рамки (и
стрелки, если раскладка разворота не поменялась) по правкам — они важнее
координат в FIGURES.

На выходе — «Примеры доков/Перенос документов в систему.html»: один файл,
картинки внутри, открывается в браузере без интернета. Оглавление по главам,
подсветка связи при наведении на строку таблицы или стрелку, просмотр
разворота крупно (колесо — масштаб, перетаскивание — сдвиг).
"""
import base64
import heapq
import json
import html
import io
import itertools
import math
import os
import re

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
LAND_NET = ('Участок — 03 Инженерные сети.png', 'Земельный участок · 03 Инженерные сети', (0, 0, 999, 185))
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
    ('Таблицы № 1 и 2. Местонахождение, регистрация', 1, (40, 10, 880, 835), [
        ((62, 36, 642, 70), OC_PLACE, (18, 66, 934, 142), 'Идентификационный код',
         'Объект оценки · Местоположение · Код ЕНИ'),
        ((588, 262, 818, 292), LIT_GEN, (288, 208, 562, 270), 'Назначение недвижимости',
         'Литера · Общие параметры · Назначение по тех паспорту'),
        ((62, 418, 818, 540), OC_PARTIES, (6, 158, 702, 197), 'Дата регистрации, собственник, документ на право собственности',
         'Объект оценки · Учреждение, собственники и ответственные · Собственник: наименование, ПУД'),
        ((62, 745, 818, 828), OC_PARTIES, (6, 199, 702, 239), 'Дата регистрации, пользователь, документ на право пользования',
         'Объект оценки · Учреждение, собственники и ответственные · Пользователь'),
    ]),
    ('Таблица № 3. Показатели по площади', 1, (40, 830, 880, 1262), [
        ((445, 1093, 528, 1114), LAND_AREAS, (491, 128, 972, 182), 'Всего застроено',
         'Земельный участок · Площади · Застроенная площадь'),
        ((712, 1212, 802, 1236), LAND_AREAS, (8, 50, 489, 106), 'Площадь участка по правоустанавливающим документам',
         'Земельный участок · Площади · По правоустанавливающим документам'),
        ((445, 1220, 632, 1246), LAND_AREAS, (8, 128, 489, 182), 'Фактическая площадь участка',
         'Земельный участок · Площади · По факту'),
    ]),
    ('Таблица № 4. Экспликация к плану основных строений', 2, (30, 20, 880, 450), [
        ((298, 418, 366, 442), LIT_AREAS, (63, 421, 414, 454), 'Итого, общая площадь',
         'Литера · Площади и этажность · Надземные, строка этажа, по внутреннему обмеру'),
    ]),
    ('Таблица № 5. Строения на участке и их благоустройство', 2, (30, 960, 880, 1185), [
        ((185, 1146, 238, 1178), LAND_NET, (340, 55, 656, 100), 'Водопроводом',
         'Земельный участок · Инженерные сети · Наличие водоснабжения'),
        ((238, 1146, 297, 1178), LAND_NET, (665, 55, 982, 100), 'Канализацией',
         'Земельный участок · Инженерные сети · Наличие канализации'),
        ((297, 1146, 383, 1178), LAND_NET, (340, 127, 656, 172), 'Центральным отоплением',
         'Земельный участок · Инженерные сети · Наличие отопления'),
        ((441, 1146, 500, 1178), LAND_NET, (16, 55, 332, 100), 'Электроосвещением',
         'Земельный участок · Инженерные сети · Наличие электроснабжения'),
        ((500, 1146, 556, 1178), LAND_NET, (16, 127, 332, 172), 'Газом',
         'Земельный участок · Инженерные сети · Наличие газификации'),
    ]),
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
    ('Перенос техпаспорта бланка 2015 г. в систему', TP2015, 'Техпаспорт', TP2015_FIGURES),
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
BELOW_GAP = 150


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
    # Пересчёт координат разворота в исходные: страница — (v - o) / s,
    # снимок — так же, по своему смещению и масштабу.
    smap = (src_x - crop[0] * s_tp, src_y - crop[1] * s_tp, s_tp)
    tmaps = [placed[l[1]] for l in links]
    return score, canvas, boxes, targets, images, smap, tmaps


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
            # Пути нет (рамка правлена руками и легла на чужую) — простой излом.
            sy_, ty_ = (src[1] + src[3]) / 2, (tgt[1] + tgt[3]) / 2
            mx = (src[2] + tgt[0]) / 2
            geo.append((src, tgt, [(src[2], sy_), (mx, sy_), (mx, ty_), (tgt[0], ty_)]))
            continue
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
    _, canvas, boxes, targets, images, smap, tmaps = best
    return canvas, route_links(canvas.size, boxes, targets, images), smap, tmaps


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


def svg_links(geo, start, keys, whats, smap, tmaps):
    """Слой стрелок поверх разворота: у каждой связи своя группа, чтобы её
    можно было подсветить из таблицы и поправить мышью. В группе — ключ
    связи, пересчёт координат в исходные и исходное положение для отката."""
    out = []
    fmt = lambda v: '%.1f' % v
    for i, (box, tgt, pts) in enumerate(geo):
        n, color = start + i, COLORS[i % len(COLORS)]
        line = ' '.join('%.1f,%.1f' % p for p in pts)
        (ax, ay), (bx, by) = pts[-2], pts[-1]
        ang = math.atan2(by - ay, bx - ax)
        L, W = 22, 11
        head = [(bx, by),
                (bx - L * math.cos(ang) + W * math.sin(ang), by - L * math.sin(ang) - W * math.cos(ang)),
                (bx - L * math.cos(ang) - W * math.sin(ang), by - L * math.sin(ang) + W * math.cos(ang))]
        rect = lambda r, cls: '<rect class="%s" x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="3"/>' % (
            cls, r[0], r[1], r[2] - r[0], r[3] - r[1])
        badge_svg = lambda x, y: ('<g class="badge"><circle cx="%.1f" cy="%.1f" r="17"/>'
                                  '<text x="%.1f" y="%.1f">%d</text></g>' % (x, y, x, y + 7, n))
        bs, bt = badge_points(box, tgt, pts)
        out.append(
            '<g class="lk" data-link="%d" data-key="%s" data-what="%s" data-sm="%s" data-tm="%s" '
            'data-src0="%s" data-tgt0="%s" data-pts0="%s" style="--c:%s">%s%s'
            '<polyline class="ln" points="%s"/><polyline class="hit" points="%s"/>'
            '<polygon points="%s"/>%s%s</g>' % (
                n, keys[i], esc(whats[i]), ','.join('%.6f' % v for v in smap), ','.join('%.6f' % v for v in tmaps[i]),
                ','.join(map(fmt, box)), ','.join(map(fmt, tgt)), line, color,
                rect(box, 'src'), rect(tgt, 'tgt'), line, line,
                ' '.join('%.1f,%.1f' % p for p in head), badge_svg(*bs), badge_svg(*bt)))
    return ''.join(out)


def load_edits():
    """Правки рамок и стрелок, сохранённые со страницы (блок box-edits)."""
    try:
        with io.open(OUT_HTML, encoding='utf-8') as f:
            text = f.read()
    except OSError:
        return {}
    m = re.search(r'<script type="application/json" id="box-edits">(.*?)</script>', text, re.S)
    try:
        return json.loads(m.group(1)) if m and m.group(1).strip() else {}
    except ValueError:
        return {}


def build():
    parts, toc = [], []
    total = 0
    # Правки со страницы важнее координат в FIGURES: рамка берётся из правки,
    # стрелка — тоже, если разворот не поменял размер (раскладка та же).
    edits, kept = load_edits(), {}
    for c, (chapter, pdf_path, name, figures) in enumerate(CHAPTERS):
        pdf = fitz.open(pdf_path)
        cid = 'ch%d' % (c + 1)
        toc.append('<li class="toc-ch"><a href="#%s">%s</a><ol>' % (cid, esc(chapter)))
        parts.append('<section class="chapter" id="%s"><h2>%s</h2>' % (cid, esc(chapter)))
        n = 1
        for i, (title, page, crop, links) in enumerate(figures):
            keys = ['%d.%d.%d' % (c + 1, i + 1, j + 1) for j in range(len(links))]
            links = list(links)
            for j, key in enumerate(keys):
                e = edits.get(key)
                if e and e.get('what') == links[j][3]:
                    links[j] = (tuple(e['src']), links[j][1], tuple(e['tgt']), links[j][3], links[j][4])
                    kept[key] = e
            canvas, geo, smap, tmaps = best_layout(pdf, page, crop, links)
            for j, key in enumerate(keys):
                e = kept.get(key)
                if e and e.get('pts') and list(e.get('size', [])) == [canvas.width, canvas.height]:
                    geo[j] = (geo[j][0], geo[j][1], [tuple(q) for q in e['pts']])
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
                    data, canvas.width, canvas.height, svg_links(geo, n, keys, [l[3] for l in links], smap, tmaps),
                    esc(name), rows))
            n += len(links)
        total += n - 1
        toc.append('</ol></li>')
        parts.append('</section>')
    lost = sorted(set(edits) - set(kept))
    if lost:
        print('правки не применены (связь поменялась):', ', '.join(lost))
    page_html = (TEMPLATE.replace('{{TOC}}', ''.join(toc)).replace('{{BODY}}', ''.join(parts))
                 .replace('{{EDITS}}', json.dumps(kept, ensure_ascii=False)))
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
.lk .hit{fill:none;stroke:transparent;stroke-width:22;pointer-events:none}
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
/* Правка разметки */
.edit-bar{display:flex;flex-direction:column;gap:8px;margin:0 0 20px;padding:12px;border:1px solid var(--line);border-radius:8px}
.edit-bar .row{display:flex;gap:8px;flex-wrap:wrap}
.edit-bar button{font:600 13px "Segoe UI",Arial,sans-serif;height:34px;padding:0 12px;border:1px solid var(--line);
  border-radius:6px;background:var(--card);color:var(--ink);cursor:pointer}
.edit-bar button:hover:not(:disabled){background:var(--accent-soft)}
.edit-bar button:disabled{opacity:.45;cursor:default}
.edit-bar button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
.edit-bar button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
#ed-state{font-size:12px;color:var(--muted);min-height:16px}
#ed-help{font-size:12px;color:var(--muted);line-height:1.45;margin:0;padding-left:16px}
body.editing .stage{cursor:default;outline:2px dashed var(--accent);outline-offset:3px}
body.editing .lk{opacity:1!important}
body.editing .lk rect{fill:rgba(255,255,255,.01);cursor:move}
body.editing .lk .hit{pointer-events:stroke;cursor:grab}
body.editing .lk .badge{pointer-events:none}
body.editing .lk.sel rect,body.editing .lk.sel .ln{stroke-width:6}
.hdl{fill:#fff;stroke:#1F5F8B;stroke-width:3}
.hdl.nw,.hdl.se{cursor:nwse-resize}
.hdl.ne,.hdl.sw{cursor:nesw-resize}
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
<nav aria-label="Оглавление"><h1>Перенос документов в систему</h1>
<div class="edit-bar">
  <div class="row">
    <button type="button" id="ed-toggle" aria-pressed="false">Править разметку</button>
    <button type="button" id="ed-save" disabled>Сохранить в файл</button>
  </div>
  <div class="row"><button type="button" id="ed-reset" disabled>Вернуть исходную связь</button></div>
  <div id="ed-state" role="status"></div>
  <ul id="ed-help" hidden>
    <li>рамка — перетащить; размер — за углы</li>
    <li>стрелка — тянуть за отрезок</li>
    <li>двойной щелчок по стрелке — излом</li>
    <li>щелчок по пустому месту разворота — открыть крупно, правка там тоже работает</li>
    <li>«Сохранить в файл» — в первый раз выбрать этот же файл, дальше перезаписывается сразу</li>
  </ul>
</div>
<ol>{{TOC}}</ol></nav>
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
<script type="application/json" id="box-edits">{{EDITS}}</script>
<script>
(function(){
  // Подсветка связи: строка таблицы <-> стрелка на развороте.
  function mark(fig, n){
    if (document.body.classList.contains('editing')) n = null;
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
  // Разворот переносится в просмотр целиком (не копией): правка идёт в одном месте.
  var home = null;
  function open(fig){
    svg = fig.querySelector('svg'); home = svg.parentNode;
    var vb = svg.viewBox.baseVal; W = vb.width; H = vb.height;
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    pane.appendChild(svg);
    viewer.querySelector('.title').textContent = fig.querySelector('h3').textContent;
    lastFocus = document.activeElement;
    viewer.classList.add('open'); document.body.style.overflow = 'hidden';
    fit(); viewer.querySelector('[data-z="close"]').focus();
  }
  function close(){
    viewer.classList.remove('open'); document.body.style.overflow = '';
    if (svg && home){
      svg.removeAttribute('width'); svg.removeAttribute('height'); svg.style.transform = '';
      home.appendChild(svg); svg = null; home = null;
    }
    if (lastFocus) lastFocus.focus();
  }
  document.querySelectorAll('.stage').forEach(function(st){
    st.addEventListener('click', function(e){
      // При захвате указателя щелчок приходит на сам svg, поэтому смотрим,
      // не начался ли он на рамке или стрелке.
      if (grabbed){ grabbed = false; return; }
      open(st.closest('.fig'));
    });
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
  pane.addEventListener('dblclick', function(e){ if (!e.target.closest('.lk')) fit(); });
  document.addEventListener('keydown', function(e){
    if (!viewer.classList.contains('open')) return;
    var r = pane.getBoundingClientRect();
    if (e.key === 'Escape') close();
    else if (e.key === '+' || e.key === '=') zoomAt(1.25, r.width / 2, r.height / 2);
    else if (e.key === '-') zoomAt(0.8, r.width / 2, r.height / 2);
    else if (e.key === '0') fit();
  });
  window.addEventListener('resize', function(){ if (viewer.classList.contains('open')) fit(); });

  // ---- Правка разметки: рамки и стрелки двигаются мышью, правки
  // сохраняются в сам файл (блок box-edits) и переживают пересборку.
  var SVGNS = 'http://www.w3.org/2000/svg';
  var editsEl = document.getElementById('box-edits');
  var edits = {};
  try { edits = JSON.parse(editsEl.textContent || '{}'); } catch (err) { edits = {}; }
  var editing = false, dirty = false, fileHandle = null, sel = null, op = null, dragged = false, grabbed = false;
  var btnEdit = document.getElementById('ed-toggle'), btnSave = document.getElementById('ed-save');
  var btnReset = document.getElementById('ed-reset'), stateEl = document.getElementById('ed-state');

  function nums(s){ return s.split(',').map(Number); }
  function clamp(v, a, b){ return a > b ? (a + b) / 2 : Math.max(a, Math.min(b, v)); }
  function rectOf(r){
    var x = +r.getAttribute('x'), y = +r.getAttribute('y');
    return [x, y, x + (+r.getAttribute('width')), y + (+r.getAttribute('height'))];
  }
  function setRect(r, b){
    var x0 = Math.min(b[0], b[2]), x1 = Math.max(b[0], b[2]), y0 = Math.min(b[1], b[3]), y1 = Math.max(b[1], b[3]);
    r.setAttribute('x', x0.toFixed(1)); r.setAttribute('y', y0.toFixed(1));
    r.setAttribute('width', Math.max(6, x1 - x0).toFixed(1)); r.setAttribute('height', Math.max(6, y1 - y0).toFixed(1));
  }
  function parsePts(s){ return s.split(' ').filter(Boolean).map(function(p){ return p.split(',').map(Number); }); }
  function getPts(g){ return parsePts(g.querySelector('.ln').getAttribute('points')); }
  function ptsStr(p){ return p.map(function(q){ return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '); }
  function setBadge(b, x, y){
    var c = b.querySelector('circle'), t = b.querySelector('text');
    c.setAttribute('cx', x); c.setAttribute('cy', y); t.setAttribute('x', x); t.setAttribute('y', y + 7);
  }
  function setPts(g, p){
    var s = ptsStr(p);
    g.querySelector('.ln').setAttribute('points', s);
    g.querySelector('.hit').setAttribute('points', s);
    var a = p[p.length - 2], b = p[p.length - 1];
    var ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 22, W = 11;
    var h = [b, [b[0] - L * Math.cos(ang) + W * Math.sin(ang), b[1] - L * Math.sin(ang) - W * Math.cos(ang)],
                [b[0] - L * Math.cos(ang) - W * Math.sin(ang), b[1] - L * Math.sin(ang) + W * Math.cos(ang)]];
    g.querySelector('polygon').setAttribute('points', ptsStr(h));
    var bs = g.querySelectorAll('.badge');
    var p0 = p[0], p1 = p[1], len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, d = Math.min(26, len);
    setBadge(bs[0], p0[0] + (p1[0] - p0[0]) * d / len, p0[1] + (p1[1] - p0[1]) * d / len);
    var t = rectOf(g.querySelector('rect.tgt'));
    setBadge(bs[1], t[2] - 18, t[1]);
  }
  function isH(a, b){ return Math.abs(a[1] - b[1]) < 0.5; }
  // Концы стрелки остаются на рамках: начало — на стороне рамки на странице,
  // конец — на стороне поля; косые участки превращаются в изломы.
  function fitEnds(g){
    var s = rectOf(g.querySelector('rect.src')), t = rectOf(g.querySelector('rect.tgt'));
    var p = getPts(g), n = p.length;
    var h0 = isH(p[0], p[1]), hN = isH(p[n - 2], p[n - 1]);
    if (h0){
      p[0][0] = p[1][0] >= (s[0] + s[2]) / 2 ? s[2] : s[0];
      p[0][1] = clamp(p[0][1], s[1] + 3, s[3] - 3);
      if (n > 2) p[1][1] = p[0][1];
    } else {
      p[0][1] = p[1][1] >= (s[1] + s[3]) / 2 ? s[3] : s[1];
      p[0][0] = clamp(p[0][0], s[0] + 3, s[2] - 3);
      if (n > 2) p[1][0] = p[0][0];
    }
    if (hN){
      p[n - 1][0] = p[n - 2][0] <= (t[0] + t[2]) / 2 ? t[0] : t[2];
      p[n - 1][1] = clamp(p[n - 1][1], t[1] + 3, t[3] - 3);
      if (n > 2) p[n - 2][1] = p[n - 1][1];
    } else {
      p[n - 1][1] = p[n - 2][1] <= (t[1] + t[3]) / 2 ? t[1] : t[3];
      p[n - 1][0] = clamp(p[n - 1][0], t[0] + 3, t[2] - 3);
      if (n > 2) p[n - 2][0] = p[n - 1][0];
    }
    var q = [p[0]];
    for (var i = 1; i < p.length; i++){
      var a = q[q.length - 1], b = p[i];
      if (Math.abs(a[0] - b[0]) > 0.5 && Math.abs(a[1] - b[1]) > 0.5){
        if (i === p.length - 1 && hN){ var mx = (a[0] + b[0]) / 2; q.push([mx, a[1]]); q.push([mx, b[1]]); }
        else q.push([b[0], a[1]]);
      }
      q.push(b);
    }
    setPts(g, q);
  }
  function record(g){
    var sm = nums(g.dataset.sm), tm = nums(g.dataset.tm), vb = g.ownerSVGElement.viewBox.baseVal;
    var r1 = function(v){ return Math.round(v * 10) / 10; };
    var s = rectOf(g.querySelector('rect.src')).map(function(v, i){ return r1((v - sm[i % 2]) / sm[2]); });
    var t = rectOf(g.querySelector('rect.tgt')).map(function(v, i){ return r1((v - tm[i % 2]) / tm[2]); });
    edits[g.dataset.key] = {what: g.dataset.what, src: s, tgt: t,
      pts: getPts(g).map(function(q){ return [Math.round(q[0]), Math.round(q[1])]; }), size: [vb.width, vb.height]};
    g.classList.add('edited');
    dirty = true; showState();
  }
  function showState(msg){
    var n = Object.keys(edits).length;
    stateEl.textContent = msg || (dirty ? 'Есть несохранённые правки' : (n ? 'Правок в файле: ' + n : ''));
    btnSave.disabled = !dirty;
    btnReset.disabled = !sel;
  }
  function handles(svg){
    var hg = svg.querySelector('g.hdls');
    if (!hg){
      hg = document.createElementNS(SVGNS, 'g'); hg.setAttribute('class', 'hdls');
      ['nw', 'ne', 'sw', 'se'].forEach(function(c){
        var r = document.createElementNS(SVGNS, 'rect');
        r.setAttribute('class', 'hdl ' + c); r.setAttribute('data-c', c);
        r.setAttribute('width', 14); r.setAttribute('height', 14); hg.appendChild(r);
      });
      svg.appendChild(hg);
    }
    return hg;
  }
  function placeHandles(){
    document.querySelectorAll('g.hdls').forEach(function(h){ h.style.display = 'none'; });
    if (!sel || sel.part === 'ln') return;
    var hg = handles(sel.g.ownerSVGElement), b = rectOf(sel.g.querySelector('rect.' + sel.part));
    hg.style.display = '';
    hg.querySelectorAll('.hdl').forEach(function(r){
      var c = r.getAttribute('data-c');
      r.setAttribute('x', (c[1] === 'w' ? b[0] : b[2]) - 7); r.setAttribute('y', (c[0] === 'n' ? b[1] : b[3]) - 7);
    });
  }
  function select(g, part){
    document.querySelectorAll('.lk.sel').forEach(function(x){ x.classList.remove('sel'); });
    sel = g ? {g: g, part: part} : null;
    if (g) g.classList.add('sel');
    placeHandles(); showState();
  }
  function svgPt(svg, e){
    var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  function nearestSeg(p, pt){
    var best = 0, bd = 1e18;
    for (var k = 0; k < p.length - 1; k++){
      var a = p[k], b = p[k + 1], d;
      if (isH(a, b)) d = Math.abs(pt.y - a[1]) + Math.max(0, Math.min(a[0], b[0]) - pt.x, pt.x - Math.max(a[0], b[0]));
      else d = Math.abs(pt.x - a[0]) + Math.max(0, Math.min(a[1], b[1]) - pt.y, pt.y - Math.max(a[1], b[1]));
      if (d < bd){ bd = d; best = k; }
    }
    return best;
  }
  function onDown(e){
    if (!editing || e.button !== 0) return;
    var svg = e.currentTarget, t = e.target, hdl = t.closest('.hdl'), g = t.closest('.lk');
    grabbed = false;
    if (!hdl && !g){ select(null); return; }
    e.preventDefault(); e.stopPropagation();
    var start = svgPt(svg, e);
    if (hdl){
      op = {kind: 'resize', c: hdl.getAttribute('data-c'), g: sel.g, part: sel.part,
            b0: rectOf(sel.g.querySelector('rect.' + sel.part))};
    } else if (t.classList.contains('hit')){
      select(g, 'ln');
      var p = getPts(g), k = nearestSeg(p, start);
      op = {kind: 'seg', g: g, k: k, p0: p, h: isH(p[k], p[k + 1])};
    } else if (t.tagName.toLowerCase() === 'rect'){
      var part = t.classList.contains('src') ? 'src' : 'tgt';
      select(g, part);
      op = {kind: 'move', g: g, part: part, b0: rectOf(t)};
    } else return;
    op.start = start; op.svg = svg; dragged = false; grabbed = true;
    svg.setPointerCapture(e.pointerId);
  }
  function onMove(e){
    if (!op) return;
    var pt = svgPt(op.svg, e), dx = pt.x - op.start.x, dy = pt.y - op.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) dragged = true;
    var g = op.g;
    if (op.kind === 'move' || op.kind === 'resize'){
      var b = op.b0.slice();
      if (op.kind === 'move'){ b[0] += dx; b[2] += dx; b[1] += dy; b[3] += dy; }
      else {
        if (op.c[1] === 'w') b[0] += dx; else b[2] += dx;
        if (op.c[0] === 'n') b[1] += dy; else b[3] += dy;
      }
      setRect(g.querySelector('rect.' + op.part), b);
      fitEnds(g); placeHandles();
    } else if (op.kind === 'seg'){
      var p = op.p0.map(function(q){ return q.slice(); }), k = op.k, n = p.length;
      var s = rectOf(g.querySelector('rect.src')), t = rectOf(g.querySelector('rect.tgt'));
      var ax = op.h ? 1 : 0, v = p[k][ax] + (op.h ? dy : dx);
      // Отрезок, упирающийся в рамку, скользит только вдоль её стороны.
      if (k === 0) v = clamp(v, s[ax] + 3, s[ax + 2] - 3);
      if (k === n - 2) v = clamp(v, t[ax] + 3, t[ax + 2] - 3);
      p[k][ax] = v; p[k + 1][ax] = v;
      setPts(g, p);
    }
  }
  function onUp(e){
    if (!op) return;
    var g = op.g; op.svg.releasePointerCapture(e.pointerId); op = null;
    if (dragged) record(g);
  }
  // Двойной щелчок по стрелке — излом: отрезок делится надвое, половину
  // можно отвести в сторону.
  function onDbl(e){
    if (!editing) return;
    // После захвата указателя событие приходит на svg — ищем стрелку под курсором.
    var t = document.elementsFromPoint(e.clientX, e.clientY).filter(function(el){
      return el.classList && el.classList.contains('hit');
    })[0];
    if (!t) return;
    e.preventDefault(); e.stopPropagation();
    var g = t.closest('.lk'), svg = g.ownerSVGElement, pt = svgPt(svg, e), p = getPts(g), k = nearestSeg(p, pt);
    var m = isH(p[k], p[k + 1]) ? [pt.x, p[k][1]] : [p[k][0], pt.y];
    p.splice(k + 1, 0, m.slice(), m.slice());
    setPts(g, p); record(g);
  }
  document.querySelectorAll('.stage svg').forEach(function(svg){
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('dblclick', onDbl);
  });
  btnEdit.addEventListener('click', function(){
    editing = !editing;
    document.body.classList.toggle('editing', editing);
    btnEdit.textContent = editing ? 'Закончить правку' : 'Править разметку';
    btnEdit.setAttribute('aria-pressed', editing);
    if (!editing) select(null);
    document.getElementById('ed-help').hidden = !editing;
  });
  btnReset.addEventListener('click', function(){
    if (!sel) return;
    var g = sel.g;
    setRect(g.querySelector('rect.src'), nums(g.dataset.src0));
    setRect(g.querySelector('rect.tgt'), nums(g.dataset.tgt0));
    setPts(g, parsePts(g.dataset.pts0));
    delete edits[g.dataset.key]; g.classList.remove('edited');
    dirty = true; placeHandles(); showState();
  });
  function pageHtml(){
    if (viewer.classList.contains('open')) close();
    var keep = sel; select(null);
    document.querySelectorAll('.on, .hl').forEach(function(x){ x.classList.remove('on', 'hl'); });
    var was = editing; document.body.classList.remove('editing');
    editsEl.textContent = JSON.stringify(edits);
    var html = '<!DOCTYPE html>' + String.fromCharCode(10) + document.documentElement.outerHTML;
    if (was) document.body.classList.add('editing');
    if (keep) select(keep.g, keep.part);
    return html;
  }
  btnSave.addEventListener('click', async function(){
    var html = pageHtml();
    try {
      if (window.showSaveFilePicker){
        if (!fileHandle){
          fileHandle = await window.showSaveFilePicker({suggestedName: document.title + '.html',
            types: [{description: 'Страница HTML', accept: {'text/html': ['.html']}}]});
        }
        var w = await fileHandle.createWritable(); await w.write(html); await w.close();
      } else {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([html], {type: 'text/html'}));
        a.download = document.title + '.html'; a.click();
      }
      dirty = false;
      showState('Сохранено ' + new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'}));
    } catch (err) {
      if (err && err.name !== 'AbortError') showState('Не сохранилось: ' + err.message);
    }
  });
  window.addEventListener('beforeunload', function(e){ if (dirty){ e.preventDefault(); e.returnValue = ''; } });
  Object.keys(edits).forEach(function(k){
    var g = document.querySelector('.lk[data-key="' + k + '"]'); if (g) g.classList.add('edited');
  });
  showState();
})();
</script>
</body>
</html>
'''


if __name__ == '__main__':
    print('связей:', build())
    print(OUT_HTML)
