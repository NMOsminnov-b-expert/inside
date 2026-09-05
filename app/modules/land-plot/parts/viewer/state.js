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

  // Фото открывается ЗДЕСЬ ЖЕ: в карточке литеры — её просмотрщиком, в перечне
  // объекта оценки — просмотрщиком объекта (решение пользователя 05.09.2026).
  // Раньше клик по снимку в перечне уводил на страницу литеры и терял место, где
  // человек работал; какие фото показывать, просмотрщик берёт из viewerPhotoOi.
  if (ctx.view === 'oi' && ctx.oi && ctx.oi.id === oiId) {
    ctx.ui.viewerPhotoOi = null;
    ctx.render();
    return;
  }
  ctx.ui.viewerPhotoOi = oiId;
  ctx.ui.viewerClosed = false;
  ctx.render();
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

// Смена масштаба не должна перелистывать документ. Лента увеличивается целиком
// (CSS zoom на ней), а scrollTop области прокрутки остаётся прежним — то же
// число пикселей после увеличения приходится уже на другой лист, и «+»/«−»
// уводили на соседнюю страницу. Поэтому перед сменой запоминаем, какой лист
// сейчас вверху и насколько он прокручен, а после — возвращаемся ровно туда же.
//
// blkAttr — атрибут блока-страницы: у обычной ленты data-vpageblk, у колонок
// сравнения свои (data-cmp-phblk / data-cmp-dcblk).
export function keepPageOnZoom(stage, blkAttr, apply) {
  if (!stage) { apply(); return; }

  const top = stage.getBoundingClientRect().top;
  const blocks = Array.from(stage.querySelectorAll(`[${blkAttr}]`));

  // Верхний видимый лист — тот же, что считает текущим обработчик прокрутки.
  let anchor = blocks[0] || null;
  blocks.forEach((b) => { if (b.getBoundingClientRect().top - top <= 60) anchor = b; });

  // Доля листа, уже ушедшая вверх: возвращаемся не к началу страницы, а туда
  // же, где читали.
  let frac = 0;
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    frac = r.height ? Math.min(1, Math.max(0, (top - r.top) / r.height)) : 0;
  }

  // Отдельно запоминаем «долистали до конца»: у последней страницы верх может
  // вообще не дойти до порога 60px (лента физически не может поднять её выше),
  // и текущей она считается именно по признаку конца. После увеличения контент
  // становится выше, признак пропадает — и «4/4» превращалось в «3/4», то есть
  // масштаб перебрасывал на предыдущий лист.
  const atBottom = stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2;

  apply();

  if (atBottom) { stage.scrollTop = stage.scrollHeight; return; }

  if (!anchor) return;
  const r2 = anchor.getBoundingClientRect();
  stage.scrollTop += (r2.top - stage.getBoundingClientRect().top) + frac * r2.height;
}
