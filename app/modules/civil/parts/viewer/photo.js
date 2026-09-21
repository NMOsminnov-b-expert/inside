import { esc } from '../../../../kernel/dom.js';
import { pagerHTML, zoomHTML, rotateHTML } from './tools.js';
import { photoFileAt, catLabel } from '../photos/model.js';

// Целевые литеры для переноса текущего фото (все литеры, кроме текущей).
function moveTargets(ctx, oi) {
  return ctx.rec.oi.filter((o) => o.card !== 'land' && (!oi || o.id !== oi.id));
}

export function renderPhotoMode(ctx, vctx) {
  const { groups, pages, curPhoto, oi } = vctx;

  // В карточке объекта оценки литера выбирается в меню просмотрщика: пока не
  // выбрана, показывать нечего — говорим об этом прямо, а не пустой лентой.
  if (!oi) {
    return {
      right: '<span class="vtitle">Фото</span>',
      body: `<div class="vstage"><div class="vempty">
        Выберите литеру в меню слева — её фотографии откроются здесь.
      </div></div>`,
    };
  }
  const pSt = vctx.pSt || { page: 1, rot: 0 };

  const targets = moveTargets(ctx, oi);
  const moveSelect = targets.length
    ? `<div class="tool-group"><select class="select vcat" data-move-photo title="Перенести текущее фото к другой литере">
        <option value="">Перенести к литере…</option>
        ${targets.map((t) => `<option value="${t.id}">Лит ${esc(t.letter)} · ${esc(t.name)}</option>`).join('')}
      </select></div>`
    : '';

  // Категория и перенос — узкими списками в той же панели: их выбирают
  // реже, чем листают, и отдельной строки они не стоят.
  const tools = `${pagerHTML(Math.min(pSt.page, pages.length || 1), pages.length)}
    <div class="tool-group"><select class="select vcat" data-vjump title="Перейти к категории">
    <option value="">К категории…</option>
    ${groups.map((g) => `<option value="${esc(g.cat)}">${esc(catLabel(oi, g.cat))} · ${g.items.length}</option>`).join('')}
    </select></div>
    ${moveSelect}
    ${zoomHTML('photo')}${rotateHTML()}`;
  const right = `<span class="vtitle">${esc(curPhoto ? catLabel(oi, curPhoto.cat) : '—')}</span>`;

  let gi = 0;
  const ribbon = groups.map((g) => {
    const inner = g.items.map((it) => {
      gi++;
      const f = photoFileAt(oi, it.cat, it.i);
      return `<div class="vpage-wrap" data-vpageblk="${gi}"><div class="vpage photo-page" data-vpageinner style="transform:rotate(${pSt.rot}deg)">
      ${f ? `<img class="vimg" src="${f.dataUrl}" alt="${esc(f.name)}">`
          : `<div class="photo-fill">${esc(catLabel(oi, it.cat))} · фото ${it.i + 1}</div>`}</div></div>`;
    }).join('');
    return `<div class="vgroup-h">${esc(catLabel(oi, g.cat))} · ${g.items.length}</div>${inner}`;
  }).join('') || '<div class="vpage photo-page"><div class="photo-fill">Фото не загружены</div></div>';

  const rail = groups.map((g) => `<div class="rail-cat">${esc(catLabel(oi, g.cat))}</div>` + g.items.map((it) => {
    const idx = pages.findIndex((p) => p.cat === it.cat && p.i === it.i) + 1;
    const f = photoFileAt(oi, it.cat, it.i);
    return `<div class="vthumb pho ${f ? 'real' : ''} ${idx === pSt.page ? 'active' : ''}" data-vthumb="${idx}" title="${esc(it.cat)} ${it.i + 1}">${f ? `<img class="vthumb-img" src="${f.dataUrl}" alt="">` : ''}<span class="vthumb-num">${idx}</span></div>`;
  }).join('')).join('');

  const railOff = ctx.ui.railCollapsed === true;
  const body = `<div class="vbody">${railOff ? '' : `<div class="vrail"><div class="vrail-list">${rail}</div></div>`}
  <div class="vstage" data-vstage><div class="vribbon" data-vribbon>${ribbon}</div></div></div>`;

  return { tools, right, body, rail: true };
}
