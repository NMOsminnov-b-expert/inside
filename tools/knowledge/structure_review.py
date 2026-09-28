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
"""
import collections
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import graph  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BOOK = os.path.join(ROOT, 'docs', 'graf-struktura.xlsx')

# Словарь видов связи: «эта запись → та запись».
VOCAB = {
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
    ws2.append(['Вид связи', 'Значение: эта запись → та'])
    for k, v in VOCAB.items():
        ws2.append([k, v])

    ws3 = wb.create_sheet('Заголовки')
    ws3.append(['ID', 'Папка', 'Сейчас', 'Станет', 'Начало текста записи'])
    for folder, r in recs:
        title = str(r.get('заголовок') or '')
        if not STUB.search(title):
            continue
        body = ' '.join(str(p) for p in r.get('пункты') or [])
        ws3.append([r['id'], folder, title, TITLES.get(r['id'], ''), body[:600]])

    head = Font(bold=True)
    fill = PatternFill('solid', fgColor='FFF4CC')
    for sheet, widths, edit in ((ws, [34, 10, 18, 60], 3), (ws2, [18, 70], None), (ws3, [34, 12, 40, 50, 90], 4)):
        for i, w in enumerate(widths, 1):
            sheet.column_dimensions[chr(64 + i)].width = w
        for c in sheet[1]:
            c.font = head
        sheet.freeze_panes = 'A2'
        sheet.auto_filter.ref = sheet.dimensions
        for row in sheet.iter_rows(min_row=2):
            for c in row:
                c.alignment = Alignment(wrap_text=True, vertical='top')
            if edit:
                row[edit - 1].fill = fill
    os.makedirs(os.path.dirname(BOOK), exist_ok=True)
    wb.save(BOOK)
    missing = [k for k in kinds if not k.startswith('якорь раздела') and k not in MAP]
    stubs = sum(1 for _f, r in recs if STUB.search(str(r.get('заголовок') or '')))
    print('книга:', os.path.relpath(BOOK, ROOT))
    print('видов связей: %d → %d; без сопоставления: %d' % (
        sum(1 for k in kinds if not k.startswith('якорь раздела')), len(VOCAB), len(missing)))
    print('заголовков-заглушек: %d, с предложением: %d' % (stubs, sum(1 for _f, r in recs if r['id'] in TITLES)))


def apply():
    from openpyxl import load_workbook

    wb = load_workbook(BOOK)
    kind_map = {r[0].value: (r[2].value or '').strip() for r in wb['Виды связей'].iter_rows(min_row=2) if r[0].value}
    title_map = {r[0].value: (r[3].value or '').strip() for r in wb['Заголовки'].iter_rows(min_row=2) if r[0].value}
    bad = sorted({v for v in kind_map.values() if v and v not in VOCAB})
    if bad:
        sys.exit('в «Станет» виды не из словаря: %s — добавьте их на лист «Словарь» в VOCAB или исправьте' % bad)
    links = titles = 0
    for folder, r in records():
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
            graph.save(folder, r)
    print('связей переименовано: %d, заголовков: %d' % (links, titles))


if __name__ == '__main__':
    {'build': build, 'apply': apply}[sys.argv[1] if len(sys.argv) > 1 else 'build']()
