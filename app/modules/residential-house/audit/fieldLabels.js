// Технические имена полей (пути JS-объекта) → человеческие подписи для
// лога действий. В проекте до этого не было общего словаря такого рода —
// подписи жили литералами прямо в *.view.js каждой карточки; здесь они
// собраны заново по факту использования (см. oi/building, oi/apartment,
// oi/land, records.js). Пока только для этого модуля — см. граф знаний.

// Поля записи ОЦ (категория 'oc') + общие для всех видов ОИ (категория 'oi').
const COMMON = {
  // ОЦ
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

  // ОИ — общие для building/apartment/land
  name: 'Наименование',
  letter: 'Литера',
  year: 'Год постройки',
  origin: 'Источник данных',
  residential: 'Жилое',
  mansardType: 'Конструктивный тип мансарды',
  'flags.entered': 'Введено',
  'flags.matched': 'Сопоставлено с фото',
  buildType: 'Расположение строения',
  resCat: 'Категория жилого строения',
  catClass: 'Категория ОИ',
  dis: 'Расхождение ТП и фото',
  structureKind: 'Тип строения',
  structureKindOther: 'Тип строения (иное)',
  'areas.tp': 'Площадь по техпаспорту',
  'areas.pud': 'Площадь по правоустанавливающим документам',
  'areas.fact': 'Площадь по факту',
  'areas.build': 'Площадь застройки',
  'areas.pravo': 'Площадь по правоустанавливающим документам',
  'heights.ext': 'Высота по внешним замерам',
  'heights.int': 'Высота по внутренним замерам',
  loggiaCount: 'Кол-во лоджий',
  balconyCount: 'Кол-во балконов/террас',
  loggiaBuildArea: 'Площадь застройки лоджий',
  balconyBuildArea: 'Площадь застройки балконов/террас',
  'struct.foundation': 'Фундамент',
  'struct.wallsExt': 'Наружные стены',
  'struct.ceilings': 'Перекрытия',
  'struct.roof': 'Кровля',
  'struct.floors': 'Полы',
  'struct.windows': 'Окна',
  'struct.doors': 'Двери',
  heating: 'Отопление',
  heatingOther: 'Отопление (иное)',
  features: 'Особенности',
  comment: 'Комментарий',
  floorList: 'Этажность',
  floors: 'Кол-во этажей',

  // Квартира (oi.apartment.*)
  'apartment.floor': 'Этаж',
  'apartment.buildingFloors': 'Этажность дома',
  'apartment.storeys': 'Кол-во этажей квартиры',
  'apartment.rooms': 'Кол-во комнат',
  'apartment.series': 'Серия',
  'apartment.location': 'Положение на этаже',
  'apartment.locationOther': 'Положение на этаже (иное)',
  'apartment.rights': 'Права на строение',
  'apartment.rightsOther': 'Права на строение (иное)',
  'apartment.loggiaCount': 'Кол-во лоджий',
  'apartment.balconyCount': 'Кол-во балконов/террас',
  'apartment.loggiaBuildArea': 'Площадь застройки лоджий',
  'apartment.balconyBuildArea': 'Площадь застройки балконов/террас',

  // Планировки (не «документы» в терминологии пользователя — отдельная
  // карточка, но не одна из 4 заявленных категорий, поэтому логируется
  // как ОИ-метрика).
  plans: 'Планировки',
};

// Ключи, значение которых зависит от вида ОИ (oi.card) — совпадающее имя
// поля означает разное у строения и у земельного участка.
const BY_CARD = {
  building: {
    rights: 'Права на строение',
    rightsOther: 'Права на строение (иное)',
  },
  land: {
    purpose: 'Назначение',
    rights: 'Права на земельный участок',
    rightsOther: 'Права на земельный участок (иное)',
    form: 'Форма участка',
    formOther: 'Форма участка (иное)',
    encumbrance: 'Сервитуты и обременения',
    encumbranceOther: 'Сервитуты и обременения (иное)',
    encumbranceArea: 'Площадь сервитутов/обременений',
  },
};

export function fieldLabel(key, cardType) {
  if (cardType && BY_CARD[cardType] && BY_CARD[cardType][key]) return BY_CARD[cardType][key];
  if (COMMON[key]) return COMMON[key];

  // structOther.<key> — то же поле, что struct.<key>, но ручной ввод
  // варианта «Прочее» — подпись берётся у базового поля + суффикс.
  if (key.startsWith('structOther.')) {
    return fieldLabel('struct.' + key.slice('structOther.'.length), cardType) + ' (иное)';
  }

  return key;
}
