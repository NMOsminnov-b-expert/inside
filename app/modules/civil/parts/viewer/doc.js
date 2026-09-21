import { esc } from '../../../../kernel/dom.js';

import { docListFor, scopeLabel } from '../docs/model.js';
import { VS } from './state.js';
import { ICON_ARCHIVE } from './icons.js';
import { pagerHTML, zoomHTML, rotateHTML } from './tools.js';

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

export function renderDocMode(ctx, vctx) {
  const { scopes, vd, d, dSt } = vctx;

  if (!d) {
    // Просмотрщик — индикатор наличия документов: если они есть (просто ни один
    // не открыт как вкладка), предлагаем выбрать, а не пишем «нет документов» —
    // эта фраза только для случая, когда их правда нет.
    const available = scopes.flatMap((sc) => docListFor(ctx, sc).map((t) => ({ sc, t })));
    if (!available.length) {
      return {
        right: '<span class="vtitle">Документы</span>',
        body: `<div class="vempty"><div class="vempty-box">Нет прикреплённых документов</div><button class="btn btn-primary" data-attach-default>Прикрепить файл</button></div>`,
      };
    }

    return {
      right: '<span class="vtitle">Документы</span>',
      body: `<div class="vempty">
        <div class="vempty-box">Документы есть — выберите, что открыть</div>
        <div class="dd">
          <button class="btn btn-primary btn-sm" data-dd-toggle>Открыть документ ▾</button>
          <div class="dd-menu">${available.map((x) => `<button data-vaddtab="${x.sc}|${x.t.id}">${scopeLabel(x.sc)} · ${esc(x.t.type)} · ${esc(x.t.name)}</button>`).join('')}</div>
        </div>
        <button class="btn btn-ghost btn-sm" data-attach-default>Прикрепить ещё документ</button>
      </div>`,
    };
  }

  const all = [];
  scopes.forEach((sc) => {
    (VS.openTabs[sc] || []).forEach((id) => {
      const t = docListFor(ctx, sc).find((x) => x.id === id);
      if (t) all.push({ sc, t });
    });
  });

  const remaining = [];
  scopes.forEach((sc) => {
    docListFor(ctx, sc).forEach((t) => {
      if (!(VS.openTabs[sc] || []).includes(t.id)) remaining.push({ sc, t });
    });
  });

  // Строка вкладок — только когда открыто больше одного документа: с одним
  // документом она занимала 34px ради одной кнопки. Переключиться на другой
  // документ можно из названия в панели — это выпадающий список.
  const tabsBar = all.length > 1 ? `<div class="vtabs">
    ${all.map((x) => `<button class="vtab ${vd && vd.scope === x.sc && vd.id === x.t.id ? 'active' : ''}" data-vtab="${x.sc}|${x.t.id}">${scopeLabel(x.sc)} · ${esc(x.t.type)}<span data-vtabclose="${x.sc}|${x.t.id}" title="Закрыть вкладку">×</span></button>`).join('')}
  </div>` : '';

  const isCur = (x) => vd && vd.scope === x.sc && vd.id === x.t.id;
  const switcher = `<div class="tool-group vdoc-pick"><div class="dd">
    <button class="vdoc-name" data-dd-toggle title="${esc(d.type)} · ${esc(d.name)} — выбрать другой документ">
      <b>${esc(d.type)}</b><span>${esc(d.name)}</span><i aria-hidden="true">▾</i></button>
    <div class="dd-menu">
      ${all.map((x) => `<button data-vtab="${x.sc}|${x.t.id}" class="${isCur(x) ? 'on' : ''}">${scopeLabel(x.sc)} · ${esc(x.t.type)} · ${esc(x.t.name)}</button>`).join('')}
      ${remaining.length ? '<div class="dd-sep"></div>' : ''}
      ${remaining.map((x) => `<button data-vaddtab="${x.sc}|${x.t.id}">${scopeLabel(x.sc)} · ${esc(x.t.type)} · ${esc(x.t.name)}</button>`).join('')}
      <div class="dd-sep"></div>
      <button data-attach-default>+ Прикрепить документ</button>
    </div></div></div>`;

  const archive = ctx.ui.viewerDoc
    ? `<button class="tool-btn" data-varchive="${esc(d.id)}"
      title="Убрать документ из карточки в архив — его можно будет найти и вернуть">${ICON_ARCHIVE}</button>`
    : '';

  // Документ без страниц — значит без файла. Такие больше не заводятся ни одним
  // из путей прикрепления, но старая запись в памяти вкладки ещё может их иметь:
  // показываем это прямо, а не пустой лентой.
  if (!d.pages.length) {
    return {
      tabsBar,
      tools: switcher,
      right: archive,
      body: `<div class="vempty"><div class="vempty-box">Файл не прикреплён</div><button class="btn btn-primary" data-attach-default>Прикрепить файл</button></div>`,
    };
  }

  const tools = `${switcher}${pagerHTML(dSt.page, d.pages.length)}${zoomHTML('doc')}${rotateHTML()}`;

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
      data-vthumb="${i + 1}" draggable="true" title="Страница ${i + 1} — перетащите, чтобы изменить порядок; Ctrl+клик — выбрать несколько">
      ${p.kind === 'pdf' ? `<canvas class="vthumb-canvas" data-pdf-src="${p.src}" data-pdf-url="${d.file.dataUrl}" data-pdf-thumb="96"></canvas>` : ''}
      <button class="vthumb-del" data-vdelpage="${i + 1}" title="Убрать страницу">×</button><span class="vthumb-num">${i + 1}</span></div>`).join('')}
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
