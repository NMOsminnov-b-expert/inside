import { esc } from '../dom.js';

import { tabKey } from './state.js';
import { ICON_ARCHIVE, ICON_UPLOAD } from './icons.js';
import { pagerHTML, zoomHTML, rotateHTML } from './tools.js';
import { tabs, notOpened, tabLabel } from './docActions.js';
import { can } from './deps.js';
import { docListFor, scopeLabel } from './deps.js';

// Страница реального PDF — canvas внутри обычного листа, который асинхронно
// заполняет viewer/pdf.js (paintPdfCanvases). Раньше здесь был <embed>, то есть
// встроенный ридер браузера со своей панелью и зумом: он подменял весь лист и
// поэтому лента миниатюр, «‹ n/N ›», зум и поворот макета на реальном файле не
// работали. Пока страница не отрисована — скелетон, чтобы не мигало пустотой.
function pdfPageHTML(d, page) {
  // Пропорция именно этой страницы, а не первой: иначе в документе со
  // смешанной ориентацией альбомная страница до отрисовки показывалась в
  // портретном боксе («переворачивалась»).
  const ratio = (d.file.pageAspects || [])[page.src - 1] || d.file.aspect;
  const aspect = ratio ? `aspect-ratio:${1} / ${ratio};` : '';
  return `<canvas class="vpdf-canvas" style="${aspect}"
    data-pdf-src="${page.src}" data-pdf-url="${d.file.dataUrl}"
    data-pdf-doc="${esc(d.id)}" aria-label="${esc(d.name)} · страница ${page.src}"></canvas>
    <div class="vpdf-load"><div class="sk-h"></div>${[100, 92, 96, 85].map((w) => `<div class="sk-line" style="width:${w}%"></div>`).join('')}</div>`;
}

function imagePageHTML(f) {
  return `<img class="vimg" src="${f.dataUrl}" alt="${esc(f.name)}">`;
}

function otherPageHTML(f) {
  return `<div class="vempty-box">Предпросмотр недоступен для этого типа файла (${esc(f.mime || 'неизвестный формат')}).</div>
<a class="btn btn-primary btn-sm" href="${f.dataUrl}" download="${esc(f.name)}" style="margin-top:8px;display:inline-block">Скачать «${esc(f.name)}»</a>`;
}

// Переключение по виду КОНКРЕТНОЙ страницы: у реального PDF страниц столько же,
// сколько в файле, и каждая — свой лист. Ветки нарисованных страниц ('title' и
// 'skel') убраны: страница бывает только у настоящего файла.
export function docPageHTML(d, n) {
  const page = d.pages[n - 1];
  if (!page) return '';

  if (page.kind === 'pdf') return pdfPageHTML(d, page);
  if (page.kind === 'image') return imagePageHTML(d.file);
  return otherPageHTML(d.file);
}

// Строка документа в списках: вид жирным, название приглушённым, область
// меткой — так в длинном списке глаз находит вид, а название дочитывает.
function docRowHTML(sc, d) {
  return `<span class="vdoc-sc">${scopeLabel(sc)}</span><b>${esc(d.type)}</b><span class="vdoc-nm">${esc(d.name)}</span>`;
}

// Строка вкладок документов — видна всегда (требование пользователя 21.09.2026:
// «нет возможности открыть ещё один документ, прикрепить ещё один»). Вкладки
// перетаскиваются, у каждой крестик и контекстное меню; «+» — открыть другой
// документ записи, открыть все или прикрепить файлы.
function tabsBarHTML(ctx, vd) {
  const list = tabs(ctx);
  const rest = notOpened(ctx);
  const tab = (x) => {
    const d = docListFor(ctx, x.sc).find((t) => t.id === x.id);
    if (!d) return '';
    const on = vd && vd.scope === x.sc && vd.id === x.id;
    const key = tabKey(x.sc, x.id);
    return `<div class="vtab ${on ? 'active' : ''}" role="tab" aria-selected="${on}" tabindex="${on ? 0 : -1}"
      data-vtab="${key}" draggable="true" title="${esc(d.type)} · ${esc(d.name)}">
      <span class="vtab-t">${esc(tabLabel(x.sc, d))}</span>
      ${can('closeTabs') ? `<button type="button" class="vtab-x" data-vtabclose="${key}" tabindex="-1"
        title="Закрыть вкладку (Alt+W)" aria-label="Закрыть «${esc(d.name)}»">×</button>` : ''}
    </div>`;
  };
  // Вкладки — в своей прокручиваемой полосе, а «+» рядом, вне прокрутки: иначе
  // меню «+» обрезалось бы краем полосы.
  return `<div class="vtabs">
    <div class="vtabs-list" role="tablist" aria-label="Открытые документы">${list.map(tab).join('')}</div>
    ${!can('attach') && !rest.length ? '' : `<div class="dd vtab-add">
      <button type="button" class="vtab-plus" data-dd-toggle title="Открыть или прикрепить документ (Ctrl+O)"
        aria-label="Открыть или прикрепить документ">+</button>
      <div class="dd-menu">
        ${can('attach') ? '<button data-vattach><span>Прикрепить файлы…</span><kbd>Ctrl+O</kbd></button>' : ''}
        ${rest.length ? '<div class="dd-sep"></div><div class="dd-cap">Документы записи</div>' : ''}
        ${rest.map((x) => `<button data-vaddtab="${tabKey(x.sc, x.d.id)}" title="${esc(x.d.name)}">${docRowHTML(x.sc, x.d)}</button>`).join('')}
        ${rest.length > 1 ? `<div class="dd-sep"></div><button data-vopenall>Открыть все · ${rest.length}</button>` : ''}
      </div>
    </div>`}
  </div>`;
}

// Пустая лента — зона для файлов: большая, с пунктирной рамкой и кнопкой
// выбора рядом (практика: зона не должна быть только для перетаскивания).
function dropHTML(ctx, text) {
  const rest = notOpened(ctx);
  return `<div class="vempty vdropzone">
    <div class="vdrop-card">
      <div class="vdrop-ico" aria-hidden="true">${ICON_UPLOAD}</div>
      <div class="vdrop-title">${esc(text)}</div>
      ${can('attach') ? '' : '<div class="vdrop-hint">Файлы добавляются на самой странице документа</div>'}
      ${can('attach') ? `<div class="vdrop-hint">Перетащите файлы сюда или вставьте из буфера — можно несколько сразу</div>
      <button class="btn btn-primary" data-vattach>Выбрать файлы…</button>
      <div class="vdrop-keys"><kbd>Ctrl+O</kbd> выбрать · <kbd>Ctrl+V</kbd> вставить</div>` : ''}
    </div>
    ${rest.length ? `<div class="vdrop-list"><div class="vdrop-cap">Документы записи · ${rest.length}</div>
      ${rest.map((x) => `<button class="vdrop-row" data-vaddtab="${tabKey(x.sc, x.d.id)}" title="${esc(x.d.name)}">${docRowHTML(x.sc, x.d)}</button>`).join('')}
    </div>` : ''}
  </div>`;
}

export function renderDocMode(ctx, vctx) {
  const { vd, d, dSt } = vctx;
  const tabsBar = tabsBarHTML(ctx, vd);

  if (!d) {
    const any = notOpened(ctx).length;
    return {
      tabsBar,
      right: '<span class="vtitle">Документы</span>',
      body: dropHTML(ctx, any ? 'Документы есть — откройте нужный или прикрепите новые' : 'Документов пока нет'),
    };
  }

  const archive = can('archive') ? `<button class="tool-btn" data-varchive="${esc(d.id)}"
    title="Убрать документ в архив — его можно будет найти и вернуть">${ICON_ARCHIVE}</button>` : '';

  // Документ без страниц — значит без файла. Такие больше не заводятся ни одним
  // из путей прикрепления, но старая запись в памяти вкладки ещё может их иметь:
  // показываем это прямо, а не пустой лентой.
  if (!d.pages.length) {
    return {
      tabsBar,
      right: archive,
      body: dropHTML(ctx, 'У документа нет файла'),
    };
  }

  const tools = `${pagerHTML(dSt.page, d.pages.length)}${zoomHTML('doc')}${rotateHTML()}`;

  // Удаление страницы — «отрезать» пустые/лишние страницы скана; сам файл при
  // этом не меняется, отрезание живёт на уровне списка страниц.
  //
  // Миниатюра реальной страницы — тот же canvas, что и большой лист, но с
  // data-pdf-thumb (фиксированная ширина, от зума не зависит). draggable —
  // перетаскивание для смены порядка, Ctrl+клик — множественный выбор (см.
  // parts/viewer/ctrl.js). Прятать миниатюры — кнопкой в панели: своя полоса
  // с надписью «« Миниатюры» занимала строку ленты.
  const sel = ctx.ui.pageSel || [];
  const railOff = ctx.ui.railCollapsed === true;
  const body = `<div class="vbody">${railOff ? '' : `<div class="vrail">
    <div class="vrail-list" data-vrail-list>
    ${d.pages.map((p, i) => `<div class="vthumb doc ${p.kind === 'pdf' ? 'real' : ''} ${i + 1 === dSt.page ? 'active' : ''} ${sel.includes(i + 1) ? 'sel' : ''}"
      data-vthumb="${i + 1}" ${can('editPages') ? 'draggable="true"' : ''}
      title="${can('editPages') ? `Страница ${i + 1} — перетащите, чтобы изменить порядок; Ctrl+клик — выбрать несколько` : `Страница ${i + 1}`}">
      ${p.kind === 'pdf' ? `<canvas class="vthumb-canvas" data-pdf-src="${p.src}" data-pdf-url="${d.file.dataUrl}" data-pdf-thumb="96"></canvas>` : ''}
      ${can('editPages') ? `<button class="vthumb-del" data-vdelpage="${i + 1}" title="Убрать страницу">×</button>` : ''}<span class="vthumb-num">${i + 1}</span></div>`).join('')}
    </div></div>`}
    <div class="vstage" data-vstage><div class="vribbon" data-vribbon>
      ${d.pages.map((p, i) => `<div class="vpage-wrap" data-vpageblk="${i + 1}"><div class="vpage" data-vpageinner style="${pageArStyle(d, p)}transform:rotate(${dSt.rot}deg)">${docPageHTML(d, i + 1)}</div></div>`).join('')}
    </div></div></div>`;

  return { tabsBar, tools, right: archive, body, rail: true };
}

// Пропорция листа (высота к ширине) — для режима «страница целиком»: ширину
// листа, при которой он весь помещается по высоте, считают стили от неё.
function pageArStyle(d, p) {
  const ar = p.kind === 'pdf' ? ((d.file.pageAspects || [])[p.src - 1] || d.file.aspect) : null;
  return ar ? `--ar:${ar};` : '';
}
