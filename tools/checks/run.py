# -*- coding: utf-8 -*-
"""Запуск всех проверок макета.

    python tools/checks/run.py                 — все проверки
    python tools/checks/run.py архив ЕНИ       — только названные (по части имени)
    python tools/checks/run.py --show          — с открытым браузером, чтобы смотреть
    python tools/checks/run.py --jobs 1        — по одной, в одном браузере
    python tools/checks/run.py --slow          — ждать с запасом (втрое дольше предел)
    python tools/checks/run.py --no-retry      — без повтора упавших файлов

Проверки — это сценарии в браузере, а не модульные тесты: макет целиком про
интерфейс, и ломается в нём именно взаимодействие. Каждый файл check_*.py рядом
отвечает за свою область и объясняет в шапке, какие уже случавшиеся дефекты он
ловит, — чтобы через полгода было понятно, зачем сценарий написан.

Файлы идут параллельно, по процессу на файл: у каждого свой браузер, общий
только раздающий http-сервер. Ожидания внутри сценариев — не паузы, а ожидание
затишья DOM (см. harness.py). Файл, упавший на обычном ожидании, автоматически
повторяется с утроенным пределом: если со второго раза зелено, дело было в
скорости машины, а не в дефекте, и это видно в отчёте.
"""
import importlib.util
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import harness  # noqa: E402


def load_checks():
    mods = []
    for fn in sorted(os.listdir(HERE)):
        if not fn.startswith('check_') or not fn.endswith('.py'):
            continue
        mods.append(load_one(fn))
    return mods


def load_one(fn):
    spec = importlib.util.spec_from_file_location(fn[:-3], os.path.join(HERE, fn))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.FILE = fn
    return mod


# --- режим воркера: один файл, результат JSON-строкой в stdout ---------------
def worker(fn):
    mod = load_one(fn)
    checks, fails, secs, waited = harness.run_one(mod)
    print('@@RESULT@@' + json.dumps(
        {'name': mod.NAME, 'checks': checks, 'fails': fails, 'secs': secs,
         'waited': waited},
        ensure_ascii=False))
    return 0


def spawn(fn, cap, port):
    env = dict(os.environ, INSIDE_CHECKS_CAP=str(cap), INSIDE_CHECKS_PORT=str(port),
               PYTHONIOENCODING='utf-8')
    return subprocess.Popen(
        [sys.executable, os.path.join(HERE, 'run.py'), '--worker', fn],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
    )


def collect(proc):
    out, err = proc.communicate()
    text = (out or b'').decode('utf-8', 'replace')
    for line in text.splitlines():
        if line.startswith('@@RESULT@@'):
            return json.loads(line[len('@@RESULT@@'):])
    # Воркер не доложил — значит упал целиком, и это тоже провал.
    tail = ((err or b'').decode('utf-8', 'replace').strip().splitlines() or [''])[-1]
    return {'name': '?', 'checks': 0, 'fails': ['воркер не отчитался: %s' % tail[:160]],
            'secs': 0.0, 'waited': 0}


def batch(mods, jobs, cap):
    """Прогнать список файлов пачками по jobs процессов."""
    results = {}
    queue = list(mods)
    running = {}

    while queue or running:
        while queue and len(running) < jobs:
            mod = queue.pop(0)
            running[spawn(mod.FILE, cap, harness.PORT)] = mod

        done = [p for p in running if p.poll() is not None]
        if not done:
            p = next(iter(running))
            p.wait()
            done = [p]

        for p in done:
            mod = running.pop(p)
            results[mod.FILE] = collect(p)

    return results


def parallel(mods, jobs, cap, retry):
    srv = harness.serve()
    try:
        results = batch(mods, jobs, cap)

        # Второй заход для упавших — с утроенным пределом ожидания. Если со
        # второго раза зелено, дело было в скорости машины, а не в дефекте.
        again = [m for m in mods if results[m.FILE]['fails']] if retry else []
        if again:
            print('Повтор с полным ожиданием: %s\n' % ', '.join(m.NAME for m in again))
            for fn, res in batch(again, jobs, cap * 3).items():
                res['retried'] = True
                results[fn] = res
    finally:
        srv.terminate()

    total_checks = 0
    total_fails = []
    for mod in mods:
        r = results[mod.FILE]
        harness.report(r['name'] if r['name'] != '?' else mod.NAME,
                       r['checks'], r['fails'], r['secs'], r.get('waited', 0),
                       r.get('retried', False))
        total_checks += r['checks']
        total_fails += ['%s: %s' % (mod.NAME, f) for f in r['fails']]

    print('\nИТОГ: провалено %d из %d проверок' % (len(total_fails), total_checks))
    return 1 if total_fails else 0


def main():
    argv = sys.argv[1:]

    if '--worker' in argv:
        return worker(argv[argv.index('--worker') + 1])

    def opt(name, default):
        return argv[argv.index(name) + 1] if name in argv else default

    args = []
    skip = False
    for a in argv:
        if skip:
            skip = False
            continue
        if a in ('--jobs', '--cap'):
            skip = True
            continue
        if not a.startswith('--'):
            args.append(a)

    headless = '--show' not in argv
    cap = 3.0 if '--slow' in argv else float(opt('--cap', harness.CAP_SCALE))
    retry = '--no-retry' not in argv

    mods = load_checks()
    if args:
        want = [a.lower() for a in args]
        mods = [m for m in mods if any(w in m.NAME.lower() or w in m.__name__.lower() for w in want)]
        if not mods:
            print('Не нашлось проверок по запросу:', ', '.join(args))
            print('Доступны:', ', '.join(m.NAME for m in load_checks()))
            return 2

    # По процессу на файл, но не больше числа ядер: смысл в том, чтобы машина
    # работала на полную, а не в том, чтобы плодить браузеры сверх ядер.
    jobs = int(opt('--jobs', min(len(mods), os.cpu_count() or 4)))

    print('Проверок к запуску: %d, потоков: %d\n' % (len(mods), jobs))

    if jobs <= 1 or not headless:
        os.environ['INSIDE_CHECKS_CAP'] = str(cap)
        importlib.reload(harness)
        return harness.run_all(mods, headless=headless)

    return parallel(mods, jobs, cap, retry)


if __name__ == '__main__':
    sys.exit(main())
