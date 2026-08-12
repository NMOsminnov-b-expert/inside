import { OC } from '../../core/state.js';
import { REALTY_TYPES } from '../../core/dictionaries.js';

// Для ОЦ типа «Жилое здание» разрешены только эти типы ОИ.
export const RESIDENTIAL_OI_TYPES = [
  'Земельный участок',
  'Квартира',
  'Жилой дом',
  'Прочее строение',
];

export const MOVABLE_OI_TYPE_VALUES = ['МЕХ', 'ОФИС'];

export const MOVABLE_OI_TYPE_LABELS = {
  МЕХ: 'Механизмы и производственное оборудование',
  ОФИС: 'Офисная техника и мебель',
};

export function isResidentialOc(oc = OC) {
  const type = oc && oc.type ? String(oc.type).toLowerCase() : '';

  return type.includes('жилое здание');
}

export function allowedRealtyOiTypesForOc(oc = OC) {
  if (isResidentialOc(oc)) {
    return [...RESIDENTIAL_OI_TYPES];
  }

  return [...REALTY_TYPES];
}

export function allowedMovableOiTypesForOc(oc = OC) {
  if (isResidentialOc(oc)) {
    return [];
  }

  if (!oc || !oc.complex) {
    return [];
  }

  return [...MOVABLE_OI_TYPE_VALUES];
}

export function allowedOiTypesForOc(oc = OC) {
  return [
    ...allowedRealtyOiTypesForOc(oc),
    ...allowedMovableOiTypesForOc(oc),
  ];
}

export function canAddOiType(type, oc = OC) {
  return allowedOiTypesForOc(oc).includes(type);
}