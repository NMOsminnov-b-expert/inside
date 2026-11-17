# -*- coding: utf-8 -*-
"""Инструкции по осмотрам для веб-страницы осмотрщика — в data/local/instructions (вне git).

Инструкции — документы компании (PDF, разложенные приложением «Осмотр» в текст и фото: оглавление
index.json и папка на инструкцию с doc.json и картинками). Репозиторий макета публичный, поэтому
инструкции в git не кладутся (правило dannye-proekta-naruzhu-ne-uhodyat): скрипт копирует их из
репозитория приложения в data/local/instructions, страница читает оттуда (pages/osmotr/instructions.js).

    python tools/osmotr/instructions.py                       # из C:/vs code/osmotr
    python tools/osmotr/instructions.py "<папка instructions>"  # из другой папки

Пользователь 17.11.2026: «Старое приложение убираем. Встраиваем инструкции».
"""
import os
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DEFAULT = r'C:/vs code/osmotr/shared/src/commonMain/composeResources/files/instructions'
OUT = os.path.join(ROOT, 'data', 'local', 'instructions')


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    if not os.path.isfile(os.path.join(src, 'index.json')):
        sys.exit('нет %s/index.json — укажите папку instructions приложения «Осмотр»' % src)
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    shutil.copytree(src, OUT, ignore=shutil.ignore_patterns('text.txt'))
    n = sum(len(f) for _, _, f in os.walk(OUT))
    print('инструкции: %s → %s, файлов %d' % (src, os.path.relpath(OUT, ROOT), n))


if __name__ == '__main__':
    main()
