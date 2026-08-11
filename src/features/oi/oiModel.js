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

export function requiredFlags(oi) {
  const prod = (oi.catClass || '') === 'Производственно-складское';
  return { height: prod, walls: prod, buildType: !prod };
}

export function oiVerbal(oi) {
  const f = oi.flags || {};
  if (f.entered && f.matched) return { t: 'сверен с осмотром', c: 'pill-done' };
  if (f.entered) return { t: 'заполнен', c: 'pill-pend' };
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
    eni: String(147561681370 + OI.length), flags: { entered: false, matched: false }, docs: [], notes: [],
  };
}

export function createMovableOi({ kind, name, docs = [], year = '', serial = '' }) {
  return {
    id: 'oi-m' + Date.now(), kind, name,
    eni: String(147561681360 + OI.length), status: '',
    flags: { entered: false, matched: false }, docs: docs.slice(), year, serial, notes: [],
  };
}