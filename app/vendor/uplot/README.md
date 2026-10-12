# uPlot — вендорная копия

uPlot 1.6.32 (MIT, Leon Sorokin, https://github.com/leeoniya/uPlot) — графики
статистики в панели осмотров (pages/inspections/stats.js). Просьба пользователя
12.10.2026: «общая статистика в виде графиков uplot».

Получено `npm pack uplot@1.6.32`, файлы `dist/uPlot.esm.js`, `dist/uPlot.min.css`
и `LICENSE` — без изменений. Подключение — ленивым `import()` и стилем при
первом показе графиков, как pdf.js (app/vendor/pdfjs/README.md): кто не
открывал панель осмотров, библиотеку не скачивает.
