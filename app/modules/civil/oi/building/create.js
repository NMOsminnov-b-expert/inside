// Новая литера (строение) — одна на все типы ОЦ: нежилое здание создаёт её
// сам, квартира, жилой дом и земельный участок — через дверь civil/card.js
// (распространение 13.10.2026: «Значит не распространили... Исправляем»).
// type — пункт меню «+ Добавить ОИ» (label, residential, litKind);
// nextId и letter — от модуля-хозяина записи.
import { RIGHTS, MANSARD_TYPE, WEAR_LEVEL } from '../../data/dictionaries.js';

export function newBuildingOi(rec, type, { nextId, letter }) {
  const oi = {
    id: nextId('oi'),
    card: type.card,
    letter,
    name: type.label,
    status: 'Основное',
    origin: 'manual',
    // Жилое помечает сам вид ОИ: «Жилой дом» и квартира — жилые, остальные
    // строения нет. Раньше в этом модуле стояло жёсткое false.
    residential: !!type.residential || type.card === 'apartment',
    resCat: '',
    eni: rec.eni || '',
    // Адрес и координаты — по умолчанию те же, что у записи (решение
    // пользователя 11.09.2026). Их правят у самого объекта имущества, если он
    // стоит иначе: другой корпус, своя квартира.
    street: rec.street || '',
    house: rec.house || '',
    flat: rec.flat || '',
    gps: rec.gps || '',
    year: '',
    flags: { entered: false, matched: false },
    rights: RIGHTS[0],
    oiCategory: '',
    areas: {
      tp: '', pud: '', fact: '', build: '',
      loggias: '', balconies: '',
    },
    floors: 1,
    floorList: [],
    heights: { ext: '', int: '' },
    buildType: 'Отдельностоящее',
    mansardType: MANSARD_TYPE[0],
    loggiasCount: '',
    balconiesCount: '',
    rentAreas: [],
    struct: {
      foundation: '',
      wallsExt: '',
      wallsInt: '',
      ceilings: '',
      roof: '',
      floors: '',
      windows: '',
      doors: '',
    },
    structOther: {},
    heating: [],
    heatingOther: '',
    wear: {
      finish: WEAR_LEVEL[0], insulation: WEAR_LEVEL[0], roof: WEAR_LEVEL[0], plinth: WEAR_LEVEL[0],
      floors: WEAR_LEVEL[0], ceilings: WEAR_LEVEL[0], windows: WEAR_LEVEL[0], doors: WEAR_LEVEL[0], heating: WEAR_LEVEL[0],
    },
    comment: '',
    features: '',
    // Назначение по техпаспорту — как в документе, заполняет ЦОД; вид литеры
    // (гражданская, производственно-складская, прочие) указывают внутри
    // карточки по фото — при создании заводится просто «Здание» (решение
    // пользователя 23.09.2026). Прочее строение заводится сразу прочим.
    catClass: '',
    litKind: type.litKind || '',
    capSigns: {},
    // «Доп параметры» — заполняются только для производственно-складских строений.
    prodHeight: '',
    dis: false,
    docs: [],
    photos: {},
    notes: [],
  };

  return oi;
}
