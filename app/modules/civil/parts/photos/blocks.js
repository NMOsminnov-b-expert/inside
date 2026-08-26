import { esc } from '../../../../kernel/dom.js';
import { PHOTO_CAT } from '../../data/dictionaries.js';
import { photoPages, photoFileAt } from './model.js';

// Плитка фото: настоящая картинка, если файл загружен, иначе прежняя макетная
// заглушка с подписью (сидовые фото файлов не имеют).
function phTileInner(oi, cat, i) {
  const f = photoFileAt(oi, cat, i);
  return f
    ? `<img class="ph-img" src="${f.dataUrl}" alt="${esc(f.name)}">`
    : `${esc(cat)} ${i + 1}`;
}

export function miniThumbs(oi) {
  const pages = photoPages(oi);
  if (!pages.length) return '<span class="muted">—</span>';
  return `<div class="inline-row" style="gap:4px">${pages.slice(0, 3).map((p) => {
    const f = photoFileAt(oi, p.cat, p.i);
    return `<div class="ph-mini" data-open-photo="${oi.id}|${p.cat}:${p.i}" title="${esc(p.cat)} ${p.i + 1}"${f ? ` style="background-image:url('${f.dataUrl}');background-size:cover;background-position:center"` : ''}></div>`;
  }).join('')}<span class="tag-mini">${pages.length}</span></div>`;
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
        ${Array.from({ length: oi.photos[cat] }, (_, i) => `<div class="ph" data-open-photo="${oi.id}|${esc(cat)}:${i}" title="${esc(cat)} ${i + 1}">${phTileInner(oi, cat, i)}</div>`).join('')}
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
