export const OI_SUBTYPE = {
  REALTY_RESIDENTIAL: 'realty_residential',
  REALTY_APARTMENT: 'realty_apartment',
  REALTY_CIVIL: 'realty_civil',
  REALTY_PRODUCTION: 'realty_production',
  REALTY_OTHER: 'realty_other',

  LAND: 'land',
  VEHICLE: 'vehicle',
  MECH: 'mech',
  OFFICE: 'office',
};

function includes(value, part) {
  return String(value || '').toLowerCase().includes(part);
}

export function subtypeForNewOi(type) {
  switch (type) {
    case 'Жилой дом':
      return OI_SUBTYPE.REALTY_RESIDENTIAL;

    case 'Квартира':
      return OI_SUBTYPE.REALTY_APARTMENT;

    case 'Гражданское здание':
      return OI_SUBTYPE.REALTY_CIVIL;

    case 'Производственное строение':
      return OI_SUBTYPE.REALTY_PRODUCTION;

    case 'Прочее строение':
      return OI_SUBTYPE.REALTY_OTHER;

    case 'Земельный участок':
      return OI_SUBTYPE.LAND;

    case 'МЕХ':
      return OI_SUBTYPE.MECH;

    case 'ОФИС':
      return OI_SUBTYPE.OFFICE;

    default:
      return OI_SUBTYPE.REALTY_CIVIL;
  }
}

export function resolveOiSubtype(oi, oc = null) {
  if (!oi) {
    return OI_SUBTYPE.REALTY_CIVIL;
  }

  if (oi.subtype) {
    return oi.subtype;
  }

  if (oi.kind === 'land') {
    return OI_SUBTYPE.LAND;
  }

  if (oi.kind === 'vehicle') {
    return OI_SUBTYPE.VEHICLE;
  }

  if (oi.kind === 'mech') {
    return OI_SUBTYPE.MECH;
  }

  if (oi.kind === 'office') {
    return OI_SUBTYPE.OFFICE;
  }

  if (oi.kind === 'realty') {
    const name = String(oi.name || '');

    if (includes(name, 'квартира')) {
      return OI_SUBTYPE.REALTY_APARTMENT;
    }

    if (
      oi.residential
      || includes(name, 'жилой дом')
      || (oc && oc.type === 'Жилое здание (дом)')
    ) {
      return OI_SUBTYPE.REALTY_RESIDENTIAL;
    }

    if (
      (oi.catClass || '') === 'Производственно-складское'
      || includes(name, 'производственное')
    ) {
      return OI_SUBTYPE.REALTY_PRODUCTION;
    }

    if (includes(name, 'гражданское')) {
      return OI_SUBTYPE.REALTY_CIVIL;
    }

    if (includes(name, 'прочее')) {
      return OI_SUBTYPE.REALTY_OTHER;
    }

    return OI_SUBTYPE.REALTY_CIVIL;
  }

  return OI_SUBTYPE.REALTY_CIVIL;
}