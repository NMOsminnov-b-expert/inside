# -*- coding: utf-8 -*-
"""Перенос «Перенос документов в систему.html» в проект программы «Разметка
документов» (tools/razmetka): главы, развороты, слои, рамки, связи.

Берёт то же, что сборщик build_tp_v_sistemu.py: главы и связи из его
списков, ручные правки рамок и стрелок — из блока box-edits готового HTML,
раскладку разворота — его подбором. В проекте всё это становится слоями:

  * страница документа — слой-картинка со всей страницей (110 dpi) и
    обрезкой по куску, который был на развороте;
  * снимок системы — слой со всем снимком и обрезкой по куску;
  * рамки — в пикселях исходника своего слоя (так же их хранил box-edits);
  * стрелки — путь, уже проложенный сборщиком (с правками руками);
  * таблица связей — отдельный слой под разворотом.

Результат — папка «Примеры доков/Перенос документов в систему — разметка»
(в .gitignore: реальные документы). Папка перезаписывается целиком.

    python tools/docs/export_razmetka.py
"""
import hashlib
import io
import json
import os
import sys
import uuid

import fitz
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_tp_v_sistemu as B  # noqa: E402

OUT = os.path.join(B.SRC, 'Перенос документов в систему — разметка')
IMAGES = os.path.join(OUT, 'images')


def new_id(prefix):
    return prefix + uuid.uuid4().hex[:10]


class Assets:
    """Картинки проекта: имя — хэш содержимого, как в ProjectStore.Import."""

    def __init__(self):
        self.items = {}
        self.by_key = {}

    def add(self, key, img, name, png):
        if key in self.by_key:
            return self.by_key[key]
        buf = io.BytesIO()
        if png:
            img.save(buf, 'PNG', optimize=True)
            ext = '.png'
        else:
            img.convert('RGB').save(buf, 'JPEG', quality=88, optimize=True)
            ext = '.jpg'
        data = buf.getvalue()
        h = hashlib.sha1(data).hexdigest()[:16]
        if h not in self.items:
            with open(os.path.join(IMAGES, h + ext), 'wb') as f:
                f.write(data)
            self.items[h] = {'file': h + ext, 'w': img.width, 'h': img.height, 'name': name}
        self.by_key[key] = h
        return h


def box(x0, y0, x1, y1):
    return {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0}


def main():
    os.makedirs(IMAGES, exist_ok=True)
    for f in os.listdir(IMAGES):
        os.remove(os.path.join(IMAGES, f))
    assets = Assets()
    edits = B.load_edits()
    chapters = []
    for c, (chapter, pdf_path, name, figures) in enumerate(B.CHAPTERS):
        pdf = fitz.open(pdf_path)
        sheets = []
        n = 1
        for i, (title, page, crop, links) in enumerate(figures):
            keys = ['%d.%d.%d' % (c + 1, i + 1, j + 1) for j in range(len(links))]
            links = list(links)
            for j, key in enumerate(keys):
                e = edits.get(key)
                if e and e.get('what') == links[j][3]:
                    links[j] = (tuple(e['src']), links[j][1], tuple(e['tgt']), links[j][3], links[j][4])
            canvas, geo, smap, tmaps = B.best_layout(pdf, page, crop, links)
            for j, key in enumerate(keys):
                e = edits.get(key)
                if e and e.get('what') == links[j][3] and e.get('pts') and list(e.get('size', [])) == [canvas.width, canvas.height]:
                    geo[j] = (geo[j][0], geo[j][1], [tuple(q) for q in e['pts']])

            layers, frames, sheet_links = [], [], []
            # Страница документа: вся страница, видна часть по crop.
            pimg = B.page_image(pdf, page)
            pcrop = crop or (0, 0, pimg.width, pimg.height)
            pa = assets.add(('page', pdf_path, page), pimg, '%s, стр. %d' % (name, page), False)
            sx, sy, s = smap
            page_layer = {
                'id': new_id('ly'), 'kind': 'image', 'name': '%s, стр. %d' % (name, page), 'caption': '',
                'asset': pa, 'crop': box(*pcrop), 'x': sx + pcrop[0] * s, 'y': sy + pcrop[1] * s,
                'w': (pcrop[2] - pcrop[0]) * s, 'locked': True, 'hidden': False, 'tableFrom': 0, 'tableTo': 0,
            }
            layers.append(page_layer)
            # Снимки системы: слой на каждый кусок снимка (один снимок может
            # стоять на развороте один раз).
            shot_layers = {}
            for j, l in enumerate(links):
                shot = l[1]
                if shot in shot_layers:
                    continue
                full = Image.open(os.path.join(B.SHOTS, shot[0])).convert('RGB')
                scrop = shot[2] if len(shot) > 2 else (0, 0, full.width, full.height)
                sa = assets.add(('shot', shot[0]), full, shot[0], True)
                tx, ty, k = tmaps[j]
                ly = {
                    'id': new_id('ly'), 'kind': 'image', 'name': shot[1], 'caption': shot[1], 'asset': sa,
                    'crop': box(*scrop), 'x': tx + scrop[0] * k, 'y': ty + scrop[1] * k, 'w': (scrop[2] - scrop[0]) * k,
                    'locked': False, 'hidden': False, 'tableFrom': 0, 'tableTo': 0,
                }
                shot_layers[shot] = ly
                layers.append(ly)
            for j, l in enumerate(links):
                fs = {'id': new_id('fr'), 'layerId': page_layer['id'], 'box': box(*l[0])}
                ft = {'id': new_id('fr'), 'layerId': shot_layers[l[1]]['id'], 'box': box(*l[2])}
                frames += [fs, ft]
                sheet_links.append({
                    'id': new_id('lk'), 'n': n + j, 'src': fs['id'], 'tgt': ft['id'], 'kind': 'transfer',
                    'docField': l[3], 'systemField': l[4],
                    'points': [{'x': float(p[0]), 'y': float(p[1])} for p in geo[j][2]],
                    'seeAlso': [], 'url': '',
                })
            # Таблица связей — слоем под разворотом, во всю его ширину.
            layers.append({
                'id': new_id('ly'), 'kind': 'table', 'name': 'Таблица связей', 'caption': '', 'asset': None,
                'crop': box(0, 0, canvas.width, 10), 'x': 0, 'y': canvas.height + 40, 'w': canvas.width,
                'locked': False, 'hidden': False, 'tableFrom': 0, 'tableTo': len(links),
            })
            sheets.append({'id': new_id('sh'), 'title': title, 'page': 'стр. %d' % page, 'layers': layers,
                           'frames': frames, 'links': sheet_links, 'notes': []})
            n += len(links)
            print('  %s — %s: связей %d' % (chapter, title, len(links)))
        chapters.append({'id': new_id('ch'), 'title': chapter, 'docName': name, 'sheets': sheets})
    project = {'version': 1, 'title': 'Перенос документов в систему', 'chapters': chapters,
               'assets': assets.items, 'history': []}
    with io.open(os.path.join(OUT, 'razmetka.json'), 'w', encoding='utf-8') as f:
        json.dump(project, f, ensure_ascii=False, indent=2)
    size = sum(os.path.getsize(os.path.join(IMAGES, f)) for f in os.listdir(IMAGES))
    print('Готово: %s (картинок %d, %.1f МБ)' % (OUT, len(assets.items), size / 1024 / 1024))


if __name__ == '__main__':
    main()
