// Заметки живут внутри записи ОЦ: у самой записи и у каждого ОИ.
// scope: 'oc' | <oi.id>
import { mkNote } from './store.js';

export function notesOf(rec, scope) {
  if (!rec) return null;
  if (scope === 'oc') { rec.notes = rec.notes || []; return rec.notes; }
  const oi = rec.oi.find((o) => o.id === scope);
  if (!oi) return null;
  oi.notes = oi.notes || [];
  return oi.notes;
}

export function findNote(rec, scope, id) {
  const arr = notesOf(rec, scope) || [];
  return arr.find((n) => n.id === id);
}

export function noteCounts(rec, scope) {
  const notes = notesOf(rec, scope) || [];
  return { p: notes.filter((n) => !n.done).length, d: notes.filter((n) => n.done).length };
}

export function totalPendingNotes(rec) {
  if (!rec) return 0;
  return (rec.notes || []).filter((n) => !n.done).length
    + rec.oi.reduce((s, o) => s + (o.notes || []).filter((n) => !n.done).length, 0);
}

// Автор и дата ставятся в момент добавления (Л3.4): кто поставил заметку и
// когда. Кто именно — знает только вызывающий (общая сессия, kernel/session.js),
// поэтому передаётся снаружи, а часть заметок этого не знать не должна.
export function addNote(rec, scope, author, date, text) {
  const arr = notesOf(rec, scope);
  if (!arr) return null;
  const n = mkNote(text || '', false, author, date);
  arr.push(n);
  return n;
}

export function removeNote(rec, scope, id) {
  const arr = notesOf(rec, scope);
  if (!arr) return;
  const i = arr.findIndex((n) => n.id === id);
  if (i >= 0) arr.splice(i, 1);
}
