import { esc } from '../../../../kernel/dom.js';

// Убрать документ в архив: коробка с крышкой. Значком, а не словом — панель
// просмотрщика узкая, и все её кнопки значковые.
const ICON_ARCHIVE = `<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
  <path d="M1.6 3.2h10.8v2.2H1.6zM2.6 5.4h8.8v6.1H2.6zM5.4 7.8h3.2"
    fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
import { docListFor, scopeLabel } from '../docs/model.js';
import { VS } from './state.js';

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
    const toolbar = `<div class="vtoolbar"><div class="tool-group right"><span class="vtitle">Документы</span><button class="tool-btn" data-vclose>×</button></div></div>`;

    // Просмотрщик — индикатор наличия документов: если они есть (просто ни один
    // не открыт как вкладка), предлагаем выбрать, а не пишем «нет документов» —
    // эта фраза только для случая, когда их правда нет.
    const available = scopes.flatMap((sc) => docListFor(ctx, sc).map((t) => ({ sc, t })));
    if (!available.length) {
      return {
        toolbar,
        body: `<div class="vempty"><div class="vempty-box">Нет прикреплённых документов</div><button class="btn btn-primary" data-attach-default>Прикрепить файл</button></div>`,
      };
    }

    return {
      toolbar,
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

  const tabsBar = `<div class="vtabs">
    ${all.map((x) => `<button class="vtab ${vd && vd.scope === x.sc && vd.id === x.t.id ? 'active' : ''}" data-vtab="${x.sc}|${x.t.id}">${scopeLabel(x.sc)} · ${esc(x.t.type)}${all.length > 1 ? `<span data-vtabclose="${x.sc}|${x.t.id}">×</span>` : ''}</button>`).join('')}
    ${remaining.length ? `<div class="dd"><button class="btn btn-ghost btn-sm" data-dd-toggle style="margin:0 0 4px 4px">+ документ</button>
      <div class="dd-menu">${remaining.map((x) => `<button data-vaddtab="${x.sc}|${x.t.id}">${scopeLabel(x.sc)} · ${esc(x.t.type)} · ${esc(x.t.name)}</button>`).join('')}</div></div>` : ''}
  </div>`;

  // Документ без страниц — значит без файла. Такие больше не заводятся ни одним
  // из путей прикрепления, но старая запись в памяти вкладки ещё может их иметь:
  // показываем это прямо, а не пустой лентой.
  if (!d.pages.length) {
    return {
      tabsBar,
      toolbar: `<div class="vtoolbar"><div class="tool-group right"><span class="vtitle">${esc(d.type)} · ${esc(d.name)}</span><button class="tool-btn" data-vclose>×</button></div></div>`,
      body: `<div class="vempty"><div class="vempty-box">Файл не прикреплён</div><button class="btn btn-primary" data-attach-default>Прикрепить файл</button></div>`,
    };
  }

  const toolbar = `<div class="vtoolbar">
    <div class="tool-group"><button class="tool-btn" data-vprev>‹</button>
      <input class="page-input" data-vpage value="${dSt.page}"><span class="muted">/ ${d.pages.length}</span>
      <button class="tool-btn" data-vnext>›</button></div>
    <div class="tool-group"><button class="tool-btn" data-vrot>⟳</button></div>
    <div class="tool-group"><button class="tool-btn" data-vzoom->−</button><span class="zoom-label" data-zoomlabel>${VS.zoom}%</span><button class="tool-btn" data-vzoom+>+</button></div>
    <div class="tool-group right"><span class="vtitle">${esc(d.type)} · ${esc(d.name)}</span>
      ${ctx.ui.viewerDoc && ctx.ui.viewerDoc.scope !== 'mech-new'
        ? `<button class="tool-btn" data-varchive="${esc(d.id)}"
        title="Убрать документ из карточки в архив — его можно будет найти и вернуть">${ICON_ARCHIVE}</button>`
        : ''}
      <button class="tool-btn" data-vclose>×</button></div>
  </div>`;

  // Удаление страницы — «отрезать» пустые/лишние страницы скана; сам файл при
  // этом не меняется, отрезание живёт на уровне списка страниц. Кнопки
  // «+ Страница» больше нет: добавлять было нечего, кроме нарисованного пустого
  // листа, а такие листы убраны совсем.
  //
  // Миниатюра реальной страницы — тот же canvas, что и большой лист, но с
  // data-pdf-thumb (фиксированная ширина, от зума не зависит): раньше все
  // миниатюры были одинаковыми схематичными полосками и по ним нельзя было
  // понять, где какая страница. draggable — перетаскивание для смены порядка,
  // Ctrl+клик — множественный выбор (см. parts/viewer/ctrl.js).
  const sel = ctx.ui.pageSel || [];
  const railOff = ctx.ui.railCollapsed === true;
  const body = `<div class="vbody"><div class="vrail ${railOff ? 'collapsed' : ''}">
    <div class="vrail-toggle" data-vrail-toggle title="${railOff ? 'Показать миниатюры' : 'Скрыть миниатюры'}">${railOff ? '»' : '« Миниатюры'}</div>
    <div class="vrail-list" data-vrail-list>
    ${d.pages.map((p, i) => `<div class="vthumb doc ${p.kind === 'pdf' ? 'real' : ''} ${i + 1 === dSt.page ? 'active' : ''} ${sel.includes(i + 1) ? 'sel' : ''}"
      data-vthumb="${i + 1}" draggable="true" title="Страница ${i + 1} — перетащите, чтобы изменить порядок; Ctrl+клик — выбрать несколько">
      ${p.kind === 'pdf' ? `<canvas class="vthumb-canvas" data-pdf-src="${p.src}" data-pdf-url="${d.file.dataUrl}" data-pdf-thumb="128"></canvas>` : ''}
      <button class="vthumb-del" data-vdelpage="${i + 1}">×</button><span class="vthumb-num">${i + 1}</span></div>`).join('')}
    </div></div>
    <div class="vstage" data-vstage><div class="vribbon" data-vribbon>
      ${d.pages.map((p, i) => `<div class="vpage-wrap" data-vpageblk="${i + 1}"><div class="vpage" data-vpageinner style="transform:rotate(${dSt.rot}deg)">${docPageHTML(d, i + 1)}</div></div>`).join('')}
    </div></div></div>`;

  return { tabsBar, toolbar, body };
}
