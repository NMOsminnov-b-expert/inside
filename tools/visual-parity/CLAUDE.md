# Снимки экрана — как пользоваться

Подгружается при работе в `tools/visual-parity/`. Правило — запись графа
`claude-feedback-ui-polish-before-report` (перенесено из корневого CLAUDE.md
30.10.2026). Подробности — `README.md` рядом.

* Черновая проверка «на посмотреть» — `screenshot.py`: поднимает сервер,
  открывает маршрут (с кликами по селекторам), снимает, печатает ошибки
  консоли:

      python tools/visual-parity/screenshot.py --route "#/oc/apartment/oc-ap-1" --out check.png

* Снимок в отчёт пользователю — только `report.py`: раскладывает по
  `docs/screens/<комментарий коммита>/<блок>/<тип ОЦ>/<тип ОИ>/<имя>.png`
  (комментарий берётся из git сам; `--oi` опускается для уровня ОЦ; имена
  папок — транслитом):

      python tools/visual-parity/report.py --route "#/oc/civil/oc-cv-1" --click "tr[data-open-oi]" --oc civil --oi building --name floors

* Git Bash: перед командой обязательно `MSYS_NO_PATHCONV=1`, иначе
  `--route "#/oc/..."` молча становится путём файловой системы.
* Сложный сценарий (поля, select, сохранение и перезагрузка) — разовый
  Playwright-скрипт по тому же принципу (сервер + переходы +
  `page.screenshot()`), а не догадка по вёрстке.
* `walk-new-build.py` — тяжёлый прогон (реестр на 20000 записей + все
  модули), после структурных изменений.
