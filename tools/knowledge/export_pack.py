# -*- coding: utf-8 -*-
"""Пакет графа знаний для другого компьютера — знания с обвязкой, без кода
макета и без поиска по смыслу (решение пользователя 15.10.2026: «Берем граф
знаний с полной его обвязкой разве что без embedding. и отдаем»; «С
инфраструктурой под него»).

    python tools/knowledge/export_pack.py [--out <папка>] [--katalog <база>]

В папке пакета (по умолчанию C:/vs code/graf-pack):

  graf.bundle      — git-пакет: knowledge/, tools/knowledge, tools/hooks,
                     tools/graf (исходники программы), tools/catalog; файлы
                     tools/knowledge/pack/ ложатся в корень (CLAUDE.md,
                     install.ps1, README.md, .gitignore). История — коммиты
                     макета, затронувшие эти пути, с исходными авторами и
                     датами: пересборка даёт те же коммиты, и обновление на
                     той стороне — обычное подтягивание, без расхождений;
  katalog.bundle   — только с --katalog: база категорий по описям, её git
                     как есть (без .cache с векторами — он вне git);
  infra/codegraph  — установка CodeGraph с этой машины;
  infra/graf-dist  — собранная программа «Граф проекта» (tools/graf/dist);
  install.ps1, README.md — установка и обновление одной командой.

Берётся закоммиченное: незакоммиченные правки графа в пакет не попадут.
Нужен git-filter-repo (pip install --user git-filter-repo).
"""
import argparse
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
PATHS = ['knowledge/', 'tools/knowledge/', 'tools/hooks/', 'tools/graf/', 'tools/catalog/']
CG = pathlib.Path(os.environ.get('LOCALAPPDATA', '')) / 'codegraph' / 'current'
DIST = ROOT / 'tools' / 'graf' / 'dist'


def run(*cmd, cwd=None):
    r = subprocess.run([str(c) for c in cmd], cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode:
        sys.exit('ошибка: %s\n%s' % (' '.join(map(str, cmd)), (r.stderr or r.stdout)[-2000:]))
    return r.stdout.strip()


def mirror(src, dst):
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))


def size(p):
    return sum(f.stat().st_size for f in p.rglob('*') if f.is_file()) if p.is_dir() else p.stat().st_size


def graf_bundle(out):
    branch = run('git', 'rev-parse', '--abbrev-ref', 'HEAD', cwd=ROOT)
    tmp = pathlib.Path(tempfile.mkdtemp(prefix='graf-pack-'))
    try:
        repo = tmp / 'graf'
        run('git', 'clone', '--quiet', '--no-local', '--single-branch', '--branch', branch, ROOT, repo)
        args = [sys.executable, '-m', 'git_filter_repo', '--force', '--quiet']
        for p in PATHS:
            args += ['--path', p]
        args += ['--path-rename', 'tools/knowledge/pack/:']
        run(*args, cwd=repo)
        run('git', 'branch', '-M', 'main', cwd=repo)
        run('git', 'bundle', 'create', out / 'graf.bundle', 'main', cwd=repo)
        n = run('git', 'rev-list', '--count', 'main', cwd=repo)
        last = run('git', 'log', '-1', '--format=%h %ad %s', '--date=short', cwd=repo)
        return n, last
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def katalog_bundle(base, out):
    base = pathlib.Path(base)
    if not (base / 'knowledge').is_dir():
        sys.exit('в %s нет knowledge/' % base)
    if run('git', 'status', '--porcelain', cwd=base):
        sys.exit('в базе %s есть незакоммиченные правки — закоммитьте или уберите' % base)
    branch = run('git', 'rev-parse', '--abbrev-ref', 'HEAD', cwd=base)
    if branch != 'main':
        sys.exit('ветка базы — %s, а установка ждёт main' % branch)
    run('git', 'bundle', 'create', out / 'katalog.bundle', 'main', cwd=base)
    return run('git', 'log', '-1', '--format=%h %ad %s', '--date=short', cwd=base)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', default=str(ROOT.parent / 'graf-pack'))
    ap.add_argument('--katalog', default='', help='база категорий по описям (папка с knowledge/)')
    a = ap.parse_args()
    # Абсолютный: git bundle запускается из временного клона.
    out = pathlib.Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)

    n, last = graf_bundle(out)
    print('граф: коммитов %s, последний %s' % (n, last))
    if a.katalog:
        print('каталог: %s' % katalog_bundle(a.katalog, out))
    elif (out / 'katalog.bundle').exists():
        print('каталог: прежний katalog.bundle оставлен как есть')

    if CG.is_dir():
        mirror(CG, out / 'infra' / 'codegraph')
    else:
        print('CodeGraph не найден в %s — infra/codegraph не обновлён' % CG)
    if (DIST / 'Graf.exe').exists():
        newer = [p for p in (ROOT / 'tools' / 'graf').rglob('*.cs') if 'obj' not in p.parts and 'bin' not in p.parts
                 and p.stat().st_mtime > (DIST / 'Graf.exe').stat().st_mtime]
        if newer:
            print('внимание: исходники программы новее сборки (%s…) — пересоберите tools/graf/build.cmd' % newer[0].name)
        mirror(DIST, out / 'infra' / 'graf-dist')
    else:
        print('программа не собрана (tools/graf/build.cmd) — infra/graf-dist не обновлён')

    # PowerShell 5.1 читает сценарий без BOM в кодировке ANSI — кириллица ломается.
    src = ROOT / 'tools' / 'knowledge' / 'pack'
    (out / 'install.ps1').write_text((src / 'install.ps1').read_text(encoding='utf-8'), encoding='utf-8-sig')
    shutil.copy2(src / 'README.md', out / 'README.md')

    for p in sorted(out.iterdir()):
        print('  %-16s %6.1f МБ' % (p.name, size(p) / 2**20))
    print('пакет: %s' % out)


if __name__ == '__main__':
    main()
