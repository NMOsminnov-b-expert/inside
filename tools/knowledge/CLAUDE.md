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

## Два поиска

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
  по смыслу любит длинные `docs/tz` — запись графа в выдаче ценнее.
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
  в фоне запускают `tools/hooks/reindex.py`: `codegraph sync` и отдельным
  процессом дообновление индекса по смыслу (только изменённые файлы).
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
