import { OI, DOCS, appState } from '../../core/state.js';
import { docListFor, ensureDocPages } from '../docs/docsModel.js';
import { photoPages, photoGroups } from '../photos/photoModel.js';
import { VS } from './viewerState.js';
import { renderDocMode } from './docViewer.js';
import { renderPhotoMode } from './photoViewer.js';
import { renderCompareMode } from './compareViewer.js';

function buildViewerContext() {
  const mode = appState.viewer.mode;
  const inOi = appState.view === 'oi';
  // ОИ берётся по openOi независимо от представления: фото-просмотрщик
  // открывается в том числе с плиток на вкладке «Фото» ОЦ.
  const oi = appState.openOi ? OI.find((o) => o.id === appState.openOi) : null;
  const scopes = inOi
    ? ((oi && (oi.docs || []).length ? [oi.id, 'oc'] : (DOCS.length ? ['oc'] : [])))
    : (appState.view === 'mech' ? ['mech-new'] : ['oc']);

  if (mode !== 'photo') {
    let vd = appState.viewerDoc;
    const all = [];
    scopes.forEach((sc) => { (VS.openTabs[sc] || []).forEach((id) => all.push({ scope: sc, id })); });
    if (!vd || !all.some((x) => x.scope === vd.scope && x.id === vd.id)) {
      vd = all.length ? all[all.length - 1] : null;
      appState.viewerDoc = vd;
    }
  }

  const vd = appState.viewerDoc;
  const d = vd ? docListFor(vd.scope).find((x) => x.id === vd.id) : null;
  if (d) ensureDocPages(d);
  const dSt = d ? (VS.docs[d.id] || (VS.docs[d.id] = { page: 1, rot: 0, scroll: 0 })) : null;
  const pages = oi ? photoPages(oi) : [];
  const groups = oi ? photoGroups(oi) : [];
  const pSt = oi ? (VS.photos[oi.id] || (VS.photos[oi.id] = { page: 1, rot: 0, scroll: 0 })) : null;
  const curPhoto = pages[pSt ? Math.min(pSt.page, pages.length) - 1 : 0];
  return { mode, inOi, oi, scopes, vd, d, dSt, pages, groups, pSt, curPhoto };
}

export function viewerHTML() {
  if (!appState.viewer) return '';
  const ctx = buildViewerContext();

  const modeBar = ctx.inOi ? `<div class="vmode">
    <button class="vmode-btn ${ctx.mode === 'photo' ? 'active' : ''}" data-vmode="photo">Фото · ${ctx.pages.length}</button>
    <button class="vmode-btn ${ctx.mode === 'doc' ? 'active' : ''}" data-vmode="doc">Документы</button>
    <button class="vmode-btn ${ctx.mode === 'compare' ? 'active' : ''}" data-vmode="compare">Сравнение</button>
  </div>` : '';

  let parts;
  if (ctx.mode === 'photo') parts = renderPhotoMode(ctx);
  else if (ctx.mode === 'doc') parts = renderDocMode(ctx);
  else parts = renderCompareMode(ctx);

  return `<div class="viewer">${modeBar}${parts.tabsBar || ''}${parts.toolbar}${parts.body}</div>`;
}

export function splitWrap(viewerInner, growInner) {
  if (!viewerInner) return `<div class="split" style="--vw:0%"><div class="grow" style="padding-left:0">${growInner}</div></div>`;
  return `<div class="split">${viewerInner}<div class="vsplit" data-vsplit title="Потяните, чтобы изменить соотношение"></div><div class="grow">${growInner}</div></div>`;
}