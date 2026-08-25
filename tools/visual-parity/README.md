# Проверка визуальной идентичности

`compare.py` — поднимает две сборки на локальных портах (старую из корня репозитория
и новую), проходит 12 состояний и сравнивает область `#content` попиксельно.

Требуется Python с `playwright` и `pillow`:

```
pip install playwright pillow numpy
python -m playwright install chromium
python tools/visual-parity/compare.py
```

Внутри скрипта пути `OLD` и `NEW` указывают на корень репозитория — поправьте под себя.
`walk-new-build.py` — прогон новой сборки: реестр на 20 000 синтетических записей
и карточки всех пяти модулей, с отловом ошибок консоли. Быстрый smoke-тест после правок.

`baseline/` — эталонные скриншоты старой сборки (v0.29.0), снятые до рефакторинга.

`screenshot.py` — быстрый скриншот произвольного экрана: маршрут + (опционально)
несколько кликов по CSS-селекторам перед снимком. Используется при правке дизайна —
посмотреть, что реально получилось, и при самопроверке перед показом результата
пользователю (а не только полагаться на чтение кода). Печатает ошибки консоли/страницы.

```
python tools/visual-parity/screenshot.py --route "#/oc/apartment/oc-ap-1" --out oi-list.png
python tools/visual-parity/screenshot.py --route "#/oc/residential-house/oc-rh-1" \
    --click "tr[data-open-oi]:nth-of-type(1)" --out building-card.png --full-page
```

На Git Bash (Windows) обязательно `MSYS_NO_PATHCONV=1` перед командой — иначе
MSYS переписывает `--route "#/oc/..."` в путь файловой системы (аргумент, начинающийся
с `/`, выглядит для MSYS как unix-путь и молча подменяется на `C:/.../oc/...`).
