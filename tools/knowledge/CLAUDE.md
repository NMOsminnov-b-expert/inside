# Граф знаний и поиск — устройство

Подгружается, когда работа идёт в `tools/knowledge/`. Порядок работы с
графом — корневой CLAUDE.md и правило графа `graf-proekta-poryadok-raboty`;
здесь — как устроены база, поиски и индексы (перенесено из корневого
CLAUDE.md 30.10.2026 при аудите настроек).

## База графа

* Источник записей — база `knowledge` в PostgreSQL поиска по смыслу
  (localhost:5432, `%LOCALAPPDATA%\semsearch`), `tools/knowledge/store.py`;
  решение `graf-znaniy-v-postgresql-papka-knowledge-vygruzka`. Таблицы
  `record`, `history`; виды `rec` (поля столбцами), `link` (связи строками).
* `knowledge/` — выгрузка из базы (файлы-константы), не в git (решение
  `graf-znaniy-ne-uhodit-v-git-tolko-na-etom-kompyutere`; папка — в
  `.git/info/exclude`, CodeGraph видит её через `codegraph.json`
  `"include": ["knowledge/"]`). Файл, изменённый в обход базы (программа
  «Граф проекта», руками), при следующем вызове `graph.py` забирается в базу.
* Копия базы — раз в день при `graph.py check`, `.graf/knowledge-backup/`;
  восстановление — `pg_restore -c -d knowledge <файл>`. Разовая копия файлов
  до переноса — `.graf/knowledge-kopiya-2026-10-29.zip`.
* В других ветках `knowledge/` ещё в git: переход на них и обратно удалит
  файлы выгрузки с диска — база не пострадает, `graph.py sync` выгрузит заново.
* Устройство записи — `knowledge/README.md`; папки: `decisions`, `rules`,
  `questions`, `tasks`, `practices`, `sources`, `tools`, `code`, `terms`,
  `concepts`, `fields`, `project`. Почему константы Python: CodeGraph ищет
  только по значениям констант кода (YAML — одни ключи, Markdown не читает).
* Оглавление — запись `oglavlenie-grafa`, связи «раздел» → карты
  `karta-razdela-*` (связи «якорь», пункт «Метки раздела: …»). Новая тема —
  новая карта и связь «раздел»; новая ключевая запись — связь «якорь».
* Правила — папка `rules`, группа — метка `правила-работа | -интерфейс |
  -проверки | -код`; `graph.py rules` выводит по группам.

## Связь с кодом (по образцу UnDiscord, 17.11.2026)

Пользователь: «Возьми идею графа оттуда… начинай миграцию. Полноценную».
Задача `graf-znaniy-po-obrazcu-undiscord-pole-code-svyaz-zapisi-s-faylom-koman`.

* Поля записи: `CODE` (`код`) — пути к файлам и папкам, при необходимости с
  символом (`app/kernel/inspections.js:carryOver`); `SUMMARY` (`кратко`) —
  суть одной строкой; `SEVERITY` (`важность`: критично, высоко, средне,
  низко); `CLOSED` (`закрыто`) — дата закрытия, ставится сама при
  `set <id> статус закрыт|отменено`. Те же поля — в `tools/graf/Model/Record.cs`.
* Новая запись о коде — с `--code <путь>` (повторяемый), правка —
  `set <id> код путь1,путь2`. Путь проверяется сразу.
* `graph.py code <путь>` — всё знание о файле или папке (по CODE и по
  упоминанию в тексте); `stale [дней]` — записи, чей код менялся коммитом
  позже записи; `debt [--all]` — открытый техдолг по важности;
  `code-fill [--apply]` — CODE по путям из текста записей (17.11.2026
  заполнено так у 425 записей; важность из меток «важно»/«средне» — у 112,
  дата закрытия из журнала базы — у 209).
* `check`: у действующей записи путь из CODE, которого нет, или символ,
  которого нет в файле, — ошибка (знание отстало от кода); у закрытой и
  отменённой — нет.
* Хуки: SessionStart печатает «отстали от кода» и «техдолга»; post-commit —
  действующие записи о файлах коммита (`code --commit HEAD`): их сверить.
* Граф кода — codebase-memory-mcp v0.12.1 (пользователь 17.11.2026:
  «codebase лучше чем codegraph. Ставим ее»; замер APCS: 9 ответов из 10
  против 6, контекст ~4 тыс. токенов против 37 тыс.). Программа —
  `%LOCALAPPDATA%\codebase-memory-mcp\bin` (архив с GitHub, sha256 сверен с
  выпуском), без установщика: подключена только к этому проекту (`.mcp.json`,
  `enabledMcpjsonServers` в `.claude/settings.local.json`); веб-страница
  программы выключена (`config set ui_enabled false`). Индекс —
  `~/.cache/codebase-memory-mcp/`, проект `C-vs-code-inside`, обновляется
  `reindex.py --code` (после коммита и `graph.py check`), около 16 с.
  `knowledge/` в индекс не попадает (вне git) — граф ищется `graph.py find`.
  CodeGraph остаётся только источником выгрузки `code_export.py` для экрана
  кода программы «Граф проекта».

## Поиск

С 17.11.2026 — только CodeGraph; поиск по смыслу (semsearch) не используется
(пользователь: «от semsearch отказываемся в пользу другого сервиса»). Ниже про
semsearch — прежнее устройство; PostgreSQL графа по-прежнему живёт в
`%LOCALAPPDATA%\semsearch`.


* **CodeGraph** — по словам: `codegraph query "<слово>"` или инструмент
  `codegraph_explore`. Индекс — `codegraph sync`.
* **semsearch** — по смыслу: инструмент `search_code`, `project_id`
  `inside-v2` (нарезка по смысловым фрагментам, 15.10.2026). Модель —
  Qwen3-Embedding-0.6B (решение 02.10.2026: в десятке 64% против 49% у
  nomic); инструкция модели к запросу — `EMBED_QUERY_PREFIX` в `.env`.
  Реранкер Qwen3-Reranker-0.6B (llama-server 127.0.0.1:8091; около 18 с на
  поиск на ЦП; без него — `search_code(..., rerank=false)`), запись
  `reranker-dlya-poiska-po-grafu-znaniy`.
* Вместе находят больше (замер 29.09.2026: 8 и 11 из 15 по отдельности, 13
  вместе; запись `poisk-po-smyslu-codebase-mcp-s-lokalnoy-modelyu`). Поиск
  по смыслу любит длинные `docs/тз` — запись графа в выдаче ценнее.
* PostgreSQL и Ollama — в `%LOCALAPPDATA%\semsearch`, только на localhost;
  поднимает и гасит `svc.py` (`status | up | down`), `graph.py` поднимает
  PostgreSQL сам. Всё, что ходит к ним из Python, — с
  `NO_PROXY=127.0.0.1,localhost` (задано в настройках Claude Code, `env`):
  иначе запросы идут через корпоративный прокси.
* Сканер semsearch (наша правка в `src\services\scanner.py`) берёт файлы,
  отслеживаемые git, плюс папки из `include` в `codegraph.json`. Сырые и
  сгенерированные данные — в `.mcpignore`.

## Индексы

* После коммита — хук `tools/hooks/post-commit` (подключение `git config
  core.hooksPath tools/hooks`); после правки графа — `graph.py check`. Оба
  в фоне запускают `tools/hooks/reindex.py --code` — только `codegraph sync`
  (индекс по смыслу не обновляется с 17.11.2026).
  Вручную — `reindex.py --code | --sem | --stop`, или программа «Граф
  проекта» → «Ещё».
* Ход — `.graf/index-status.json`; журналы — `.graf/reindex-code.log`,
  `.graf/reindex-sem.log`. Выгрузки для программы: `code_export.py` (после
  `codegraph sync`), `semantic_export.py` (под Python окружения semsearch).
* Индекс по смыслу целиком:

      "%LOCALAPPDATA%\semsearch\src\codebase-mcp\.venv\Scripts\python.exe" "%LOCALAPPDATA%\semsearch\client.py" index "C:/vs code/inside" inside-v2

## Мультиграф

Решение 13.10.2026, запись `multigraf-otdelnye-grafy-proektov-i-poisk-po-vsem`:
у других проектов — свои графы (файлами), например APCS. `graph.py graphs`
— список; `--project APCS find …` — нужный; `--all find …` — по всем.
Ссылаясь — называть граф: «граф APCS, запись <ID>». Применённое здесь —
своей записью макета.
