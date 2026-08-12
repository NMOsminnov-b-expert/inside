import { appState } from '../../core/state.js';
import { PHOTO_CAT } from '../../core/dictionaries.js';
import { esc } from '../../core/utils.js';
import { photoPages } from './photoModel.js';

export function miniThumbs(oi) {
  const pages = photoPages(oi);
  if (!pages.length) return '<span class="muted">—</span>';
  return `<div class="inline-row" style="gap:4px">${pages.slice(0, 3).map((p) => `<div class="ph-mini" data-open-photo="${oi.id}|${p.cat}:${p.i}" title="${esc(p.cat)} ${p.i + 1}"></div>`).join('')}<span class="tag-mini">${pages.length}</span></div>`;
}

export function photoAccordions(oi, withAdd) {
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
    const isOpen = appState.accOpen[key] === true;

    return `<div class="acc ${isOpen ? 'open' : ''}">
      <div class="acc-head" data-acc-toggle="${key}"><span class="chev">▾</span>${esc(cat)}<span class="muted" style="font-weight:400">${oi.photos[cat]} фото</span></div>
      <div class="acc-body"><div class="ph-row">
        ${Array.from({ length: oi.photos[cat] }, (_, i) => `<div class="ph" data-open-photo="${oi.id}|${esc(cat)}:${i}">${esc(cat)} ${i + 1}</div>`).join('')}
        ${withAdd ? `<button class="btn btn-ghost btn-sm" data-add-photo="${esc(cat)}" data-photo-oi="${oi.id}">+ Загрузить</button>` : ''}
      </div></div>
    </div>`;
  }).join('');

  if (!withAdd) {
    return accordionsHtml;
  }

  // Дропдаун добавления фото в новую категорию.
  // Показываем все PHOTO_CAT — для уже существующих это увеличит счётчик,
  // для новых создаст категорию.
  const addCategoryMenu = `<div class="dd" style="margin-top:8px">
    <button class="btn btn-ghost btn-sm" data-dd-toggle>+ Добавить категорию</button>
    <div class="dd-menu">${PHOTO_CAT.map((c) => `<button data-add-photo="${esc(c)}" data-photo-oi="${oi.id}">${esc(c)}</button>`).join('')}</div>
  </div>`;

  return accordionsHtml + addCategoryMenu;
}