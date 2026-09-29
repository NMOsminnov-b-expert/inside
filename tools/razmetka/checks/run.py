# -*- coding: utf-8 -*-
"""Сценарий «с нуля» (checks/from_scratch.json) на собранной программе.

Новый проект, PDF, фото, связь клавишами, описание, копия, отмена и повтор,
удаление, заметка, новый разворот, «Подряд», сохранение, экспорт HTML и
Excel, проверка разметки. Строка «НЕ ТАК» или «ОШИБКА» в журнале — провал.
Ловит, в частности, удаление невидимо выбранного слоя вместе со связями
(Delete после «Повторить», 29.09.2026). Нужны «Примеры доков» (вне git).

    python tools/razmetka/checks/run.py
"""
import os, pathlib, shutil, subprocess, sys, tempfile

here = pathlib.Path(__file__).resolve().parent
root = here.parents[2]
tmp = pathlib.Path(tempfile.gettempdir()) / 'razmetka-check'
shutil.rmtree(tmp, ignore_errors=True)
(tmp / 'fresh').mkdir(parents=True)
s = (here / 'from_scratch.json').read_text(encoding='utf-8')
s = s.replace('{TMP}', tmp.as_posix()).replace('{DOCS}', (root / 'Примеры доков').as_posix())
(tmp / 's.json').write_text(s, encoding='utf-8')
subprocess.run([str(here.parent / 'dist' / 'Razmetka.exe'), '--script', str(tmp / 's.json')])
log = (tmp / 's.json.log').read_text(encoding='utf-8').splitlines()
sys.stdout.reconfigure(encoding='utf-8')
bad = [l for l in log if 'НЕ ТАК' in l or 'ОШИБКА' in l]
print('\n'.join(l for l in log if 'ок:' in l or l in bad))
print('провал' if bad else 'всё в порядке')
sys.exit(1 if bad else 0)
