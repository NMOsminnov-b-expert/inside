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
import os

import fitz
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.shared import Cm, Pt
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'Примеры доков')
SHOTS = os.path.join(SRC, 'Фото системы')
PDF = os.path.join(SRC, '0190 г.Кант ул.Куттубека Тагаева 3-ДС МИС_техпаспорт.pdf')
GOSAKT = os.path.join(SRC, 'Госакт Б 028723.pdf')
OUT_DOCX = os.path.join(SRC, 'Разметка техпаспорта (хар-ка строений и сооружений).docx')
OUT_DIR = os.path.join(SRC, 'Перенос техпаспорта в систему')
DPI = 110

# Снимки системы: файл → подпись над снимком (чей это блок).
OC_PARTIES = ('Screenshot 2026-09-24 144331.png', 'Объект оценки · 01 Учреждение, собственники и ответственные')
OC_PLACE = ('Screenshot 2026-09-24 144339.png', 'Объект оценки · 02 Местоположение')
OC_LIST = ('Screenshot 2026-09-24 144351.png', 'Объект оценки · 03 Перечень ОИ')
LIT_GEN = ('Screenshot 2026-09-24 144400.png', 'Литера · 01 Общие параметры')
LIT_AREAS = ('Литера — 02 Площади и этажность.png', 'Литера · 02 Площади и этажность')
LIT_AREAS_TOP = ('Литера — 02 Площади и этажность.png', 'Литера · 02 Площади и этажность', (0, 0, 990, 262))
LAND_MAIN = ('Screenshot 2026-09-24 144646.png', 'Земельный участок · 01 Основные параметры')
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
    ('Экспликация к плану основных строений, 1 этаж', 3, (60, 90, 900, 700), [
        ((214, 650, 404, 678), LIT_AREAS, (63, 421, 414, 454), 'Итого по этажу (1 этаж), общая площадь',
         'Литера · Площади и этажность · Надземные, строка «1 этаж», по внутреннему обмеру'),
    ]),
    ('Экспликация к плану основных строений, 2 этаж и всего', 4, (60, 90, 900, 900), [
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

GA_FIGURES = [
    ('Титульный лист', 1, (180, 440, 850, 800), [
        ((225, 700, 800, 772), LAND_MAIN, (14, 527, 328, 576), 'О праве бессрочного пользования земельным участком',
         'Земельный участок · Основные параметры · Права на земельный участок'),
    ]),
    ('Площадь и целевое назначение', 2, (40, 650, 890, 1215), [
        ((65, 686, 870, 742), LAND_AREAS, (491, 50, 972, 106), 'Площадь участка',
         'Земельный участок · Площади · По правоудостоверяющим документам'),
        ((65, 1150, 870, 1205), LAND_MAIN, (14, 140, 972, 190), 'Целевое назначение и категория',
         'Земельный участок · Основные параметры · Назначение по правоудостоверяющему документу'),
    ]),
    ('Идентификационный номер и место расположения', 3, (40, 60, 890, 260), [
        ((330, 176, 615, 207), LAND_MAIN, (14, 62, 248, 115), 'Идентификационный номер',
         'Земельный участок · Основные параметры · ЕНИ'),
        ((618, 170, 868, 234), LAND_MAIN, (14, 215, 972, 288), 'Место расположения: улица, дом',
         'Земельный участок · Основные параметры · Адрес: Улица, Дом'),
        ((618, 170, 868, 234), OC_PLACE, (15, 158, 932, 240), 'Место расположения: населённый пункт',
         'Объект оценки · Местоположение · Область, Город или село, Район'),
    ]),
    ('Ограничение права собственности на земельный участок', 6, (40, 240, 890, 960), [
        ((65, 330, 872, 940), LAND_MAIN, (336, 527, 650, 576), 'Ограничения права',
         'Земельный участок · Основные параметры · Наличие сервитутов и обременений'),
    ]),
]

# Главы документа: (заголовок, PDF, как назван документ в таблице, страницы).
CHAPTERS = [
    ('Перенос техпаспорта в систему', PDF, 'Техпаспорт', TP_FIGURES),
    ('Перенос госакта в систему', GOSAKT, 'Госакт', GA_FIGURES),
]

COLORS = ['#D1495B', '#2E86AB', '#EDAE49', '#3B8B5A', '#8E5BB5', '#D9772B', '#1B998B']
PAGE_H = 1400      # высота страницы техпаспорта на картинке
SHOT_W = 900       # ширина снимка системы на картинке
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


def figure(doc, name, title, page, crop, links, start):
    tp = page_image(doc, page)
    crop = crop or (0, 0, tp.width, tp.height)
    tp = tp.crop(crop)
    # Кусок страницы крупно: по ширине до 1150, по высоте до PAGE_H.
    s_tp = min(1150 / tp.width, PAGE_H / tp.height)
    tp = tp.resize((int(tp.width * s_tp), int(tp.height * s_tp)))

    # Снимки — по порядку первого упоминания, каждый один раз.
    shots = []
    for _, shot, *_ in links:
        if shot not in shots:
            shots.append(shot)
    cap_f = font(22, True)
    placed = {}
    y = PAD
    right_x = PAD + tp.width + GAP
    blocks = []
    for shot in shots:
        img, scrop = shot_image(shot)
        s = SHOT_W / img.width
        img = img.resize((SHOT_W, int(img.height * s)))
        blocks.append((shot, img, y))
        placed[shot] = (right_x - scrop[0] * s, y + 34 - scrop[1] * s, s)
        y += 34 + img.height + 40
    height = max(PAD * 2 + tp.height, y)
    width = right_x + SHOT_W + PAD
    canvas = Image.new('RGB', (width, height), 'white')
    canvas.paste(tp, (PAD, PAD))
    d = ImageDraw.Draw(canvas)
    for shot, img, top in blocks:
        d.text((right_x, top), shot[1], fill='#1F3A4D', font=cap_f)
        canvas.paste(img, (right_x, top + 34))
        d.rectangle((right_x - 1, top + 33, right_x + img.width, top + 34 + img.height), outline='#B8C4CE', width=1)

    rows = []
    for i, (box, shot, sbox, what, where) in enumerate(links):
        n = start + i
        color = COLORS[i % len(COLORS)]
        x0, y0, x1, y1 = [(v - crop[i % 2]) * s_tp for i, v in enumerate(box)]
        x0, x1, y0, y1 = x0 + PAD, x1 + PAD, y0 + PAD, y1 + PAD
        d.rectangle((x0, y0, x1, y1), outline=color, width=4)
        sx, sy, s = placed[shot]
        a0, b0, a1, b1 = sx + sbox[0] * s, sy + sbox[1] * s, sx + sbox[2] * s, sy + sbox[3] * s
        d.rectangle((a0, b0, a1, b1), outline=color, width=4)
        arrow(d, (x1, (y0 + y1) / 2), (a0 - 4, (b0 + b1) / 2), color)
        badge(d, x0, y0, n, color)
        badge(d, a0, b0, n, color)
        rows.append((n, what, where))
    path = os.path.join(OUT_DIR, '%s, стр. %02d — %s.png' % (name, page, title))
    canvas.save(path)
    return path, rows


def build():
    os.makedirs(OUT_DIR, exist_ok=True)
    # Папка картинок целиком собирается сборщиком — старые снимки убираются.
    for f in os.listdir(OUT_DIR):
        if f.endswith('.png'):
            os.remove(os.path.join(OUT_DIR, f))
    doc = Document()
    sec = doc.sections[0]
    sec.orientation = WD_ORIENT.LANDSCAPE
    sec.page_width, sec.page_height = Cm(29.7), Cm(21.0)
    for side in ('left_margin', 'right_margin', 'top_margin', 'bottom_margin'):
        setattr(sec, side, Cm(1.5))
    doc.styles['Normal'].font.name = 'Calibri'
    doc.styles['Normal'].font.size = Pt(10)
    total = 0
    for c, (chapter, pdf_path, name, figures) in enumerate(CHAPTERS):
        if c:
            doc.add_page_break()
        doc.add_heading(chapter, level=1)
        pdf = fitz.open(pdf_path)
        n = 1
        for i, (title, page, crop, links) in enumerate(figures):
            if i:
                doc.add_page_break()
            doc.add_heading('%s (стр. %d)' % (title, page), level=2)
            path, rows = figure(pdf, name, title, page, crop, links, n)
            n += len(links)
            # Картинка вписывается в страницу: по ширине 26,7 см, по высоте 12,5 см.
            with Image.open(path) as im:
                ratio = im.width / im.height
            if ratio >= 26.7 / 12.5:
                doc.add_picture(path, width=Cm(26.7))
            else:
                doc.add_picture(path, height=Cm(12.5))
            t = doc.add_table(rows=1, cols=3)
            t.style = 'Light Grid Accent 1'
            for cell, text in zip(t.rows[0].cells, ('№', name, 'Система')):
                cell.text = text
            for num, what, where in rows:
                cells = t.add_row().cells
                cells[0].text, cells[1].text, cells[2].text = str(num), what, where
            for row in t.rows:
                row.cells[0].width, row.cells[1].width, row.cells[2].width = Cm(1.2), Cm(9), Cm(16.5)
        total += n - 1
    doc.save(OUT_DOCX)
    return total


if __name__ == '__main__':
    print('связей:', build())
    print(OUT_DOCX)
