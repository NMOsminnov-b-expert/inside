# -*- coding: utf-8 -*-
"""Экраны матрицы взаимодействий: раздел, роль, маршрут, подготовка.

Порядок охвата — ответ пользователя 13.10.2026 (запись графа matricy-
vzaimodeystviy-putey-i-scenarii-po-rolyam): «Осмотры», затем реестр и
карточки, затем справочники, архив, документы, учреждения.

Экран: name — имя в отчёте; section — раздел (ключ отбора в командной
строке); role — роль макета (kernel/session.js); route — адрес; wait —
признак отрисовки; prep — щелчки перед замером (CSS-селекторы по порядку);
touches — пути файлов, правка которых затрагивает экран (отбор --changed).
"""
from urllib.parse import quote

# Демо-данные детерминированы (kernel/inspectionsDemo.js): этот человек есть
# всегда, у него назначения, отчёты и профиль.
PERSON = 'Абдылдаев Айсултан Марсович'

_INSP_TOUCH = ('app/pages/inspections/', 'app/kernel/inspections', 'app/kernel/grid.js', 'app/kernel/xlsx.js',
               'app/kernel/mapgl.js', 'app/kernel/cadastreLayersGL.js', 'app/vendor/maplibre/')
_INSPECTOR_TOUCH = ('app/pages/inspector/', 'app/kernel/inspections')
_ALL = ['load', 'summary', 'table', 'reports', 'totals', 'norms', 'stats', 'fields']
_PERSON = ['trips', 'plan', 'route', 'reports', 'stats', 'assigns', 'profile', 'car']

SCREENS = []

# Оболочка (меню слева, крошки, шапка) одна на все экраны: её действия
# гоняются на первом экране раздела (shell=True), на остальных — нет.
SHELL_BLOCKS = ('aside.sidebar', 'nav.side-nav', 'header.topbar', 'button.sidebar-toggle', 'nav.crumbs', 'div.side-foot')

# Задуманное (как поле «ожидаемо» в APCS): флаг у такого действия — по
# замыслу, в отчёте идёт строчными с причиной. label — подпись действия
# (начало), flags — какие флаги задуманы.
EXPECTED = [
    {'label': 'Свернуть меню', 'flags': ['СДВИГ'], 'why': 'меню сворачивается — содержимое страницы становится шире по замыслу'},
    # appeared — появился блок с этим именем: панель выбранного рядом со
    # списком (правило «без модальных окон», bez-modalok-prostranstvo-celikom-
    # stili-iz-yadra) сужает колонку, и шапка над ней перестраивается.
    {'appeared': 'ip-pane[Подробности]', 'flags': ['СДВИГ'], 'why': 'панель выбранного открывается рядом со списком (без окон поверх) — колонка сужается по замыслу'},
]


def _add(name, section, role, route, wait, touches, prep=()):
    first = not any(s['section'] == section for s in SCREENS)
    SCREENS.append({'name': name, 'section': section, 'role': role, 'route': route,
                    'wait': wait, 'touches': touches, 'prep': list(prep), 'shell': first})


_add('Осмотры · К назначению', 'osmotry', 'rm', '#/inspections?s=assign&t=queue', '[data-ip-section]', _INSP_TOUCH)
# «Назначено» — сначала сотрудник, потом его объекты (перестройка 13.10.2026):
# три уровня — список сотрудников, все назначения, объекты одного сотрудника.
_add('Осмотры · Назначено · сотрудники', 'osmotry', 'rm', '#/inspections?s=assign&t=assigned', '[data-ip-section]', _INSP_TOUCH)
_add('Осмотры · Назначено · все', 'osmotry', 'rm', '#/inspections?s=assign&t=assigned&ap=*', '[data-ip-section]', _INSP_TOUCH)
_add('Осмотры · Назначено · сотрудник', 'osmotry', 'rm', '#/inspections?s=assign&t=assigned&ap=' + quote(PERSON), '[data-ip-section]', _INSP_TOUCH)
for k in _ALL:
    _add('Осмотры · Все осмотрщики · ' + k, 'osmotry', 'rm', '#/inspections?s=people&t=' + k, '[data-ip-section]', _INSP_TOUCH)
for k in _PERSON:
    _add('Осмотры · Осмотрщик · ' + k, 'osmotry', 'rm', '#/inspections?s=people&p=%s&t=%s' % (quote(PERSON), k),
         '[data-ip-section]', _INSP_TOUCH)
_add('Осмотры · Кадастр', 'osmotry', 'rm', '#/inspections?s=cadastre', '[data-ip-section]', _INSP_TOUCH)
_add('Осмотры · Уведомления', 'osmotry', 'rm', '#/inspections?s=notes', '[data-ip-section]', _INSP_TOUCH)
_add('Осмотры · История', 'osmotry', 'rm', '#/inspections?s=history', '[data-ip-section]', _INSP_TOUCH)
_SCANS_TOUCH = ('app/pages/scans/', 'app/kernel/scanQueue.js', 'app/kernel/inspectionResults.js', 'app/kernel/inspections')
_add('Сканы с осмотров · Ждёт разбора', 'osmotry', 'rm', '#/scans', '.sc-main', _SCANS_TOUCH)
_add('Сканы с осмотров · Принято', 'osmotry', 'rm', '#/scans?state=accepted', '.sc-main', _SCANS_TOUCH)
_add('Сканы с осмотров · Возвращено', 'osmotry', 'rm', '#/scans?state=returned', '.sc-main', _SCANS_TOUCH)

# Разделы верхнего уровня экрана осмотрщика (14.10.2026): Сегодня · Задачи ·
# Запросы · Уведомления.
_add('Осмотрщик · Сегодня', 'osmotry', 'insp', '#/insp?as=' + quote(PERSON), '.ins-body', _INSPECTOR_TOUCH)
_add('Осмотрщик · Задачи', 'osmotry', 'insp', '#/insp?as=' + quote(PERSON) + '&tab=tasks', '.ins-page, .ins-list, main', _INSPECTOR_TOUCH)
_add('Осмотрщик · Запросы', 'osmotry', 'insp', '#/insp?as=' + quote(PERSON) + '&tab=cad', '.ins-body', _INSPECTOR_TOUCH)
_add('Осмотрщик · Уведомления', 'osmotry', 'insp', '#/insp?as=' + quote(PERSON) + '&tab=notes', '.ins-body', _INSPECTOR_TOUCH)
_add('Осмотрщик · Задача', 'osmotry', 'insp', '#/insp?as=' + quote(PERSON), '.ins-page, .ins-list, main', _INSPECTOR_TOUCH,
     prep=['a[href^="#/insp/"]'])
# Опись у осмотрщика (этап Б, 29.10.2026): демо-опись приложена к
# назначению на «Осминнов Н.» по oc-cv-1.
_add('Осмотрщик · Опись', 'osmotry', 'insp', '#/insp/civil/oc-cv-1/inv/inv-mt-adm?as=' + quote('Осминнов Н.'), '.inv-list',
     _INSPECTOR_TOUCH + ('app/kernel/inventories.js',))
# Осмотр ТС (этап А, 27.10.2026): ОЦ «ТС» с модулем и без адреса, форма «на
# месте»; выявленное ТС в блоке «Выявлено».
_TS_TOUCH = _INSPECTOR_TOUCH + ('app/modules/vehicle/inspect.js', 'app/modules/vehicle/data/seed.js', 'app/kernel/geoHere.js')
_add('Осмотрщик · Осмотр ТС', 'osmotry', 'insp', '#/insp/vehicle/oc-vehicle-d2/object/ts?as=' + quote(PERSON), '.ins-acc', _TS_TOUCH)
_add('Осмотрщик · Объект · выявленное ТС', 'osmotry', 'insp', '#/insp/civil/oc-cv-1/object?as=' + quote('Бабашова Даяна Алтынбековна'),
     '.ins-oi', _TS_TOUCH)
