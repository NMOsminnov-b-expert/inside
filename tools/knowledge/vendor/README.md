# Библиотеки просмотра графа (вендорные копии)

Для `tools/knowledge/view_graph.py` — страница графа открывается файлом, без
интернета и без запросов наружу: код библиотек вставляется в страницу.

- `force-graph.min.js` — force-graph 1.51.5 (2D), MIT, `LICENSE-force-graph`.
- `3d-force-graph.min.js` — 3d-force-graph 1.80.0 (3D, внутри three.js), MIT,
  `LICENSE-3d-force-graph`.

Обновление: `npm pack force-graph 3d-force-graph`, взять `dist/*.min.js` и
`LICENSE`.
