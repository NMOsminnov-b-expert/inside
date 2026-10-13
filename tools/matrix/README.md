# Матрицы: пути и взаимодействия

Практики APCS, приспособленные к макету (записи графа
`matrica-putey-chto-ostalos-posle-deystviya`,
`matrica-vzaimodeystviy-kto-na-kogo-deystvuet`; правило
`matricy-i-scenarii-derzhat-v-aktualnom-sostoyanii`).

**Матрица путей** — «что осталось после действия». Путь — шаги человека из
сценария роли; после шагов сверяется видимое состояние. Оси: путь × ширина
(1920, 1600, 1280, 1100, 900, 760) × роль. Быстрая — гоняется всегда.

    python tools/matrix/paths.py                 # все пути
    python tools/matrix/paths.py --changed       # затронутые правкой
    python tools/matrix/paths.py --path jump --widths 1600,760

**Матрица взаимодействий** — «кто на кого действует». На экране находятся
все действия и все блоки сами; каждое действие — 3 повтора на свежей
странице, каждый блок — каждый кадр. Флаги — в шапке `interactions.py`.
Тяжёлая: после правки — `--changed`, полностью (`--all`) — по просьбе
пользователя.

    python tools/matrix/interactions.py --changed
    python tools/matrix/interactions.py --screen Кадастр --repeats 1

Отчёты — `out/` (вне git); таблица для человека:

    python tools/docs/build_matrix_report.py     # docs/matricy-i-scenarii.xlsx

Где что:

* `screens.py` — экраны (раздел, роль, маршрут, подготовка, `touches`) и
  `EXPECTED` — задуманное, которое не считается находкой;
* `paths_<раздел>.py` — пути раздела и снимок состояния (`STATE_JS`);
* `recorder.js` — запись в странице: блоки, действия, кадры;
* стенд — `tools/checks/serve.py`: без `__persist`, правки остаются в
  браузере, `data/local` не трогается; запросы не к стенду отклоняются.

Новый путь — функция с декоратором `@path(id, название, код сценария)`;
шаги — методы `P` (`open`, `click`, `fill`, `key`, `back`, `state`, `eq`,
`ck`). Путь сначала должен упасть на известной ошибке — иначе он ничего не
проверяет (правило APCS «проверять как человек»).
