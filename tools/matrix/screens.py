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
_ALL = ['summary', 'table', 'reports', 'totals', 'norms', 'stats', 'fields']
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
# Общий срез (ТЗ экрана регионалов 17.11.2026): область и учреждение — в адресе.
_add('Осмотры · Планирование · срез по учреждению', 'osmotry', 'rm', '#/inspections?s=assign&t=queue&i=' + quote('Министерство'), '.ip-qswitch', _INSP_TOUCH)
# Центр Планирования (этапы 2–3): сетка «осмотрщик × день» — слои «План» и «Факт»; карта.
_add('Осмотры · Планирование · сетка', 'osmotry', 'rm', '#/inspections?s=assign&t=queue', '.ip-board .ip-ld-b', _INSP_TOUCH)
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

# Осмотрщик — веб-страница осмотрщика (перенос приложения «Осмотр» в веб,
# 16.11.2026; образец вида — мобильный вид стенда). Приложение «Осмотр» в рамке
# убрано 17.11.2026 (пользователь: «Старое приложение убираем»).
_OM_TOUCH = ('app/pages/osmotr/', 'app/kernel/router.js', 'app/kernel/inspections.js', 'app/pages/inspection/tasks.js')
_add('Осмотрщик · Сегодня', 'osmotry', 'insp', '#/osmotr', '.om-app[data-v="today"]', _OM_TOUCH)
_add('Осмотрщик · Выезды · Недвижимое', 'osmotry', 'insp', '#/osmotr?v=trips&f=real', '.om-app[data-v="trips"]', _OM_TOUCH)
_add('Осмотрщик · Выезды · К осмотру', 'osmotry', 'insp', '#/osmotr?v=trips', '.om-app[data-v="trips"]', _OM_TOUCH)
_add('Осмотрщик · Выезды · Все', 'osmotry', 'insp', '#/osmotr?v=trips&s=all', '.om-app[data-v="trips"]', _OM_TOUCH)
_add('Осмотрщик · Выезды · Оборудование', 'osmotry', 'insp', '#/osmotr?v=trips&f=inv', '.om-app[data-v="trips"]', _OM_TOUCH)
_add('Осмотрщик · Поиск', 'osmotry', 'insp', '#/osmotr?v=search&q=' + quote('Бишкек'), '.om-app[data-v="search"]', _OM_TOUCH)
_add('Осмотрщик · Меню', 'osmotry', 'insp', '#/osmotr?v=menu', '.om-app[data-v="menu"]', _OM_TOUCH)
_add('Осмотрщик · Объект имущества', 'osmotry', 'insp', '#/osmotr?v=oi&id=' + quote('civil|oc-cv-1') + '&oi=oi-cv1-b', '.om-app[data-v="oi"] .om-secrow', _OM_TOUCH)
_add('Осмотрщик · Раздел осмотра', 'osmotry', 'insp', '#/osmotr?v=sec&id=' + quote('civil|oc-cv-1') + '&oi=oi-cv1-b&s=nets', '.om-app[data-v="sec"] .om-field', _OM_TOUCH)
_add('Осмотрщик · Входящие', 'osmotry', 'insp', '#/osmotr?v=notes', '.om-app[data-v="notes"]', _OM_TOUCH)
_add('Осмотрщик · Отчёт дня', 'osmotry', 'insp', '#/osmotr?v=report', '.om-app[data-v="report"] [data-morning]', _OM_TOUCH)
_add('Осмотрщик · Запросы документов', 'osmotry', 'insp', '#/osmotr?v=cad', '.om-app[data-v="cad"]', _OM_TOUCH)
_add('Осмотрщик · Планы', 'osmotry', 'insp', '#/osmotr?v=plans', '.om-app[data-v="plans"] .om-days', _OM_TOUCH)
_add('Осмотрщик · Инструкции', 'osmotry', 'insp', '#/osmotr?v=instr', '.om-app[data-v="instr"]', _OM_TOUCH)

# Аналитика · Земли по айыл аймакам (04.11.2026): Дарек и Кадастр — записанными
# ответами (harness: map.darek.kg, use_cadastre_fixture).
_add('Аналитика · Земли по айыл аймакам', 'analytics', 'rm', '#/analytics', '.an-page',
     ('app/pages/analytics/', 'app/kernel/landStats.js', 'app/kernel/darekAdmin.js', 'app/kernel/mapgl.js'))
