# -*- coding: utf-8 -*-
"""Сценарии проверки «Разметки документов» на собранной программе (dist).

Каждый checks/*.json — сценарий ScriptRunner (шаги README, «Проверка»);
{TMP} — временная папка, {DOCS} — «Примеры доков» (вне git). Перед каждым
сценарием в {TMP}/proj кладётся свежая копия проекта-примера, для
from_scratch — пустая {TMP}/fresh. Провал — «НЕ ТАК» или «ОШИБКА» в журнале
либо программа завершилась не с 0.

  from_scratch            новый проект, PDF, фото, связь клавишами, копия,
                          отмена, повтор, удаление, заметка, разворот,
                          «Подряд», сохранение, экспорт, проверка (ловит
                          удаление невидимо выбранного слоя по Delete)
  basic_navigation        Tab по связям, описание, палитра, шпаргалка, PageDown
  link_draw_describe      связь обводкой, описание, заметка, фокус в списке,
                          палитра по разворотам, F8, узкое окно, Ctrl+\
  crop_menu_palette       обрезка C и Enter, меню правой кнопки, палитра,
                          новый разворот, отмена
  lossless_import_export  PDF 300 dpi, фото байт в байт, экспорт HTML и Excel
  tabs_and_flow           Ctrl+PageDown, «Подряд», прокрутка, Enter, узкое окно
  theme_and_remap         тёмная тема, переназначение клавиши, окно «Клавиши»
  rotation_and_tilt       поворот [ ], «Выровнять по линии», рамки на повёрнутом
  export_html             экспорт HTML (сама страница — браузером отдельно)

    python tools/razmetka/checks/run.py [имя …]
"""
import pathlib, shutil, subprocess, sys, tempfile

sys.stdout.reconfigure(encoding='utf-8')
here = pathlib.Path(__file__).resolve().parent
root = here.parents[2]
docs = root / 'Примеры доков'
sample = docs / 'Перенос документов в систему — разметка'
exe = here.parent / 'dist' / 'Razmetka.exe'
names = sys.argv[1:] or sorted(p.stem for p in here.glob('*.json'))
failed = []
for name in names:
    tmp = pathlib.Path(tempfile.gettempdir()) / 'razmetka-check' / name
    shutil.rmtree(tmp, ignore_errors=True)
    (tmp / 'fresh').mkdir(parents=True)
    shutil.copytree(sample, tmp / 'proj')
    s = (here / f'{name}.json').read_text(encoding='utf-8')
    s = s.replace('{TMP}', tmp.as_posix()).replace('{DOCS}', docs.as_posix())
    (tmp / 's.json').write_text(s, encoding='utf-8')
    code = subprocess.run([str(exe), '--script', str(tmp / 's.json')]).returncode
    log = (tmp / 's.json.log').read_text(encoding='utf-8').splitlines()
    bad = [l for l in log if 'НЕ ТАК' in l or 'ОШИБКА' in l]
    oks = sum('ок:' in l for l in log)
    ok = code == 0 and not bad
    print(f'{"ок  " if ok else "ПРОВАЛ"} {name}: проверок {oks}' + ('' if ok else f', код {code}; ' + ' | '.join(bad[:3])))
    if not ok: failed.append(name)
print('всё в порядке' if not failed else 'провалы: ' + ', '.join(failed))
sys.exit(1 if failed else 0)
