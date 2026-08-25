import { docListFor, ensureDocPages } from '../docs/model.js';
import { photoPages, photoGroups } from '../photos/model.js';
import { VS } from './state.js';
import { renderDocMode } from './doc.js';
import { renderPhotoMode } from './photo.js';
import { renderCompareMode } from './compare.js';

function buildViewerContext(ctx) {
  const mode = ctx.ui.viewer.mode;
  const inOi = ctx.view === 'oi';
  const oi = ctx.oi;

  const scopes = inOi
    ? ((oi && (oi.docs || []).length ? [oi.id, 'oc'] : ((ctx.rec.docs || []).length ? ['oc'] : [])))
    : (ctx.view === 'mech' ? ['mech-new'] : ['oc']);

  if (mode !== 'photo') {
    let vd = ctx.ui.viewerDoc;
    const all = [];
    scopes.forEach((sc) => { (VS.openTabs[sc] || []).forEach((id) => all.push({ scope: sc, id })); });
    if (!vd || !all.some((x) => x.scope === vd.scope && x.id === vd.id)) {
      vd = all.length ? all[all.length - 1] : null;
      ctx.ui.viewerDoc = vd;
    }
  }

  const vd = ctx.ui.viewerDoc;
  const d = vd ? docListFor(ctx, vd.scope).find((x) => x.id === vd.id) : null;
  if (d) ensureDocPages(d);

  const dSt = d ? (VS.docs[d.id] || (VS.docs[d.id] = { page: 1, rot: 0, scroll: 0 })) : null;
  const pages = oi ? photoPages(oi) : [];
  const groups = oi ? photoGroups(oi) : [];
  const pSt = oi ? (VS.photos[oi.id] || (VS.photos[oi.id] = { page: 1, rot: 0, scroll: 0 })) : null;
  const curPhoto = pages[pSt ? Math.min(pSt.page, pages.length) - 1 : 0];

  return { mode, inOi, oi, scopes, vd, d, dSt, pages, groups, pSt, curPhoto };
}

export function viewerHTML(ctx) {
  if (!ctx.ui.viewer) return '';
  const vctx = buildViewerContext(ctx);

  const modeBar = vctx.inOi ? `<div class="vmode">
    <button class="vmode-btn ${vctx.mode === 'photo' ? 'active' : ''}" data-vmode="photo">Фото · ${vctx.pages.length}</button>
    <button class="vmode-btn ${vctx.mode === 'doc' ? 'active' : ''}" data-vmode="doc">Документы</button>
    <button class="vmode-btn ${vctx.mode === 'compare' ? 'active' : ''}" data-vmode="compare">Сравнение</button>
  </div>` : '';

  let parts;
  if (vctx.mode === 'photo') parts = renderPhotoMode(ctx, vctx);
  else if (vctx.mode === 'doc') parts = renderDocMode(ctx, vctx);
  else parts = renderCompareMode(ctx, vctx);

  return `<div class="viewer">${modeBar}${parts.tabsBar || ''}${parts.toolbar}${parts.body}</div>`;
}

export function splitWrap(viewerInner, growInner) {
  if (!viewerInner) return `<div class="split" style="--vw:0%"><div class="grow" style="padding-left:0">${growInner}</div></div>`;
  return `<div class="split">${viewerInner}<div class="vsplit" data-vsplit title="Потяните, чтобы изменить соотношение"></div><div class="grow">${growInner}</div></div>`;
}

// Перетаскивание разделителя — часть просмотрщика, а не каркаса.
export function bindSplitPanes(ctx) {
  ctx.scope.$$('[data-vsplit]').forEach((sp) => {
    sp.onpointerdown = (e) => {
      e.preventDefault();
      // Захват указателя на самой ручке — без этого на части тачпадов/сенсорных
      // экранов браузер трактует жест как touch-скролл страницы и до
      // pointermove дело не доходит, хотя pointerdown срабатывает нормально.
      sp.setPointerCapture(e.pointerId);

      const split = sp.parentElement;
      const rect = split.getBoundingClientRect();
      const maxVW = Math.min(70, Math.max(25, ((rect.width - 620) / rect.width) * 100));

      const move = (ev) => {
        const pct = ((ev.clientX - rect.left) / rect.width) * 100;
        split.style.setProperty('--vw', Math.min(maxVW, Math.max(25, pct)) + '%');
      };
      const up = () => {
        sp.releasePointerCapture(e.pointerId);
        sp.removeEventListener('pointermove', move);
        sp.removeEventListener('pointerup', up);
      };
      sp.addEventListener('pointermove', move);
      sp.addEventListener('pointerup', up);
    };
  });
}
