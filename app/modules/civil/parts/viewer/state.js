import { docListFor } from '../docs/model.js';
import { photoPages } from '../photos/model.js';

// Состояние просмотрщика этого модуля: зум, страница, открытые вкладки.
// cmpZoom — зум режима «Сравнение», СВОЙ на каждую колонку: сравнивают обычно
// мелкую деталь на фото с крупным планом в документе, общий зум для этого не
// годится (см. parts/viewer/compare.js).
export const VS = { zoom: 100, cmpZoom: { photo: 100, doc: 100 }, docs: {}, photos: {}, openTabs: {} };

export function openTabOnly(scope, id) {
  VS.openTabs[scope] = VS.openTabs[scope] || [];
  if (!VS.openTabs[scope].includes(id)) VS.openTabs[scope].push(id);
}

export function openDocViewer(ctx, scope, id) {
  if (!id) return;
  openTabOnly(scope, id);
  ctx.ui.viewerDoc = { scope, id };
  ctx.ui.viewer = { mode: (ctx.ui.viewer && ctx.ui.viewer.mode === 'compare') ? 'compare' : 'doc' };
  ctx.render();
}

export function openPhotoInPlace(ctx, oiId, idx) {
  VS.photos[oiId] = VS.photos[oiId] || { page: 1, rot: 0, scroll: 0 };
  if (idx) VS.photos[oiId].page = idx;
  ctx.ui.viewer = { mode: 'photo' };
  // Фото открывается в карточке своего ОИ.
  if (ctx.view === 'oi' && ctx.oi && ctx.oi.id === oiId) ctx.render();
  else ctx.navigate({ rest: ['oi', oiId] });
}

export function vSt(ctx) {
  const v = ctx.ui.viewer;
  if (!v) return null;

  if (v.mode === 'doc' || v.mode === 'compare') {
    const vd = ctx.ui.viewerDoc;
    const d = vd ? docListFor(ctx, vd.scope).find((x) => x.id === vd.id) : null;
    return d ? (VS.docs[d.id] || (VS.docs[d.id] = { page: 1, rot: 0, scroll: 0 })) : null;
  }

  const oiId = ctx.oi ? ctx.oi.id : null;
  if (!oiId) return null;
  return VS.photos[oiId] || (VS.photos[oiId] = { page: 1, rot: 0, scroll: 0 });
}

export function vPages(ctx) {
  const v = ctx.ui.viewer;
  if (!v) return [];

  if (v.mode === 'doc' || v.mode === 'compare') {
    const vd = ctx.ui.viewerDoc;
    const d = vd ? docListFor(ctx, vd.scope).find((x) => x.id === vd.id) : null;
    return d ? d.pages : [];
  }

  return photoPages(ctx.oi);
}

export function vGo(ctx, n) {
  const st = vSt(ctx);
  if (!st) return;

  const pages = vPages(ctx);
  st.page = Math.min(pages.length, Math.max(1, n));

  const blk = ctx.scope.$(`[data-vpageblk="${st.page}"]`);
  const vs = ctx.scope.$('[data-vstage]');

  if (blk && vs) {
    const r = blk.getBoundingClientRect();
    const s = vs.getBoundingClientRect();
    vs.scrollTo({ top: vs.scrollTop + (r.top - s.top) - 10, behavior: 'smooth' });
  } else {
    ctx.render();
  }
}

export function setVZoom(ctx, z) {
  VS.zoom = Math.min(500, Math.max(40, z));
  const r = ctx.scope.$('[data-vribbon]');
  if (r) r.style.zoom = String(VS.zoom / 100);
  const c = ctx.scope.$('[data-cmp]');
  if (c) c.style.zoom = String(VS.zoom / 100);
  const l = ctx.scope.$('[data-zoomlabel]');
  if (l) l.textContent = VS.zoom + '%';
}
