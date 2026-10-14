// Поля осмотра одного объекта имущества.
//
// Состав, формулировки и ПЕРЕЧНИ ЗНАЧЕНИЙ взяты не из ТЗ, а из рабочей
// системы: пользователь прислал сохранённый экран осмотра строения
// (inside.html в корне, /inspections/<id>/assets/<assetId>?assetType=BUILDING).
// ТЗ в этих местах устарело — например, наличие сетей там описано шкалой
// «проходят рядом / отсутствуют в районе», а в системе выбор другой.
//
// Отсюда же главное про устройство: осмотр ведётся ПО ОБЪЕКТУ ИМУЩЕСТВА, а не
// по записи целиком. У каждой литеры свой чек-лист, свои замеры и свой износ.
//
// Разделы рабочей системы по порядку: Объект (только чтение) · Чек-лист
// коммуникаций · Износ · Замеры и площади · Конструктивные элементы
// (опционально) · Помещения · Комментарии · Фото и документы, и внизу «Назад»
// и «Сохранить осмотр».
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: заполненное живёт в памяти вкладки. На сервере это
// осмотр литеры со своим автором, временем и версией — и, судя по рабочей
// системе, с обязательными полями, без которых осмотр не сдаётся.

import { getValue } from '../../kernel/fieldSchema.js';
import { optionsFor } from '../../kernel/dicts.js';

// Наличие сети. Ровно четыре варианта рабочей системы: «не удалось
// установить» — это не то же самое, что «нет», а «нет (доступно подключение)»
// влияет на стоимость иначе, чем простое «нет».
const PRESENCE = ['Да', 'Нет', 'Не удалось установить', 'Нет (доступно подключение)'];
const YESNO = ['Да', 'Нет'];

// Ступени износа словами, а не проценты: на осмотре процент не измерить, его
// считают позже по элементам (III этап ТЗ).
//
// Шкала — ОБЩАЯ с карточкой (решение пользователя 08.09.2026): один и тот же
// элемент не может оцениваться на осмотре одной шкалой, а в карточке другой.
// Читается из справочника «Износ»; здесь только запасной перечень.
const WEAR_STEPS = ['Умеренный', 'Значительный'];

// Пустое значение справочника («Не выбрано») в чипах не нужно: незаполненное
// поле и так видно, а снимается выбор повторным нажатием.
const wearOpts = (typeId) => dict(typeId, 'wear', WEAR_STEPS)
  .filter((v) => !/^не /i.test(v));

// Фундамент — перечень рабочей системы (20 значений)
const FOUNDATION = [
  'Асфальт', 'Бетонные столбы', 'Бетонный', 'Блочный',
  'Бутобетонные столбы', 'Бутобетонный', 'Бутокаменный', 'Дерево',
  'Деревянные стойки', 'Железобетонный', 'Жжёный кирпич', 'Кирпичный',
  'Металл', 'Металлическая решётка', 'Металлическая сетка',
  'Металлические прутья', 'Металлические стойки', 'Прочее (ручной ввод)',
  'Тесовые', 'Шифер',
];

// Цоколь — перечень рабочей системы (20 значений)
const BASEMENT = [
  'Асфальт', 'Бетонные столбы', 'Бетонный', 'Блочный',
  'Бутобетонные столбы', 'Бутобетонный', 'Бутокаменный', 'Дерево',
  'Деревянные стойки', 'Железобетонный', 'Жжёный кирпич', 'Кирпичный',
  'Металл', 'Металлическая решётка', 'Металлическая сетка',
  'Металлические прутья', 'Металлические стойки', 'Прочее (ручной ввод)',
  'Тесовые', 'Шифер',
];

// Наружные стены — перечень рабочей системы (44 значений)
const WALLS = [
  'Бетон', 'Бетонные панели', 'Бетонные плиты', 'Брус цельный',
  'Бутобетонные', 'Бутокаменные', 'Газобетон', 'Газоблок', 'Глинобитные',
  'Деревянно-щитовые', 'Деревянные', 'Деревянные столбы', 'Дощатые',
  'Железобетонные', 'Жжёный кирпич', 'Каркасно-щитовые', 'Каркасные',
  'Кирпич', 'Клееный брус', 'ЛСТК', 'Металлическая решётка',
  'Металлическая сетка', 'Металлические', 'Металлические прутья',
  'Металлические стойки', 'Металлокаркас', 'Остекление', 'Пеноблок',
  'Пескоблок', 'Пластиковые', 'Полуостеклённые', 'Прочее (ручной ввод)',
  'Саман', 'Сборно-щитовые', 'Сетка', 'Силикатный кирпич', 'Стойки',
  'Столбы', 'Сэндвич-панели', 'Тесовые', 'Шифер', 'Шлакоблок', 'Штакетник',
  'Щитовой',
];

// Полы — перечень рабочей системы (11 значений)
const FLOORS = [
  'Бетонные', 'Глинобитные', 'Деревянные', 'Дощатые', 'Ламинат', 'Линолеум',
  'Мозаичные', 'Паркетные', 'Плитка', 'Прочее (указать в особенностях)',
  'Цементные',
];

// Перекрытия — перечень рабочей системы (8 значений)
const CEILINGS = [
  'Деревянные', 'Деревянные балки', 'Железобетонные',
  'Железобетонные плиты', 'Кирпич', 'Металлические балки', 'Монолит',
  'Прочее (указать в особенностях)',
];

// Кровля — перечень рабочей системы (14 значений)
const ROOF = [
  'Алюкобонд', 'Асбоцементная', 'Деревянная', 'Железобетонная', 'Металл',
  'Мягкая', 'Оцинкованная', 'Пластиковая', 'Плоская',
  'Прочее (ручной ввод)', 'Рубероидная', 'Совмещённая', 'Тесовая', 'Шифер',
];

// Окна — перечень рабочей системы (11 значений)
const WINDOWS = [
  'Алюминиевые', 'Двойное остекление', 'Двустворчатые', 'Деревянные',
  'Металлопластиковые, одностворчатые', 'Одинарное остекление',
  'Одностворчатые', 'Одностворчатые деревянные', 'Отсутствуют',
  'ПВХ (стеклопакет)', 'Простые',
];

// Двери — перечень рабочей системы (3 значений)
const DOORS = [
  'Деревянные', 'Металлические', 'Пластиковые (ПВХ)',
];

// Отопление — перечень рабочей системы (11 значений)
const HEATING_EL = [
  'Водяное', 'Газовое отопление', 'Комбинированное отопление',
  'Паровое отопление', 'Печное отопление',
  'Прочее (указать в особенностях)', 'Современные радиаторы',
  'Тёплый водяной пол', 'Тёплый электрический пол',
  'Центральное водяное отопление', 'Чугунные радиаторы',
];

// Системы отопления (1 или более) — перечень рабочей системы (11 значений)
const HEAT_SYSTEMS = [
  'Водяное', 'Газовое отопление', 'Комбинированное отопление',
  'Паровое отопление', 'Печное отопление',
  'Прочее (указать в особенностях)', 'Современные радиаторы',
  'Тёплый водяной пол', 'Тёплый электрический пол',
  'Центральное водяное отопление', 'Чугунные радиаторы',
];

// Тип автономного отопления (1 или более) — перечень рабочей системы (5 значений)
const HEAT_AUTO = [
  'Газ / Газовая колонка', 'Прочее', 'Тепловой насос', 'Уголь',
  'Электрокотёл',
];

// Значение «Прочее (ручной ввод)» в перечнях рабочей системы обещает поле для
// ввода — без него выбор ничего не сообщает. Поле появляется только при этом
// выборе: условная видимость есть у конструктора (kernel/fieldSchema.js).
// Значения поля: сначала справочник раздела «Справочники», встроенный перечень
// рабочей системы — запасной. Ровно тот же порядок, что у карточек
// (modules/*/data/opts.js): правка справочника доходит и до осмотра, а
// отвязанный справочник не оставляет поле пустым.
//
// Тип ОЦ приходит параметром: активного экрана модуля на странице осмотров
// нет, и activeOcType() там пуст (см. kernel/ocType.js).
const dict = (typeId, field, fallback) => optionsFor(typeId, 'building', field) || fallback;

const OTHER = 'Прочее (ручной ввод)';

const other = (key, label) => ({
  key: key + 'Other',
  label,
  max: 100,
  placeholder: 'Опишите словами',
  visible: (values) => values[key] === OTHER,
});

// Внутренние стены в рабочей системе — тот же перечень, что наружные.
const WALLS_INT = WALLS;

// Разделы формы — по виду ОИ (аудит 14.10.2026: форма строения открывалась на
// квартире, участке, механизмах и ТС; решение пользователя «Правим»): у
// каждого вида — поля его карточки, которые проверяются на месте; списки — из
// тех же справочников, что у карточки; рядом с полем — значение «по
// документам» (field.doc — из записи ОИ). ТС — ждёт решения пользователя
// («ТС пока что ждём»): формы нет, только снимки и заметка.
export const sections = (typeId, oi) => {
  const card = (oi && oi.card) || 'building';
  if (card === 'apartment') return flatSections(typeId);
  if (card === 'land') return landSections(typeId);
  if (card === 'mech' || card === 'movable') return mechSections(oi);
  if (card === 'vehicle') return [];
  return buildingSections(typeId);
};

// Состояние — шкала карточки квартиры и литеры.
const CONDITION = ['Отличное', 'Хорошее', 'Удовлетворительное', 'Плохое', 'Аварийное'];
const NETWORK = ['Подведены', 'Проходят рядом', 'На удалении', 'Отсутствуют в районе'];
const LAND_FORM = ['Квадратная', 'Прямоугольная', 'Близкая к прямоугольной', 'Трапециевидная', 'Вытянутая прямоугольная',
  'Близкая к Г-образной', 'Г-образная', 'Неправильный многоугольник', 'Неправильный многоугольник с заужением',
  'Узкая зауженная прямоугольная', 'Треугольная', 'Иное'];
const LAND_RELIEF = ['Ровный', 'Слабый уклон', 'Средний уклон или с перепадами', 'Крутой уклон', 'Сложный рельеф'];
const IMPROVE = ['Не благоустроен', 'Частично благоустроен', 'Благоустроен', 'Дорогое благоустройство'];
const MECH_STATE = ['Рабочее', 'Условно пригодное', 'Нерабочее'];
const landDict = (typeId, field, fallback) => (optionsFor(typeId, 'land', field) || fallback).filter((v) => !/^не (выбрано|заполнено)$/i.test(v));
const at = (o, path) => path.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
// Путь поля записи — при функции: по нему сборщик сверки
// (tools/docs/build_sverka_osmotra.py) находит поле карточки.
// Список (отопление — несколько видов сразу) — через запятую.
const docOf = (path) => Object.assign((oi) => {
  const v = at(oi, path);
  if (Array.isArray(v)) return v.filter(Boolean).join(', ');
  return v == null || v === '' ? '' : String(v);
}, { path });

// Квартира — блоки карточки квартиры: площади и высоты, конструктив и износ
// (тот же справочник, что у литеры), состояние.
const flatSections = (typeId) => {
  const b = buildingSections(typeId);
  const struct = b.find((s) => s.key === 'struct');
  return [
    {
      key: 'measure',
      title: 'Замеры и площади',
      short: 'Замеры',
      fields: [
        { key: 'areaFact', label: 'Общая площадь по факту', unit: 'м²', num: true, tpFrom: 'pud' },
        { key: 'ceilInt', label: 'Высота по внутренним замерам', unit: 'м', num: true, tpFrom: 'heightInt' },
      ],
    },
    {
      key: 'state',
      title: 'Состояние',
      fields: [
        { key: 'condInner', label: 'Внутреннее состояние', req: true, opts: CONDITION, doc: docOf('conditionInner') },
        { key: 'condOuter', label: 'Внешнее состояние', req: true, opts: CONDITION, doc: docOf('conditionOuter') },
        { key: 'condTotal', label: 'Итоговое состояние', opts: CONDITION, doc: docOf('conditionTotal') },
      ],
    },
    b.find((s) => s.key === 'wear'),
    // Отопление карточка хранит у ОИ (heating), а не в конструктиве: из
    // struct.heating «по документам» всегда было пустым (сверка с карточками
    // 14.10.2026).
    { ...struct, fields: struct.fields.map((f) => (f.visible ? f : { ...f, doc: docOf(f.key === 'heating' ? 'heating' : 'struct.' + f.key) })) },
    b.find((s) => s.key === 'comments'),
  ];
};

// Земельный участок — блоки карточки участка: площади, инженерные сети,
// местоположение и форма, благоустройство.
const landSections = (typeId) => [
  {
    key: 'measure',
    title: 'Площади',
    short: 'Площади',
    fields: [
      { key: 'areaFact', label: 'Площадь по факту', unit: 'м²', num: true, doc: docOf('areas.pravo'), docLabel: 'по правоустанавливающим' },
      { key: 'buildFact', label: 'Застроенная площадь', unit: 'м²', num: true, doc: docOf('areas.build') },
    ],
  },
  {
    key: 'nets',
    title: 'Инженерные сети',
    short: 'Сети',
    fields: [
      { key: 'electricity', label: 'Наличие электроснабжения', req: true, opts: landDict(typeId, 'electricity', NETWORK), doc: docOf('electricity') },
      { key: 'centralWater', label: 'Наличие водоснабжения', req: true, opts: landDict(typeId, 'centralWater', NETWORK), doc: docOf('centralWater') },
      { key: 'sewerage', label: 'Наличие канализации', req: true, opts: landDict(typeId, 'sewerage', NETWORK), doc: docOf('sewerage') },
      { key: 'gasification', label: 'Наличие газификации', req: true, opts: landDict(typeId, 'gasification', NETWORK), doc: docOf('gasification') },
      { key: 'centralHeating', label: 'Наличие отопления', opts: landDict(typeId, 'centralHeating', [...NETWORK, 'Автономное']), doc: docOf('centralHeating') },
      { key: 'railway', label: 'Наличие железнодорожной ветки', opts: landDict(typeId, 'railway', ['Нет', 'Есть', 'Возможно подвести']), doc: docOf('railway') },
    ],
  },
  {
    key: 'place',
    title: 'Местоположение и форма',
    short: 'Местоположение',
    fields: [
      { key: 'corner', label: 'Угловой / неугловой', opts: landDict(typeId, 'corner', ['Угловой', 'Неугловой']), doc: docOf('corner') },
      { key: 'form', label: 'Форма участка', opts: landDict(typeId, 'form', LAND_FORM), doc: docOf('form') },
      { key: 'relief', label: 'Рельеф участка', opts: landDict(typeId, 'relief', LAND_RELIEF), doc: docOf('relief') },
      { key: 'encumbrance', label: 'Сервитуты и обременения', opts: landDict(typeId, 'encumbrance', ['Нет', 'Есть']), doc: docOf('encumbrance') },
    ],
  },
  {
    key: 'improve',
    title: 'Благоустройство',
    fields: [
      { key: 'improvementRank', label: 'Наличие благоустройства', opts: IMPROVE, doc: docOf('improvementRank') },
    ],
  },
  {
    key: 'comments',
    title: 'Комментарии',
    fields: [
      { key: 'features', label: 'Особенности участка', long: true, rows: 3 },
      { key: 'note', label: 'Комментарий осмотрщика', long: true, rows: 3 },
    ],
  },
];

// Механизмы и оборудование — по каждой единице, как позиции описи в
// приложении «Осмотр»: найдена ли на месте, номера с бирки и таблички рядом с
// карточкой, состояние. «Нерабочее» — только при снимках (ответ В9
// 12.10.2026; проверка — mismatchHint).
const mechSections = (oi) => [
  ...((oi && oi.mechanisms) || []).map((u, i) => ({
    key: 'u' + i,
    title: u.name || `Единица ${i + 1}`,
    short: (u.inv || u.name || `№${i + 1}`).slice(0, 18),
    fields: [
      { key: `u.${u.id}.found`, path: `u.${u.id}.found`, label: 'На месте', req: true, opts: ['Найдено', 'Не найдено'] },
      { key: `u.${u.id}.inv`, path: `u.${u.id}.inv`, label: 'Инвентарный номер с бирки', doc: () => u.inv || '' },
      { key: `u.${u.id}.serial`, path: `u.${u.id}.serial`, label: 'Заводской номер с таблички', doc: () => (u.params && u.params.serial) || '' },
      { key: `u.${u.id}.state`, path: `u.${u.id}.state`, label: 'Состояние', opts: MECH_STATE, doc: () => u.state || '', needsPhoto: 'Нерабочее' },
    ],
  })),
  {
    key: 'comments',
    title: 'Комментарии',
    fields: [{ key: 'note', label: 'Комментарий осмотрщика', long: true, rows: 3 }],
  },
];

// Строение — форма рабочей системы (как была).
const buildingSections = (typeId) => [
  {
    key: 'comm',
    title: 'Чек-лист коммуникаций',
    short: 'Коммуникации',
    fields: [
      { key: 'electric', label: 'Наличие электрификации', req: true, opts: PRESENCE },
      { key: 'gas', label: 'Наличие газификации', req: true, opts: PRESENCE },
      { key: 'heatCentral', label: 'Наличие центрального отопления', req: true, opts: PRESENCE },
      { key: 'waterCentral', label: 'Наличие центрального водоснабжения', req: true, opts: PRESENCE },
      { key: 'heatAuto', label: 'Наличие автономного отопления', req: true, opts: PRESENCE },
      { key: 'heatAutoType', label: 'Тип автономного отопления (1 или более)', multi: true, opts: HEAT_AUTO },
      { key: 'heatSystems', label: 'Системы отопления (1 или более)', req: true, multi: true, opts: HEAT_SYSTEMS },
      { key: 'septic', label: 'Наличие септика', req: true, opts: YESNO },
      { key: 'wc', label: 'Санузел внутри дома', req: true, opts: YESNO },
    ],
  },
  {
    key: 'measure',
    title: 'Замеры и площади',
    short: 'Замеры',
    // Замеры осмотрщика — ОТДЕЛЬНЫЕ значения, а не правка данных ЦОД (решение
    // пользователя 08.09.2026: «дублирует своим значением»). Рядом показываем,
    // что стоит по документам, чтобы расхождение было видно сразу.
    fields: [
      // «По документам» — общая площадь по правоустанавливающим документам
      // (areas.pud). До сверки 14.10.2026 здесь стояло areas.tp, а это поле
      // карточка с переименования площадей подписывает «Площадь по внешним
      // замерам»; «площади застройки» в карточке больше нет — замер назван
      // по полю карточки, с которым и сверяется (areas.build), ключ прежний:
      // введённое осмотрщиком сохраняется. Решение пользователя: «Ошибки
      // правим».
      { key: 'areaFact', label: 'Площадь фактическая', unit: 'м²', num: true, tpFrom: 'pud' },
      { key: 'buildFact', label: 'Общая площадь по внутреннему обмеру', unit: 'м²', num: true, tpFrom: 'build', tpLabel: 'в карточке' },
      { key: 'ceilExt', label: 'Потолки, внешние замеры', unit: 'м', num: true, tpFrom: 'heightExt' },
      { key: 'ceilInt', label: 'Потолки, внутренние замеры', unit: 'м', num: true, tpFrom: 'heightInt' },
    ],
  },
  {
    key: 'wear',
    title: 'Износ',
    fields: [
      { key: 'wearRoof', label: 'Кровля', opts: wearOpts(typeId) },
      { key: 'wearFinish', label: 'Отделка', opts: wearOpts(typeId) },
      { key: 'wearInsul', label: 'Утепление', opts: wearOpts(typeId) },
    ],
  },
  {
    key: 'struct',
    title: 'Конструктивные элементы',
    short: 'Конструктив',
    // Стоит после обязательного: в рабочей системе это самый большой раздел
    // (десять полей по 20–44 значения), помеченный «опционально», и он
    // занимал экран прежде того, за чем едут на осмотр. Свёрнутым заранее НЕ
    // держим — замечание пользователя 08.09.2026.
    optional: true,
    // Порядок и перечни — как в рабочей системе. Значения «Прочее (ручной
    // ввод)» и «Прочее (указать в особенностях)» оставлены её формулировками:
    // они говорят осмотрщику, куда писать пояснение.
    fields: [
      { key: 'foundation', label: 'Фундамент', opts: dict(typeId, 'struct.foundation', FOUNDATION) },
      other('foundation', 'Фундамент — свой вариант'),
      { key: 'basement', label: 'Цоколь', opts: dict(typeId, 'struct.basement', BASEMENT) },
      other('basement', 'Цоколь — свой вариант'),
      { key: 'wallsExt', label: 'Наружные стены', opts: dict(typeId, 'struct.wallsExt', WALLS) },
      other('wallsExt', 'Наружные стены — свой вариант'),
      { key: 'wallsInt', label: 'Внутренние стены', opts: dict(typeId, 'struct.wallsExt', WALLS_INT) },
      other('wallsInt', 'Внутренние стены — свой вариант'),
      { key: 'floors', label: 'Полы', opts: dict(typeId, 'struct.floors', FLOORS) },
      { key: 'ceilings', label: 'Перекрытия', opts: dict(typeId, 'struct.ceilings', CEILINGS) },
      { key: 'roof', label: 'Кровля', opts: dict(typeId, 'struct.roof', ROOF) },
      other('roof', 'Кровля — свой вариант'),
      { key: 'windows', label: 'Окна', opts: dict(typeId, 'struct.windows', WINDOWS) },
      { key: 'heating', label: 'Отопление', opts: dict(typeId, 'heating', HEATING_EL) },
      { key: 'doors', label: 'Двери', opts: dict(typeId, 'struct.doors', DOORS) },
    ],
  },
  {
    key: 'comments',
    title: 'Комментарии',
    fields: [
      { key: 'features', label: 'Прочие особенности', long: true, rows: 3 },
      { key: 'note', label: 'Комментарий осмотрщика', long: true, rows: 3 },
    ],
  },
];

// Плоский перечень полей — для подсчёта заполненного и обязательного
// (kernel/fieldSchema.js: requiredLeft, filledCount).
export const allFields = (typeId, oi) => sections(typeId, oi).flatMap((s) => s.fields);

// Что показать рядом с полем замера: значение из данных ЦОД.
export function tpValue(oi, from) {
  if (!oi) return '';
  if (from === 'tp' || from === 'build' || from === 'pud') return (oi.areas || {})[from] || '';
  if (from === 'heightExt') return (oi.heights || {}).ext || '';
  if (from === 'heightInt') return (oi.heights || {}).int || '';
  return '';
}

// Расхождение замера с документами — то, за чем едут на осмотр. Показываем не
// нейтральной подсказкой, а сигналом: и значение по документам, и разницу.
export function mismatchHint(field, values, oi, ctx = {}) {
  // «Нерабочее» у механизма — только при снимках (В9 12.10.2026).
  const own0 = getValue(values, field.path || field.key);
  if (field.needsPhoto && own0 === field.needsPhoto && !ctx.photos) return 'РАСХОДИТСЯ: «Нерабочее» ставится только при снимках — сначала снимите';
  // Значение «по документам» из записи ОИ — у полей видов, кроме замеров строения.
  if (typeof field.doc === 'function') {
    const doc = field.doc(oi || {});
    const own = own0;
    const unit = field.unit ? ' ' + field.unit : '';
    const lbl = field.docLabel ? `по документам (${field.docLabel})` : 'по документам';
    if (!doc) return own ? '' : `${lbl}: не заполнено`;
    if (!own) return `${lbl}: ${doc}${unit}`;
    if (field.num) {
      const a = parseFloat(String(doc).replace(',', '.'));
      const b = parseFloat(String(own).replace(',', '.'));
      if (!isNaN(a) && !isNaN(b) && a !== b) return `РАСХОДИТСЯ: ${lbl} ${doc}${unit}, ${b > a ? '+' : '−'}${Math.abs(b - a).toFixed(2)}${unit}`;
      return `${lbl}: ${doc}${unit} — совпадает`;
    }
    const same = String(own).trim().toLowerCase() === String(doc).trim().toLowerCase();
    return same ? `${lbl}: ${doc} — совпадает` : `РАСХОДИТСЯ: ${lbl} ${doc}`;
  }
  if (!field.tpFrom) return '';

  const doc = tpValue(oi, field.tpFrom);
  const own = getValue(values, field.path || field.key);
  const unit = field.unit ? ' ' + field.unit : '';
  // Обмер ЦОД — не документ: у такого поля подпись «в карточке».
  const lbl = field.tpLabel || 'по документам';

  if (!doc) return own ? '' : `${lbl}: не заполнено`;
  if (!own) return `${lbl}: ${doc}${unit}`;

  const a = parseFloat(String(doc).replace(',', '.'));
  const b = parseFloat(String(own).replace(',', '.'));
  if (isNaN(a) || isNaN(b) || a === b) return `${lbl}: ${doc}${unit} — совпадает`;

  const d = b - a;
  const sign = d > 0 ? '+' : '−';
  return `РАСХОДИТСЯ: ${lbl} ${doc}${unit}, ${sign}${Math.abs(d).toFixed(2)}${unit}`;
}
