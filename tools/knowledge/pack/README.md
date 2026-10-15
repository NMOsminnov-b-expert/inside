# Граф знаний — установка

Пакет: `graf.bundle` (граф знаний и обвязка), `katalog.bundle` (каталог по
описям, если положен), `infra\codegraph` (CodeGraph), `infra\graf-dist`
(программа «Граф проекта»), `install.ps1`.

Нужны git и Python 3 в PATH, Claude Code. Установка и обновление — одна
команда из папки пакета:

    powershell -ExecutionPolicy Bypass -File install.ps1 -Target "C:\graf"

Что делает:

* графы — клон из пакета в `C:\graf\graf` и `C:\graf\katalog`; при повторном
  запуске с новым пакетом — подтягивает новые коммиты (свои сохраняются);
* CodeGraph — в `%LOCALAPPDATA%\codegraph\current`, индекс обоих графов,
  подключение к Claude Code (`claude mcp add codegraph --scope user …`);
* программа «Граф проекта» — в `C:\graf\graf\tools\graf\dist`, ярлык на
  рабочем столе;
* хук: после каждого коммита индекс CodeGraph обновляется сам
  (`git config core.hooksPath tools/hooks`);
* каталог — в мультиграф (`graph.py graphs add`).

Поиска по смыслу (semsearch) в пакете нет — хук и программа его пропускают.

Claude Code запускать в `C:\graf\graf`: там `CLAUDE.md` с порядком работы.
