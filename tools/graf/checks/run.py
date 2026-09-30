# -*- coding: utf-8 -*-
"""Сценарии проверки программы «Граф проекта» на собранной программе (dist).

Каждый checks/*.json — сценарий ScriptRunner (шаги — в начале
ScriptRunner.cs). Программа идёт по копии графа во временной папке
(knowledge/ и .graf/), настройки человека сценарий не меняет. Провал —
«ОШИБКА» в журнале сценария, код выхода не 0 или новая запись в журнале
падений %TEMP%/graf-crash.log.

  date_filter   раздел «Дата» раскрыт, период «за час» дважды подряд, «свой
                период», смена периодов, метки, список. Ловит падение
                30.09.2026: переиспользуемые элементы панели (гистограмма,
                поля дат) при пересборке вставлялись повторно, и программа
                падала COMException 0x800F1000 — а раз раздел оставался
                раскрытым в настройках, то и при каждом запуске.

    python tools/graf/checks/run.py [имя …]
"""
import os, pathlib, shutil, subprocess, sys, tempfile

sys.stdout.reconfigure(encoding='utf-8')
here = pathlib.Path(__file__).resolve().parent
root = here.parents[2]
exe = here.parent / 'dist' / 'Graf.exe'
crash = pathlib.Path(tempfile.gettempdir()) / 'graf-crash.log'
names = sys.argv[1:] or sorted(p.stem for p in here.glob('*.json'))
failed = []
for name in names:
    tmp = pathlib.Path(tempfile.gettempdir()) / 'graf-check' / name
    shutil.rmtree(tmp, ignore_errors=True)
    shutil.copytree(root / 'knowledge', tmp / 'proj' / 'knowledge')
    if (root / '.graf').exists():
        shutil.copytree(root / '.graf', tmp / 'proj' / '.graf')
    shutil.copy(here / f'{name}.json', tmp / 's.json')
    before = crash.stat().st_size if crash.exists() else 0
    try:
        code = subprocess.run([str(exe), '--root', str(tmp / 'proj'), '--script', str(tmp / 's.json')],
                              timeout=180).returncode
    except subprocess.TimeoutExpired:
        code = 'зависла'
    log_path = tmp / 's.json.log'
    log = log_path.read_text(encoding='utf-8').splitlines() if log_path.exists() else ['ОШИБКА: журнала нет — программа упала']
    bad = [l for l in log if 'ОШИБКА' in l]
    after = crash.stat().st_size if crash.exists() else 0
    if after > before:
        bad.append('падение: ' + crash.read_bytes()[before:].decode('utf-8', 'replace').strip().splitlines()[0][:200])
    ok = code == 0 and not bad and 'ГОТОВО' in log
    steps = sum(l.startswith('> ') for l in log)
    print(f'{"ок  " if ok else "ПРОВАЛ"} {name}: шагов {steps}' + ('' if ok else f', код {code}; ' + ' | '.join(bad[:3])))
    if not ok:
        failed.append(name)
print('всё в порядке' if not failed else 'провалы: ' + ', '.join(failed))
sys.exit(1 if failed else 0)
