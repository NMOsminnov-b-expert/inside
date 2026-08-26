import { createSeed } from './seed.js';
import { LETTER_SEQ } from './dictionaries.js';

// Данные и UI-состояние ЭТОГО модуля. Один экземпляр на сессию (ES-модуль).
export const records = createSeed();

export function getRecord(id) {
  return records.find((r) => r.id === id) || null;
}

export function getOi(rec, oiId) {
  return rec ? (rec.oi.find((o) => o.id === oiId) || null) : null;
}

// UI-состояние карточки: раскрытия, режимы, просмотрщик.
// Навигация (какая запись, какой ОИ, какая вкладка) живёт в маршруте.
export const ui = {
  expanded: {},
  accOpen: {},
  doneOpen: {},
  viewer: null,        // { mode: 'doc' | 'photo' | 'compare' }
  viewerDoc: null,     // { scope, id }
  letterEdit: false,
  heatOpen: false,
  photoQuery: '',
  railCollapsed: false,   // лента миниатюр просмотрщика свёрнута
  mechMode: 'mono',
  mechDocs: [],
  mechRows: [],
  mechDraft: { name: '', year: '', serial: '' },
};

export function resetViewer() {
  ui.viewer = null;
  ui.viewerDoc = null;
}

export function nextLetter(rec) {
  const used = new Set(rec.oi.filter((o) => o.card !== 'land').map((o) => o.letter));
  return LETTER_SEQ.find((x) => !used.has(x)) || ('Л' + (used.size + 1));
}

// Идентификаторы: последовательные внутри записи, без опоры на длину массива.
let seq = Date.now() % 100000;
export function nextId(prefix) {
  seq += 1;
  return `${prefix}-${seq.toString(36)}`;
}

// ЕНИ выдаётся от максимума уже использованных, а не от длины массива —
// иначе после удаления ОИ код повторяется (исправление дефекта макета).
export function nextEni(rec, base) {
  const used = rec.oi.map((o) => parseInt(o.eni, 10)).filter((n) => !isNaN(n));
  const max = used.length ? Math.max(...used) : parseInt(base, 10) || 147561681300;
  return String(max + 1);
}

export function addRecord(rec) {
  records.push(rec);
  return rec;
}

export function removeRecord(id) {
  const i = records.findIndex((r) => r.id === id);
  if (i >= 0) records.splice(i, 1);
}
