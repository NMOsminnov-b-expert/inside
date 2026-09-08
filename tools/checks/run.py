# -*- coding: utf-8 -*-
"""Запуск проверок макета.

    python tools/checks/run.py --changed       — только то, чего касается правка
    python tools/checks/run.py                 — все проверки
    python tools/checks/run.py архив ЕНИ       — только названные (по части имени)
    python tools/checks/run.py --list          — что есть и от каких файлов зависит
    python tools/checks/run.py --show          — с открытым браузером, чтобы смотреть
    python tools/checks/run.py --jobs 1        — по одной, в одном браузере
    python tools/checks/run.py --slow          — ждать с запасом (втрое дольше предел)
    python tools/checks/run.py --no-retry      — без повтора упавших
    python tools/checks/run.py --profile       — на что ушло время внутри сценариев

Проверки — это сценарии в браузере, а не модульные тесты: макет целиком про
интерфейс, и ломается в нём именно взаимодействие. Каждый файл check_*.py рядом
отвечает за свою область и объясняет в шапке, какие уже случавшиеся дефекты он
ловит, — чтобы через полгода было понятно, зачем сценарий написан.

ДВА ЭТАПА. Требование пользователя 07.09.2026: «на минимальные правки уходит
куча затрат, это не дело; цель — оптимизация без потери качества».

  1. По ходу работы — `--changed`. Каждый сценарий объявляет TOUCHES: файлы, от
     которых он зависит. Запускается только то, чего касается правка, — секунды
     вместо минут. Всё неразобранное трактуется в сторону полного прогона, а не
     пропуска (см. select_changed.py), поэтому этап нельзя «обмануть» и пропустить
     дефект.
  2. Перед коммитом и отчётом пользователю — полный прогон, без ключей.

ЧЕМ ПОЛНЫЙ ПРОГОН БЫСТРЕЕ, ЧЕМ БЫЛ (157 с до правки 07.09.2026):

  * один браузер на несколько файлов. Раньше процесс поднимался на каждый файл,
    и подъём Playwright с Chromium (≈1,4 с) повторялся 25 раз — четверть всего
    времени уходила на старты. Теперь единицы прогона делятся на столько частей,
    сколько потоков, и внутри части браузер один (страница у каждой единицы
    своя: данные макета живут в памяти вкладки, и сценарии не должны видеть
    чужие правки);
  * тяжёлые сценарии разложены на части (PARTS в файле проверки) — обычно по
    типу ОЦ. Файл, который обходил пять модулей подряд и занимал 51 с, идёт
    пятью независимыми частями и раскладывается по потокам. Сумма работы та же,
    но хвост прогона больше не определяется одним файлом;
  * части раскладываются по замерам прошлого прогона (.times.json): самые долгие
    первыми, каждая — в самый свободный поток;
  * отчёт печатается по мере готовности, а не в конце. Провал видно на десятой
    секунде, и не нужно ждать конца прогона, чтобы прервать его.

Ожидания внутри сценариев — не паузы, а ожидание затишья DOM (см. harness.py).
Единица, упавшая на обычном ожидании, автоматически повторяется с утроенным
пределом: если со второго раза зелено, дело было в скорости машины, а не в
дефекте, и это видно в отчёте.
"""
import importlib.util
import json
import os
import queue
import subprocess
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import harness  # noqa: E402
import select_changed  # noqa: E402

# Замеры прошлых прогонов: по ним раскладываются единицы. Файл локальный, в git
# не нужен — пересобирается сам на любом полном прогоне.
TIMES = os.path.join(HERE, '.times.json')

# Сколько считать незамеренную единицу при раскладке: медиана замеров
# 07.09.2026 — около десяти секунд.
GUESS_SECS = 10.0


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


class Unit:
    """Единица прогона: файл целиком либо одна его часть.

    Части (PARTS) нужны тяжёлым сценариям, которые обходят все пять типов ОЦ:
    целым файлом такой сценарий занимает минуту и один держит весь прогон, а
    частями раскладывается по потокам.
    """

    def __init__(self, mod, part=None):
        self.mod = mod
        self.part = part
        self.file = mod.FILE
        self.key = mod.FILE + ('#' + part if part else '')
        self.name = mod.NAME + (' · ' + part if part else '')


def units_of(mods):
    out = []
    for mod in mods:
        parts = list(getattr(mod, 'PARTS', ()) or ())
        out += [Unit(mod, p) for p in parts] if parts else [Unit(mod)]
    return out


# --- режим воркера: своя часть прогона в одном браузере ----------------------
def worker(keys):
    """Прогнать переданные единицы, докладывая о каждой сразу, как готова."""
    loaded = {}
    with harness.browser() as br:
        for key in keys:
            fn, _, part = key.partition('#')
            if fn not in loaded:
                loaded[fn] = load_one(fn)
            res = harness.run_one(loaded[fn], part=part or None, browser_=br)
            res['key'] = key
            print('@@RESULT@@' + json.dumps(res, ensure_ascii=False), flush=True)
    return 0


def spawn(keys, cap, port):
    env = dict(os.environ, INSIDE_CHECKS_CAP=str(cap), INSIDE_CHECKS_PORT=str(port),
               PYTHONIOENCODING='utf-8')
    return subprocess.Popen(
        [sys.executable, os.path.join(HERE, 'run.py'), '--worker'] + list(keys),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
    )


def load_times():
    try:
        with open(TIMES, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_times(results):
    """Запомнить, сколько заняли единицы прогона.

    Сглаживаем пополам с прошлым замером: разовый выброс (машина была занята
    чем-то ещё) не должен перекашивать раскладку следующего прогона.
    """
    times = load_times()
    for key, r in results.items():
        if not r.get('secs') or r.get('retried'):
            continue                      # повтор шёл с утроенным пределом — не мерка
        was = times.get(key)
        times[key] = round(r['secs'] if was is None else (was + r['secs']) / 2, 1)
    try:
        with open(TIMES, 'w', encoding='utf-8') as f:
            json.dump(times, f, ensure_ascii=False, indent=1, sort_keys=True)
    except Exception:
        pass                              # замеры — удобство, а не условие работы


def plan(units, jobs, times):
    """Разложить единицы по потокам: долгие первыми, каждая — в самый свободный.

    Жадная раскладка (longest processing time first). От математического
    оптимума отстаёт на проценты, считается мгновенно и объяснима: хвост
    прогона определяется самой долгой единицей, а не порядком имён файлов.
    """
    jobs = max(1, jobs)
    order = sorted(units, key=lambda u: -times.get(u.key, GUESS_SECS))
    shards = [[] for _ in range(jobs)]
    load = [0.0] * jobs
    for u in order:
        i = load.index(min(load))
        shards[i].append(u)
        load[i] += times.get(u.key, GUESS_SECS)
    return [s for s in shards if s], [x for x in load if x]


def read_results(proc, out):
    """Читать доклады воркера по мере появления, а не в конце прогона."""
    for raw in proc.stdout:
        line = raw.decode('utf-8', 'replace').strip()
        if line.startswith('@@RESULT@@'):
            out.put(json.loads(line[len('@@RESULT@@'):]))
    proc.wait()
    err = (proc.stderr.read() or b'').decode('utf-8', 'replace').strip()
    out.put({'done': proc, 'err': err})


def batch(units, jobs, cap, profile=False, quiet=False):
    """Прогнать единицы, печатая отчёт по мере готовности."""
    shards, load = plan(units, jobs, load_times())
    if not quiet:
        print('Потоков: %d, единиц: %d (ожидаемо по потокам: %s)\n'
              % (len(shards), len(units), ', '.join('%.0f с' % x for x in load)))

    inbox = queue.Queue()
    procs = {}
    for shard in shards:
        p = spawn([u.key for u in shard], cap, harness.PORT)
        procs[p] = shard
        threading.Thread(target=read_results, args=(p, inbox), daemon=True).start()

    results = {}
    by_key = {u.key: u for u in units}
    left = len(shards)

    while left:
        msg = inbox.get()

        if 'done' in msg:
            left -= 1
            # Воркер закончил. Всё, о чём он не доложил, — провал: значит
            # процесс упал целиком и часть сценариев не прогонялась.
            tail = (msg.get('err') or '').strip().splitlines()
            for u in procs[msg['done']]:
                if u.key in results:
                    continue
                results[u.key] = {
                    'name': u.name, 'checks': 0, 'secs': 0.0, 'waited': 0,
                    'fails': ['воркер не отчитался: %s' % (tail[-1][:160] if tail else '—')],
                }
                harness.report(results[u.key], profile=profile, name=u.name)
            continue

        u = by_key.get(msg.get('key'))
        results[msg['key']] = msg
        harness.report(msg, profile=profile, name=u.name if u else msg.get('name'))

    return results


def run_parallel(units, jobs, cap, retry, profile):
    srv = harness.serve()
    try:
        results = batch(units, jobs, cap, profile)

        # Второй заход для упавших — с утроенным пределом ожидания. Если со
        # второго раза зелено, дело было в скорости машины, а не в дефекте.
        again = [u for u in units if results.get(u.key, {}).get('fails')] if retry else []
        if again:
            print('\nПовтор с полным ожиданием: %s' % ', '.join(u.name for u in again))
            for key, res in batch(again, jobs, cap * 3, profile, quiet=True).items():
                res['retried'] = True
                results[key] = res
    finally:
        srv.terminate()

    save_times(results)

    total_checks = 0
    total_fails = []
    for u in units:
        r = results.get(u.key) or {}
        total_checks += r.get('checks', 0)
        total_fails += ['%s: %s' % (u.name, f) for f in r.get('fails', ())]

    print('\nИТОГ: провалено %d из %d проверок' % (len(total_fails), total_checks))
    return 1 if total_fails else 0


def show_list(mods):
    """Что есть и от чего зависит: по этому списку правится TOUCHES."""
    times = load_times()
    print('Сценарий                       файл (замер прошлого прогона)')
    for m in mods:
        parts = list(getattr(m, 'PARTS', ()) or ())
        keys = [m.FILE + '#' + p for p in parts] or [m.FILE]
        secs = sum(times.get(k, 0.0) for k in keys)
        print('\n%-30s %s%s%s'
              % (m.NAME, m.FILE,
                 ', частей %d' % len(parts) if parts else '',
                 ', %.0f с' % secs if secs else ''))
        for p in getattr(m, 'TOUCHES', ()) or ():
            print('%32s<- %s' % ('', p))
        if not getattr(m, 'TOUCHES', ()):
            print('%32s← область не объявлена: попадает в любой прогон' % '')
    return 0


def main():
    argv = sys.argv[1:]

    if '--worker' in argv:
        return worker(argv[argv.index('--worker') + 1:])

    def opt(name, default):
        i = argv.index(name) + 1 if name in argv else 0
        return argv[i] if i and i < len(argv) and not argv[i].startswith('--') else default

    # Имена проверок — это доводы без «--», но у --jobs, --cap и --changed есть
    # своё значение следом, и его нельзя принять за имя. У --changed значение
    # необязательное, поэтому пропускаем следующий довод только если он есть и
    # сам не ключ: иначе «--changed --jobs 5» съедало бы --jobs, а «5»
    # оставалось бы искать среди имён проверок.
    args = []
    skip = False
    for i, a in enumerate(argv):
        if skip:
            skip = False
            continue
        if a in ('--jobs', '--cap', '--changed'):
            nxt = argv[i + 1] if i + 1 < len(argv) else ''
            skip = bool(nxt) and not nxt.startswith('--')
            continue
        if not a.startswith('--'):
            args.append(a)

    headless = '--show' not in argv
    cap = 3.0 if '--slow' in argv else float(opt('--cap', harness.CAP_SCALE))
    retry = '--no-retry' not in argv
    profile = '--profile' in argv

    mods = load_checks()

    if '--list' in argv:
        return show_list(mods)

    if args:
        want = [a.lower() for a in args]
        mods = [m for m in mods
                if any(w in m.NAME.lower() or w in m.__name__.lower() for w in want)]
        if not mods:
            print('Не нашлось проверок по запросу:', ', '.join(args))
            print('Доступны:', ', '.join(m.NAME for m in load_checks()))
            return 2

    if '--changed' in argv:
        mods, why = select_changed.select(mods, opt('--changed', None))
        print('Отбор по правкам: %s\n' % why)
        if not mods:
            return 0

    units = units_of(mods)

    # Потоков — на одно меньше числа ядер, но не больше шести.
    #
    # Раньше здесь стояла ПОЛОВИНА ядер, и по делу: процесс поднимался на каждый
    # файл проверок, браузеров за прогон было двадцать пять, и при потоке на
    # каждое ядро машина уходила в перегрузку. Проявлялось это не замедлением, а
    # ложными падениями — локатор не дожидался элемента, потому что отрисовка не
    # получала процессорного времени (провалы 04.09.2026: от прогона к прогону
    # падали разные проверки).
    #
    # Теперь браузер один на поток, а не один на файл, и живых браузеров ровно
    # столько, сколько потоков. Замер 07.09.2026 на шести ядрах: 3 потока —
    # 128 с, 5 потоков — 89 с, оба прогона без провалов. Предел в шесть — про
    # память: каждый браузер стоит своих сотен мегабайт, и на машине с большим
    # числом ядер их незачем плодить. Машина занята чем-то ещё — `--jobs 3`.
    default_jobs = max(2, min(6, (os.cpu_count() or 4) - 1))
    jobs = int(opt('--jobs', min(len(units), default_jobs)))

    if jobs <= 1 or not headless:
        os.environ['INSIDE_CHECKS_CAP'] = str(cap)
        importlib.reload(harness)
        return harness.run_all(units, headless=headless, profile=profile)

    return run_parallel(units, jobs, cap, retry, profile)


if __name__ == '__main__':
    sys.exit(main())
