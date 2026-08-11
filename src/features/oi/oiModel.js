import { LETTER_SEQ } from '../../core/dictionaries.js';
import { OI, appState } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { buildFloors } from './floorsModel.js';

export function oiLabel(o) {
  if (o.kind === 'realty') return `Лит ${esc(o.letter)} · ${esc(o.name)}`;
  if (o.kind === 'land') return 'Земельный участок';
  if (o.kind === 'vehicle') return `ТС · ${esc(o.name)}`;
  if (o.kind === 'mech') return `Механизм · ${esc(o.name)}`;
  if (o.kind === 'office') return `Офис. техника · ${esc(o.name)}`;
  return esc(o.name);
}

export function autoCategory(oi) {
  if (oi.kind === 'vehicle') return 'Движимое · ТС';
  if (oi.kind === 'mech') return 'Движимое · Механизм';
  if (oi.kind === 'office') return 'Движимое · Офисная техника';
  if (oi.kind === 'land') return 'Земельный участок';
  return oi.catClass || 'Гражданское';
}

// Правила видимости/обязательности полей карточки ОИ.
// Единственная точка, где кодируются условия из продуктовых заметок.
export function oiFieldRules(oi) {
  const prod = (oi.catClass || '') === 'Производственно-складское';
  const ml = (oi.origin || 'manual') === 'ml';
  return {
    heightRequired: prod,
    wallsRequired: prod,
    buildTypeRequired: !prod,
    // Категория жилого строения — только у жилых ОИ.
    showResCat: !!oi.residential,
    // Цепочка «сверен/удостоверен» и флаг «Сопоставлено» — только у ML-импорта;
    // у ручных ОИ дополнительного статуса нет.
    showMatched: ml,
  };
}

// Статус выводится автоматически из происхождения и флагов — вручную не проставляется.
export function oiVerbal(oi) {
  const f = oi.flags || {};
  if ((oi.origin || 'manual') === 'ml') {
    if (f.entered && f.matched) return { t: 'проверено (сверено с документами — удостоверено)', c: 'pill-done' };
    return { t: f.entered ? 'импортировано по ML — ожидает проверки' : 'импортировано по ML', c: 'pill-pend' };
  }
  // Ручное происхождение: дополнительного статуса нет.
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

export function createRealtyOi({ letter, name, catClass = 'Гражданское' }) {
  const oi = {
    id: 'oi-r' + Date.now(), kind: 'realty', letter, name, status: 'Основное',
    eni: String(147561681380 + OI.length), year: '', flags: { entered: false, matched: false },
    origin: 'manual', residential: name === 'Жилой дом' || name === 'Квартира', resCat: '',
    areas: { tp: '', pud: '', fact: '', build: '' }, floors: 1, floorList: [],
    heights: { ext: '', int: '' }, buildType: 'Отдельностоящее',
    struct: { foundation: 'Не указано', wallsExt: 'Не указано', ceilings: 'Не указано', roof: 'Не указано', floors: 'Не указано', windows: 'Не указано', doors: 'Не указано' },
    heating: [], heatingOther: '', comment: '', catClass, dis: false, premises: [], photos: {}, notes: [],
  };
  buildFloors(oi);
  return oi;
}

export function createLandOi() {
  return {
    id: 'oi-l' + Date.now(), kind: 'land', name: 'Земельный участок', purpose: '', area: '',
    eni: String(147561681370 + OI.length), status: 'Основное',
    flags: { entered: false, matched: false }, docs: [], photos: {}, notes: [],
  };
}

export function createMovableOi({ kind, name, docs = [], year = '', serial = '' }) {
  return {
    id: 'oi-m' + Date.now(), kind, name,
    eni: String(147561681360 + OI.length), status: '',
    flags: { entered: false, matched: false }, docs: docs.slice(), year, serial, notes: [],
  };
}