# -*- coding: utf-8 -*-
"""Разбор: как избавиться от перерисовки экрана при добавлении и удалении.

Зачем скрипт, а не документ руками. Половина разбора — замеры, и они меняются
вместе с макетом: число полей на карточке, вес разметки, время пересборки.
Здесь они снимаются с живых экранов, поэтому документ пересобирается одной
командой и не расходится с макетом.

    python tools/docs/build_render_analysis.py

На выходе — docs/pererisovka-razbor.docx (локальный файл, никуда не
выгружается).
"""
import io
import os
import subprocess
import sys
import time

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOCS = os.path.join(ROOT, 'docs')
OUT = os.path.join(DOCS, 'pererisovka-razbor.docx')
PORT = 5598

# Экраны, на которых меряем: самый лёгкий, самый тяжёлый и перечень.
SCREENS = [
    ('#/oc/civil/oc-cv-1', 'Карточка объекта оценки (перечень ОИ)', '+ Собственник'),
    ('#/oc/civil/oc-cv-1/oi/oi-cv1-a', 'Карточка литеры', '+ Добавить строку'),
    ('#/oc/civil/oc-cv-1/oi/oi-cv1-m1', 'Карточка механизмов', '+ Поле'),
]

MEASURE = """async (label) => {
  const root = document.querySelector('#screen') || document.body;
  const find = () => [...document.querySelectorAll('button')]
    .find((b) => b.textContent.trim() === label);

  const before = root.innerHTML;
  const input = root.querySelector('input.input');
  if (input) input.focus();

  const btn = find();
  let ms = null;
  let changed = null;
  let keptFocus = null;

  if (btn) {
    const t0 = performance.now();
    btn.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    ms = Math.round(performance.now() - t0);
    keptFocus = input ? document.activeElement === input : null;

    const after = root.innerHTML;
    let head = 0;
    while (head < before.length && head < after.length && before[head] === after[head]) head++;
    let tail = 0;
    while (tail < before.length - head && tail < after.length - head
      && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
    changed = Math.round((after.length - head - tail) / after.length * 1000) / 10;
  }

  return {
    nodes: root.querySelectorAll('*').length,
    fields: root.querySelectorAll('input, select, textarea').length,
    buttons: root.querySelectorAll('button').length,
    kb: Math.round(root.innerHTML.length / 1024),
    ms,
    changed,
    keptFocus,
  };
}"""


def measure():
    """Снять замеры с живых экранов."""
    from playwright.sync_api import sync_playwright

    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    rows = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={'width': 1600, 'height': 1000})
            for route, title, label in SCREENS:
                pg.goto('http://127.0.0.1:%d/app.html%s' % (PORT, route))
                pg.wait_for_selector('.card')
                pg.wait_for_timeout(900)
                rows.append((title, pg.evaluate(MEASURE, label)))
            b.close()
    finally:
        srv.terminate()
    return rows


def h(doc, text, level):
    doc.add_heading(text, level=level)


def p(doc, text, bold=False):
    par = doc.add_paragraph()
    run = par.add_run(text)
    run.bold = bold
    run.font.size = Pt(11)
    return par


def bullets(doc, items):
    for item in items:
        doc.add_paragraph(item, style='List Bullet')


def steps(doc, items):
    for item in items:
        doc.add_paragraph(item, style='List Number')


def table(doc, head, rows):
    t = doc.add_table(rows=1, cols=len(head))
    t.style = 'Light Grid Accent 1'
    for i, name in enumerate(head):
        cell = t.rows[0].cells[i]
        cell.text = name
        cell.paragraphs[0].runs[0].bold = True
    for row in rows:
        cells = t.add_row().cells
        for i, value in enumerate(row):
            cells[i].text = str(value)
            if i:
                cells[i].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
    return t


def build(rows):
    doc = Document()
    doc.styles['Normal'].font.size = Pt(11)

    h(doc, 'Перерисовка экрана при добавлении и удалении', 0)

    h(doc, 'Как устроена отрисовка сейчас', 1)
    p(doc, 'Экран собирается в строку разметки и целиком кладётся в область через '
           'scope.setHTML (app/kernel/scope.js): root.innerHTML = html. Сразу после этого '
           'весь корень обходят два усилителя — свои выпадающие списки (kernel/dropdown.js) '
           'и всплытие мультивыборов (kernel/msDrop.js), — а контроллер карточки заново '
           'навешивает обработчики на каждый элемент.')
    p(doc, 'Так работает любое изменение: добавили строку в таблицу — пересобран весь экран. '
           'В модуле гражданского здания вызовов такой пересборки 68.')

    h(doc, 'Во что это обходится', 1)
    p(doc, 'Замеры сняты с живых экранов при добавлении одной строки:')
    table(doc,
          ['Экран', 'Узлов', 'Полей', 'Разметка, КБ', 'Пересборка, мс', 'Изменилось, %'],
          [(title, m['nodes'], m['fields'], m['kb'],
            '—' if m['ms'] is None else m['ms'],
            '—' if m['changed'] is None else m['changed']) for title, m in rows])
    p(doc, 'Главная цифра — последний столбец: при добавлении строки на карточке литеры '
           'на самом деле меняется около процента разметки, а пересобирается сто процентов. '
           'Остальное — работа впустую.')

    p(doc, 'Что при этом теряется:', bold=True)
    bullets(doc, [
        'Фокус и каретка. После добавления строки активным элементом становится body — '
        'человек, набиравший в поле, теряет место ввода.',
        'Выделение текста, состояние прокрутки внутренних блоков, начатые переходы CSS.',
        'Раскрытые списки и аккордеоны — они переживают пересборку только потому, что их '
        'состояние вынесено в ctx.ui и восстанавливается при отрисовке. Половина ctx.ui '
        'существует ради этого, а не ради дела.',
        'Загруженные тяжёлые узлы: страницы PDF в просмотрщике приходится рисовать заново.',
    ])

    p(doc, 'Обходные приёмы, уже написанные в макете:', bold=True)
    bullets(doc, [
        'oi/mech/ctrl.js — refreshList: обновляет только ячейки строк состава.',
        'oi/building/floors.view.js — updateFloorsUI: обновляет поля развёртки поштучно, '
        'пропуская поле в фокусе.',
        'Оба написаны вручную под свою карточку. Это работает, но повторяется в каждой '
        'карточке заново и легко расходится: в составе механизмов уже ловили дефект, когда '
        'точечное обновление строки стирало кнопку удаления вместе с обработчиком.',
    ])

    h(doc, 'Что нужно, чтобы избавиться полностью', 1)
    p(doc, 'Три меры, каждая самостоятельна и даёт результат сама по себе. Вместе они '
           'закрывают вопрос целиком.')

    h(doc, '1. Сверка дерева вместо замены — одна правка в ядре', 2)
    p(doc, 'Вместо root.innerHTML = html строить новое дерево в памяти и ПРИВОДИТЬ к нему '
           'существующее: совпадающие узлы править на месте, недостающие добавлять, лишние '
           'убирать. Это известный приём (morphdom, idiomorph, Alpine.morph): узлы, '
           'совпавшие по id или ключу, не пересоздаются, поэтому фокус, каретка, прокрутка и '
           'обработчики сохраняются сами.')
    p(doc, 'Почему это главная мера: контроллеры продолжают звать ctx.render() как раньше — '
           'менять 68 мест не нужно, — но перерисовки не происходит. Точечные обновления, '
           'написанные вручную, после этого можно убрать.')
    bullets(doc, [
        'Объём: свой алгоритм сверки — около двухсот строк в ядре, либо вендоринг idiomorph '
        '(8 КБ) по тому же порядку, что принят для PDF.js.',
        'Обязательное условие — устойчивые ключи: строки таблиц и блоки карточек должны '
        'иметь id или data-key. В перечне ОИ ключ уже есть (data-open-oi с идентификатором), '
        'у полей карточки — собственные id; проставить нужно строкам таблиц и повторяющимся '
        'блокам.',
        'Усилители списков (dropdown, msDrop) вызывать не на весь корень, а только на '
        'добавленные поддеревья — иначе экономия съедается обходом.',
        'Узлы, которых нет в шаблоне (кнопка своего выпадающего списка, canvas страницы PDF), '
        'помечать как неприкосновенные, чтобы сверка их не трогала.',
    ])

    h(doc, '2. Делегирование событий вместо перепривязки', 2)
    p(doc, 'Сейчас обработчики вешаются на каждый элемент при каждой отрисовке: на карточке '
           'литеры это около 170 кнопок и 300 полей. В ядре уже есть scope.on — один '
           'слушатель на корень с выбором по селектору; он переживает любые изменения '
           'разметки и вешается один раз за жизнь экрана.')
    bullets(doc, [
        'Снимает вторую половину стоимости отрисовки.',
        'Убирает целый класс дефектов: обработчик больше не может «потеряться» после '
        'точечного обновления куска разметки.',
        'Начинать с перечня ОИ и таблиц состава — там элементов больше всего.',
    ])

    h(doc, '3. Списки с ключами', 2)
    p(doc, 'Для таблиц (перечень ОИ, поэтажная развёртка, состав техники, пристройки) — '
           'одна функция ядра, которая по ключу вставляет, убирает и переставляет ТОЛЬКО '
           'затронутые строки. Нужна и при сверке дерева: без ключей вставка строки в начало '
           'списка выглядит как изменение всех строк подряд.')

    h(doc, 'Порядок внедрения', 1)
    steps(doc, [
        'Ядро: рядом с setHTML появляется patch — та же подпись, другой способ применения. '
        'Ничего не ломает: экраны переводятся по одному.',
        'Проставить ключи строкам таблиц и повторяющимся блокам карточек.',
        'Перевести на patch первый экран — карточку механизмов или ТС (там уже есть свои '
        'сценарии проверок), замерить и сверить поведение.',
        'Перевести остальные карточки модуля гражданского здания, затем остальные модули.',
        'Перевести привязки на делегирование, начиная с перечня ОИ.',
        'Убрать ручные точечные обновления (refreshList, updateFloorsUI) — они станут лишними.',
    ])

    h(doc, 'Как проверять, что стало лучше', 1)
    bullets(doc, [
        'Сценарий в tools/checks: после добавления строки фокус остался в поле, каретка на '
        'месте, выделение не сброшено.',
        'Тот же сценарий проверяет, что узлы не пересозданы: пометить узел признаком до '
        'изменения и убедиться, что признак уцелел.',
        'Замеры этого документа пересобираются одной командой и показывают, как изменились '
        'время и доля перерисованного.',
    ])

    h(doc, 'Что решать отдельно', 1)
    bullets(doc, [
        'Ключи для строк, у которых нет собственного идентификатора (например, строки '
        'развёртки нумеруются позицией): нужен устойчивый ключ, иначе удаление строки из '
        'середины сдвинет все последующие.',
        'Состояние в ctx.ui: часть его (раскрытые блоки, выбранная единица) после сверки '
        'дерева можно держать прямо в разметке, часть — оставить, потому что она нужна и '
        'при переходе между экранами.',
        'Внешняя зависимость: писать свой алгоритм сверки или вендорить готовый — решение '
        'того же порядка, что принималось по PDF.js.',
    ])

    doc.save(OUT)


if __name__ == '__main__':
    if not os.path.isdir(DOCS):
        os.makedirs(DOCS)
    data = measure()
    build(data)
    io.open(sys.stdout.fileno(), 'w', encoding='utf-8', closefd=False).write(
        'собрано: %s\n' % os.path.relpath(OUT, ROOT)
        + ''.join('  %s: узлов %d, полей %d, %d КБ, пересборка %s мс, изменилось %s%%\n'
                  % (t, m['nodes'], m['fields'], m['kb'], m['ms'], m['changed']) for t, m in data))
