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

export const DICT_SOURCES = [
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
    key: 'CATCLASS',
    title: 'Классы объектов имущества',
    kind: 'list',
    system: true,
    values: D.CATCLASS,
    slots: [
      { card: 'building', field: 'class', label: 'Класс ОИ' },
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
    key: 'HEATING',
    title: 'Отопление',
    kind: 'list',
    system: false,
    values: D.HEATING,
    slots: [
      { card: 'building', field: 'heating', label: 'Отопление' },
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
    key: 'MANSARD_TYPE',
    title: 'Тип мансарды',
    kind: 'list',
    system: false,
    values: D.MANSARD_TYPE,
    slots: [
      { card: 'building', field: 'mansardType', label: 'Тип мансарды' },
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
];
