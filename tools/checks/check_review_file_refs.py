# -*- coding: utf-8 -*-
"""Ссылки на файлы из файлов сотрудников: только настоящие.

Код-ревью 09.10.2026 (docs/kod-revyu.xlsx): dataUrl из файлов сотрудников
(data/local/*.json — JSON, который можно поправить руками) вставлялся в
разметку просмотрщика и фото (src, style) без проверки. kernel/persist.js
cleanFileRefs пропускает только blob: и data: с картинкой или PDF — и
проверяет ссылку целиком: строка «data:image/png,x" onerror=…» начиналась
правильно и выходила из атрибута. Кроме того, в местах вставки ссылка
экранируется.

Что ловит сценарий: посторонняя строка в dataUrl (разметка, javascript:,
data:text/html, правильное начало с кавычкой дальше) остаётся в данных;
настоящая ссылка (blob:, base64-картинка, PDF) убирается.
"""
NAME = 'файлы сотрудников: ссылки на файлы'

TOUCHES = ('app/kernel/persist.js',)


def run(t):
    pg = t.page
    t.open('', wait='.reg-tr')
    r = pg.evaluate("""async () => {
      const p = await import('./app/kernel/persist.js');
      const bad = ["x');alert(1)//", 'javascript:alert(1)', 'data:text/html,<b>x</b>',
        'data:image/png,x" onerror="alert(1)'];
      const good = ['data:image/png;base64,AAAA', 'blob:http://127.0.0.1/abc-1', 'data:application/pdf;base64,AA'];
      const docs = [...bad, ...good].map((u) => ({ file: { dataUrl: u } }));
      p.cleanFileRefs({ sources: { 'records.civil': { x: { at: '1', item: { docs } } } } });
      return { bad: docs.slice(0, bad.length).map((d) => [d.file.dataUrl || null, !!d.file.fileLost]),
               good: docs.slice(bad.length).map((d) => [d.file.dataUrl || null, !!d.file.fileLost]) };
    }""")
    t.ck(all(x[0] is None and x[1] for x in r['bad']), 'посторонние строки остались в dataUrl: %s' % r['bad'])
    t.ck(all(x[0] and not x[1] for x in r['good']), 'настоящие ссылки на файлы убраны: %s' % r['good'])
