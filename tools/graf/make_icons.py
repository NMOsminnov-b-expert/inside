# -*- coding: utf-8 -*-
"""Иконка программы «Граф проекта».

    python tools/graf/make_icons.py

Пишет tools/graf/Assets/graf.ico, в файле размеры 16–256. Иконка «Разметки
документов» — в её репозитории (C:s code
azmetka, tools/make_icon.py),
вынесена 13.11.2026. Рисуется крупно (1024) и
уменьшается: так значок читается и в списке файлов, и на панели задач.

Задача пользователя 28.09.2026: «иконки добавь на приложения, а то теряется в
списке файлов». Граф — узлы и связи на тёмном поле, как полотно программы.
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BIG = 1024
SIZES = [16, 24, 32, 48, 64, 128, 256]


def rounded(d, box, r, fill):
    d.rounded_rectangle(box, radius=r, fill=fill)


def graf():
    im = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rounded(d, (24, 24, BIG - 24, BIG - 24), 200, (19, 27, 36, 255))
    c = (512, 512)
    around = [((250, 300), (79, 143, 214)), ((780, 260), (224, 98, 90)),
              ((800, 740), (93, 179, 107)), ((260, 760), (242, 162, 58))]
    for (p, _) in around:
        d.line([c, p], fill=(170, 185, 200, 255), width=34)
    d.line([around[0][0], around[1][0]], fill=(170, 185, 200, 160), width=22)
    for (p, col) in around:
        r = 96
        d.ellipse((p[0] - r, p[1] - r, p[0] + r, p[1] + r), fill=col + (255,))
    # Выбранный узел — в золотом кольце, как на полотне программы.
    r = 150
    d.ellipse((c[0] - r - 34, c[1] - r - 34, c[0] + r + 34, c[1] + r + 34), fill=(255, 209, 102, 255))
    d.ellipse((c[0] - r - 12, c[1] - r - 12, c[0] + r + 12, c[1] + r + 12), fill=(19, 27, 36, 255))
    d.ellipse((c[0] - r, c[1] - r, c[0] + r, c[1] + r), fill=(76, 127, 184, 255))
    return im


def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, format='ICO', sizes=[(s, s) for s in SIZES])
    print(os.path.relpath(path, ROOT))


if __name__ == '__main__':
    save(graf(), os.path.join(ROOT, 'tools', 'graf', 'Assets', 'graf.ico'))
