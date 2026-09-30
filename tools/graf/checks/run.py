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
  exchange      выгрузка графа и загрузка обратно: сперва выгрузка целого
                графа, затем у копии удаляются записи и портится заголовок,
                загрузка должна вернуть всё байт в байт (вопрос пользователя
                30.09.2026 «А импорт будет корректным?»).

Сценарий — список шагов или объект {"steps": [...], "prepare": {...},
"same_as_repo": true}: prepare.delete — файлы knowledge/ удалить перед
шагами, prepare.spoil — файлы, у которых испортить TITLE; same_as_repo —
после шагов knowledge/ копии должна совпасть с репозиторием байт в байт.
Шаг {"op": "prepare"} выполняет подготовку посреди сценария (после
выгрузки). {TMP} в сценарии — временная папка сценария.

    python tools/graf/checks/run.py [имя …]
"""
import json, pathlib, re, shutil, subprocess, sys, tempfile

sys.stdout.reconfigure(encoding='utf-8')
here = pathlib.Path(__file__).resolve().parent
root = here.parents[2]
exe = here.parent / 'dist' / 'Graf.exe'
crash = pathlib.Path(tempfile.gettempdir()) / 'graf-crash.log'
names = sys.argv[1:] or sorted(p.stem for p in here.glob('*.json'))

def do_prepare(proj, prep):
    for rel in prep.get('delete', []):
        (proj / 'knowledge' / rel).unlink()
    for rel in prep.get('spoil', []):
        f = proj / 'knowledge' / rel
        t = f.read_text(encoding='utf-8')
        f.write_text(re.sub(r"^TITLE = .*$", "TITLE = 'испорчено'", t, count=1, flags=re.M), encoding='utf-8', newline='')


def run_part(tmp):
    before = crash.stat().st_size if crash.exists() else 0
    try:
        code = subprocess.run([str(exe), '--root', str(tmp / 'proj'), '--script', str(tmp / 's.json')],
                              timeout=180).returncode
    except subprocess.TimeoutExpired:
        code = 'зависла'
    log_path = tmp / 's.json.log'
    log = log_path.read_text(encoding='utf-8').splitlines() if log_path.exists() else ['ОШИБКА: журнала нет — программа упала']
    after = crash.stat().st_size if crash.exists() else 0
    if after > before:
        log.append('ОШИБКА падение: ' + crash.read_bytes()[before:].decode('utf-8', 'replace').strip().splitlines()[0][:200])
    return code, log


def differ(a, b):
    """Файлы, которые есть не в обеих папках или отличаются байтами."""
    fa = {p.relative_to(a) for p in a.rglob('*') if p.is_file() and '__pycache__' not in p.parts}
    fb = {p.relative_to(b) for p in b.rglob('*') if p.is_file() and '__pycache__' not in p.parts}
    out = [b / x for x in sorted(fa ^ fb)]
    out += [b / x for x in sorted(fa & fb) if (a / x).read_bytes() != (b / x).read_bytes()]
    return out


failed = []
for name in names:
    tmp = pathlib.Path(tempfile.gettempdir()) / 'graf-check' / name
    shutil.rmtree(tmp, ignore_errors=True)
    shutil.copytree(root / 'knowledge', tmp / 'proj' / 'knowledge')
    if (root / '.graf').exists():
        shutil.copytree(root / '.graf', tmp / 'proj' / '.graf')
    spec = json.loads((here / f'{name}.json').read_text(encoding='utf-8').replace('{TMP}', tmp.as_posix()))
    if isinstance(spec, list):
        spec = {'steps': spec}
    steps = spec['steps']
    prep = spec.get('prepare')
    if prep and not any(st.get('op') == 'prepare' for st in steps):
        do_prepare(tmp / 'proj', prep)
    # Подготовка посреди сценария: сценарий разбивается на две части,
    # между ними копия портится (программа при этом перезапускается).
    parts, cur = [], []
    for st in steps:
        if st.get('op') == 'prepare':
            parts.append(cur); cur = []
        else:
            cur.append(st)
    parts.append(cur)
    code, log = 0, []
    for i, part in enumerate(parts):
        if i:
            do_prepare(tmp / 'proj', prep)
        (tmp / 's.json').write_text(json.dumps(part, ensure_ascii=False), encoding='utf-8')
        c, lg = run_part(tmp)
        code = code or c
        log += lg
    bad = [l for l in log if 'ОШИБКА' in l]
    if spec.get('same_as_repo'):
        diff = [str(f.relative_to(tmp / 'proj')) for f in differ(root / 'knowledge', tmp / 'proj' / 'knowledge')]
        if diff:
            bad.append('расходится с репозиторием: ' + ', '.join(diff[:5]))
    ok = code == 0 and not bad and log.count('ГОТОВО') == len(parts)
    steps_n = sum(l.startswith('> ') for l in log)
    print(f'{"ок  " if ok else "ПРОВАЛ"} {name}: шагов {steps_n}' + ('' if ok else f', код {code}; ' + ' | '.join(bad[:3])))
    if not ok:
        failed.append(name)
print('всё в порядке' if not failed else 'провалы: ' + ', '.join(failed))
sys.exit(1 if failed else 0)

