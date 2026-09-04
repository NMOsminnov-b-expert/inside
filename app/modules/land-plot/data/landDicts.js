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
    key: 'IMPROVEMENT_GROUPS',
    title: 'Благоустройство территории',
    kind: 'list',
    system: false,
    values: D.IMPROVEMENT_GROUPS,
    slots: [
      { card: 'land', field: 'improvements', label: 'Благоустройство территории' },
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
  {
    key: 'LAND_UTILITY_STATUS',
    title: 'Состояние коммуникаций',
    kind: 'list',
    system: false,
    values: D.LAND_UTILITY_STATUS,
    slots: [
      { card: 'land', field: 'gasification', label: 'Наличие газификации' },
      { card: 'land', field: 'centralHeating', label: 'Наличие центрального отопления' },
      { card: 'land', field: 'centralWater', label: 'Наличие центрального водоснабжения' },
      { card: 'land', field: 'autonomousHeating', label: 'Наличие автономного отопления' },
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
