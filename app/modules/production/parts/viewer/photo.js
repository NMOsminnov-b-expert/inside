import { esc } from '../../../../kernel/dom.js';
import { VS } from './state.js';

// Целевые литеры для переноса текущего фото (все литеры, кроме текущей).
function moveTargets(ctx, oi) {
  return ctx.rec.oi.filter((o) => o.card !== 'land' && (!oi || o.id !== oi.id));
}

export function renderPhotoMode(ctx, vctx) {
  const { groups, pages, curPhoto, oi } = vctx;
  const pSt = vctx.pSt || { page: 1, rot: 0 };

  const targets = moveTargets(ctx, oi);
  const moveSelect = targets.length
    ? `<div class="tool-group"><select class="select vcat" data-move-photo title="Перенести текущее фото к другой литере">
        <option value="">Перенести к литере…</option>
        ${targets.map((t) => `<option value="${t.id}">Лит ${esc(t.letter)} · ${esc(t.name)}</option>`).join('')}
      </select></div>`
    : '';

  const toolbar = `<div class="vtoolbar">
    <div class="tool-group"><button class="tool-btn" data-vprev>‹</button>
    <input class="page-input" data-vpage value="${Math.min(pSt.page, pages.length || 1)}"><span class="muted">/ ${pages.length}</span>
    <button class="tool-btn" data-vnext>›</button></div>
    <div class="tool-group"><select class="select vcat" data-vjump>
    <option value="">К категории…</option>
    ${groups.map((g) => `<option value="${esc(g.cat)}">${esc(g.cat)} · ${g.items.length}</option>`).join('')}
    </select></div>
    ${moveSelect}
    <div class="tool-group"><button class="tool-btn" data-vrot>⟳</button></div>
    <div class="tool-group"><button class="tool-btn" data-vzoom->−</button><span class="zoom-label" data-zoomlabel>${VS.zoom}%</span><button class="tool-btn" data-vzoom+>+</button></div>
    <div class="tool-group right"><span class="vtitle">Фото · ${esc(curPhoto ? curPhoto.cat : '—')}</span><button class="tool-btn" data-vclose>×</button></div>
  </div>`;

  let gi = 0;
  const ribbon = groups.map((g) => {
    const inner = g.items.map((it) => {
      gi++;
      return `<div class="vpage-wrap" data-vpageblk="${gi}"><div class="vpage photo-page" data-vpageinner style="transform:rotate(${pSt.rot}deg)">
      <div class="photo-fill">${esc(it.cat)} · фото ${it.i + 1}</div></div></div>`;
    }).join('');
    return `<div class="vgroup-h">${esc(g.cat)} · ${g.items.length}</div>${inner}`;
  }).join('') || '<div class="vpage photo-page"><div class="photo-fill">Фото не загружены</div></div>';

  const rail = groups.map((g) => `<div class="rail-cat">${esc(g.cat)}</div>` + g.items.map((it) => {
    const idx = pages.findIndex((p) => p.cat === it.cat && p.i === it.i) + 1;
    return `<div class="vthumb pho ${idx === pSt.page ? 'active' : ''}" data-vthumb="${idx}" title="${esc(it.cat)} ${it.i + 1}"><span class="vthumb-num">${idx}</span></div>`;
  }).join('')).join('');

  const body = `<div class="vbody"><div class="vrail"><div class="vrail-list">${rail}</div></div>
  <div class="vstage" data-vstage><div class="vribbon" data-vribbon>${ribbon}</div></div></div>`;

  return { toolbar, body };
}
