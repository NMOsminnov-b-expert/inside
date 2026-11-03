"""Сборка приложения «Осмотр» (PWA) → app/vendor/osmotr — страница осмотрщиков макета.

Решение пользователя 03.11.2026: «Тогда подтягиваем и PWA в макет. Это и будет
страница осмотрщиков». Приложение — отдельный репозиторий (по умолчанию
C:/vs code/osmotr); его интерфейс не переписывается, а берётся сборкой.

    python tools/osmotr/sync_pwa.py [--repo ПУТЬ] [--build]

--build — сначала собрать (Gradle, нужен JDK 21: JAVA_HOME или
%LOCALAPPDATA%/jdk/jdk-21*). Без --build берётся готовая папка сборки
shared/build/dist/wasmJs/productionExecutable. После копирования — sw.js
(служебный кэш приложения, tools/web/sw.mjs репозитория приложения): без него
регистрация кэша падает и заставка показывает «браузер не подходит».
Карты исходников (.map) не копируются.
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEST = os.path.join(ROOT, 'app', 'vendor', 'osmotr')
DIST = os.path.join('shared', 'build', 'dist', 'wasmJs', 'productionExecutable')


def java_home():
    if os.environ.get('JAVA_HOME'):
        return os.environ['JAVA_HOME']
    found = sorted(glob.glob(os.path.join(os.environ.get('LOCALAPPDATA', ''), 'jdk', 'jdk-21*')))
    if not found:
        sys.exit('нет JDK 21: укажите JAVA_HOME')
    return found[-1]


def build(repo):
    env = dict(os.environ, JAVA_HOME=java_home())
    gradlew = os.path.join(repo, 'gradlew.bat' if os.name == 'nt' else 'gradlew')
    for task in (':shared:compileProductionExecutableKotlinWasmJsOptimize', ':shared:wasmJsBrowserDistribution'):
        extra = ['--rerun'] if 'Optimize' in task else []
        subprocess.run([gradlew, '-Posmotr.web', task, *extra, '--console=plain', '-q'], cwd=repo, env=env, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default=r'C:/vs code/osmotr')
    ap.add_argument('--build', action='store_true')
    a = ap.parse_args()
    if a.build:
        build(a.repo)
    src = os.path.join(a.repo, DIST)
    if not os.path.isfile(os.path.join(src, 'index.html')):
        sys.exit(f'нет сборки: {src} (запустите с --build)')
    shutil.rmtree(DEST, ignore_errors=True)
    shutil.copytree(src, DEST, ignore=shutil.ignore_patterns('*.map', 'sw.js'))
    subprocess.run(['node', os.path.join(a.repo, 'tools', 'web', 'sw.mjs'), DEST], check=True)
    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(DEST) for f in fs)
    rev = subprocess.run(['git', '-C', a.repo, 'log', '-1', '--format=%h %ad %s', '--date=short'],
                         capture_output=True, text=True, encoding='utf-8').stdout.strip()
    with open(os.path.join(DEST, 'VERSION.txt'), 'w', encoding='utf-8') as f:
        f.write(f'Приложение «Осмотр», коммит {rev}\n')
    # Страница осмотрщиков (pages/osmotr) по этому файлу узнаёт, есть ли сборка.
    with open(DEST + '.json', 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'present': True, 'app': rev}, f, ensure_ascii=False)
        f.write('\n')
    print(f'готово: {DEST} — {size / 1e6:.1f} МБ; коммит приложения {rev}')


if __name__ == '__main__':
    main()
