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
// (опционально) · Комментарии · Фото и документы, и внизу «Назад»
// и «Сохранить осмотр».
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: заполненное живёт в памяти вкладки. На сервере это
// осмотр литеры со своим автором, временем и версией — и, судя по рабочей
// системе, с обязательными полями, без которых осмотр не сдаётся.

import { getValue } from '../../kernel/fieldSchema.js';
import { optionsFor } from '../../kernel/dicts.js';
import { LIT_KINDS, LIT_PURPOSES, LIT_SIGNS, OI_NETS, netValue, netsLandOf, tsInspectPlan, BATHROOM, bathroomOf } from '../../kernel/registry.js';

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
// заметка. С 27.10.2026 у ТС своя форма — поля «на месте» (vehicleSections).
export const sections = (typeId, oi) => {
  const card = (oi && oi.card) || 'building';
  if (card === 'apartment') return flatSections(typeId, oi);
  if (card === 'land') return landSections(typeId);
  if (card === 'mech' || card === 'movable') return mechSections(oi);
  // Выявленное на осмотре ТС — черновик со своими полями в блоке «Выявлено»
  // (views.js, foundTsHTML): формы осмотра у него нет.
  if (card === 'vehicle') return oi.draft ? [] : vehicleSections(oi);
  return buildingSections(typeId, oi);
};

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
// Состояния оборудования — те же, что в карточке механизмов (таблица
// пользователя 28.10.2026; страницы не берут справочники из модулей, поэтому
// перечень и описания повторены дословно). Описание выбранного — подсказкой
// у поля.
const MECH_REPAIR = 'В ремонте';
const MECH_STATE_NOTES = {
  'Рабочее': 'Оборудование полностью исправно, функционирует в штатном режиме и соответствует своему назначению без ограничений. Видимые дефекты отсутствуют либо носят косметический характер и не влияют на работоспособность.',
  'Условно пригодное': 'Оборудование функционирует, но имеет неисправности, износ или дефекты, которые ограничивают его работу или требуют ремонта/замены отдельных узлов для возвращения штатных характеристик. Эксплуатация возможна с ограничениями либо после вложений.',
  'Нерабочее': 'Оборудование не функционирует и не может выполнять свои функции в текущем состоянии. Для восстановления работоспособности требуется ремонт или замена существенных узлов, либо восстановление технически или экономически нецелесообразно.',
  [MECH_REPAIR]: 'На момент осмотра оборудование проходит ремонт или техническое обслуживание: частично или полностью разобрано, либо остановлено для проведения ремонтных работ. Оценка работоспособности в данный момент невозможна, фактическое состояние определяется по результатам завершения ремонта.',
};
const MECH_STATE = Object.keys(MECH_STATE_NOTES);
const BUILD_TYPE = ['Отдельностоящее', 'Встроенное'];
const TEMP_MODE = ['Тёплый склад', 'Морозильник', 'Холодильник', 'Ангар', 'Холодный склад'];
const STRUCT_STRENGTH = ['Облегчённая', 'Усиленная'];
const APT_SERIES = ['Индивидуальная', 'Серия 97', 'Серия 97А', 'Серия 104', 'Серия 105', 'Серия 106', 'Серия 105/106', 'Серия 111',
  'Хрущёвка', 'Сталинка', 'Барачного типа', 'Гостиничного типа', 'Прочее'];
const APT_LOCATION = ['Неугловое', 'Угловое', '3 стороны', '4 стороны', 'Прочее'];
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

// Тип и класс капитальности — как блок карточки литеры (civil/oi/building,
// capClass.js; решение пользователя 15.10.2026 «Тип и класс капитальности надо
// бы включить в осмотры»): тип объекта имущества, назначение по факту и
// признаки класса своего типа. Какие поля видны — по типу, выбранному на
// осмотре, а пока не выбран — по типу в карточке. Признак «высота» на осмотре не
// спрашивается: высоты осмотр не замеряет. Показывается у нежилого строения, как в
// карточке (fieldRules: showOiCategory).
const kindByLabel = (label) => (LIT_KINDS.find((k) => k.label === label) || {}).key || '';
const kindLabelOf = (key) => (LIT_KINDS.find((k) => k.key === key) || {}).label || '';
// Признаки класса на осмотре — только перечисленные (ключи SIGNS карточки,
// civil/oi/building/capClass.js). У производственно-складского — кран-балка и
// полы (решение пользователя 23.10.2026: «Для производственно складской в типе
// и классе капитальности оставляем назначение по факту, кран балку, полы»); у
// гражданского — всё, кроме уровня отделки (23.10.2026). Спрятанные прежде
// признаки удалены из кода 13.11.2026 (решение pwa-osmotr-otdelnyy-modul-so-svoey-
// kodovoy-bazoy-polya-osmotra-v-maket). Высоты осмотр не замеряет — признака
// «Высота» в списках нет.
const CAP_SIGNS = { civil: ['arch', 'constr', 'plan', 'eng'], prod: ['crane', 'floors'] };
const capClassSection = (oi) => {
  const kindNow = (values) => kindByLabel(values.litKind) || (oi && oi.litKind) || '';
  // «Тип объекта имущества» тоже прячется, если строение производственно-складское
  // по карточке и тип на осмотре не меняли. Если осмотрщик сам выбрал тип, поле
  // остаётся — иначе после выбора его нельзя было бы исправить.
  const kindFieldVisible = (values) => !(oi && oi.litKind === 'prod' && !values.litKind);
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
      { key: 'litKind', label: 'Тип объекта имущества', opts: LIT_KINDS.map((k) => k.label), visible: kindFieldVisible, doc: Object.assign((o) => kindLabelOf(o && o.litKind), { path: 'litKind' }) },
      ...LIT_KINDS.map((k) => ({
        key: 'purposeFact_' + k.key, label: 'Назначение по факту', opts: LIT_PURPOSES[k.key] || [],
        visible: (values) => kindNow(values) === k.key,
        doc: Object.assign((o) => (own(k.key) ? o.purposeFact || '' : ''), { path: 'purposeFact' }),
      })),
      ...Object.entries(LIT_SIGNS).flatMap(([kind, signs]) => signs.filter((g) => (CAP_SIGNS[kind] || []).includes(g.key)).map((g) => ({
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
  fields: [
    ...OI_NETS.map((f) => ({
      key: f.key, label: f.label, opts: landDict(typeId, f.key, f.list), tpLabel: 'в карточке',
      doc: Object.assign((o) => netValue(NETS_REC, o, f.key).value, { path: 'nets.' + f.key }),
    })),
    // Санузел — внутри / снаружи, оба сразу бывают (решение 02.11.2026,
    // pole-sanuzel-vnutri-snaruzhi-v-inzhenernyh-setyah-liter-i-kvartir).
    { key: BATHROOM.key, label: BATHROOM.label, multi: true, opts: landDict(typeId, BATHROOM.key, BATHROOM.list), tpLabel: 'в карточке',
      doc: Object.assign((o) => bathroomOf(o).join(', '), { path: 'nets.' + BATHROOM.key }) },
  ],
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
      // Площади и высоты на осмотре не замеряются (указание пользователя
      // 15.10.2026: «Площади и высоты по осмотру не нужны») — остаётся
      // этажность, в общих параметрах (16.10.2026: «Объединяем» — отдельным
      // разделом было по одному полю в блоке).
      { key: 'floorsN', label: 'Количество этажей', num: true, doc: docOf('floors'), tpLabel: 'в карточке' },
    ],
  },
  // Конструктив, износ и состояние осмотрщик не заполняет (решение
  // пользователя 16.10.2026: «осмотрщик конструктив и износ не заполняет…
  // Состояние тоже»): их определяют по снимкам. Разделы удалены 13.11.2026.
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
      { key: `u.${u.id}.state`, path: `u.${u.id}.state`, label: 'Состояние', opts: MECH_STATE, optNotes: MECH_STATE_NOTES, doc: () => u.state || '', needsPhoto: 'Нерабочее' },
      { key: `u.${u.id}.repair`, path: `u.${u.id}.repair`, label: 'Причина ремонта', req: true, max: 300,
        placeholder: 'Что ремонтируют, кто, до какого срока', visible: (values) => getValue(values, `u.${u.id}.state`) === MECH_REPAIR },
    ],
  })),
  commentsSection,
];

// Транспортное средство — ОЦ «ТС» или ОИ «Транспортное средство» (решение
// пользователя 27.10.2026, запись графа osmotr-ts-na-meste-i-po-snimkam).
// Только поля «на месте»: что читается с таблички, прибора или документа,
// считается или меряется рулеткой; рядом — значение из записи ТС и
// «РАСХОДИТСЯ». Поля «по снимкам» (состояния, комплектация, КПП, тормоза…)
// заполняют ЦОД и оценка — осмотрщику они не показываются. Состав, подписи,
// единицы и подсказки — из каталога ТС через дверь модуля (kernel/registry.js,
// tsInspectPlan); здесь — только раскладка по разделам.
//
// Первым — «Место осмотра»: ТС не закреплено за адресом (заметка пользователя
// 27.10.2026 «ТС не закреплены за конкретным адресом»). Адрес — на момент
// осмотра и необязательный («Адрес мог меняться. Указываем (опционально) на
// момент осмотра»). Место съёмки и подстановка адреса объекта выезда —
// действия раздела (views.js, widget 'tsPlace'). Отметки «найдено / не
// найдено» нет (пользователь 28.10.2026: «Для подобных ситуаций существуют
// статусы самого осмотра»).
const NUM_TYPES = ['int', 'num', 'year'];
// Поле каталога → поле формы. prefix — где лежит значение у осмотра: 'f' у
// машины, 'm.<id>' у модуля (как f и modules[].f у записи ТС).
function tsField(prefix, d, { label = d.label } = {}) {
  const key = `${prefix}.${d.key}`;
  const one = d.units.length <= 1;
  const field = {
    key,
    label,
    note: d.hint,
    doc: Object.assign(() => d.doc, { path: `vehicle.${prefix === 'f' ? 'f' : 'modules'}.${d.key}` }),
    ...(d.fromDocs ? {} : { tpLabel: 'в карточке' }),
  };
  if (d.type === 'select') Object.assign(field, { opts: d.options });
  else if (d.type === 'area') Object.assign(field, { long: true, rows: 2 });
  else if (NUM_TYPES.includes(d.type)) Object.assign(field, { num: true, int: d.type !== 'num', unit: one ? d.units[0] || '' : d.unit });
  // Номера сверяются без пробелов и дефисов: «01 KG 777 ABC» — тот же госномер.
  else Object.assign(field, { loose: true, max: 40 });
  // Пробег — в км или милях: единицу выбирают рядом (как в карточке ТС).
  const unitField = one ? [] : [{
    key: key + '@unit', label: `${d.label}, единица`, opts: d.units,
  }];
  return [field, ...unitField];
}
function vehicleSections(oi) {
  const plan = tsInspectPlan(oi);
  const sec = (key, title, short, fields) => ({ key, title, short, fields });
  const list = [
    {
      key: 'where',
      title: 'Место осмотра',
      short: 'Место',
      widget: 'tsPlace',
      fields: [
        { key: 'ts.addr', label: 'Адрес на момент осмотра', max: 200 },
      ],
    },
    // Разделы и поля — как в приложении «Осмотр» (modules/vehicle/inspect.js, TS_ONSITE).
    sec('ident', 'Опознание', 'Опознание', plan.ident.flatMap((d) => tsField('f', d))),
    sec('readings', 'Показания', 'Показания', plan.readings.flatMap((d) => tsField('f', d))),
    sec('engine', 'Двигатель', 'Двигатель', plan.engine.flatMap((d) => tsField('f', d))),
    commentsSection,
  ];
  return list.filter((s) => s.fields.length);
}

// Плоский перечень полей — для подсчёта заполненного и обязательного
// (kernel/fieldSchema.js: requiredLeft, filledCount).
export const allFields = (typeId, oi) => sections(typeId, oi).flatMap((s) => s.fields);

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
      if (!isNaN(a) && !isNaN(b) && a !== b) return `РАСХОДИТСЯ: ${lbl} ${doc}${unit}, ${b > a ? '+' : '−'}${Math.abs(b - a).toFixed(field.int ? 0 : 2)}${unit}`;
      return `${lbl}: ${doc}${unit} — совпадает`;
    }
    // Мультивыбор — набор значений: порядок не важен.
    const set = (v) => [].concat(Array.isArray(v) ? v : String(v).split(/,\s*/)).map((x) => String(x).trim().toLowerCase()).filter(Boolean).sort().join('|');
    // loose — номера (госномер, VIN): пробелы и дефисы не в счёт.
    const norm = (v) => String(v).trim().toLowerCase().replace(field.loose ? /[\s-]+/g : /^$/, '');
    const same = Array.isArray(own) ? set(own) === set(doc) : norm(own) === norm(doc);
    return same ? `${lbl}: ${doc} — совпадает` : `РАСХОДИТСЯ: ${lbl} ${doc}`;
  }
  return '';
}
