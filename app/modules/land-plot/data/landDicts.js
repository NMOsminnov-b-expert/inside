// Справочники карточки ОИ «земельный участок» — ОДИН набор на все типы ОЦ.
//
// Карточка участка в проекте одна: остальные модули импортируют её отсюда
// (см. oi/land/index.js в любом из них). Раз карточка одна, то и поля её одни,
// поэтому перечни описаны здесь, а модули их только подключают:
//
//     import { LAND_DICT_SOURCES } from '../../land-plot/data/landDicts.js';
//     export const DICT_SOURCES = [ ...своё..., ...LAND_DICT_SOURCES ];
//
// Иначе получается то, что и было до 02.09.2026: в каталоге «Гражданское
// здание» у участка не было ни одного справочника, а в «Жилом здании (дом)» —
// два случайных, хотя участок можно добавить в объект оценки любого типа.
//
// Значения — начальные: ядро копирует их в каждый справочник отдельно
// (kernel/dicts.js), поэтому правка перечня в одном типе ОЦ не задевает
// остальные. Общий здесь только состав полей.
import * as D from './dictionaries.js';

export const LAND_DICT_SOURCES = [
  {
    key: 'RAILWAY_ACCESS',
    title: 'Железнодорожная ветка',
    kind: 'list',
    system: false,
    values: D.RAILWAY_ACCESS,
    slots: [
      { card: 'land', field: 'railway', label: 'Наличие железнодорожной ветки' },
    ],
  },
  {
    key: 'ENGINEERING',
    title: 'Инженерное оснащение участка',
    kind: 'list',
    system: false,
    values: D.ENGINEERING,
    slots: [
      { card: 'land', field: 'utilities', label: 'Инженерное оснащение' },
    ],
  },
  {
    key: 'AUX_BUILDING_GROUPS',
    title: 'Вспомогательные постройки',
    // Разделы по типу участка: сельхозу и несельхозу подходят разные постройки.
    kind: 'group',
    system: false,
    values: D.AUX_BUILDING_GROUPS,
    slots: [
      { card: 'land', field: 'auxBuildingKind', label: 'Вспомогательная постройка' },
    ],
  },
  {
    key: 'AUX_CONDITION',
    title: 'Состояние постройки',
    kind: 'list',
    system: false,
    values: D.AUX_CONDITION,
    slots: [
      { card: 'land', field: 'auxCondition', label: 'Состояние постройки' },
    ],
  },
  {
    // Способ оценки вспомогательных построек: от него зависит, ведётся ли их
    // перечень в карточке участка (решение пользователя 11.09.2026).
    key: 'AUX_VALUATION',
    title: 'Оценка вспомогательных построек',
    kind: 'list',
    system: false,
    values: D.AUX_VALUATION,
    slots: [
      { card: 'land', field: 'auxValuation', label: 'Вспомогательные постройки оцениваются' },
    ],
  },
  {
    key: 'AUX_CLASS',
    title: 'Класс постройки',
    kind: 'list',
    system: false,
    values: D.AUX_CLASS,
    slots: [
      { card: 'land', field: 'auxClass', label: 'Класс постройки' },
    ],
  },
  {
    key: 'IMPROVEMENT_RANKS',
    // Поле 10.09.2026 переименовано в «Наличие благоустройства» — заголовок
    // справочника держим тем же словом, иначе перечень называется одним, а
    // поле, к которому он привязан, другим.
    title: 'Наличие благоустройства',
    kind: 'list',
    system: false,
    values: D.IMPROVEMENT_RANKS,
    slots: [
      { card: 'land', field: 'improvementRank', label: 'Наличие благоустройства' },
    ],
  },
  {
    key: 'LAND_PURPOSE_DOC',
    title: 'Назначение по правоудостоверяющему документу',
    kind: 'list',
    system: false,
    values: D.LAND_PURPOSE_DOC,
    slots: [
      { card: 'land', field: 'purpose', label: 'Назначение по правоудостоверяющему документу' },
    ],
  },
  {
    key: 'LAND_SOIL',
    title: 'Тип почвы',
    kind: 'list',
    system: false,
    values: D.LAND_SOIL,
    slots: [
      { card: 'land', field: 'soil', label: 'Тип почвы' },
    ],
  },
  {
    key: 'LAND_STONINESS',
    title: 'Каменистость',
    kind: 'list',
    system: false,
    values: D.LAND_STONINESS,
    slots: [
      { card: 'land', field: 'stoniness', label: 'Каменистость' },
    ],
  },
  {
    key: 'LAND_RIGHTS',
    title: 'Права на земельный участок',
    kind: 'list',
    system: false,
    values: D.LAND_RIGHTS,
    slots: [
      { card: 'land', field: 'rights', label: 'Права на земельный участок' },
    ],
  },
  {
    key: 'LAND_CATEGORIES',
    title: 'Категория земель',
    kind: 'list',
    system: false,
    values: D.LAND_CATEGORIES,
    slots: [
      { card: 'land', field: 'landCategory', label: 'Категория земель' },
    ],
  },
  {
    key: 'IRRIGATION_ACCESS',
    title: 'Доступность полива',
    kind: 'list',
    system: false,
    values: D.IRRIGATION_ACCESS,
    slots: [
      { card: 'land', field: 'irrigation', label: 'Доступность полива' },
    ],
  },
  {
    key: 'IRRIGATION_TYPE',
    title: 'Тип полива',
    kind: 'list',
    system: false,
    values: D.IRRIGATION_TYPE,
    slots: [
      { card: 'land', field: 'irrigationType', label: 'Тип полива' },
    ],
  },
  {
    key: 'LAND_BUILDINGS',
    title: 'Наличие построек (да/нет)',
    kind: 'list',
    system: true,
    values: D.LAND_BUILDINGS,
    slots: [
      { card: 'land', field: 'buildings', label: 'Наличие построек' },
    ],
  },
  {
    key: 'LAND_CORNER',
    title: 'Угловой / неугловой участок',
    kind: 'list',
    system: false,
    values: D.LAND_CORNER,
    slots: [
      { card: 'land', field: 'corner', label: 'Угловой/Неугловой' },
    ],
  },
  {
    key: 'LAND_ENCUMBRANCE',
    title: 'Сервитуты и обременения (да/нет)',
    kind: 'list',
    system: true,
    values: D.LAND_ENCUMBRANCE,
    slots: [
      { card: 'land', field: 'encumbrance', label: 'Наличие сервитутов и обременений' },
    ],
  },
  {
    key: 'LAND_FORM',
    title: 'Формы земельного участка',
    kind: 'list',
    system: false,
    values: D.LAND_FORM,
    slots: [
      { card: 'land', field: 'form', label: 'Форма участка' },
    ],
  },
  {
    key: 'LAND_LOCATION',
    title: 'Расположение в районе',
    kind: 'list',
    system: false,
    values: D.LAND_LOCATION,
    slots: [
      { card: 'land', field: 'location', label: 'Расположение в районе' },
    ],
  },
  {
    key: 'LAND_PLAN_DOC_TYPES',
    title: 'Планы и схемы участка',
    kind: 'list',
    system: false,
    values: D.LAND_PLAN_DOC_TYPES,
    slots: [
      { card: 'land', field: 'planDocType', label: 'Тип плана' },
    ],
  },
  {
    key: 'LAND_RELIEF',
    title: 'Рельеф участка',
    kind: 'list',
    system: false,
    values: D.LAND_RELIEF,
    slots: [
      { card: 'land', field: 'relief', label: 'Рельеф участка' },
    ],
  },
  {
    key: 'LAND_ROAD_LOCATION',
    title: 'Расположение к трассе',
    kind: 'list',
    system: false,
    values: D.LAND_ROAD_LOCATION,
    slots: [
      { card: 'land', field: 'roadLocation', label: 'Расположение к трассе' },
    ],
  },
  {
    key: 'LAND_TYPES',
    title: 'Типы земельного участка',
    kind: 'list',
    system: true,
    values: D.LAND_TYPES,
    slots: [
      { card: 'land', field: 'landType', label: 'Тип земельного участка' },
    ],
  },
  {
    key: 'LAND_USE_CATEGORIES',
    title: 'Категории использования земли',
    kind: 'list',
    system: false,
    values: D.LAND_USE_CATEGORIES,
    slots: [
      { card: 'land', field: 'useCategory', label: 'Категория и разрешённое использование' },
    ],
  },
  // У каждой инженерной сети свой перечень (решение пользователя 11.09.2026):
  // общий список не давал править их по отдельности. Порядок — как в карточке,
  // по ходу подключения. Отопление стоит последним: у него, в отличие от
  // прочих, есть «Автономное» — котёл на участке никакой сетью не подведён.
  {
    key: 'LAND_ELECTRICITY_STATUS',
    title: 'Состояние электроснабжения',
    kind: 'list',
    system: false,
    folder: 'Инженерные сети',
    values: D.LAND_ELECTRICITY_STATUS,
    slots: [
      { card: 'land', field: 'electricity', label: 'Наличие электроснабжения' },
    ],
  },
  {
    key: 'LAND_WATER_STATUS',
    title: 'Состояние водоснабжения',
    kind: 'list',
    system: false,
    folder: 'Инженерные сети',
    values: D.LAND_WATER_STATUS,
    slots: [
      { card: 'land', field: 'centralWater', label: 'Наличие водоснабжения' },
    ],
  },
  {
    key: 'LAND_SEWERAGE_STATUS',
    title: 'Состояние канализации',
    kind: 'list',
    system: false,
    folder: 'Инженерные сети',
    values: D.LAND_SEWERAGE_STATUS,
    slots: [
      { card: 'land', field: 'sewerage', label: 'Наличие канализации' },
    ],
  },
  {
    key: 'LAND_GAS_STATUS',
    title: 'Состояние газификации',
    kind: 'list',
    system: false,
    folder: 'Инженерные сети',
    values: D.LAND_GAS_STATUS,
    slots: [
      { card: 'land', field: 'gasification', label: 'Наличие газификации' },
    ],
  },
  {
    key: 'LAND_HEATING_STATUS',
    title: 'Состояние отопления',
    kind: 'list',
    system: false,
    folder: 'Инженерные сети',
    values: D.LAND_HEATING_STATUS,
    slots: [
      { card: 'land', field: 'centralHeating', label: 'Наличие отопления' },
    ],
  },
  {
    key: 'APARTMENT_RIGHTS',
    title: 'Права на земельный участок',
    kind: 'list',
    system: false,
    values: D.APARTMENT_RIGHTS,
    slots: [
      { card: 'land', field: 'rights', label: 'Права на земельный участок' },
    ],
  },
];
