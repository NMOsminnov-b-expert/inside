export const OC_SUBTYPE = {
  RESIDENTIAL: 'oc_residential',
  CIVIL: 'oc_civil',
  PRODUCTION: 'oc_production',
  OTHER_REALTY: 'oc_other_realty',
  MOVABLE: 'oc_movable',
};

export function resolveOcSubtype(oc) {
  if (!oc) {
    return OC_SUBTYPE.CIVIL;
  }

  if (oc.subtype) {
    return oc.subtype;
  }

  if (oc.category === 'Движимое') {
    return OC_SUBTYPE.MOVABLE;
  }

  if (oc.type === 'Жилое здание (дом)') {
    return OC_SUBTYPE.RESIDENTIAL;
  }

  if (oc.type === 'Производственное строение') {
    return OC_SUBTYPE.PRODUCTION;
  }

  if (oc.type === 'Гражданское здание') {
    return OC_SUBTYPE.CIVIL;
  }

  return OC_SUBTYPE.OTHER_REALTY;
}