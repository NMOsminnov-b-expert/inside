# -*- coding: utf-8 -*-
"""
Веб-страница осмотрщика (17.11.2026): «Инструкции» — как в приложении «Осмотр» (InstructionsScreen.kt).

Инструкции — документы компании, в git их нет (data/local/instructions); проверка подменяет их выдуманными.

Что ловит сценарий:
  * в меню нет «Инструкции»; список не по группам;
  * поиск по тексту не находит слово внутри инструкции или не ведёт к найденному месту;
  * в документе нет полосы разделов, жирного, пунктов списка, фото, страниц бланка и файла для организации;
  * у объекта имущества нет подсказки «Инструкция: …» по его виду;
  * нет инструкций на устройстве — экран пустой или падает, а не говорит об этом;
  * на 360 пикселях экраны прокручиваются вбок.
"""
import json

from harness import use_cadastre_fixture

NAME = 'инструкции (веб)'

TOUCHES = ('app/pages/osmotr/*',)

INDEX = [
    {'id': 'fast', 'title': 'Общая памятка', 'group': 'Быстрый осмотр'},
    {'id': 'otdelnoe', 'title': 'Отдельностоящее помещение', 'group': 'Недвижимость'},
    {'id': 'akt', 'title': 'Акт проверочный', 'group': 'Документы для организации'},
]
PNG = bytes.fromhex('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
                    '1f15c4890000000d4944415478da63f8cfc0f01f0005000201a5c0a3d40000000049454e44ae426082')
DOCS = {
    'fast': {'id': 'fast', 'title': 'Общая памятка', 'group': 'Быстрый осмотр', 'memo': {'f': 'memo.png', 'w': 10, 'h': 10}, 'blocks': [
        {'k': 'h', 'lvl': 1, 'runs': [['Общая памятка', 1]]},
        {'k': 'h', 'lvl': 2, 'runs': [['1. Снаружи', 1]]},
        {'k': 'p', 'runs': [['Снять ', 0], ['фасад', 1], [' целиком.', 0]]},
        {'k': 'li', 'm': '•', 'lvl': 1, 'runs': [['угол здания', 0]]},
        {'k': 'h', 'lvl': 2, 'runs': [['2. Внутри', 1]]},
        {'k': 'p', 'runs': [['Проверочноеслово в разделе внутри.', 0]]},
        {'k': 'img', 'items': [{'f': '01.png', 'w': 10, 'h': 10, 'cap': [['подпись', 0]]}], 'cap': []},
    ]},
    'otdelnoe': {'id': 'otdelnoe', 'title': 'Отдельностоящее помещение', 'group': 'Недвижимость', 'blocks': [{'k': 'p', 'runs': [['Текст', 0]]}]},
    'akt': {'id': 'akt', 'title': 'Акт проверочный', 'group': 'Документы для организации', 'pdf': 'original.pdf', 'blocks': [],
            'pages': [{'f': 'page-1.png', 'w': 10, 'h': 14}]},
}


def serve(route):
    path = route.request.url.split('/data/local/instructions/', 1)[1].split('?')[0]
    if path == 'index.json':
        return route.fulfill(status=200, content_type='application/json', body=json.dumps(INDEX, ensure_ascii=False))
    folder, _, name = path.partition('/')
    if name == 'doc.json' and folder in DOCS:
        return route.fulfill(status=200, content_type='application/json', body=json.dumps(DOCS[folder], ensure_ascii=False))
    if name.endswith('.png'):
        return route.fulfill(status=200, content_type='image/png', body=PNG)
    if name.endswith('.pdf'):
        return route.fulfill(status=200, content_type='application/pdf', body=b'%PDF-1.4\n')
    return route.fulfill(status=404, body='')


def run(t):
    pg = t.page
    use_cadastre_fixture(pg)
    pg.route('**/data/local/instructions/**', serve)
    pg.set_viewport_size({'width': 400, 'height': 860})

    t.open('#/osmotr?v=menu', wait='.om-app[data-v="menu"]')
    t.ck(pg.locator('.om-row', has_text='Инструкции').count() == 1, 'в меню нет «Инструкции»')
    pg.locator('.om-row', has_text='Инструкции').click()
    t.ck(t.wait_until("() => document.querySelectorAll('.om-app[data-v=instr] .om-sec').length === 3"), 'список инструкций не по трём группам')

    # Поиск по тексту.
    pg.fill('#om-instr-q', 'проверочноеслово')
    t.ck(t.wait_until("() => /Найдено: 1/.test(document.querySelector('.om-scr').textContent)"), 'поиск не нашёл слово внутри инструкции')
    pg.locator('.om-group .om-row').first.click()
    t.ck(t.wait_until("() => /id=fast/.test(location.hash) && !!document.querySelector('.om-instr')"), 'находка поиска не открыла инструкцию')
    t.ck(t.wait_until("() => { const r = document.querySelector('#om-ib-5').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }"),
         'инструкция из поиска не прокручена к найденному месту')

    # Документ.
    t.ck(pg.locator('.om-itoc [data-instr-go]').count() == 2, 'нет полосы из двух разделов')
    t.ck(pg.locator('.om-instr .om-ip b', has_text='фасад').count() == 1, 'жирное в тексте потеряно')
    t.ck(pg.locator('.om-instr .om-ili').count() == 1, 'нет пункта списка')
    t.ck(pg.locator('.om-instr .om-ifig img').count() == 2, 'нет памятки и фото')
    t.ck('подпись' in pg.locator('.om-instr figcaption').inner_text(), 'нет подписи фото')
    t.open('#/osmotr?v=instr&id=akt', wait='.om-instr')
    t.ck(pg.locator('.om-instr .om-ifig img').count() == 1, 'нет страницы бланка')
    t.ck(pg.locator('.om-instr a[download][href$="original.pdf"]').count() == 1, 'нет файла для организации')

    # Подсказка у объекта имущества: литера нежилого здания — «Отдельностоящее помещение».
    t.open('#/osmotr?v=oi&id=civil%7Coc-cv-1&oi=oi-cv1-b', wait='.om-app[data-v="oi"] .om-secrow')
    t.ck(t.wait_until("() => !!document.querySelector('.om-instr-hint a[href*=\"id=otdelnoe\"]')"), 'у литеры нет подсказки «Инструкция: …»')

    pg.set_viewport_size({'width': 360, 'height': 780})
    for route in ('#/osmotr?v=instr', '#/osmotr?v=instr&id=fast'):
        t.open(route, wait='.om-app .om-title')
        over = pg.evaluate("() => { const s = document.querySelector('.om-scr'); return s.scrollWidth - s.clientWidth; }")
        t.ck(over <= 0, '%s на 360 px прокручивается вбок на %d px' % (route, over))

    # Нет инструкций на устройстве.
    pg.unroute('**/data/local/instructions/**')
    # Ответ 404 браузер пишет ошибкой в консоль (проверка её ловит) — «нет» подаётся пустым ответом.
    pg.route('**/data/local/instructions/**', lambda r: r.fulfill(status=200, content_type='application/json', body='null'))
    pg.reload()
    t.open('#/osmotr?v=instr', wait='.om-app[data-v="instr"]')
    t.ck(t.wait_until("() => /Инструкций на этом устройстве нет/.test(document.querySelector('.om-scr').textContent)"), 'без инструкций нет сообщения об этом')
