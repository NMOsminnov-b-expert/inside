import { docListFor, ensureDocPages } from '../docs/model.js';
import { photoPages, photoGroups } from '../photos/model.js';
import { VS, scopesOf, orderedTabs } from './state.js';
import { renderDocMode } from './doc.js';
import { renderPhotoMode } from './photo.js';
import { renderCompareMode } from './compare.js';
import { viewerSidebarHTML } from './sidebar.js';
import {
  ICON_RAIL, ICON_FULL, ICON_FULL_EXIT, ICON_DOCK, ICON_DOCK_EXIT, ICON_POPOUT, ICON_POPIN,
} from './icons.js';
import { isPopoutOpen } from './popout.js';

function buildViewerContext(ctx) {
  const mode = ctx.ui.viewer.mode;
  const inOi = ctx.view === 'oi';
  // В карточке литеры показываем её фото, в перечне объекта оценки — фото той
  // литеры, снимок которой открыли из окна перечня (kernel: viewerPhotoOi).
  const oi = ctx.oi
    || (ctx.ui.viewerPhotoOi
      ? (ctx.rec.oi || []).find((o) => o.id === ctx.ui.viewerPhotoOi)
      : null);

  // Области документов: в литере — её и объекта оценки (state.js, scopesOf).
  const scopes = scopesOf(ctx);

  if (mode !== 'photo') {
    let vd = ctx.ui.viewerDoc;
    const all = orderedTabs(scopes).map((x) => ({ scope: x.sc, id: x.id }));
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

  // Счётчик на кнопке «Фото»: у литеры — её снимки, в карточке объекта
  // оценки — все снимки записи (там литера выбирается в меню просмотрщика).
  const photoCount = oi
    ? pages.length
    : (ctx.rec.oi || []).reduce((n, o) => n + photoPages(o).length, 0);

  return { mode, inOi, oi, scopes, vd, d, dSt, pages, groups, pSt, curPhoto, photoCount };
}

// Одна панель вместо трёх (задача пользователя 21.09.2026: у просмотрщика мало
// полезной площади). Раньше над листом стояли три полосы — режимы, вкладки
// документов, инструменты — 119px из 660. Теперь режимы, инструменты режима и
// общие кнопки идут одной строкой, которая переносится только на узком
// просмотрщике; вкладки документов появляются, лишь когда открыто больше
// одного. Панель — часть вёрстки, а не слой поверх листа: перекрытая панелью
// часть страницы — одна из главных жалоб на просмотрщики.
export function viewerHTML(ctx) {
  if (!ctx.ui.viewer) return '';

  // Просмотрщик вынесен в отдельное окно — в карточке остаётся узкая полоса:
  // показать окно или вернуть просмотрщик сюда (parts/viewer/popout.js).
  if (ctx.ui.viewerPopout && isPopoutOpen() && !ctx.isPopout) {
    return `<div class="viewer vpop-stub">
      <button class="tool-btn" data-vpop-focus title="Показать окно с документом">${ICON_POPOUT}</button>
      <span class="vpop-stub-text">Документ в отдельном окне</span>
      <button class="tool-btn" data-vpop-back title="Вернуть просмотрщик в карточку">${ICON_POPIN}</button>
    </div>`;
  }

  const vctx = buildViewerContext(ctx);

  let parts;
  if (vctx.mode === 'photo') parts = renderPhotoMode(ctx, vctx);
  else if (vctx.mode === 'doc') parts = renderDocMode(ctx, vctx);
  else parts = renderCompareMode(ctx, vctx);

  const full = !!ctx.ui.viewerFull && !ctx.isPopout;
  const dock = !!ctx.ui.viewerDock && !ctx.isPopout;

  // Кнопка-гамбургер открывает сайдбар выбора (см. sidebar.js): оттуда
  // доступен любой документ записи ОЦ и любое фото, а не только уже открытое.
  const burger = `<button class="vburger ${ctx.ui.viewerSidebar ? 'on' : ''}" data-vsb-toggle
    title="Выбрать документ или фото" aria-label="Выбрать документ или фото"><span></span><span></span><span></span></button>`;

  const mode = (key, label) => `<button class="vmode-btn ${vctx.mode === key ? 'active' : ''}"
    data-vmode="${key}" aria-pressed="${vctx.mode === key}">${label}</button>`;

  const railOff = ctx.ui.railCollapsed === true;
  const railBtn = parts.rail
    ? `<button class="tool-btn ${railOff ? '' : 'on'}" data-vrail-toggle aria-pressed="${!railOff}"
      title="${railOff ? 'Показать миниатюры' : 'Скрыть миниатюры'}">${ICON_RAIL}</button>`
    : '';

  const bar = `<div class="vbar">
    <div class="tool-group vbar-modes">${burger}
      <div class="vmodes">${mode('photo', `Фото · ${vctx.photoCount}`)}${mode('doc', 'Документы')}${mode('compare', 'Сравнение')}</div>
    </div>
    ${parts.tools || ''}
    <div class="tool-group right">
      ${parts.right || ''}
      <button class="tool-btn" data-vhelp title="Горячие клавиши (?)" aria-label="Горячие клавиши">?</button>
      ${railBtn}
      ${ctx.isPopout ? `<button class="tool-btn" data-vpop-back title="Вернуть просмотрщик в карточку">${ICON_POPIN}</button>` : `
      <button class="tool-btn ${dock ? 'on' : ''}" data-vdock aria-pressed="${dock}"
        title="${dock ? 'Вернуть под шапку (F)' : 'Раскрыть во всю высоту: документ слева, карточка справа (F)'}">${dock ? ICON_DOCK_EXIT : ICON_DOCK}</button>
      <button class="tool-btn" data-vfull aria-pressed="${full}"
        title="${full ? 'Вернуть (Esc)' : 'На весь экран поверх карточки (Shift+F)'}">${full ? ICON_FULL_EXIT : ICON_FULL}</button>
      <button class="tool-btn" data-vpopout title="Открыть в отдельном окне — например, на втором мониторе">${ICON_POPOUT}</button>
      <button class="tool-btn" data-vclose title="Закрыть просмотрщик" aria-label="Закрыть просмотрщик">×</button>`}
    </div>
  </div>`;

  return `<div class="viewer ${full ? 'is-full' : ''}" ${full ? 'role="dialog" aria-modal="true" aria-label="Просмотр во весь экран"' : ''}>
    ${bar}${parts.tabsBar || ''}${parts.body}${viewerSidebarHTML(ctx, vctx.mode)}
    ${dock && !full ? '<div class="vdock-grip" data-vdock-grip title="Потяните, чтобы изменить ширину документа"></div>' : ''}</div>`;
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
