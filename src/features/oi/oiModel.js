import { LETTER_SEQ } from '../../core/dictionaries.js';
import { OI, OC, appState } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { buildFloors } from './floorsModel.js';

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

export function isApartmentOi(oi) {
  if (!oi) return false;
  if (oi.subtype === OI_SUBTYPE.REALTY_APARTMENT) return true;
  return String(oi.name || '').toLowerCase().includes('квартира');
}

export function isResidentialOi(oi) {
  if (!oi) return false;
  if (oi.subtype === OI_SUBTYPE.REALTY_RESIDENTIAL) return true;
  // Фоллбэк по имени для старых объектов без subtype.
  return String(oi.name || '').toLowerCase().includes('жилой дом');
}

function createApartmentState() {
  return {
    floor: '',
    buildingFloors: '',
    rooms: '',
    series: '',
    location: '',
    locationOther: '',
    storeys: '',
    loggiaCount: '',
    balconyCount: '',
    loggiaBuildArea: '',
    balconyBuildArea: '',
    rights: '',
    rightsOther: '',
  };
}

export function oiLabel(o) {
  if (o.kind === 'realty') return `Лит ${esc(o.letter)} · ${esc(o.name)}`;
  if (o.kind === 'land') return 'Земельный участок';
  if (o.kind === 'vehicle') return `ТС · ${esc(o.name)}`;
  if (o.kind === 'mech') return `Механизм · ${esc(o.name)}`;
  if (o.kind === 'office') return `Офис. техника · ${esc(o.name)}`;
  return esc(o.name);
}

export function autoCategory(oi) {
  if (isApartmentOi(oi)) return 'Квартира';
  if (oi.kind === 'vehicle') return 'Движимое · ТС';
  if (oi.kind === 'mech') return 'Движимое · Механизм';
  if (oi.kind === 'office') return 'Движимое · Офисная техника';
  if (oi.kind === 'land') return 'Земельный участок';
  return oi.catClass || 'Гражданское здание';
}

export function oiFieldRules(oi) {
  const prod = (oi.catClass || '') === 'Производственно-складское';
  const ml = (oi.origin || 'manual') === 'ml';
  const isApartment = isApartmentOi(oi);

  // Категория ОИ скрывается, когда:
  // 1) ОЦ является «Жилым зданием (домом)», и
  // 2) ОИ по подтипу является «Жилым зданием».
  const hideCatClassForResidential =
    isResidentialOi(oi)
    && OC
    && String(OC.type || '').toLowerCase().includes('жилое здание');

  return {
    heightRequired: prod,
    wallsRequired: prod,
    buildTypeRequired: !prod,
    showResCat: !!oi.residential && !isApartment,
    showMatched: ml,
    isApartment,
    showCatClass: !hideCatClassForResidential,
  };
}

export function oiVerbal(oi) {
  const f = oi.flags || {};
  if ((oi.origin || 'manual') === 'ml') {
    if (f.entered && f.matched) return { t: 'проверено (сверено с документами — удостоверено)', c: 'pill-done' };
    return { t: f.entered ? 'импортировано по ML — ожидает проверки' : 'импортировано по ML', c: 'pill-pend' };
  }
  if (f.entered) return { t: 'введено вручную', c: 'pill-done' };
  return { t: 'не заполнено', c: 'pill-gray' };
}

export function currentOI() {
  return appState.view === 'oi' ? OI.find((o) => o.id === appState.openOi) : null;
}

export function nextLetter() {
  const used = new Set(OI.filter((o) => o.kind === 'realty').map((o) => o.letter));
  return LETTER_SEQ.find((x) => !used.has(x)) || ('Л' + (used.size + 1));
}

function resolveRealtySubtype(name, catClass) {
  const lowerName = String(name || '').toLowerCase();
  if (lowerName.includes('квартира')) return OI_SUBTYPE.REALTY_APARTMENT;
  if (lowerName.includes('жилой дом') || lowerName.includes('жилое здание')) return OI_SUBTYPE.REALTY_RESIDENTIAL;
  if (catClass === 'Производственно-складское' || lowerName.includes('производственное')) return OI_SUBTYPE.REALTY_PRODUCTION;
  if (lowerName.includes('прочее')) return OI_SUBTYPE.REALTY_OTHER;
  return OI_SUBTYPE.REALTY_CIVIL;
}

export function createRealtyOi({ letter, name, catClass = 'Гражданское здание' }) {
  const subtype = resolveRealtySubtype(name, catClass);
  const isApartment = subtype === OI_SUBTYPE.REALTY_APARTMENT;
  const oi = {
    id: 'oi-r' + Date.now(),
    kind: 'realty',
    subtype,
    letter,
    name,
    status: 'Основное',
    eni: String(147561681380 + OI.length),
    year: '',
    flags: { entered: false, matched: false },
    origin: 'manual',
    residential: subtype === OI_SUBTYPE.REALTY_RESIDENTIAL || isApartment,
    resCat: '',
    areas: { tp: '', pud: '', fact: '', build: '' },
    floors: 1,
    floorList: [],
    heights: { ext: '', int: '' },
    buildType: 'Отдельностоящее',
    struct: {
      foundation: 'Не указано',
      wallsExt: 'Не указано',
      ceilings: 'Не указано',
      roof: 'Не указано',
      floors: 'Не указано',
      windows: 'Не указано',
      doors: 'Не указано',
    },
    heating: [],
    heatingOther: '',
    comment: '',
    catClass,
    dis: false,
    premises: [],
    photos: {},
    notes: [],
    apartment: isApartment ? createApartmentState() : null,
  };
  buildFloors(oi);
  return oi;
}

export function createLandOi() {
  return {
    id: 'oi-l' + Date.now(),
    kind: 'land',
    subtype: OI_SUBTYPE.LAND,
    name: 'Земельный участок',
    purpose: '',
    area: '',
    eni: String(147561681370 + OI.length),
    status: 'Основное',
    flags: { entered: false, matched: false },
    docs: [],
    photos: {},
    notes: [],
  };
}

export function createMovableOi({ kind, name, docs = [], year = '', serial = '' }) {
  const subtype = kind === 'mech'
    ? OI_SUBTYPE.MECH
    : kind === 'vehicle'
      ? OI_SUBTYPE.VEHICLE
      : OI_SUBTYPE.OFFICE;
  return {
    id: 'oi-m' + Date.now(),
    kind,
    subtype,
    name,
    eni: String(147561681360 + OI.length),
    status: '',
    flags: { entered: false, matched: false },
    docs: docs.slice(),
    year,
    serial,
    notes: [],
  };
}