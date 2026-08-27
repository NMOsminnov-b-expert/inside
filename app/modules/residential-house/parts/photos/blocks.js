import { esc } from '../../../../kernel/dom.js';
import { PHOTO_CAT } from '../../data/dictionaries.js';
import { photoPages, photoFileAt } from './model.js';

export function miniThumbs(oi) {
  const pages = photoPages(oi);
  if (!pages.length) return '<span class="muted">—</span>';
  return `<div class="inline-row" style="gap:4px">${pages.slice(0, 3).map((p) => `<div class="ph-mini" data-open-photo="${oi.id}|${p.cat}:${p.i}" title="${esc(p.cat)} ${p.i + 1}"></div>`).join('')}<span class="tag-mini">${pages.length}</span></div>`;
}

export function photoAccordions(ui, oi, withAdd) {
  const cats = Object.keys(oi.photos || {});

  if (!cats.length) {
    if (!withAdd) return '<span class="muted">Фото не загружены</span>';

    return `<div class="dd">
      <button class="btn btn-ghost btn-sm" data-dd-toggle>+ Добавить фото</button>
      <div class="dd-menu">${PHOTO_CAT.map((c) => `<button data-add-photo="${esc(c)}" data-photo-oi="${oi.id}">${esc(c)}</button>`).join('')}</div>
    </div>
    <div class="muted" style="font-size:10.5px;margin-top:6px">Выберите категорию, чтобы загрузить первое фото.</div>`;
  }

  const accordionsHtml = cats.map((cat) => {
    const key = 'ph|' + oi.id + '|' + cat;
    const isOpen = ui.accOpen[key] === true;

    return `<div class="acc ${isOpen ? 'open' : ''}">
      <div class="acc-head" data-acc-toggle="${key}"><span class="chev">▾</span>${esc(cat)}<span class="muted" style="font-weight:400">${oi.photos[cat]} фото</span></div>
      <div class="acc-body"><div class="ph-row">
        ${Array.from({ length: oi.photos[cat] }, (_, i) => `<div class="ph" data-open-photo="${oi.id}|${esc(cat)}:${i}">${esc(cat)} ${i + 1}</div>`).join('')}
        ${withAdd ? `<button class="btn btn-ghost btn-sm" data-add-photo="${esc(cat)}" data-photo-oi="${oi.id}">+ Загрузить</button>` : ''}
      </div></div>
    </div>`;
  }).join('');

  if (!withAdd) return accordionsHtml;

  // Дропдаун добавления фото в новую категорию.
  const addCategoryMenu = `<div class="dd" style="margin-top:8px">
    <button class="btn btn-ghost btn-sm" data-dd-toggle>+ Добавить категорию</button>
    <div class="dd-menu">${PHOTO_CAT.map((c) => `<button data-add-photo="${esc(c)}" data-photo-oi="${oi.id}">${esc(c)}</button>`).join('')}</div>
  </div>`;

  return accordionsHtml + addCategoryMenu;
}

// Ячейка «Фото» в перечне ОИ: ОДИН прямоугольник с количеством вместо ряда из
// 1–4 миниатюр (Л4.7). Превью — первое прикреплённое фото, если оно есть; клик
// открывает всплывающее окно со всеми фото литеры.
export function photoCell(oi) {
  const pages = photoPages(oi);
  if (!pages.length) return '<span class="muted">—</span>';

  const first = pages[0];
  const f = photoFileAt(oi, first.cat, first.i);

  return `<button class="ph-cell" data-photo-pop="${oi.id}"
      title="${pages.length} фото — открыть список"${f ? ` style="background-image:url('${f.dataUrl}')"` : ''}>
    <span class="ph-cell-n">${pages.length}</span>
  </button>`;
}

// Всплывающее окно со всеми фото литеры (открывает ячейка выше).
export function photoPopHTML(oi) {
  const pages = photoPages(oi);
  const label = oi.letter ? `Литера ${esc(oi.letter)} · ${esc(oi.name)}` : esc(oi.name || 'ОИ');

  return `<div class="ph-pop" data-photo-pop-box>
    <div class="ph-pop-head">${label}<span class="muted">${pages.length} фото</span>
      <button class="tool-btn" data-photo-pop-close title="Закрыть">×</button></div>
    <div class="ph-pop-body">
      ${pages.map((p, idx) => {
        const f = photoFileAt(oi, p.cat, p.i);
        return `<button class="ph-pop-item" data-open-photo="${oi.id}|${esc(p.cat)}:${p.i}"
            title="${esc(p.cat)} · фото ${p.i + 1}">
          <span class="ph-pop-img"${f ? ` style="background-image:url('${f.dataUrl}')"` : ''}></span>
          <span class="ph-pop-cap">${esc(p.cat)} · ${p.i + 1}</span>
        </button>`;
      }).join('')}
    </div>
  </div>`;
}
