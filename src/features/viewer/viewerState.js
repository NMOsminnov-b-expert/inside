import { OI, appState } from '../../core/state.js';
import { render } from '../../core/renderer.js';
import { docListFor } from '../docs/docsModel.js';
import { photoPages } from '../photos/photoModel.js';

// Состояние просмотрщика: зум, постраничная позиция, открытые вкладки.
export const VS = { zoom: 100, docs: {}, photos: {}, openTabs: {} };

export function openTabOnly(scope, id) {
  VS.openTabs[scope] = VS.openTabs[scope] || [];
  if (!VS.openTabs[scope].includes(id)) VS.openTabs[scope].push(id);
}

export function openDocViewer(scope, id) {
  if (!id) return;
  openTabOnly(scope, id);
  appState.viewerDoc = { scope, id };
  appState.viewer = { mode: (appState.viewer && appState.viewer.mode === 'compare') ? 'compare' : 'doc' };
  render();
}
/*
export function openPhotoViewer(oiId, pageIdx) {
  VS.photos[oiId] = VS.photos[oiId] || { page: 1, rot: 0, scroll: 0 };
  if (pageIdx) VS.photos[oiId].page = pageIdx;
  appState.openOi = oiId;
  appState.letterEdit = false;
  appState.view = 'oi';
  appState.viewer = { mode: 'photo' };
  render();
}
  */

export function openPhotoInPlace(oiId, idx) {
  VS.photos[oiId] = VS.photos[oiId] || { page: 1, rot: 0, scroll: 0 };
  if (idx) VS.photos[oiId].page = idx;
  appState.openOi = oiId;
  appState.viewer = { mode: 'photo' };
  render();
}

export function vSt() {
  const v = appState.viewer;
  if (!v) return null;
  if (v.mode === 'doc' || v.mode === 'compare') {
    const d = appState.viewerDoc ? docListFor(appState.viewerDoc.scope).find((x) => x.id === appState.viewerDoc.id) : null;
    return d ? (VS.docs[d.id] || (VS.docs[d.id] = { page: 1, rot: 0, scroll: 0 })) : null;
  }
  return VS.photos[appState.openOi] || (VS.photos[appState.openOi] = { page: 1, rot: 0, scroll: 0 });
}

export function vPages() {
  const v = appState.viewer;
  if (!v) return [];
  if (v.mode === 'doc' || v.mode === 'compare') {
    const d = appState.viewerDoc ? docListFor(appState.viewerDoc.scope).find((x) => x.id === appState.viewerDoc.id) : null;
    return d ? d.pages : [];
  }
  return photoPages(OI.find((o) => o.id === appState.openOi));
}

export function vGo(n) {
  const st = vSt();
  if (!st) return;
  const pages = vPages();
  st.page = Math.min(pages.length, Math.max(1, n));
  const blk = document.querySelector(`[data-vpageblk="${st.page}"]`);
  const vs = document.querySelector('[data-vstage]');
  if (blk && vs) {
    const r = blk.getBoundingClientRect();
    const s = vs.getBoundingClientRect();
    vs.scrollTo({ top: vs.scrollTop + (r.top - s.top) - 10, behavior: 'smooth' });
  } else {
    render();
  }
}

export function setVZoom(z) {
  VS.zoom = Math.min(220, Math.max(40, z));
  const r = document.querySelector('[data-vribbon]');
  if (r) r.style.zoom = String(VS.zoom / 100);
  const c = document.querySelector('[data-cmp]');
  if (c) c.style.zoom = String(VS.zoom / 100);
  const l = document.querySelector('[data-zoomlabel]');
  if (l) l.textContent = VS.zoom + '%';
}