import { OC, OI } from '../../core/state.js';
import { mkNote } from './notesStore.js';

export function resolveNotes(scope) {
  if (scope === 'oc') { OC.notes = OC.notes || []; return OC.notes; }
  const oi = OI.find((o) => o.id === scope);
  if (!oi) return null;
  oi.notes = oi.notes || [];
  return oi.notes;
}

export function findNote(scope, id) {
  const arr = scope === 'oc' ? (OC.notes || []) : ((OI.find((o) => o.id === scope) || {}).notes || []);
  return arr.find((n) => n.id === id);
}

export function noteCounts(scope) {
  const notes = scope === 'oc' ? (OC.notes || []) : ((OI.find((o) => o.id === scope) || {}).notes || []);
  return { p: notes.filter((n) => !n.done).length, d: notes.filter((n) => n.done).length };
}

export function totalPendingNotes() {
  return (OC.notes || []).filter((n) => !n.done).length
    + OI.reduce((s, o) => s + (o.notes || []).filter((n) => !n.done).length, 0);
}

export function addNoteToScope(scope) {
  const arr = resolveNotes(scope);
  if (!arr) return null;
  const n = mkNote('', false);
  arr.push(n);
  return n;
}

export function removeNoteFromScope(scope, id) {
  const arr = resolveNotes(scope);
  if (!arr) return;
  const i = arr.findIndex((n) => n.id === id);
  if (i >= 0) arr.splice(i, 1);
}