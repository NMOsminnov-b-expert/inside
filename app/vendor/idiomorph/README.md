# idiomorph — вендорная копия

idiomorph 0.8.0 (0BSD, Big Sky Software, https://github.com/bigskysoftware/idiomorph) —
сверка дерева разметки вместо замены: существующее дерево приводится к новой
разметке, совпавшие узлы правятся на месте. Подключается в
`app/kernel/morph.js`; перерисовка карточек ОЦ и ОИ (`scope.setHTML` у экранов
модулей) идёт через неё. Решение пользователя 26.10.2026 «Решай проблемы
перерисовки» (вопрос графа `pererisovka-ekrana-pri-izmenenii`).

Получено с https://cdn.jsdelivr.net/npm/idiomorph@0.8.0/ — файлы
`dist/idiomorph.esm.js` и `LICENSE` без изменений.
