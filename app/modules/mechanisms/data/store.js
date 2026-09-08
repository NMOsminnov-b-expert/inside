import { createSeed } from './seed.js';

// Данные и UI-состояние ЭТОГО модуля. Один экземпляр на сессию (ES-модуль).
export const records = createSeed();

export function getRecord(id) {
  return records.find((r) => r.id === id) || null;
}

// UI-состояние карточки: раскрытия, режимы, просмотрщик.
// Навигация (какая запись, какая вкладка) живёт в маршруте.
// У этого модуля нет объектов имущества, поэтому здесь нет ни oi-состояния
// перечня (oiCols, letterEdit, mechMode и т.п.), ни фото-режима записи.
export const ui = {
  accOpen: {},
  doneOpen: {},
  viewer: null,        // { mode: 'doc' | 'photo' | 'compare' }
  viewerDoc: null,     // { scope, id }
  splitVW: {},
  cmpSplit: 50,
  cmpHidden: null,
  railCollapsed: false,
  viewerSidebar: false,
  pageSel: [],
  // Фильтры вкладки «Логи» — тот же набор, что у остальных модулей.
  auditCatOpen: false,
  auditCatFilter: [],
  auditPersonOpen: false,
  auditPersonFilter: [],
  auditActionOpen: false,
  auditActionFilter: [],
  auditObjectOpen: false,
  auditObjectFilter: [],
  auditDateFrom: '',
  auditDateTo: '',
  auditSearchText: '',
};

export function resetViewer() {
  ui.viewer = null;
  ui.viewerDoc = null;
  ui.viewerClosed = false;
}

// Идентификаторы: последовательные внутри записи, без опоры на длину массива.
let seq = Date.now() % 100000;
export function nextId(prefix) {
  seq += 1;
  return `${prefix}-${seq.toString(36)}`;
}

// Id вида «<база записи>-<порядковый номер>» — для документов и строк лога
// действий (см. audit/model.js). Порядковый номер берётся от максимума уже
// использованных суффиксов, а не от длины массива, — переживает удаления.
// У этого модуля нет кода ЕНИ, поэтому базой всегда служит rec.id.
export function nextEniScoped(rec, existingIds) {
  const used = (existingIds || [])
    .map((id) => { const m = /-(\d+)$/.exec(id || ''); return m ? parseInt(m[1], 10) : NaN; })
    .filter((n) => !isNaN(n));
  return `${rec.id}-${(used.length ? Math.max(...used) : 0) + 1}`;
}

export function nextDocId(rec) {
  const ids = (rec.docs || []).map((d) => d.id);
  return nextEniScoped(rec, ids);
}

export function addRecord(rec) {
  records.push(rec);
  return rec;
}

export function removeRecord(id) {
  const i = records.findIndex((r) => r.id === id);
  if (i >= 0) records.splice(i, 1);
}

// Изъять запись, отдав её содержимое: так объект уезжает в архив, а не
// исчезает (kernel/archive.js, ТЗ docs/tz/20-arhiv.md §4.2).
export function takeRecord(id) {
  const i = records.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const [rec] = records.splice(i, 1);
  return rec;
}

// Вернуть запись из архива — С ТЕМ ЖЕ идентификатором. Повторный возврат не
// создаёт дубль.
export function restoreRecord(rec) {
  if (!rec || !rec.id) return null;
  if (records.some((r) => r.id === rec.id)) return null;
  records.push(rec);
  return rec;
}
