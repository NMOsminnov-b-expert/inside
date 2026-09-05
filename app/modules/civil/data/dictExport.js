// Что этот модуль отдаёт в раздел «Справочники».
//
// Ядро собирает справочники через реестр (kernel/registry.js) — знать про
// модули напрямую ему по-прежнему не нужно. Здесь только описание: какие
// перечни модуля становятся справочниками, какие остаются системными (их
// правка ломает логику карточек — см. docs/tz/10-spravochniki.md, раздел 1.1)
// и к какому полю какого типа ОИ они привязаны.
//
// Сами значения НЕ дублируются: берутся из dictionaries.js этого же модуля.
import * as D from './dictionaries.js';
// Перечни полей карточки участка — общие для всех типов ОЦ: сама карточка
// тоже одна на проект (см. oi/land/index.js).
import { LAND_DICT_SOURCES } from '../../land-plot/data/landDicts.js';

export const DICT_SOURCES = [
  {
    key: 'TEMP_MODE',
    title: 'Температурный режим',
    kind: 'list',
    system: false,
    values: D.TEMP_MODE,
    slots: [
      { card: 'building', field: 'tempMode', label: 'Температурный режим' },
    ],
  },
  {
    key: 'STRUCT_STRENGTH',
    title: 'Капитальность конструкций',
    kind: 'list',
    system: false,
    values: D.STRUCT_STRENGTH,
    slots: [
      { card: 'building', field: 'structStrength', label: 'Капитальность' },
    ],
  },
  {
    key: 'STRUCTURE_KIND',
    title: 'Тип строения',
    kind: 'list',
    system: false,
    values: D.STRUCTURE_KIND,
    slots: [
      { card: 'building', field: 'structureKind', label: 'Тип строения' },
    ],
  },
  {
    key: 'APARTMENT_LOCATIONS',
    title: 'Расположение квартиры',
    kind: 'list',
    system: false,
    values: D.APARTMENT_LOCATIONS,
    slots: [
      { card: 'apartment', field: 'location', label: 'Расположение' },
    ],
  },
  {
    key: 'APARTMENT_RIGHTS',
    title: 'Права на строение',
    kind: 'list',
    system: false,
    values: D.APARTMENT_RIGHTS,
    slots: [
      { card: 'apartment', field: 'rights', label: 'Права на строение' },
    ],
  },
  {
    key: 'APARTMENT_SERIES',
    title: 'Серии жилых домов',
    kind: 'list',
    system: false,
    values: D.APARTMENT_SERIES,
    slots: [
      { card: 'apartment', field: 'series', label: 'Серия' },
    ],
  },
  {
    key: 'BUILD_TYPE',
    title: 'Расположение строения',
    kind: 'list',
    system: true,
    values: D.BUILD_TYPE,
    slots: [
      { card: 'building', field: 'buildType', label: 'Тип строения' },
    ],
  },
  {
    key: 'CRANE_BEAM',
    title: 'Кран-балка',
    kind: 'list',
    system: false,
    values: D.CRANE_BEAM,
    slots: [
      { card: 'building', field: 'craneBeam', label: 'Наличие/возможность кран-балки' },
    ],
  },
  {
    key: 'DOC_TYPES',
    title: 'Типы документов',
    kind: 'list',
    system: false,
    values: D.DOC_TYPES,
    slots: [
      { card: 'oc', field: 'docType', label: 'Тип документа' },
    ],
  },
  {
    key: 'HEATING',
    title: 'Отопление',
    kind: 'list',
    system: false,
    values: D.HEATING,
    slots: [
      { card: 'building', field: 'heating', label: 'Отопление' },
      { card: 'apartment', field: 'heating', label: 'Отопление' },
    ],
  },
  {
    key: 'MANSARD_TYPE',
    title: 'Тип мансарды',
    kind: 'list',
    system: false,
    values: D.MANSARD_TYPE,
    slots: [
      { card: 'building', field: 'mansardType', label: 'Форма крыши' },
      { card: 'apartment', field: 'mansardType', label: 'Тип мансарды' },
    ],
  },
  {
    key: 'OI_CATEGORY_GROUPS',
    title: 'Категории объектов имущества',
    kind: 'list',
    system: true,
    values: D.OI_CATEGORY_GROUPS,
    slots: [
      { card: 'building', field: 'category', label: 'Категория ОИ' },
    ],
  },
  {
    key: 'PHOTO_CAT',
    title: 'Категории фотографий',
    kind: 'list',
    system: false,
    values: D.PHOTO_CAT,
    slots: [
      { card: 'building', field: 'photoCat', label: 'Категория фотографии' },
    ],
  },
  {
    key: 'PROD_FLOORS',
    title: 'Полы производственных зданий',
    kind: 'list',
    system: false,
    values: D.PROD_FLOORS,
    slots: [
      { card: 'building', field: 'floorsType', label: 'Полы' },
    ],
  },
  {
    key: 'PROD_FRAME',
    title: 'Каркас производственного здания',
    kind: 'list',
    system: false,
    values: D.PROD_FRAME,
    slots: [
      { card: 'building', field: 'frame', label: 'Каркас' },
    ],
  },
  {
    key: 'RES_BUILD_CAT',
    title: 'Категории жилых строений',
    kind: 'list',
    system: false,
    values: D.RES_BUILD_CAT,
    slots: [
      { card: 'building', field: 'buildCat', label: 'Категория строения' },
    ],
  },
  {
    key: 'RIGHTS',
    title: 'Права',
    kind: 'list',
    system: false,
    values: D.RIGHTS,
    slots: [
      { card: 'building', field: 'rights', label: 'Права на строение' },
    ],
  },
  {
    key: 'STATUS_BUILD',
    title: 'Статусы объекта имущества',
    kind: 'list',
    system: true,
    values: D.STATUS_BUILD,
    slots: [
      { card: 'building', field: 'status', label: 'Статус' },
    ],
  },
  {
    key: 'STATUS_OC',
    title: 'Статусы объекта оценки',
    kind: 'list',
    system: true,
    values: D.STATUS_OC,
    slots: [
      { card: 'oc', field: 'status', label: 'Статус ОЦ' },
    ],
  },
  {
    key: 'BUILD_CONDITION',
    title: 'Состояние строения',
    kind: 'list',
    system: false,
    values: D.BUILD_CONDITION,
    slots: [
      { card: 'building', field: 'conditionInner', label: 'Внутреннее состояние' },
      { card: 'building', field: 'conditionOuter', label: 'Внешнее состояние' },
      { card: 'building', field: 'conditionTotal', label: 'Итоговое состояние' },
    ],
  },
  {
    key: 'WEAR_LEVEL',
    title: 'Уровень износа',
    kind: 'list',
    system: false,
    values: D.WEAR_LEVEL,
    slots: [
      { card: 'building', field: 'wear', label: 'Износ' },
    ],
  },
  {
    key: 'STRUCT_foundation',
    title: 'Фундамент',
    kind: 'list',
    system: false,
    folder: 'Конструктивный состав',
    values: D.STRUCT.foundation,
    slots: [
      { card: 'building', field: 'struct.foundation', label: 'Фундамент' },
    ],
  },
  {
    key: 'STRUCT_wallsExt',
    title: 'Наружные стены',
    kind: 'list',
    system: false,
    folder: 'Конструктивный состав',
    values: D.STRUCT.wallsExt,
    slots: [
      { card: 'building', field: 'struct.wallsExt', label: 'Наружные стены' },
    ],
  },
  {
    key: 'STRUCT_wallsInt',
    title: 'Внутренние стены',
    kind: 'list',
    system: false,
    folder: 'Конструктивный состав',
    values: D.STRUCT.wallsExt,
    slots: [
      { card: 'building', field: 'struct.wallsInt', label: 'Внутренние стены' },
    ],
  },
  {
    key: 'STRUCT_ceilings',
    title: 'Перекрытия',
    kind: 'list',
    system: false,
    folder: 'Конструктивный состав',
    values: D.STRUCT.ceilings,
    slots: [
      { card: 'building', field: 'struct.ceilings', label: 'Перекрытия' },
    ],
  },
  {
    key: 'STRUCT_roof',
    title: 'Кровля',
    kind: 'list',
    system: false,
    folder: 'Конструктивный состав',
    values: D.STRUCT.roof,
    slots: [
      { card: 'building', field: 'struct.roof', label: 'Кровля' },
    ],
  },
  {
    key: 'STRUCT_floors',
    title: 'Полы',
    kind: 'list',
    system: false,
    folder: 'Конструктивный состав',
    values: D.STRUCT.floors,
    slots: [
      { card: 'building', field: 'struct.floors', label: 'Полы' },
    ],
  },
  {
    key: 'STRUCT_windows',
    title: 'Окна',
    kind: 'list',
    system: false,
    folder: 'Конструктивный состав',
    values: D.STRUCT.windows,
    slots: [
      { card: 'building', field: 'struct.windows', label: 'Окна' },
    ],
  },
  {
    key: 'STRUCT_doors',
    title: 'Двери',
    kind: 'list',
    system: false,
    folder: 'Конструктивный состав',
    values: D.STRUCT.doors,
    slots: [
      { card: 'building', field: 'struct.doors', label: 'Двери' },
    ],
  },

  ...LAND_DICT_SOURCES,
];
