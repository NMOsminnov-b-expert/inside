import { esc } from '../../../../kernel/dom.js';
import { PHOTO_CAT } from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';
import { photoPages, photoFileAt, photoGroups } from './model.js';

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
      <div class="dd-menu">${opt('building', 'photoCat', PHOTO_CAT).map((c) => `<button data-add-photo="${esc(c)}" data-photo-oi="${oi.id}">${esc(c)}</button>`).join('')}</div>
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
    <div class="dd-menu">${opt('building', 'photoCat', PHOTO_CAT).map((c) => `<button data-add-photo="${esc(c)}" data-photo-oi="${oi.id}">${esc(c)}</button>`).join('')}</div>
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
//
// Категории — чипами в шапке, а не заголовками в списке: заголовки вытягивали
// окно, и снимки нужной категории приходилось искать прокруткой (замечание
// пользователя 05.09.2026). Щелчок по чипу оставляет одну категорию, «Все»
// возвращает полный набор; выбор живёт в ui, поэтому переживает перерисовку.
//
// Сетка ровно в три столбца, высота — четыре ряда: дальше окно прокручивается
// внутри себя, а не растёт до края экрана.
export function photoPopHTML(oi, ui) {
  const pages = photoPages(oi);
  const groups = photoGroups(oi);
  const label = oi.letter ? `Литера ${esc(oi.letter)} · ${esc(oi.name)}` : esc(oi.name || 'ОИ');

  const active = (ui && ui.photoPopCat) || '';
  const shown = active ? pages.filter((p) => p.cat === active) : pages;

  const chip = (cat, text, n) => `<button class="ph-chip ${cat === active ? 'on' : ''}"
    data-photo-cat="${esc(cat)}">${esc(text)}<span>${n}</span></button>`;

  const chips = `<div class="ph-pop-cats">
    ${chip('', 'Все', pages.length)}
    ${groups.map((g) => chip(g.cat, g.cat, g.items.length)).join('')}
  </div>`;

  const grid = `<div class="ph-pop-grid">${shown.map((p) => {
    const f = photoFileAt(oi, p.cat, p.i);
    return `<button class="ph-pop-item" data-open-photo="${oi.id}|${esc(p.cat)}:${p.i}"
        title="${esc(p.cat)} · фото ${p.i + 1}">
      <span class="ph-pop-img"${f ? ` style="background-image:url('${f.dataUrl}')"` : ''}></span>
      <span class="ph-pop-cap">${esc(active ? String(p.i + 1) : p.cat + ' · ' + (p.i + 1))}</span>
    </button>`;
  }).join('')}</div>`;

  return `<div class="ph-pop" data-photo-pop-box>
    <div class="ph-pop-head">${label}<span class="muted">${pages.length} фото</span>
      <button class="tool-btn" data-photo-pop-close title="Закрыть">×</button></div>
    ${chips}
    <div class="ph-pop-body">${grid}</div>
  </div>`;
}
