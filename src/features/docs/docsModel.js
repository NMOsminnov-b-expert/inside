import { OI, DOCS, appState } from '../../core/state.js';

export function ensureDocPages(d) {
  if (!d.pages) d.pages = Array.from({ length: 3 }, (_, i) => ({ kind: i === 0 ? 'title' : 'skel' }));
}

export function docListFor(scope) {
  if (scope === 'oc') return DOCS;
  if (scope === 'mech-new') return appState.mechDocs || [];
  return ((OI.find((o) => o.id === scope) || {}).docs || []);
}

export function scopeLabel(sc) {
  return sc === 'oc' ? 'ОЦ' : (sc === 'mech-new' ? 'Новый' : 'ОИ');
}