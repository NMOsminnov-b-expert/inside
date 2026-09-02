# -*- coding: utf-8 -*-
"""Запуск всех проверок макета.

    python tools/checks/run.py                 — все проверки
    python tools/checks/run.py архив ЕНИ       — только названные (по части имени)
    python tools/checks/run.py --show          — с открытым браузером, чтобы смотреть

Проверки — это сценарии в браузере, а не модульные тесты: макет целиком про
интерфейс, и ломается в нём именно взаимодействие. Каждый файл check_*.py рядом
отвечает за свою область и объясняет в шапке, какие уже случавшиеся дефекты он
ловит, — чтобы через полгода было понятно, зачем сценарий написан.
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import harness  # noqa: E402


def load_checks():
    mods = []
    for fn in sorted(os.listdir(HERE)):
        if not fn.startswith('check_') or not fn.endswith('.py'):
            continue
        spec = importlib.util.spec_from_file_location(fn[:-3], os.path.join(HERE, fn))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mods.append(mod)
    return mods


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    headless = '--show' not in sys.argv

    mods = load_checks()
    if args:
        want = [a.lower() for a in args]
        mods = [m for m in mods if any(w in m.NAME.lower() or w in m.__name__.lower() for w in want)]
        if not mods:
            print('Не нашлось проверок по запросу:', ', '.join(args))
            print('Доступны:', ', '.join(m.NAME for m in load_checks()))
            return 2

    print('Проверок к запуску: %d\n' % len(mods))
    return harness.run_all(mods, headless=headless)


if __name__ == '__main__':
    sys.exit(main())
