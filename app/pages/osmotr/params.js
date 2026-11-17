// Поля осмотра приложения «Осмотр» (PWA) — отдельный модуль, как требует решение графа
// pwa-osmotr-otdelnyy-modul-so-svoey-kodovoy-bazoy-polya-osmotra-v-maket (13.11.2026: «PWA — отдельный модуль.
// Пусть имеет свою кодовую базу… так избежим проблем»). Перенос Params.kt приложения
// (osmotr/shared/…/core/Params.kt): ключи, подписи, перечни, обязательность и условия показа — те же, сводка —
// tools/docs/build_pwa_fields.py («Поля осмотра PWA.xlsx»). Схема прежнего экрана осмотрщика
// (pages/inspection/form.js) здесь не используется: поля не смешиваются.
//
// Отличие от приложения — одно: у ТС нет «Адреса на момент осмотра» (пользователь 16.11.2026: «Адрес на
// момент осмотров разве что убираем у ТС»).
//
// Поле: key — путь значения в «Результатах осмотра» (kernel/fieldSchema.js, getValue); opts — перечень; multi —
// выбор нескольких; num — число; long — текст; req(values) — обязательное; visible(values) — показывается;
// counted — идёт ли в «заполнено N из M» (комментарий не идёт, как в приложении).

const UTILITY = ['Подведены', 'Проходят рядом', 'На удалении', 'Отсутствуют в районе'];
const SEWERAGE = ['Подведена центральная', 'Септик', 'Очистные сооружения', 'Проходят рядом', 'На удалении', 'Отсутствуют в районе'];
const HEATING = [...UTILITY, 'Автономное'];
const BUILD_TYPE = ['Отдельностоящее', 'Встроенное'];
const LAND_FORM = ['Квадратная', 'Прямоугольная', 'Близкая к прямоугольной', 'Трапециевидная', 'Вытянутая прямоугольная',
  'Близкая к Г-образной', 'Г-образная', 'Неправильный многоугольник', 'Неправильный многоугольник с заужением',
  'Узкая зауженная прямоугольная', 'Треугольная', 'Иное'];
const LAND_RELIEF = ['Ровный', 'Слабый уклон', 'Средний уклон или с перепадами', 'Крутой уклон', 'Сложный рельеф'];
const IMPROVE = ['Не благоустроен', 'Частично благоустроен', 'Благоустроен', 'Дорогое благоустройство'];
const LAND_USE = ['Орошаемая пашня', 'Богара', 'Сенокос', 'Сельскохозяйственное производство', 'Кошара', 'Иное'];
const IRRIGATION_ACCESS = ['Хорошая', 'Средняя', 'Ограничена', 'Отсутствует'];
const IRRIGATION_DISTANCE = ['На участке', 'Рядом', 'На незначительном удалении', 'Удалён'];
const IRRIGATION_TYPE = ['Арык', 'Канал', 'Речка', 'Скважина', 'Водопровод', 'Прочее'];
const LAND_SOIL = ['Чернозёмная', 'Серозёмная', 'Каштановая', 'Лугово-болотная', 'Песчаная', 'Каменистая', 'Иное'];
const ENGINEERING = ['Электроснабжение', 'Водоснабжение', 'Ёмкость для воды', 'Газоснабжение', 'Отопление', 'Канализация'];

export const OBJ_KIND = 'objKind';
export const LAND_TYPE = 'landType';
const FLAT = 'Квартира';
const BUILDING = 'Здание';
const HOUSE = 'Жилой дом';
const OTHER = 'Прочее строение';
const AUX = 'Вспомогательная постройка';
const OI_TYPES = [FLAT, BUILDING, HOUSE, OTHER, AUX];
const AGRI = 'Сельскохозяйственный';

const always = () => true;
const isFlat = (v) => v[OBJ_KIND] === FLAT;
const notFlat = (v) => !isFlat(v);
const isAgri = (v) => v[LAND_TYPE] === AGRI;
const notAgri = (v) => !isAgri(v);

const COMMENT = { key: 'comments', title: 'Комментарии', fields: [{ key: 'note', label: 'Комментарий осмотрщика', long: true, rows: 3, counted: false }] };

const building = () => [
  { key: 'kind', title: 'Тип ОИ', fields: [{ key: OBJ_KIND, label: 'Тип ОИ', opts: OI_TYPES }] },
  { key: 'general', title: 'Общие параметры', fields: [
    { key: 'buildType', label: 'Тип строения', opts: BUILD_TYPE, visible: notFlat },
    { key: 'floorsN', label: 'Количество этажей', num: true, int: true, visible: notFlat },
  ] },
  { key: 'flat', title: 'Общие параметры квартиры', fields: [
    { key: 'aptFloor', label: 'Этаж', num: true, int: true, visible: isFlat },
    { key: 'aptBuildingFloors', label: 'Этажность дома', num: true, int: true, visible: isFlat },
    { key: 'aptStoreys', label: 'Количество этажей в квартире', num: true, int: true, visible: isFlat },
    { key: 'aptRooms', label: 'Количество комнат', num: true, int: true, visible: isFlat },
  ] },
  { key: 'sanuzel', title: 'Санузел', fields: [{ key: 'bathroom', label: 'Санузел', multi: true, opts: ['Внутри', 'Снаружи'] }] },
  { key: 'nets', title: 'Инженерные сети', fields: [
    { key: 'electricity', label: 'Наличие электроснабжения', opts: UTILITY, req: always },
    { key: 'centralWater', label: 'Наличие водоснабжения', opts: UTILITY, req: always },
    { key: 'sewerage', label: 'Наличие канализации', opts: SEWERAGE, req: always },
    { key: 'gasification', label: 'Наличие газификации', opts: UTILITY, req: always },
    { key: 'centralHeating', label: 'Наличие отопления', opts: HEATING, req: always },
  ] },
  COMMENT,
];

const land = () => [
  { key: 'type', title: 'Тип земельного участка', fields: [{ key: LAND_TYPE, label: 'Тип земельного участка', opts: [AGRI, 'Несельскохозяйственный'] }] },
  { key: 'place', title: 'Основные параметры', fields: [
    { key: 'locationFeatures', label: 'Особенности местоположения', long: true, rows: 2 },
    { key: 'form', label: 'Форма участка', opts: LAND_FORM },
    { key: 'relief', label: 'Рельеф участка', opts: LAND_RELIEF },
  ] },
  { key: 'agri', title: 'Сельскохозяйственные характеристики', fields: [
    { key: 'useCategory', label: 'Категория и разрешенное использование', opts: LAND_USE, visible: isAgri },
    { key: 'irrigation', label: 'Доступность полива', opts: IRRIGATION_ACCESS, visible: isAgri },
    { key: 'irrigationDistance', label: 'Удалённость полива', opts: IRRIGATION_DISTANCE, visible: isAgri },
    { key: 'irrigationType', label: 'Тип полива', opts: IRRIGATION_TYPE, visible: isAgri },
    { key: 'soil', label: 'Тип почвы', opts: LAND_SOIL, visible: isAgri },
    { key: 'utilities', label: 'Инженерное оснащение', multi: true, opts: ENGINEERING, visible: isAgri },
  ] },
  { key: 'nets', title: 'Инженерные сети', fields: [
    { key: 'electricity', label: 'Наличие электроснабжения', opts: UTILITY, req: always, visible: notAgri },
    { key: 'centralWater', label: 'Наличие водоснабжения', opts: UTILITY, req: always, visible: notAgri },
    { key: 'sewerage', label: 'Наличие канализации', opts: SEWERAGE, req: always, visible: notAgri },
    { key: 'gasification', label: 'Наличие газификации', opts: UTILITY, req: always, visible: notAgri },
    { key: 'centralHeating', label: 'Наличие отопления', opts: HEATING, req: always, visible: notAgri },
    { key: 'railway', label: 'Наличие железнодорожной ветки', opts: ['Нет', 'Есть', 'Возможно подвести'], visible: notAgri },
  ] },
  { key: 'improve', title: 'Благоустройство территории', fields: [
    { key: 'improvementRank', label: 'Наличие благоустройства', opts: IMPROVE },
    { key: 'improvementNote', label: 'Особенности благоустройства', long: true, rows: 2 },
  ] },
  COMMENT,
];

const vehicle = () => [
  // Регистрационный номер осмотрщик не редактирует (пользователь 17.11.2026) — он в шапке ТС из записи (data.js tsLine).
  { key: 'readings', title: 'Показания', fields: [
    { key: 'f.mileage', label: 'Пробег', num: true, int: true },
    { key: 'f.mileage@unit', label: 'Единица', opts: ['км', 'миль'] },
    { key: 'f.engineHours', label: 'Моточасы, ч', num: true, int: true },
    { key: 'f.wheel', label: 'Руль', opts: ['Левый', 'Правый'] },
  ] },
  { key: 'engine', title: 'Двигатель', fields: [{ key: 'f.fuel', label: 'Тип топлива', opts: ['Бензин', 'Дизель', 'Газ', 'Газ-бензин', 'Гибрид', 'Электро'] }] },
  { key: 'state', title: 'Состояние', fields: [
    { key: 'f.generalState', label: 'Общее состояние', opts: ['Рабочее', 'Условно пригодное', 'Нерабочее', 'Иное'] },
    { key: 'f.generalStateNote', label: 'Описание общего состояния', long: true, rows: 2, visible: (v) => v['f.generalState'] === 'Иное' || (v.f || {}).generalState === 'Иное' },
  ] },
  COMMENT,
];

// Форма по виду ОИ: строение, квартира, вспомогательная постройка — форма строения; участок; ТС (и выявленное ТС).
// Механизмы и оборудование — описью, полей формы нет.
export function pwaSections(oi) {
  const card = (oi && oi.card) || '';
  if (card === 'land') return land();
  if (card === 'vehicle') return vehicle();
  if (card === 'building' || card === 'apartment' || card === 'aux') return building();
  return [];
}

// Значения по умолчанию — что приложение подставляет само (не считается заполненным осмотрщиком): тип ОИ — по
// виду ОИ в составе.
export function pwaDefaults(oi) {
  if (!oi) return {};
  if (oi.card === 'apartment') return { [OBJ_KIND]: FLAT };
  if (oi.card === 'aux') return { [OBJ_KIND]: AUX };
  if (oi.card === 'building') return { [OBJ_KIND]: oi.residential ? HOUSE : oi.litKind === 'other' ? OTHER : BUILDING };
  return {};
}
