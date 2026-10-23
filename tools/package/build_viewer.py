# -*- coding: utf-8 -*-
"""Сборка макета для показа: один exe с Python и макетом внутри, в zip.

Решение пользователя 23.10.2026: «Надо собрать в архив макет для просмотров. С
установкой питона и потом запуском прокси для осмотров. Само собой с отдачей
всего сайта… пользователь просто запустил легкое приложение, нажал запустить и
оно все само поставило, открыло браузер»; «Каждый у себя при этом запускает
макет»; в сборке — засев и карточки сотрудников, правки зрителя сохраняются у
него.

    python tools/package/build_viewer.py                 # в C:/vs code/inside-dist (zip и exe)
    python tools/package/build_viewer.py --out D:/показ

Что внутри exe (окно запуска — tools/package/launcher/Launcher.cs):
  python.zip — встраиваемый Python с python.org (скачивается один раз, кэш —
               %LOCALAPPDATA%/inside-pack-cache); серверам хватает стандартной
               библиотеки;
  site.zip   — app.html и app/ (файлы из git, в том виде, как лежат на диске),
               tools/serve.py (сервер макета и правок), tools/cadastre/proxy.py
               (прокси Кадастра: карта осмотра, адрес по ЕНИ), data/local/*.json
               (карточки сотрудников — какие есть на этом компьютере);
  build.txt  — коммит и время сборки: окно запуска по нему решает, менять ли
               установленный макет.

Сборка кладётся вне репозитория: в git ей не место, а .gitignore не трогаем.
"""
import argparse
import datetime
import io
import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
PY_VER = '3.12.10'  # последняя 3.12 со встраиваемым выпуском под Windows
PY_URL = 'https://www.python.org/ftp/python/%s/python-%s-embed-amd64.zip' % (PY_VER, PY_VER)
CACHE = os.path.join(os.environ.get('LOCALAPPDATA', ROOT), 'inside-pack-cache')
CSC = r'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
NAME = 'Макет E-state'
SITE_FILES = ['app.html', 'app']
SITE_TOOLS = ['tools/serve.py', 'tools/cadastre/proxy.py']


def python_zip():
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, os.path.basename(PY_URL))
    if not os.path.exists(path):
        print('скачиваю', PY_URL)
        data = urllib.request.urlopen(PY_URL, timeout=120).read()
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            if 'python.exe' not in z.namelist():
                raise SystemExit('в скачанном архиве нет python.exe')
        with open(path, 'wb') as fp:
            fp.write(data)
    return path


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, encoding='utf-8').stdout.strip()


def site_zip(path):
    tracked = git('ls-files', '-z', '--', *SITE_FILES).split('\0')
    files = [f for f in tracked if f and os.path.isfile(os.path.join(ROOT, f))] + SITE_TOOLS
    local = os.path.join(ROOT, 'data', 'local')
    cards = sorted(f for f in os.listdir(local) if f.endswith('.json') and f != 'manifest.json') if os.path.isdir(local) else []
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in files:
            z.write(os.path.join(ROOT, f), f)
        for c in cards:
            z.write(os.path.join(local, c), 'data/local/' + c)
    return len(files), cards


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(ROOT), 'inside-dist'))
    args = ap.parse_args()
    if not os.path.exists(CSC):
        raise SystemExit('нет компилятора C# (%s) — нужен .NET Framework 4' % CSC)

    work = os.path.join(CACHE, 'build')
    os.makedirs(work, exist_ok=True)
    os.makedirs(args.out, exist_ok=True)

    head = git('rev-parse', '--short', 'HEAD')
    dirty = ' (с правками сверх коммита)' if git('status', '--porcelain', '--', *SITE_FILES, *SITE_TOOLS) else ''
    stamp = datetime.datetime.now().strftime('%d.%m.%Y %H:%M')
    build = 'коммит %s%s, сборка %s' % (head, dirty, stamp)
    for name, text in (('build.txt', build), ('python.txt', PY_VER)):
        with open(os.path.join(work, name), 'w', encoding='utf-8') as fp:
            fp.write(text)

    py = python_zip()
    n, cards = site_zip(os.path.join(work, 'site.zip'))

    exe = os.path.join(work, 'launcher.exe')
    fw = os.path.dirname(CSC)
    cmd = [CSC, '/nologo', '/target:winexe', '/optimize+', '/codepage:65001', '/out:' + exe,
           '/r:System.dll', '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll',
           '/r:' + os.path.join(fw, 'System.IO.Compression.dll'),
           '/r:' + os.path.join(fw, 'System.IO.Compression.FileSystem.dll'),
           '/resource:%s,python.zip' % py,
           '/resource:%s,site.zip' % os.path.join(work, 'site.zip'),
           '/resource:%s,build.txt' % os.path.join(work, 'build.txt'),
           '/resource:%s,python.txt' % os.path.join(work, 'python.txt'),
           os.path.join(HERE, 'launcher', 'Launcher.cs')]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='cp866', errors='replace')
    if r.returncode != 0:
        print(r.stdout, r.stderr)
        raise SystemExit('exe не собран')

    out = os.path.join(args.out, NAME + '.zip')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(exe, NAME + '.exe')
    print('готово: %s (%.1f МБ)' % (out, os.path.getsize(out) / 2 ** 20))
    print('  %s; файлов макета %d; карточки: %s' % (build, n, ', '.join(cards) or 'нет'))
    # exe и рядом с архивом: его можно передать и без распаковки.
    plain = os.path.join(args.out, NAME + '.exe')
    shutil.copyfile(exe, plain)
    print('  exe отдельно: %s' % plain)


if __name__ == '__main__':
    sys.exit(main())
