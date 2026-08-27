// Технические имена полей (пути JS-объекта) → человеческие подписи для лога
// действий. Свой словарь на модуль, а не общий с жилым зданием: набор полей у
// гражданского здания другой (износ конструктивов, арендные площади, каркас и
// кран у производственных, категория ОИ вместо категории жилого строения).
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
  buildType: 'Расположение строения',
  resCat: 'Категория жилого строения',
  catClass: 'Категория ОИ',
  oiCategory: 'Категория ОИ',
  rights: 'Права',
  dis: 'Расхождение ТП и фото',
  mansardType: 'Конструктивный тип мансарды',
  features: 'Особенности',
  comment: 'Комментарий',
  floorList: 'Этажность',
  floors: 'Кол-во этажей',
  loggiasCount: 'Кол-во лоджий',
  balconiesCount: 'Кол-во балконов',
  rentAreas: 'Арендные площади',
  'flags.entered': 'Введено',
  'flags.matched': 'Сопоставлено с фото',

  // Площади и высоты
  'areas.tp': 'Площадь по техпаспорту',
  'areas.pud': 'Площадь по правоустанавливающим документам',
  'areas.fact': 'Площадь по факту',
  'areas.build': 'Площадь застройки',
  'areas.loggias': 'Площадь лоджий',
  'areas.balconies': 'Площадь балконов',
  'heights.ext': 'Высота по внешним замерам',
  'heights.int': 'Высота по внутренним замерам',

  // Конструктивный состав
  'struct.foundation': 'Фундамент',
  'struct.wallsExt': 'Наружные стены',
  'struct.wallsInt': 'Внутренние стены',
  'struct.ceilings': 'Перекрытия',
  'struct.roof': 'Кровля',
  'struct.floors': 'Полы',
  'struct.windows': 'Окна',
  'struct.doors': 'Двери',
  heating: 'Отопление',
  heatingOther: 'Отопление (иное)',

  // Износ конструктивных элементов — только у этого типа ОЦ
  'wear.finish': 'Износ · отделка',
  'wear.insulation': 'Износ · утепление',
  'wear.roof': 'Износ · кровля',
  'wear.plinth': 'Износ · цоколь',
  'wear.floors': 'Износ · полы',
  'wear.ceilings': 'Износ · перекрытия',
  'wear.windows': 'Износ · окна',
  'wear.doors': 'Износ · двери',
  'wear.heating': 'Износ · отопление',

  // Производственные параметры
  prodFrame: 'Каркас',
  prodFloors: 'Этажность производственного',
  prodHeight: 'Высота производственного',
  prodCrane: 'Крановое оборудование',
};

// Поля, чьё значение зависит от вида ОИ: одно и то же имя означает разное.
const BY_CARD = {
  land: {
    purpose: 'Назначение',
    rights: 'Права на земельный участок',
    form: 'Форма участка',
    'areas.pravo': 'Площадь по правоустанавливающим документам',
    'areas.fact': 'Площадь по факту (из ТП)',
    'areas.build': 'Застроенная площадь',
  },
  building: {
    rights: 'Права на строение',
  },
  movable: {
    name: 'Наименование механизма',
    year: 'Год выпуска',
  },
};

export function fieldLabel(key, cardType) {
  if (cardType && BY_CARD[cardType] && BY_CARD[cardType][key]) return BY_CARD[cardType][key];
  if (COMMON[key]) return COMMON[key];

  // structOther.<key> — ручной ввод варианта «Прочее» для того же поля.
  if (key.startsWith('structOther.')) {
    return fieldLabel('struct.' + key.slice('structOther.'.length), cardType) + ' (иное)';
  }

  return key;
}
