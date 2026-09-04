// Технические имена полей (пути JS-объекта) → человеческие подписи для лога
// действий (audit/model.js кладёт в строку лога путь через точку, а audit/view.js
// показывает то, что вернёт fieldLabel).
//
// Словарь СВОЙ на каждый модуль, а не общий в kernel: набор полей у разных типов
// ОЦ разный (у квартиры свои поля, у производственного строения — свои), а ядро не знает ни одного типа ОЦ.
// Подписи собраны по фактическим *.view.js этого модуля.

const COMMON = {
  // Запись ОЦ
  eni: 'Код ЕНИ',
  address: 'Адрес',
  city: 'Город',
  gps: 'GPS-координаты',
  institution: 'Учреждение',
  podved: 'Подведомственность',
  status: 'Статус',
  purposeTP: 'Назначение по ТП',
  complex: 'Комплекс (единый паспорт)',
  owners: 'Собственники',
  users: 'Пользователи',
  type: 'Тип ОЦ',
  'resp.gov': 'Ответственный от учреждения',
  'resp.cod': 'Оператор ЦОД',
  'resp.appr': 'Оценщик',
  'resp.insp': 'Осмотрщик',

  // Общие поля ОИ
  name: 'Наименование',
  letter: 'Литера',
  year: 'Год постройки',
  origin: 'Источник данных',
  residential: 'Жилое',
  resCat: 'Категория жилого строения',
  catClass: 'Категория ОИ',
  buildType: 'Расположение строения',
  mansardType: 'Конструктивный тип мансарды',
  dis: 'Расхождение ТП и фото',
  features: 'Особенности',
  comment: 'Комментарий',
  floorList: 'Этажность',
  floors: 'Кол-во этажей',
  'flags.entered': 'Введено',
  'flags.matched': 'Сопоставлено с фото',

  // Лоджии/балконы/террасы — списки с площадью у каждого элемента
  // (kernel/areaList.js), а не пара «количество + общая площадь», как было.
  loggias: 'Лоджии',
  balconies: 'Балконы',
  terraces: 'Террасы',

  // Площади и высоты
  'areas.tp': 'Площадь по техпаспорту',
  'areas.pud': 'Площадь по правоустанавливающим документам',
  'areas.fact': 'Площадь по факту',
  'areas.build': 'Площадь застройки',
  'heights.ext': 'Высота по внешним замерам',
  'heights.int': 'Высота по внутренним замерам',

  // Конструктивный состав
  'struct.foundation': 'Фундамент',
  'struct.wallsExt': 'Наружные стены',
  'struct.ceilings': 'Перекрытия',
  'struct.roof': 'Кровля',
  'struct.floors': 'Полы',
  'struct.windows': 'Окна',
  'struct.doors': 'Двери',
  heating: 'Отопление',
  heatingOther: 'Отопление (иное)',

  // Строение
  structureKind: 'Тип строения',
  structureKindOther: 'Тип строения (иное)',

  // Квартира (oi.apartment.*)
  'apartment.floor': 'Этаж',
  'apartment.buildingFloors': 'Этажность дома',
  'apartment.storeys': 'Кол-во этажей квартиры',
  'apartment.rooms': 'Кол-во комнат',
  'apartment.series': 'Серия',
  'apartment.seriesOther': 'Серия (прочее)',
  'apartment.location': 'Положение на этаже',
  'apartment.locationOther': 'Положение на этаже (иное)',
  'apartment.rights': 'Права на строение',
  'apartment.rightsOther': 'Права на строение (иное)',
  'apartment.loggias': 'Лоджии',
  'apartment.balconies': 'Балконы',
  'apartment.terraces': 'Террасы',

  // Планировки — не «документы» в терминологии пользователя (отдельная
  // карточка, но не одна из 4 заявленных категорий), поэтому логируются как
  // ОИ-метрика.
  plans: 'Планировки',
  // Износ конструктивных элементов: раздел распространён на все типы ОЦ
  // 04.09.2026, поэтому подписи нужны и здесь.
  'wear.finish': 'Износ · отделка',
  'wear.insulation': 'Износ · утепление',
  'wear.roof': 'Износ · кровля',
  'wear.plinth': 'Износ · цоколь',
  'wear.floors': 'Износ · полы',
  'wear.ceilings': 'Износ · перекрытия',
  'wear.windows': 'Износ · окна',
  'wear.doors': 'Износ · двери',
  'wear.heating': 'Износ · отопление',

};

// Поля, чьё значение зависит от вида ОИ: одно и то же имя означает разное.
const BY_CARD = {
  // Земельный участок. Карточка ЗУ во всех модулях импортируется из land-plot
  // (см. oi/land/index.js), поэтому набор полей здесь одинаковый везде.
  land: {
    landType: 'Тип земельного участка',
    landCategory: 'Категория земель',
    'areas.pravoUd': 'Площадь по правоудостоверяющим документам',
    electricity: 'Наличие электроснабжения',
    sewerage: 'Наличие канализации',
    encumbranceNote: 'Комментарий к сервитуту',
    gps: 'Координаты участка',
    zone: 'Крупная зона',
    microdistrict: 'Микрорайон',
    distanceToCenter: 'Удалённость от райцентра',
    improvementRank: 'Ранг благоустройства',
    improvementNote: 'Особенности благоустройства',
    auxBuildings: 'Вспомогательные постройки',
    auxBuildingKind: 'Вспомогательная постройка',
    auxCondition: 'Состояние постройки',
    auxClass: 'Класс постройки',
    purpose: 'Назначение по правоудостоверяющему документу',
    purposeOther: 'Назначение по правоудостоверяющему документу (иное)',
    rights: 'Права на земельный участок',
    form: 'Форма участка',
    formOther: 'Форма участка (иное)',
    'areas.pravo': 'Площадь по правоустанавливающим документам',
    'areas.fact': 'Площадь по факту',
    'areas.build': 'Застроенная площадь',
    useCategory: 'Категория и разрешённое использование',
    irrigation: 'Доступность полива',
    irrigationType: 'Тип полива',
    soil: 'Тип почвы',
    bonitet: 'Балл бонитета',
    stoniness: 'Каменистость',
    // Оснащение стало списком (было четыре флажка) — в логе это одно поле.
    utilities: 'Инженерное оснащение',
    gasification: 'Наличие газификации',
    centralHeating: 'Наличие центрального отопления',
    centralWater: 'Наличие центрального водоснабжения',
    autonomousHeating: 'Наличие автономного отопления',
    location: 'Расположение в районе',
    roadLocation: 'Расположение к трассе',
    corner: 'Угловой/неугловой',
    relief: 'Рельеф участка',
    locationFeatures: 'Особенности местоположения',
    encumbrance: 'Наличие сервитутов и обременений',
    encumbranceArea: 'Площадь сервитутов и обременений',
    buildings: 'Наличие построек',
    buildingType: 'Тип построек',
    buildingArea: 'Площадь построек',
  },
  building: {
    rights: 'Права на строение',
    rightsOther: 'Права на строение (иное)',
  },
};

export function fieldLabel(key, cardType) {
  if (cardType && BY_CARD[cardType] && BY_CARD[cardType][key]) return BY_CARD[cardType][key];
  if (COMMON[key]) return COMMON[key];

  // structOther.<key> — то же поле, что struct.<key>, но ручной ввод варианта
  // «Прочее»: подпись берётся у базового поля + суффикс.
  if (key.startsWith('structOther.')) {
    return fieldLabel('struct.' + key.slice('structOther.'.length), cardType) + ' (иное)';
  }

  return key;
}
