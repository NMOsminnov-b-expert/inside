import { docListFor, ensureDocPages } from '../docs/model.js';
import { photoPages, photoGroups } from '../photos/model.js';
import { VS } from './state.js';
import { renderDocMode } from './doc.js';
import { renderPhotoMode } from './photo.js';
import { renderCompareMode } from './compare.js';
import { viewerSidebarHTML } from './sidebar.js';

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

  // Кнопка-гамбургер в левом верхнем углу открывает сайдбар выбора (см.
  // sidebar.js): оттуда доступен любой документ записи ОЦ и любое фото, а не
  // только уже открытое вкладкой.
  const burger = `<button class="vburger ${ctx.ui.viewerSidebar ? 'on' : ''}" data-vsb-toggle title="Выбрать документ или фото"><span></span><span></span><span></span></button>`;

  const modeBar = `<div class="vmode">
    ${burger}
    ${vctx.inOi ? `<button class="vmode-btn ${vctx.mode === 'photo' ? 'active' : ''}" data-vmode="photo">Фото · ${vctx.pages.length}</button>
    <button class="vmode-btn ${vctx.mode === 'doc' ? 'active' : ''}" data-vmode="doc">Документы</button>
    <button class="vmode-btn ${vctx.mode === 'compare' ? 'active' : ''}" data-vmode="compare">Сравнение</button>` : ''}
  </div>`;

  let parts;
  if (vctx.mode === 'photo') parts = renderPhotoMode(ctx, vctx);
  else if (vctx.mode === 'doc') parts = renderDocMode(ctx, vctx);
  else parts = renderCompareMode(ctx, vctx);

  return `<div class="viewer">${modeBar}${parts.tabsBar || ''}${parts.toolbar}${parts.body}${viewerSidebarHTML(ctx, vctx.mode)}</div>`;
}

// Закрытый просмотрщик оставляет после себя закладку — так же, как блок
// заметок справа (.notes-tab в app.html): иначе вернуть его на этом же экране
// нечем. Закладка слева, потому что и сам просмотрщик слева.
export function splitWrap(viewerInner, growInner) {
  if (!viewerInner) {
    return `<div class="split split-closed" style="--vw:0%">
      <button class="vopen-tab" data-vopen title="Открыть просмотрщик документов"><span>Документы</span></button>
      <div class="grow">${growInner}</div>
    </div>`;
  }
  return `<div class="split">${viewerInner}<div class="vsplit" data-vsplit title="Потяните, чтобы изменить соотношение"></div><div class="grow">${growInner}</div></div>`;
}

// Ширина просмотрщика запоминается ОТДЕЛЬНО ДЛЯ КАЖДОГО РЕЖИМА (Л3.8).
// В сравнении рядом стоят фото и документ, и места нужно заметно больше, чем
// в обычном просмотре, — поэтому при переходе в сравнение зона параметров
// сжимается сама. Если человек подвинул границу руками, дальше используется
// его значение — но тоже своё для каждого режима.
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: соотношение колонок — личная настройка пользователя.
// В макете она живёт только в памяти сессии и теряется при перезагрузке. На
// сервере это либо поле в профиле пользователя, либо localStorage у него на
// машине. Что практичнее — решать разработчикам: профиль переезжает вместе с
// человеком на другой компьютер, localStorage не требует запроса к серверу на
// каждый показ карточки.
const DEFAULT_VW = { doc: null, photo: null, compare: 64 };   // ключ режима — 'compare' (см. parts/viewer/ctrl.js)

const modeOf = (ctx) => (ctx.ui.viewer && ctx.ui.viewer.mode) || 'doc';

export function applySplitForMode(ctx) {
  const split = ctx.scope.$('.split');
  if (!split) return;

  const mode = modeOf(ctx);
  const saved = (ctx.ui.splitVW || {})[mode];
  const vw = saved != null ? saved : DEFAULT_VW[mode];

  if (vw == null) split.style.removeProperty('--vw');
  else split.style.setProperty('--vw', vw + '%');
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
        const vw = Math.min(maxVW, Math.max(25, pct));
        split.style.setProperty('--vw', vw + '%');
        // Запоминаем для текущего режима: в сравнении и в обычном просмотре
        // удобны разные соотношения.
        ctx.ui.splitVW = ctx.ui.splitVW || {};
        ctx.ui.splitVW[modeOf(ctx)] = Math.round(vw);
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

  applySplitForMode(ctx);
}
