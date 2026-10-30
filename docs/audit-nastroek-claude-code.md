# Аудит настроек Claude Code — 30.10.2026

Записка разработчику. Повод — просьба пользователя 30.10.2026: «давай проведем
аудит твоих настроек. Тщательный аудит. Надо выяснить, что можно улучшить,
собрать практики». Запись графа — `audit-nastroek-claude-code-30-10-2026`
(задача), практики — `praktiki-nastroyki-claude-code` (практика).

Источник практик — официальная документация Claude Code,
https://code.claude.com/docs/en/ (страницы `settings-reference`, `permissions`,
`memory`, `hooks`, `sub-agents`, `env-vars`, `data-usage`, `claude-directory`),
прочитана 30.10.2026. Запросы — общими словами, без сведений о проекте.

## Что стоит сейчас

| Где | Что |
|---|---|
| `%USERPROFILE%\.claude\settings.json` | `model: opus`, `effortLevel: high`, хук `UserPromptSubmit` → `codegraph prompt-hook`, разрешено `mcp__codegraph__*`, `agentPushNotifEnabled` |
| `%USERPROFILE%\.claude\CLAUDE.md` | только блок CodeGraph |
| `%USERPROFILE%\.claude.json` | MCP-сервер `codegraph` (stdio, локальный) |
| `.mcp.json` (проект) | MCP-сервер `semsearch` (локальный) |
| `.claude\settings.local.json` (проект) | семь разовых разрешений Bash от прошлых задач (`verify_audit_v3.py`, `npm pack`, `tar … pdfjs-dist`) |
| `CLAUDE.md` (проект) | 593 строки, 52 КБ |
| навыки | `ui-ux-pro-max`, `c4-architecture`, `find-skills` (ссылки на `~/.agents/skills`) |
| хуки git | `tools/hooks/post-commit` → фоновая переиндексация; `pre-commit` и `commit-msg` нет |
| память Claude | `projects/c--vs-code-inside/memory/MEMORY.md` — одна строка-указатель на граф |
| граф | 77 действующих правил (`graph.py rules`) |

## Найдено

### Безопасность — «данные наружу не уходят»

1. **Запрет выгрузки держится только на тексте CLAUDE.md.** В настройках нет ни
   одного `deny`. Инструменты публикации доступны: `Artifact` (страница на
   claude.ai) и подключения claude.ai (Claude Docs) — они появились в сессии
   30.10.2026 сами. Практика: CLAUDE.md — контекст, а не запрет; жёсткий запрет —
   `permissions.deny` и хуки.
2. **`git push` и `npm publish` не закрыты настройкой.** Правило «push — только по
   прямой просьбе» соблюдается на честном слове. Запрет `Bash(git push *)` не
   ловит `git -C . push` — надёжнее хук `PreToolUse`, который спрашивает
   подтверждение на любой `push`.
3. **Расшифровки разговоров лежат в `.claude/` открытым текстом** — со всем, что
   читалось: файлами, выводом команд, содержимым базы описей. Сейчас
   `projects/c--vs-code-inside` — 2,2 ГБ: разговор с 21.08.2026 — один файл
   на 1,3 ГБ (он и не закрывался, только сжимался), и бесхозный
   `{04cf4f58-…}.tmp` на 840 МБ от 12.10.2026. Это прямо задевает решение
   28.09.2026 «логи в .claude — потенциальная утечка». Срок хранения не задан
   (по умолчанию 30 дней, но к живому разговору это не применяется).
4. **Строка соавторства.** Claude Code сам подкладывает в коммиты
   `Co-Authored-By: Claude`, правило проекта это запрещает; держится на
   CLAUDE.md. В настройках есть `attribution.commit` / `attribution.pr`
   (`includeCoAuthoredBy` устарел).
5. **WebFetch отправляет имя хоста** на api.anthropic.com для проверки по списку
   блокировок (путь не отправляет). Отключается `skipWebFetchPreflight: true`.
6. **Телеметрия и отчёты об ошибках включены** (ничего не отключено).
   Выключатели — переменные `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`,
   `DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING`, в пользовательских настройках
   (в проектных они игнорируются).
7. **Автопамять Claude включена**, хотя заметки в `.claude/` запрещены; в ней
   одна строка-указатель. Выключатель — `autoMemoryEnabled: false`.

### Контекст и скорость

8. **CLAUDE.md — 593 строки, 52 КБ.** Документация советует до 200 строк: длинный
   файл хуже соблюдается. Самые большие разделы: «Граф проекта» — 11 КБ (в нём
   много устройства индексов, которое нужно раз в месяц), «Правила работы с
   пользователем» — 7 КБ, «Дизайн по практикам» — 5 КБ, «Автопроверки» — 4 КБ,
   «Данные наружу» — 4,6 КБ. Импорты `@файл` контекст не экономят (грузятся
   сразу). Экономят: вложенные `CLAUDE.md` в подпапках (`tools/checks/`,
   `tools/matrix/`, `tools/knowledge/`) — грузятся, только когда работа идёт в
   этой папке; `.claude/rules/*.md` с `paths:` — но в `.claude/` знаний не держим.
9. **Один разговор на всё** с 21.08.2026 — каждое сжатие теряет подробности.
   Практика: новый разговор на задачу; переход между задачами — через граф.
10. **Хук `UserPromptSubmit` CodeGraph** выполняется на каждое сообщение; по
    умолчанию у такого хука 30 с. Замечаний нет, держать в виду, если ответ
    начинается с задержкой.
11. **`NO_PROXY` не задан в настройках** — каждый раз вписывается в команду руками.
    Блок `env` в `settings.json` распространяется на все процессы, которые
    запускает Claude Code.

### Правила и граф

12. **Дубли правил.** Одно и то же правило записано по 2–3 раза:
    * спрашивать при бизнес-неоднозначности — `claude-feedback-ask-on-business-ambiguity`,
      `claude-md-biznes-logika-vs-kod-dizayn-kogda-sprashivat`,
      `sprashivat-pri-biznes-neodnoznachnosti`;
    * граф — первый источник — `graf-znaniy-pervyy-istochnik`,
      `graf-proekta-poryadok-raboty`;
    * практики перед дизайном — `sbor-praktik-pered-dizaynom`,
      `claude-md-dizayn-po-obscheprinyatym-praktikam-a-ne-po-naitiyu`;
    * проверка UI снимками — `claude-md-proverka-ui-pri-pravke-dizayna`,
      `claude-md-otchetnost-skrinshotami-obyazatelna-pri-pravke-stranic`,
      `claude-feedback-ui-polish-before-report`.
13. **Устаревшие правила со статусом «действует»:**
    * `claude-project-civil-card-correction` — работа в ветке
      `карточка-гражданского-здания` (сентябрь);
    * `claude-project-rashozhdeniya-plan` — план от 11.09.2026;
    * `graf-proekta-poryadok-raboty` — «коммит вместе с правкой графа»,
      `project_id inside` — после 29.10.2026 неверно;
    * описание в шапке `tools/knowledge/graph.py` — «граф в git, журнал —
      история коммитов».
14. **Среди правил — практики** (`avtorastuschee-pole`, `vvod-vin`,
    `vychislenie-v-chislovom-pole`, `oformlenie-*`, `tablica-imya-znachenie`,
    `status-stepper-v-shapke`): они в папке `rules` и попадают в `graph.py rules`,
    который читается в начале каждой работы.
15. **Исправлено сразу:** CLAUDE.md называл проект поиска по смыслу `inside`, а
    переиндексация пишет в `inside-v2` (с 15.10.2026) — поиск шёл по старому
    индексу. Теперь `inside-v2`.

### Порядок работы

16. **Нет git-хуков на правила коммита:** строка в журнале изменений и строка
    авторства держатся на памяти. `commit-msg` может отклонять
    `Co-Authored-By: Claude` и требовать «Подготовлено в Claude Code…»;
    `pre-commit` — требовать `change_log_data.py`, если тронуты `app/` или `tools/`.
17. **Модели помощников** (Sonnet — исполнение, Haiku — сбор) задаются руками при
    каждом вызове. Можно закрепить: агенты проекта `.claude/agents/*.md` с полем
    `model` — но это файлы в `.claude/`; либо переменная
    `CLAUDE_CODE_SUBAGENT_MODEL`.
18. **Проверка «всё поднято» после перерыва** выполняется руками. Хук
    `SessionStart` может сам запускать `svc.py status` и `graph.py toc`/`rules` и
    подкладывать вывод в начало разговора.
19. **`settings.local.json`** — разовые разрешения от прошлых задач, не нужны.

## Предложения — ждут решения пользователя

Ничего из этого не применено. Пользовательские настройки
(`%USERPROFILE%\.claude\settings.json`) — по одному на пункт:

```json
{
  "cleanupPeriodDays": 7,
  "autoMemoryEnabled": false,
  "disableClaudeAiConnectors": true,
  "enableArtifact": false,
  "skipWebFetchPreflight": true,
  "attribution": { "commit": "", "pr": "" },
  "env": {
    "NO_PROXY": "127.0.0.1,localhost",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "DISABLE_ERROR_REPORTING": "1"
  },
  "permissions": {
    "deny": ["Artifact", "Bash(npm publish *)"],
    "ask":  ["Bash(git push *)"]
  }
}
```

* `attribution` — точное значение, скрывающее строку, в документации не
  найдено; проверить пробным коммитом.
* `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` отключает и автообновление —
  обновлять Claude Code тогда вручную.
* Хук `PreToolUse` на `git push` в любом написании (`git -C … push`) — сильнее,
  чем `ask`.

Уборка (только с разрешения): удалить бесхозный `.tmp` на 840 МБ; закрыть
текущий разговор и начинать новый на задачу; очистить `settings.local.json`.

Граф: свести дубли правил в одну запись (остальные — «заменено»), устаревшие —
«снято», практики — в `practices`; поправить `graf-proekta-poryadok-raboty` и
шапку `graph.py`.

CLAUDE.md: ужать до выжимки правил со ссылками на записи графа; подробности
устройства индексов, проверок и матриц — во вложенные `CLAUDE.md` при своих
папках (`tools/knowledge/`, `tools/checks/`, `tools/matrix/`) или в граф.

Хуки: `commit-msg` (авторство), `pre-commit` (журнал изменений), `SessionStart`
(состояние инструментов и правила графа).
