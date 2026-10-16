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
import { LIT_KINDS, LIT_PURPOSES, LIT_SIGNS, OI_NETS, netValue, netsLandOf } from '../../kernel/registry.js';

// Ступени износа словами, а не проценты: на осмотре процент не измерить, его
// считают позже по элементам (III этап ТЗ).
//
// Шкала — ОБЩАЯ с карточкой (решение пользователя 08.09.2026): один и тот же
// элемент не может оцениваться на осмотре одной шкалой, а в карточке другой.
// Читается из справочника «Износ»; здесь только запасной перечень.
const WEAR_STEPS = ['Умеренный', 'Значительный'];

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

// Значение «Прочее (ручной ввод)» в перечнях рабочей системы обещает поле для
// ввода — без него выбор ничего не сообщает. Поле появляется только при этом
// выборе: условная видимость есть у конструктора (kernel/fieldSchema.js).
// Значения поля: сначала справочник раздела «Справочники», встроенный перечень
// рабочей системы — запасной. Ровно тот же порядок, что у карточек
// (modules/*/data/opts.js): правка справочника доходит и до осмотра, а
// отвязанный справочник не оставляет поле пустым.
//
// Тип ОЦ приходит параметром: активного экрана модуля на странице осмотров
// нет, и activeOcType() там пуст (см. kernel/ocType.js). Чтение — cardDict
// и landDict ниже.

const OTHER = 'Прочее (ручной ввод)';

const other = (key, label) => ({
  key: key + 'Other',
  label,
  max: 100,
  placeholder: 'Опишите словами',
  visible: (values) => [].concat(values[key] || []).includes(OTHER),
});

// Внутренние стены в рабочей системе — тот же перечень, что наружные.
const WALLS_INT = WALLS;

// Разделы формы — по виду ОИ, по карточке этого вида (решение пользователя
// 15.10.2026 по сверке осмотра с карточками: «Полностью синхронизируем.
// Эталон - ОЦ+ОИ»; состав — «То, что видно на месте»; чек-лист коммуникаций
// строения — «Перенести к участку»). Подписи, порядок блоков и перечни — как в
// карточке ОИ; полей, которых в карточке нет, в осмотре нет. Не берутся поля
// по документам (ЕНИ, права, наименование, год, категория земель) и «Тип и
// класс капитальности» — его ставят по снимкам с осмотра. Рядом с полем —
// значение «по документам» (field.doc — из записи ОИ). Ключи прежних полей
// сохранены там, где смысл тот же: введённое осмотрщиком не теряется. ТС —
// ждёт решения пользователя («ТС пока что ждём»): формы нет, только снимки и
// заметка.
export const sections = (typeId, oi) => {
  const card = (oi && oi.card) || 'building';
  if (card === 'apartment') return flatSections(typeId, oi);
  if (card === 'land') return landSections(typeId);
  if (card === 'mech' || card === 'movable') return mechSections(oi);
  if (card === 'vehicle') return [];
  return buildingSections(typeId, oi);
};

const CONDITION = ['Отличное', 'Хорошее', 'Удовлетворительное', 'Плохое', 'Аварийное'];
const NETWORK = ['Подведены', 'Проходят рядом', 'На удалении', 'Отсутствуют в районе'];
const LAND_FORM = ['Квадратная', 'Прямоугольная', 'Близкая к прямоугольной', 'Трапециевидная', 'Вытянутая прямоугольная',
  'Близкая к Г-образной', 'Г-образная', 'Неправильный многоугольник', 'Неправильный многоугольник с заужением',
  'Узкая зауженная прямоугольная', 'Треугольная', 'Иное'];
const LAND_RELIEF = ['Ровный', 'Слабый уклон', 'Средний уклон или с перепадами', 'Крутой уклон', 'Сложный рельеф'];
const LAND_LOCATION = ['В центре населенного пункта', 'На окраине населенного пункта'];
const LAND_ROAD = ['На междугородней трассе — первая линия', 'На междугородней трассе — вторая линия',
  'Вблизи междугородней трассы (до 300 м)', 'На центральной трассе населенного пункта — первая линия',
  'На центральной трассе населенного пункта — вторая линия', 'Вблизи центральной трассы населенного пункта',
  'Внутри района', 'В глубине района'];
const IMPROVE = ['Не благоустроен', 'Частично благоустроен', 'Благоустроен', 'Дорогое благоустройство'];
const MECH_STATE = ['Рабочее', 'Условно пригодное', 'Нерабочее'];
const BUILD_TYPE = ['Отдельностоящее', 'Встроенное'];
const TEMP_MODE = ['Тёплый склад', 'Морозильник', 'Холодильник', 'Ангар', 'Холодный склад'];
const STRUCT_STRENGTH = ['Облегчённая', 'Усиленная'];
const APT_SERIES = ['Индивидуальная', 'Серия 97', 'Серия 97А', 'Серия 104', 'Серия 105', 'Серия 106', 'Серия 105/106', 'Серия 111',
  'Хрущёвка', 'Сталинка', 'Барачного типа', 'Гостиничного типа', 'Прочее'];
const APT_LOCATION = ['Неугловое', 'Угловое', '3 стороны', '4 стороны', 'Прочее'];
const FINISH = ['Без отделки', 'Вагонка', 'Гипсокартон', 'Декоративная штукатурка', 'Жидкие обои', 'Керамическая плитка',
  'Обои', 'Панели МДФ', 'Панели ПВХ', 'Побелка', 'Покраска', OTHER, 'Стеновые панели', 'Штукатурка'];
const INSULATION = ['Без утепления', 'Керамзит', 'Минеральная вата', 'Опилки', 'Пенопласт', 'Пенополистирол (ЭППС)',
  'Пенополиуретан', OTHER, 'Сэндвич-панели', 'Фольгированный утеплитель', 'Шлак', 'Штукатурка теплоизоляционная', 'Эковата'];
// Пустое значение справочника («Не выбрано», «Не заполнено») в осмотре — сам
// пустой выбор списка.
const clean = (list) => list.filter((v) => !/^не (выбрано|заполнено)$/i.test(v));
const landDict = (typeId, field, fallback) => clean(optionsFor(typeId, 'land', field) || fallback);
const cardDict = (typeId, card, field, fallback) => clean(optionsFor(typeId, card, field) || fallback);
const at = (o, path) => path.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
// Путь поля записи — при функции: по нему сборщик сверки
// (tools/docs/build_sverka_osmotra.py) находит поле карточки.
// Список (отопление — несколько видов сразу) — через запятую.
const docOf = (path) => Object.assign((oi) => {
  const v = at(oi, path);
  if (Array.isArray(v)) return v.filter(Boolean).join(', ');
  return v == null || v === '' ? '' : String(v);
}, { path });

// Производственное строение — как в карточке (civil/oi/building/zones.js,
// hasKind): вид литеры или хотя бы одной её подгруппы помещений.
const isProd = (oi) => !!oi && (oi.litKind === 'prod'
  || (Array.isArray(oi.zones) && oi.zones.some((z) => z && z.litKind === 'prod')));

// Конструктив и износ — строки таблицы карточки (civil/oi/building/view.js,
// STRUCT_ROWS): материал — мультивыбор, как в карточке, и износ элемента.
// Ключи прежних полей осмотра сохранены (basement — цоколь, wearRoof и др.).
const STRUCT_ROWS = [
  { key: 'foundation', path: 'foundation', label: 'Фундамент', fallback: FOUNDATION },
  { key: 'basement', path: 'plinth', label: 'Цоколь/подвал', optsKey: 'basement', fallback: BASEMENT },
  { key: 'wallsExt', path: 'wallsExt', label: 'Наружные стены', fallback: WALLS },
  { key: 'wallsInt', path: 'wallsInt', label: 'Внутренние стены', optsKey: 'wallsExt', fallback: WALLS_INT },
  { key: 'ceilings', path: 'ceilings', label: 'Перекрытия', fallback: CEILINGS },
  { key: 'roof', path: 'roof', label: 'Кровля', fallback: ROOF, wearKey: 'wearRoof' },
  { key: 'floors', path: 'floors', label: 'Полы', fallback: FLOORS },
  { key: 'windows', path: 'windows', label: 'Окна', fallback: WINDOWS },
  { key: 'doors', path: 'doors', label: 'Двери', fallback: DOORS },
  { key: 'heating', path: 'heating', label: 'Отопление', fallback: HEATING_EL, heating: true },
  { key: 'finish', path: 'finish', label: 'Отделка', fallback: FINISH, wearKey: 'wearFinish' },
  { key: 'insulation', path: 'insulation', label: 'Утепление', fallback: INSULATION, wearKey: 'wearInsul' },
];
// Самый большой раздел — «по возможности»: он не должен занимать экран
// прежде того, за чем едут на осмотр (свёрнутым заранее НЕ держим —
// замечание пользователя 08.09.2026). req — обязательные элементы карточки.
const structSection = (typeId, card, req = {}) => ({
  key: 'struct',
  title: 'Конструктив и износ',
  short: 'Конструктив',
  optional: true,
  fields: STRUCT_ROWS.flatMap((r) => {
    const opts = r.heating ? cardDict(typeId, card, 'heating', r.fallback) : cardDict(typeId, card, 'struct.' + (r.optsKey || r.key), r.fallback);
    return [
      // Отопление карточка хранит у ОИ (heating), а не в конструктиве.
      { key: r.key, label: r.label, multi: true, req: !!req[r.key], opts, doc: docOf(r.heating ? 'heating' : 'struct.' + r.path) },
      ...(opts.includes(OTHER) ? [other(r.key, `${r.label} — свой вариант`)] : []),
      {
        key: r.wearKey || 'wear' + r.key[0].toUpperCase() + r.key.slice(1),
        label: `${r.label} — износ`,
        opts: cardDict(typeId, card, 'wear', WEAR_STEPS),
        doc: docOf('wear.' + r.path),
      },
    ];
  }),
});

const stateSection = (typeId, card) => ({
  key: 'state',
  title: 'Состояние',
  fields: [
    { key: 'condInner', label: 'Внутреннее состояние', req: true, opts: cardDict(typeId, card, 'conditionInner', CONDITION), doc: docOf('conditionInner') },
    { key: 'condOuter', label: 'Внешнее состояние', req: true, opts: cardDict(typeId, card, 'conditionOuter', CONDITION), doc: docOf('conditionOuter') },
    { key: 'condTotal', label: 'Итоговое состояние', opts: cardDict(typeId, card, 'conditionTotal', CONDITION), doc: docOf('conditionTotal') },
  ],
});

// Тип и класс капитальности — как блок карточки литеры (civil/oi/building,
// capClass.js; решение пользователя 15.10.2026 «Тип и класс капитальности надо
// бы включить в осмотры»): тип объекта имущества, назначение по факту и
// признаки класса своего типа. Какие поля видны — по типу, выбранному на
// осмотре, а пока не выбран — по типу в карточке. Признак «высота» на осмотре не
// спрашивается: высоты осмотр не замеряет. Показывается у нежилого строения, как в
// карточке (fieldRules: showOiCategory).
const kindByLabel = (label) => (LIT_KINDS.find((k) => k.label === label) || {}).key || '';
const kindLabelOf = (key) => (LIT_KINDS.find((k) => k.key === key) || {}).label || '';
const capClassSection = (oi) => {
  const kindNow = (values) => kindByLabel(values.litKind) || (oi && oi.litKind) || '';
  const own = (kind) => (oi && oi.litKind === kind);
  const signDoc = (kind, key) => Object.assign((o) => {
    if (!o || o.litKind !== kind) return '';
    const v = (o.capSigns || {})[key];
    return Array.isArray(v) ? v.filter(Boolean).join(', ') : (v || '');
  }, { path: 'capSigns.' + key });
  return {
    key: 'capclass',
    title: 'Тип и класс капитальности',
    short: 'Класс',
    fields: [
      { key: 'litKind', label: 'Тип объекта имущества', opts: LIT_KINDS.map((k) => k.label), doc: Object.assign((o) => kindLabelOf(o && o.litKind), { path: 'litKind' }) },
      ...LIT_KINDS.map((k) => ({
        key: 'purposeFact_' + k.key, label: 'Назначение по факту', opts: LIT_PURPOSES[k.key] || [],
        visible: (values) => kindNow(values) === k.key,
        doc: Object.assign((o) => (own(k.key) ? o.purposeFact || '' : ''), { path: 'purposeFact' }),
      })),
      ...Object.entries(LIT_SIGNS).flatMap(([kind, signs]) => signs.filter((g) => !g.height).map((g) => ({
        key: `cap_${kind}_${g.key}`, label: g.label, multi: !!g.multi, opts: g.options.map((o) => o[0]),
        visible: (values) => kindNow(values) === kind,
        doc: signDoc(kind, g.key),
      }))),
    ],
  };
};

// Инженерные сети ОИ в осмотре (16.10.2026): те же поля и перечни, что в
// карточке; рядом — значение из карточки (своё, от участка или по
// умолчанию). Раздел свёрнут, если ОИ на участке, и открыт без участка.
// Запись ОЦ для значения из карточки ставит экран осмотрщика (setNetsRec):
// значение участка берётся из записи, а форма знает только ОИ.
let NETS_REC = null;
export const setNetsRec = (rec) => { NETS_REC = rec; };
const netsSection = (typeId, oi) => ({
  key: 'nets',
  title: 'Инженерные сети',
  short: 'Сети',
  closed: !!netsLandOf(NETS_REC, oi),
  fields: OI_NETS.map((f) => ({
    key: f.key, label: f.label, opts: landDict(typeId, f.key, f.list), tpLabel: 'в карточке',
    doc: Object.assign((o) => netValue(NETS_REC, o, f.key).value, { path: 'nets.' + f.key }),
  })),
});
export const NETS_KEYS = OI_NETS.map((f) => f.key);

const commentsSection = {
  key: 'comments',
  title: 'Комментарии',
  fields: [{ key: 'note', label: 'Комментарий осмотрщика', long: true, rows: 3 }],
};

// Строение — блоки карточки литеры: общие параметры, площади и этажность,
// конструктив и износ, состояние, доп. параметры производственного строения.
// Замеры осмотрщика — ОТДЕЛЬНЫЕ значения, а не правка данных ЦОД (решение
// пользователя 08.09.2026: «дублирует своим значением»): рядом — что стоит по
// документам и в карточке. Чек-лист коммуникаций рабочей системы — у участка
// (его «Инженерные сети»).
// Обязательность — как в карточке литеры (civil/oi/building/view.js,
// fieldRules): у производственного строения — наружные стены и высота по
// внешним замерам, у остальных — расположение строения.
const buildingSections = (typeId, oi, prod = isProd(oi)) => [
  {
    key: 'general',
    title: 'Общие параметры',
    short: 'Общие',
    fields: [
      { key: 'buildType', label: 'Расположение строения', req: !prod, opts: cardDict(typeId, 'building', 'buildType', BUILD_TYPE), doc: docOf('buildType') },
    ],
  },
  // Площади и высоты на осмотре не замеряются (указание пользователя
  // 15.10.2026: «Площади и высоты по осмотру не нужны») — они из документов и
  // карточки. Остаётся этажность.
  {
    key: 'measure',
    title: 'Этажность',
    short: 'Этажи',
    fields: [
      { key: 'floorsN', label: 'Количество этажей', num: true, doc: docOf('floors'), tpLabel: 'в карточке' },
    ],
  },
  // Конструктив, износ и состояние осмотрщик не заполняет (решение
  // пользователя 16.10.2026: «осмотрщик конструктив и износ не заполняет…
  // Состояние тоже»): их определяют по снимкам. structSection и stateSection
  // остаются в коде — описание полей карточки, понадобятся для сверки.
  netsSection(typeId, oi),
  ...(oi && oi.residential ? [] : [capClassSection(oi)]),
  ...(prod ? [{
    key: 'prod',
    title: 'Доп параметры (производственное строение)',
    short: 'Производственное',
    fields: [
      { key: 'tempMode', label: 'Температурный режим', multi: true, opts: cardDict(typeId, 'building', 'tempMode', TEMP_MODE), doc: docOf('tempMode') },
      { key: 'structStrength', label: 'Усиленность конструкции', opts: cardDict(typeId, 'building', 'structStrength', STRUCT_STRENGTH), doc: docOf('structStrength') },
    ],
  }] : []),
  commentsSection,
];

// Квартира — блоки карточки квартиры: общие параметры, конструктив
// и износ (справочники карточки квартиры), состояние.
const flatSections = (typeId, oi) => [
  {
    key: 'general',
    title: 'Общие параметры квартиры',
    short: 'Общие',
    fields: [
      { key: 'aptFloor', label: 'Этаж', num: true, doc: docOf('apartment.floor') },
      { key: 'aptBuildingFloors', label: 'Этажность дома', num: true, doc: docOf('apartment.buildingFloors') },
      { key: 'aptStoreys', label: 'Количество этажей в квартире', num: true, doc: docOf('apartment.storeys') },
      { key: 'aptRooms', label: 'Количество комнат', num: true, doc: docOf('apartment.rooms') },
      { key: 'aptSeries', label: 'Серия', opts: cardDict(typeId, 'apartment', 'series', APT_SERIES), doc: docOf('apartment.series') },
      { key: 'aptLocation', label: 'Положение на этаже', opts: cardDict(typeId, 'apartment', 'location', APT_LOCATION), doc: docOf('apartment.location') },
    ],
  },
  netsSection(typeId, oi),
  commentsSection,
];

// Земельный участок — блоки карточки участка: основные параметры (что видно
// на месте), инженерные сети (сюда же — чек-лист коммуникаций
// рабочей системы, решение пользователя 15.10.2026), благоустройство.
const landSections = (typeId) => [
  {
    key: 'place',
    title: 'Основные параметры',
    short: 'Основные',
    fields: [
      { key: 'location', label: 'Расположение в районе', opts: landDict(typeId, 'location', LAND_LOCATION), doc: docOf('location') },
      { key: 'roadLocation', label: 'Расположение к трассе', opts: landDict(typeId, 'roadLocation', LAND_ROAD), doc: docOf('roadLocation') },
      { key: 'corner', label: 'Угловой/Неугловой', opts: landDict(typeId, 'corner', ['Угловой', 'Неугловой']), doc: docOf('corner') },
      { key: 'locationFeatures', label: 'Особенности местоположения', long: true, rows: 2, doc: docOf('locationFeatures') },
      { key: 'encumbrance', label: 'Наличие сервитутов и обременений', opts: landDict(typeId, 'encumbrance', ['Нет', 'Есть']), doc: docOf('encumbrance') },
      { key: 'form', label: 'Форма участка', opts: landDict(typeId, 'form', LAND_FORM), doc: docOf('form') },
      { key: 'relief', label: 'Рельеф участка', opts: landDict(typeId, 'relief', LAND_RELIEF), doc: docOf('relief') },
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
    key: 'improve',
    title: 'Благоустройство территории',
    short: 'Благоустройство',
    fields: [
      { key: 'improvementRank', label: 'Наличие благоустройства', opts: landDict(typeId, 'improvementRank', IMPROVE), doc: docOf('improvementRank') },
      { key: 'improvementNote', label: 'Особенности благоустройства', long: true, rows: 2, doc: docOf('improvementNote') },
    ],
  },
  commentsSection,
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
  commentsSection,
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
    // Обмер ЦОД — не документ: у такого поля подпись «в карточке» (tpLabel).
    const lbl = field.tpLabel || (field.docLabel ? `по документам (${field.docLabel})` : 'по документам');
    if (!doc) return own ? '' : `${lbl}: не заполнено`;
    if (!own) return `${lbl}: ${doc}${unit}`;
    if (field.num) {
      const a = parseFloat(String(doc).replace(',', '.'));
      const b = parseFloat(String(own).replace(',', '.'));
      if (!isNaN(a) && !isNaN(b) && a !== b) return `РАСХОДИТСЯ: ${lbl} ${doc}${unit}, ${b > a ? '+' : '−'}${Math.abs(b - a).toFixed(2)}${unit}`;
      return `${lbl}: ${doc}${unit} — совпадает`;
    }
    // Мультивыбор — набор значений: порядок не важен.
    const set = (v) => [].concat(Array.isArray(v) ? v : String(v).split(/,\s*/)).map((x) => String(x).trim().toLowerCase()).filter(Boolean).sort().join('|');
    const same = Array.isArray(own) ? set(own) === set(doc) : String(own).trim().toLowerCase() === String(doc).trim().toLowerCase();
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
