# -*- coding: utf-8 -*-
"""Наведение порядка в графе: виды связей и заголовки записей — через книгу
на согласование.

    python tools/knowledge/structure_review.py build   # docs/graf-struktura.xlsx
    python tools/knowledge/structure_review.py apply   # применить книгу к графу

Задача пользователя 28.09.2026: «граф сильно запутан — структуризацию
организовать»; выбраны два пункта: сократить виды связей и переписать
заголовки-заглушки. Порядок — книга на просмотр, правка колонки «Станет» в
Excel, затем apply: скрипт меняет только то, что в книге, и ничего сверх.

Лист «Виды связей»: нынешний вид, сколько раз встречается, во что сливается
(словарь — VOCAB). Лист «Заголовки»: записи с заголовком-заглушкой («03.09.2026:»,
«Задача пользователя 17.09.2026:») — предложенный заголовок по содержанию.
Прежний заголовок — начало первого пункта записи, поэтому при замене ничего
не теряется.

Дополнено 28.09.2026 («Берем все» — практики записи
kak-uluchshat-graf-znaniy-…):
  * словарь по образцу SKOS: у вида связи — обратное имя (программа
    показывает связь с другой стороны, вторым экземпляром она не пишется)
    и род: иерархия, история, смысловая;
  * лист «Разбиение» — пункты записей с 10+ пунктами: «да» в «Выделить» —
    пункт становится своей записью (одна запись — одна мысль), связанной с
    прежней как «часть»;
  * лист «Кандидаты связей» — пары от graph.py suggest: вид из словаря в
    «Связь» — связь ставится; «заменяет» — вторая запись снимается (ADR);
  * лист «Определения» — поля и понятия без определения: текст из
    «Определение» записывается в запись.
"""
import collections
import datetime
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import graph  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BOOK = os.path.join(ROOT, 'docs', 'graf-struktura.xlsx')

# Словарь видов связи: «эта запись → та запись».
VOCAB = {
    'раздел': 'оглавление → карта раздела',
    'якорь': 'карта раздела → ключевая запись раздела',
    'опирается на': 'эта запись основана на той: решение на источнике, правило на требовании',
    'реализует': 'эта запись выполняет ту: задача или код — решение',
    'реализовано в': 'эта запись воплощена там: решение — в коде, утилите, документе',
    'влияет на': 'эта запись меняет ту или вызвала её',
    'использует': 'эта запись берёт что-то у той: код — модуль, карточка — справочник',
    'уточняет': 'эта запись дополняет или продолжает ту',
    'заменяет': 'эта запись отменяет и заменяет ту',
    'часть': 'эта запись — часть той',
    'содержит': 'эта запись включает ту',
    'проверяет': 'эта запись — проверка той',
    'проверяется': 'эта запись проверяется той',
    'относится к': 'общая связь по теме, когда точнее не сказать',
}

# Обратное имя: как связь читается со стороны «той» записи (SKOS: обратная
# связь выводится, а не пишется). Одно и то же имя — связь симметрична.
# Та же таблица — в программе (tools/graf, GraphView.Inverse).
INVERSE = {
    'раздел': 'в оглавлении', 'якорь': 'якорь раздела',
    'опирается на': 'основа для', 'реализует': 'реализовано в', 'реализовано в': 'реализует',
    'влияет на': 'меняется из-за', 'использует': 'используется в', 'уточняет': 'уточняется в',
    'заменяет': 'заменено', 'часть': 'содержит', 'содержит': 'часть',
    'проверяет': 'проверяется', 'проверяется': 'проверяет', 'относится к': 'относится к',
}

# Род связи (SKOS: иерархические и ассоциативные; замена — отдельно, по ADR).
GENUS = {
    'раздел': 'иерархия', 'якорь': 'иерархия', 'часть': 'иерархия', 'содержит': 'иерархия',
    'заменяет': 'история',
}
GENUS.update({k: 'смысловая' for k in VOCAB if k not in GENUS})

MAP = {
    'affects': 'влияет на', 'меняет': 'влияет на', 'меняет содержимое': 'влияет на', 'изменил': 'влияет на',
    'требует изменения': 'влияет на', 'потребовало': 'влияет на', 'потребовалось для': 'влияет на',
    'потребовал': 'влияет на', 'привела к': 'влияет на', 'породила': 'влияет на', 'поставила': 'влияет на',
    'следствие': 'влияет на', 'вскрыло дефект в': 'влияет на', 'вскрыла': 'влияет на',
    'проявилась на': 'влияет на', 'делает исключение из': 'влияет на', 'переворачивает правило в': 'влияет на',
    'отложило пункты': 'влияет на', 'определяет устройство': 'влияет на', 'governs': 'влияет на',
    'даст признак для столбца': 'влияет на',

    'опирается на': 'опирается на', 'depends_on': 'опирается на', 'derived_from': 'опирается на',
    'следует из': 'опирается на', 'grounds': 'опирается на', 'supports': 'опирается на',
    'caused_by': 'опирается на', 'возникло при': 'опирается на', 'выяснено при': 'опирается на',
    'переиспользует подход': 'опирается на', 'сделана по образцу': 'опирается на',
    'служит основой вместо неопределённых правил': 'опирается на', 'подчиняется правилам формы': 'опирается на',
    'источник переноса': 'опирается на',

    'реализует': 'реализует', 'выполняет': 'реализует', 'resolves': 'реализует', 'fixes': 'реализует',
    'закрывает': 'реализует', 'закрывает часть': 'реализует', 'фиксирует': 'реализует',

    'реализовано в': 'реализовано в', 'реализован в': 'реализовано в', 'применено в': 'реализовано в',
    'применена в': 'реализовано в', 'зафиксировано в': 'реализовано в', 'зафиксирована в': 'реализовано в',
    'записано в': 'реализовано в', 'описано в': 'реализовано в', 'используется в': 'реализовано в',
    'используется в карточке': 'реализовано в', 'tracked_by': 'реализовано в',

    'использует': 'использует', 'uses': 'использует', 'mounts': 'использует', 'подключается из': 'использует',
    'подключается в': 'использует', 'описывает поля через': 'использует',
    'определяет состав полей через': 'использует', 'рисует поля по': 'использует',
    'рисует поля через': 'использует', 'берёт состав полей из': 'использует',
    'повторяет состав полей карточки': 'использует', 'снимает состав с': 'использует',
    'собирает документ по': 'использует', 'индексирует': 'использует', 'расшифровывает записи': 'использует',
    'хранится только локально по': 'использует', 'привязывает каждое поле к этапу': 'использует',

    'уточняет': 'уточняет', 'refines': 'уточняет', 'уточняет и расширяет': 'уточняет', 'дополняет': 'уточняет',
    'дополняет полями': 'уточняет', 'extends': 'уточняет', 'развивает': 'уточняет', 'продолжает': 'уточняет',
    'раскрывает': 'уточняет', 'specifies': 'уточняет', 'точнее чем': 'уточняет',

    'заменяет': 'заменяет', 'supersedes': 'заменяет',

    'part_of': 'часть', 'часть': 'часть', 'часть карточки': 'часть', 'часть раздела': 'часть',
    'входит в состав': 'часть', 'проходит этап': 'часть',

    'содержит': 'содержит', 'contains': 'содержит', 'aggregates_records_from': 'содержит', 'covers': 'содержит',
    'содержит открытый вопрос': 'содержит',

    'проверяет': 'проверяет', 'verifies': 'проверяет', 'сторожит': 'проверяет', 'ловит нарушение': 'проверяет',
    'проверяется': 'проверяется', 'сторожится': 'проверяется', 'проверяется в': 'проверяется',

    'относится к': 'относится к', 'relates_to': 'относится к', 'applies_to': 'относится к',
    'references': 'относится к', 'родственник': 'относится к', 'сделано вместе с': 'относится к',
    'остался от': 'относится к', 'показывает': 'относится к', 'расходится с реализацией в макете': 'относится к',
}

STUB = re.compile(r'(:\s*$|^Задача пользователя|^Решение пользователя|^Решения пользователя|^Указание'
                  r'|^Практика \(собрана|^Собрано|^\d\d\.\d\d\.\d{4})')

TITLES = {
    'adaptivnaya-shapka-oc': 'Шапка ОЦ переносит данные на новую строку вместо обрезки',
    'arhiv-svoe-hranilishche': 'Архив — собственное хранилище kernel/archiveStore.js',
    'arhiv-vechen-i-hranit-vse': 'Состав архива и бессрочное хранение',
    'avtoprivyazka-pri-perenose': 'Перенос справочника в другой каталог: привязка к одноимённому полю',
    'chto-ne-spravochnik': 'Что не является справочником: литеры и ответственные',
    'civil-kategorii-liter-i-ts': 'Категоризация литер и ТС внутри гражданского здания',
    'dizayn-razdela-spravochnikov': 'Оформление раздела «Справочники»',
    'eni-mozhet-povtoryatsya': 'Коды ЕНИ могут повторяться',
    'forma-osmotra-chitaet-spravochniki': 'Форма осмотра читает справочники по типу ОЦ',
    'iznos-otdelki-i-utepleniya': 'Износ отделки и утепления в таблице «Конструктив и износ»',
    'kartochka-kvartiry-chitaet-spravochniki': 'Карточка квартиры читает справочники через opt()',
    'kartochka-mekhanizmov-po-klassifikatoru': 'Карточка механизмов по классификатору движимого имущества',
    'kartochka-ts-baza-modul': 'Карточка ОЦ «Транспортные средства» по схеме «база + модуль»',
    'katalogi-spravochnikov': 'Каталоги справочников: тип ОЦ → тип ОИ',
    'kvartira-tolko-iznos-bez-materialov': 'Квартира: износ конструктивных элементов без материалов',
    'lokalnoe-hranenie-faylov': 'Прикреплённые файлы хранятся локально в браузере',
    'mnogostrochnye-polya-ts': 'Многострочные поля ТС растут по тексту',
    'mnogoznachnye-perechni-strokami': 'Длинные многозначные перечни — строками, а не плитками',
    'odin-znachok-ml': 'Один значок ML-импорта вместо двух',
    'otkreplenie-litery-brosok-kuda-ugodno': 'Открепление литеры от участка броском в любое место',
    'otoplenie-perechen-rabochey-sistemy': 'Справочник отопления — 11 значений рабочей системы',
    'papki-vnutri-tipa-oi': 'Папки справочников внутри типа ОИ (конструктивный состав)',
    'pereimenovanie-v-estate': 'Переименование системы: Inside → E-state',
    'poetazhka-shiriny-i-zakreplyonnye-kolonki': 'Поэтажная развёртка: ширины и закреплённые служебные колонки',
    'polya-dokumentov-iz-vetki-kirill': 'Поля документа из ветки kirill: орган и дата регистрации, принадлежность',
    'pravki-kartochki-uchastka-04-09-2026': 'Правки карточки земельного участка 04.09.2026',
    'pravo-vozvrata-po-sostavu-bloka': 'Право вернуть из архива — по составу сотрудников блока',
    'privyazka-po-klyuchu-polya': 'Привязка справочника по ключу поля, а не по названию',
    'prosmotrshchik-i-spisok-kak-v-uchrezhdeniyah': 'Список рядом с просмотрщиком устроен как в карточке ОЦ',
    'prosmotrshchik-raskrytie-i-okno': 'Просмотрщик: режим раскрытия и отдельное окно',
    'rabota-s-dokumentami-2': 'Работа с документами в просмотрщике: что сделано 21.09.2026',
    'rasschitannoe-pole': 'Рассчитанное поле — только для чтения, пересчёт сразу',
    'razmetka-dotnet': 'Разметка документов — настольная программа на .NET',
    'realizaciya-pravok-uchastka-04-09-2026': 'Правки участка по ТЗ 30-uchastok-pravki: реализация',
    'shapka-oc-g-obraznaya': 'Г-образная шапка ОЦ для рабочей системы (предложение)',
    'shkala-iznosa-obshchaya': 'Общая шкала износа для осмотра и карточки',
    'slovari-polnye-perechni-rabochey-sistemy': 'Справочники конструктива — полные перечни рабочей системы',
    'sostav-poley-mehanizmov': 'Состав полей механизмов: характеристики отдельными полями',
    'sostav-poley-ts-po-tipam-i-etapam': 'Состав полей ТС по восьми типам и этапам (до «базы + модуля»)',
    'sostoyanie-u-vseh-stroeniy': 'Блок «Состояние» у всех строений',
    'spectehnika-eto-ts': 'Спецтехника относится к ТС, а не к механизмам',
    'spravochnik-na-odno-pole': 'Один справочник — одно поле',
    'spravochniki-model': 'Модель справочников: привязка, удаление, права, история',
    'spravochniki-uchastka-obshchie': 'Справочники участка — общие для всех типов ОЦ (landDicts.js)',
    'statusy-oc-kak-v-sisteme': 'Статусы ОЦ как в рабочей системе — девять шагов',
    'storony-v-kartochke-oc-ts': 'Блок сторон в карточке ОЦ «Транспортные средства»',
    'svodnaya-vkladka-uchrezhdeniy': 'Сводная вкладка учреждения по всему поддереву',
    'svoi-vypadayushchie-spiski': 'Свои выпадающие списки вместо нативных (kernel/dropdown.js)',
    'tihie-polya-v-tablicah-oi': '«Тихие» поля в таблицах карточки ОИ',
    'ts-baza-plyus-modul': 'Категоризация ТС «база + модуль»',
    'ts-goznak-kirillica-latinica': 'Госномер хранится как в документе: кириллица и латиница',
    'ts-kak-vid-oi-v-grazhdanskom': 'ТС как вид объекта имущества в гражданском здании',
    'ts-kategoriya-traktory-i-specshassi': 'Категория баз «Тракторы и специальные шасси»',
    'ts-marka-model-odno-pole': '«Марка, модель» ТС — одно поле',
    'ts-podskazki-blanka': 'Подсказки «ТП»: бланк УГАИ 2000-х',
    'ts-uvedomlenie-kategoriya-tip-ts': 'Уведомление о несовпадении категории и «Типа ТС»',
    'tsokol-element-konstruktiva': 'Цоколь — элемент конструктивного состава',
    'udaleny-mertvye-kartochki-uchastka': 'Удалены неиспользуемые копии карточки участка',
    'vetka-kartochka-zemelnogo-uchastka-v3': 'Ветка «карточка-земельного-участка-v3»',
    'vspomogatelnaya-postroyka-kak-vid-oi': 'Вспомогательная постройка — вид ОИ, привязанный к участку',
    'vyrazhenie-v-chislovom-pole': 'Выражения в числовом поле («7*6» → 42)',
    'zhurnal-izmeneniy': 'Журнал изменений макета',
    'zony-litery': 'Подгруппы помещений литеры (зоны)',
    'css-comment-star-slash': 'CSS: в комментариях нельзя «звёздочка + слэш»',
    'gruppirovka-poley-po-etapam': 'Группировка полей формы по смыслу и этапам',
    'oformlenie-interfeysa-priemka': 'Приёмка оформления: только токены, без расхождения стилей',
    'prosmotrshchik-dokumentov-i-foto': 'Практики просмотрщика документов и фото',
    'rabota-s-dokumentami-v-prosmotrshchike': 'Практики работы с документами в просмотрщике',
    'sbor-praktik-pered-dizaynom': 'Сбор практик перед проектированием интерфейса',
    'sverka-dereva-vmesto-zameny': 'Сверка дерева разметки вместо замены (morphdom)',
    'tekst-interfeysa-po-delu': 'Текст интерфейса — только сведения по делу',
    'vvod-vin': 'Ввод VIN: нормализация по ходу набора',
    'vychislenie-v-chislovom-pole': 'Вычисление выражения в числовом поле (практика)',
    'zametki-dlya-razrabotchikov-i-v-kruzhke': 'Заметки для разработчиков — значок «i» в кружке',
    'kak-ocenivat-sady': 'Как оценивать сады и многолетние насаждения',
    'otoplenie-dubli-v-spravochnike': 'Смысловые дубли в справочнике отопления',
    'pererisovka-ekrana-pri-izmenenii': 'Перерисовка экрана при добавлении и удалении',
    'razdelitel-razryadov-dvuh-vidov': 'Два разных пробела-разделителя разрядов',
    'svyaz-postroek-s-kartochkoy-uchastka': 'Два перечня вспомогательных построек: в карточке участка и в ОЦ',
    'uroven-otdelki-i-gotovnost': 'Уровень отделки и готовность недостроенного здания',
    'arhiv-zamorozhen-na-etape-3': 'Архив заморожен на этапе 3 из 7',
    'ballastnyy-tyagach-i-smennyy-kuzov': 'Балластный тягач и сменный кузов (отложено)',
    'buhuchet-imushchestva': 'Бухгалтерский учёт имущества (отложено)',
    'prosmotrshchik-ploshchad': 'Увеличить полезную площадь просмотрщика',
    'rabota-s-dokumentami': 'Полноценная работа с документами в просмотрщике',
    'flazhki-pri-malom-chisle-variantov': 'Флажки при малом числе вариантов',
    'podskazki-dlya-novichka': 'Постоянная подсказка у вопроса, всплывающая — для второстепенного',
    'pometka-istochnika-polya': 'Источник значения поля — в подписи',
    'poryadok-poley-kak-v-dokumente': 'Порядок полей как в бумажном документе',
    'preduprezhdenie-vmesto-oshibki': 'Предупреждение вместо ошибки',
    'shirina-polya-po-dline-znacheniya': 'Ширина поля по длине значения',
    'dokumenty-ts-kr': 'Документы ТС в КР: правила регистрации и бланки',
    'gruppirovka-strok-tablicy-razdelami': 'Разделы с заголовком в перечне (практика)',
    'tehpasport-sostav': 'Технический паспорт в КР: состав',
    'tekhnicheskie-kharakteristiki-otdelnymi-polyami': 'Характеристики оборудования отдельными полями',
}


def records():
    return [(folder, rec) for folder, _p, rec in graph.load_all()]


def build():
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    recs = records()
    kinds = collections.Counter(l.get('тип') for _f, r in recs for l in r.get('связи') or [])
    wb = Workbook()

    ws = wb.active
    ws.title = 'Виды связей'
    ws.append(['Сейчас', 'Сколько', 'Станет', 'Что значит «Станет»'])
    for kind, n in kinds.most_common():
        if kind.startswith('якорь раздела'):
            continue
        new = MAP.get(kind, '')
        ws.append([kind, n, new, VOCAB.get(new, '— нет в словаре, укажите вид')])

    ws2 = wb.create_sheet('Словарь')
    ws2.append(['Вид связи', 'Значение: эта запись → та', 'С другой стороны', 'Род'])
    for k, v in VOCAB.items():
        ws2.append([k, v, INVERSE.get(k, ''), GENUS.get(k, '')])

    ws3 = wb.create_sheet('Заголовки')
    ws3.append(['ID', 'Папка', 'Сейчас', 'Станет', 'Начало текста записи'])
    for folder, r in recs:
        title = str(r.get('заголовок') or '')
        if not STUB.search(title):
            continue
        body = ' '.join(str(p) for p in r.get('пункты') or [])
        ws3.append([r['id'], folder, title, TITLES.get(r['id'], ''), body[:600]])

    import quality
    by = {r['id']: (f, r) for f, r in recs}

    def name(i):
        return ' '.join(str(by[i][1].get('заголовок') or by[i][1].get('термин') or '').split())[:120]

    ws4 = wb.create_sheet('Разбиение')
    ws4.append(['ID записи', 'Заголовок записи', '№', 'Пункт', 'Выделить', 'Заголовок новой записи'])
    for folder, r in recs:
        pts = r.get('пункты') or []
        if len(pts) < 10 or folder == 'project' or r.get('статус') == 'отменено':
            continue
        for i, pt in enumerate(pts, 1):
            ws4.append([r['id'], name(r['id']), i, str(pt), split_hint(str(pt)), title_hint(str(pt))])

    ws5 = wb.create_sheet('Кандидаты связей')
    ws5.append(['ID первой', 'Первая запись', 'ID второй', 'Вторая запись', 'По соседям', 'По тексту', 'Связь'])
    for a, b, aa, tx in quality.suggest(graph.load_all()):
        ws5.append([a, name(a), b, name(b), round(aa, 2), round(tx, 2), ''])

    ws6 = wb.create_sheet('Определения')
    ws6.append(['ID', 'Вид', 'Термин', 'Где встречается', 'Определение'])
    for folder, r in recs:
        if folder in ('fields', 'concepts') and not str(r.get('определение') or '').strip():
            where = '; '.join(' · '.join(x for x in (o.get('объект'), o.get('часть'), o.get('блок')) if x)
                              for o in r.get('встречается') or [])
            ws6.append([r['id'], r.get('вид'), r.get('термин'), where, ''])

    head = Font(bold=True)
    fill = PatternFill('solid', fgColor='FFF4CC')
    sheets = ((ws, [34, 10, 18, 60], [3]), (ws2, [18, 60, 18, 12], []), (ws3, [34, 12, 40, 50, 90], [4]),
              (ws4, [30, 40, 5, 90, 10, 50], [5, 6]), (ws5, [30, 40, 30, 40, 11, 11, 16], [7]),
              (ws6, [30, 10, 30, 50, 70], [5]))
    for sheet, widths, edit in sheets:
        for i, w in enumerate(widths, 1):
            sheet.column_dimensions[chr(64 + i)].width = w
        for c in sheet[1]:
            c.font = head
        sheet.freeze_panes = 'A2'
        sheet.auto_filter.ref = sheet.dimensions
        for row in sheet.iter_rows(min_row=2):
            for c in row:
                c.alignment = Alignment(wrap_text=True, vertical='top')
            for e in edit:
                row[e - 1].fill = fill
    os.makedirs(os.path.dirname(BOOK), exist_ok=True)
    wb.save(BOOK)
    missing = [k for k in kinds if not k.startswith('якорь раздела') and k not in MAP]
    stubs = sum(1 for _f, r in recs if STUB.search(str(r.get('заголовок') or '')))
    print('книга:', os.path.relpath(BOOK, ROOT))
    print('видов связей: %d → %d; без сопоставления: %d' % (
        sum(1 for k in kinds if not k.startswith('якорь раздела')), len(VOCAB), len(missing)))
    print('заголовков-заглушек: %d, с предложением: %d' % (stubs, sum(1 for _f, r in recs if r['id'] in TITLES)))
    print('разбиение: пунктов %d, предложено выделить %d; кандидатов связей: %d; без определения: %d' % (
        ws4.max_row - 1, sum(1 for row in ws4.iter_rows(min_row=2) if row[4].value == 'да'),
        ws5.max_row - 1, ws6.max_row - 1))


# Пункт — кандидат в отдельную запись, если он самостоятелен: начинается с
# даты или повода («2026-08-25 (второй проход): …», «Решение …») или длинный.
# Справка из прежнего графа («[восстановлено] …») остаётся в записи.
SELF = re.compile(r'^(\d{4}-\d\d-\d\d|\d\d\.\d\d\.\d{4}|Решение|Задача|Указание|Правило|Процессное)')


def split_hint(pt):
    if pt.startswith('[восстановлено]'):
        return ''
    return 'да' if SELF.match(pt) or len(pt) >= 400 else ''


def title_hint(pt):
    t = re.sub(r'^\[восстановлено\]\s*', '', pt)
    t = re.split(r'(?<=[.;!?])\s|\s—\s', t, maxsplit=1)[0]
    return t[:110].rstrip(' .,:;')


def apply():
    from openpyxl import load_workbook

    wb = load_workbook(BOOK)
    kind_map = {r[0].value: (r[2].value or '').strip() for r in wb['Виды связей'].iter_rows(min_row=2) if r[0].value}
    title_map = {r[0].value: (r[3].value or '').strip() for r in wb['Заголовки'].iter_rows(min_row=2) if r[0].value}
    bad = sorted({v for v in kind_map.values() if v and v not in VOCAB})
    if bad:
        sys.exit('в «Станет» виды не из словаря: %s — добавьте их на лист «Словарь» в VOCAB или исправьте' % bad)
    links = titles = 0
    recs = records()
    by = {r['id']: (f, r) for f, r in recs}
    touched = set()

    # Определения полей и понятий.
    defs = 0
    if 'Определения' in wb.sheetnames:
        for row in wb['Определения'].iter_rows(min_row=2):
            rid, text = row[0].value, str(row[4].value or '').strip()
            if rid in by and text and text != by[rid][1].get('определение'):
                by[rid][1]['определение'] = text
                touched.add(rid)
                defs += 1

    # Кандидаты связей: вид из словаря — связь первой записи на вторую;
    # «заменяет» — вторая снимается статусом (ADR).
    added = retired = 0
    if 'Кандидаты связей' in wb.sheetnames:
        today = datetime.date.today().strftime('%d.%m.%Y')
        for row in wb['Кандидаты связей'].iter_rows(min_row=2):
            a, b, kind = row[0].value, row[2].value, str(row[6].value or '').strip()
            if not kind or a not in by or b not in by:
                continue
            if kind not in VOCAB:
                sys.exit('«Кандидаты связей»: вид «%s» не из словаря (%s → %s)' % (kind, a, b))
            ra = by[a][1]
            if not any(l.get('куда') == b for l in ra.get('связи') or []):
                ra['связи'] = (ra.get('связи') or []) + [{'тип': kind, 'куда': b, 'папка': by[b][0]}]
                touched.add(a)
                added += 1
            rb = by[b][1]
            if kind == 'заменяет' and rb.get('статус') != 'отменено':
                rb['статус'] = 'отменено'
                rb['пункты'] = (rb.get('пункты') or []) + ['%s снято по образцу ADR: запись заменена %s.' % (today, a)]
                touched.add(b)
                retired += 1

    # Разбиение: «да» — пункт становится своей записью, «часть» прежней.
    split = 0
    if 'Разбиение' in wb.sheetnames:
        from migrate_from_graph import slug
        take = collections.defaultdict(list)
        for row in wb['Разбиение'].iter_rows(min_row=2):
            if str(row[4].value or '').strip().lower() == 'да' and row[0].value in by:
                take[row[0].value].append((int(row[2].value), str(row[5].value or '').strip(), str(row[3].value)))
        for rid, items in take.items():
            folder, r = by[rid]
            pts = list(r.get('пункты') or [])
            gone = set()
            for n, title, text in items:
                if n - 1 >= len(pts) or str(pts[n - 1]) != text:
                    sys.exit('«Разбиение»: пункт %d записи %s уже не тот — пересоберите книгу (build)' % (n, rid))
                title = title or title_hint(text)
                nid = slug(title)
                while nid in by:
                    nid += '-2'
                m = re.match(r'^(\d{4}-\d\d-\d\d)|^(\d\d)\.(\d\d)\.(\d{4})', text)
                date = (m.group(1) or '%s-%s-%s' % (m.group(4), m.group(3), m.group(2))) if m else r.get('дата')
                by[nid] = (folder, {
                    'id': nid, 'вид': r.get('вид'), 'заголовок': title,
                    'метки': list(r.get('метки') or [graph.FOLDERS[folder]]),
                    'статус': r.get('статус'), 'дата': date,
                    'источник': 'выделено из записи %s; %s' % (rid, r.get('источник') or ''),
                    'пункты': [text], 'связи': [{'тип': 'часть', 'куда': rid, 'папка': folder}],
                })
                touched.add(nid)
                gone.add(n - 1)
                split += 1
            r['пункты'] = [p for i, p in enumerate(pts) if i not in gone]
            touched.add(rid)

    for folder, r in recs:
        changed = False
        for l in r.get('связи') or []:
            new = kind_map.get(l.get('тип'))
            if new and new != l.get('тип'):
                l['тип'] = new
                links += 1
                changed = True
        new = title_map.get(r['id'])
        if new and new != r.get('заголовок'):
            r['заголовок'] = new
            titles += 1
            changed = True
        if changed:
            touched.add(r['id'])
    for rid in sorted(touched):
        graph.save(*by[rid])
    print('связей переименовано: %d, заголовков: %d, определений: %d, связей добавлено: %d, снято: %d, '
          'выделено записей: %d' % (links, titles, defs, added, retired, split))


if __name__ == '__main__':
    {'build': build, 'apply': apply}[sys.argv[1] if len(sys.argv) > 1 else 'build']()
