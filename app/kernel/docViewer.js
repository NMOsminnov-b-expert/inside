// Полноценный просмотрщик документа — тот же подход, что в карточках ОЦ/ОИ
// (modules/*/parts/viewer/{doc,pdf,state}.js): реальный PDF рисуется по
// страницам в canvas (kernel/pdfRender.js), с лентой миниатюр, зумом,
// поворотом и прокруткой всей ленты страниц (а не встроенным ридером браузера
// или показом только одной страницы за раз) — навигация («‹ n/N ›», клик по
// миниатюре) прокручивает к нужному блоку, а обратное — прокрутка ленты
// колесом/мышью — сама меняет номер текущей страницы (см. bindViewer: тот же
// приём, что в modules/civil/parts/viewer/ctrl.js: 342-374).
//
// Живёт в ядре, потому что нужен двум разделам: реестру «Документы» и
// учреждениям (у учреждения свои документы — решение пользователя 03.09.2026).
// Стили — kernel/docViewer.css, их подключает страница через host.ensureStyle.
//
// Урезано по сравнению с карточкой ОЦ: здесь нет вкладок/ОИ, режима «Фото»,
// режима «Сравнение» и перестановки страниц — реестру «Документы» они не
// нужны (документ — самостоятельная сущность, не привязанная к литере ОИ).
// Если у документа несколько файлов — между ними переключаются вкладки.
import { esc } from './dom.js';
import { ensureFilePages } from './fileUpload.js';
import { paintPdfCanvases } from './pdfRender.js';

const VS = { zoom: 100 };
const fileState = {}; // fileId -> { page, rot, scroll }

function stFor(f) {
  return fileState[f.id] || (fileState[f.id] = { page: 1, rot: 0, scroll: 0 });
}

// Смена масштаба не должна перелистывать документ — см.
// modules/civil/parts/viewer/state.js:keepPageOnZoom (тот же приём: до
// изменения запоминаем, какой лист сейчас вверху и насколько он прокручен,
// после — возвращаемся ровно туда же, а не к началу страницы).
function keepPageOnZoom(stage, apply) {
  if (!stage) { apply(); return; }

  const top = stage.getBoundingClientRect().top;
  const blocks = Array.from(stage.querySelectorAll('[data-vpageblk]'));

  let anchor = blocks[0] || null;
  blocks.forEach((b) => { if (b.getBoundingClientRect().top - top <= 60) anchor = b; });

  let frac = 0;
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    frac = r.height ? Math.min(1, Math.max(0, (top - r.top) / r.height)) : 0;
  }

  const atBottom = stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2;

  apply();

  if (atBottom) { stage.scrollTop = stage.scrollHeight; return; }
  if (!anchor) return;

  const r2 = anchor.getBoundingClientRect();
  stage.scrollTop += (r2.top - stage.getBoundingClientRect().top) + frac * r2.height;
}

function pdfPageHTML(f, page) {
  const ratio = (f.pageAspects || [])[page.src - 1] || f.aspect;
  const aspect = ratio ? `aspect-ratio:1 / ${ratio};` : '';
  return `<canvas class="vpdf-canvas" style="${aspect}"
    data-pdf-src="${page.src}" data-pdf-url="${f.dataUrl}" aria-label="${esc(f.name)} · страница ${page.src}"></canvas>
    <div class="vpdf-load"><div class="sk-h"></div>${[100, 92, 96, 85].map((w) => `<div class="sk-line" style="width:${w}%"></div>`).join('')}</div>`;
}

function imagePageHTML(f) {
  return `<img class="vimg" src="${f.dataUrl}" alt="${esc(f.name)}">`;
}

function otherPageHTML(f) {
  return `<div class="vempty-box">Предпросмотр недоступен для этого типа файла (${esc(f.mime || 'неизвестный формат')}).</div>
<a class="btn btn-primary btn-sm" href="${f.dataUrl}" download="${esc(f.name)}" style="margin-top:8px;display:inline-block">Скачать «${esc(f.name)}»</a>`;
}

function pageHTML(f, n) {
  const page = f.pages[n - 1];
  if (!page) return '';
  if (page.kind === 'pdf') return pdfPageHTML(f, page);
  if (page.kind === 'image') return imagePageHTML(f);
  return otherPageHTML(f);
}

// activeFileId — какой из doc.files сейчас открыт; null/не найден → первый.
export function viewerHTML(doc, activeFileId) {
  const files = doc.files || [];
  if (!files.length) return '';

  const f = files.find((x) => x.id === activeFileId) || files[0];
  ensureFilePages(f);
  const st = stFor(f);
  st.page = Math.min(Math.max(1, st.page), f.pages.length);

  const tabsBar = files.length > 1 ? `<div class="vtabs">
    ${files.map((x) => `<button class="vtab ${x.id === f.id ? 'active' : ''}" data-vftab="${esc(x.id)}">${esc(x.name)}</button>`).join('')}
  </div>` : '';

  const toolbar = `<div class="vtoolbar">
    <div class="tool-group"><button class="tool-btn" data-vprev ${st.page <= 1 ? 'disabled' : ''}>‹</button>
      <input class="page-input" data-vpage value="${st.page}"><span class="muted">/ ${f.pages.length}</span>
      <button class="tool-btn" data-vnext ${st.page >= f.pages.length ? 'disabled' : ''}>›</button></div>
    <div class="tool-group"><button class="tool-btn" data-vrot>⟳</button></div>
    <div class="tool-group"><button class="tool-btn" data-vzoom->−</button><span class="zoom-label" data-zoomlabel>${VS.zoom}%</span><button class="tool-btn" data-vzoom+>+</button></div>
    <div class="tool-group right"><span class="vtitle">${esc(f.name)}</span></div>
  </div>`;

  const body = `<div class="vbody"><div class="vrail"><div class="vrail-list">
    ${f.pages.map((p, i) => `<div class="vthumb doc ${p.kind === 'pdf' ? 'real' : ''} ${i + 1 === st.page ? 'active' : ''}"
      data-vthumb="${i + 1}" title="Страница ${i + 1}">
      ${p.kind === 'pdf' ? `<canvas class="vthumb-canvas" data-pdf-src="${p.src}" data-pdf-url="${f.dataUrl}" data-pdf-thumb="128"></canvas>` : ''}
      <span class="vthumb-num">${i + 1}</span></div>`).join('')}
    </div></div>
    <div class="vstage" data-vstage><div class="vribbon" data-vribbon style="zoom:${VS.zoom / 100}">
      ${f.pages.map((p, i) => `<div class="vpage-wrap" data-vpageblk="${i + 1}"><div class="vpage" data-vpageinner style="transform:rotate(${st.rot}deg)">${pageHTML(f, i + 1)}</div></div>`).join('')}
    </div></div></div>`;

  return `<div class="viewer">${tabsBar}${toolbar}${body}</div>`;
}

export function bindViewer(scope, { doc, activeFileId, onFileChange }) {
  const files = doc.files || [];
  const f = files.find((x) => x.id === activeFileId) || files[0];
  if (!f) return;

  const st = stFor(f);

  function updateToolbar() {
    const inp = scope.$('[data-vpage]');
    if (inp) inp.value = st.page;
    scope.$$('[data-vthumb]').forEach((t) => t.classList.toggle('active', +t.dataset.vthumb === st.page));

    const vpr = scope.$('[data-vprev]');
    if (vpr) vpr.disabled = st.page <= 1;
    const vn = scope.$('[data-vnext]');
    if (vn) vn.disabled = st.page >= f.pages.length;
  }

  // Переход по кнопке/миниатюре — прокрутка ленты к нужному блоку (а не
  // мгновенный прыжок), как в карточке ОЦ.
  function go(n) {
    st.page = Math.min(f.pages.length, Math.max(1, n));
    updateToolbar();

    const blk = scope.$(`[data-vpageblk="${st.page}"]`);
    const vs = scope.$('[data-vstage]');
    if (blk && vs) {
      const r = blk.getBoundingClientRect();
      const s = vs.getBoundingClientRect();
      vs.scrollTo({ top: vs.scrollTop + (r.top - s.top) - 10, behavior: 'smooth' });
    }
  }

  const vp = scope.$('[data-vpage]');
  if (vp) vp.onchange = () => go(+vp.value || 1);

  const vpr = scope.$('[data-vprev]');
  if (vpr) vpr.onclick = () => go(st.page - 1);

  const vn = scope.$('[data-vnext]');
  if (vn) vn.onclick = () => go(st.page + 1);

  const vr = scope.$('[data-vrot]');
  if (vr) vr.onclick = () => {
    st.rot = (st.rot + 90) % 360;
    scope.$$('[data-vpageinner]').forEach((p) => { p.style.transform = `rotate(${st.rot}deg)`; });
  };

  function setZoom(z) {
    const vstageEl = scope.$('[data-vstage]');
    keepPageOnZoom(vstageEl, () => {
      VS.zoom = Math.min(500, Math.max(40, z));
      const r = scope.$('[data-vribbon]');
      if (r) r.style.zoom = String(VS.zoom / 100);
      const l = scope.$('[data-zoomlabel]');
      if (l) l.textContent = VS.zoom + '%';
      paintPdfCanvases(scope.root, VS.zoom);
    });
  }

  const zm = scope.$('[data-vzoom-]');
  if (zm) zm.onclick = () => setZoom(VS.zoom - 10);

  const zp = scope.$('[data-vzoom\\+]');
  if (zp) zp.onclick = () => setZoom(VS.zoom + 10);

  scope.$$('[data-vthumb]').forEach((t) => t.onclick = () => go(+t.dataset.vthumb));

  scope.$$('[data-vftab]').forEach((b) => b.onclick = () => { if (onFileChange) onFileChange(b.dataset.vftab); });

  const vstageEl = scope.$('[data-vstage]');
  if (vstageEl) {
    vstageEl.scrollTop = st.scroll || 0;

    // Прокрутка ленты сама меняет текущую страницу — тот же приём, что в
    // modules/civil/parts/viewer/ctrl.js: верхний лист (с запасом 60px) и
    // отдельно случай «долистали до конца» (у последней страницы верх может
    // не дойти до порога, если лента физически не может поднять её выше).
    vstageEl.addEventListener('scroll', () => {
      st.scroll = vstageEl.scrollTop;
      const top = vstageEl.getBoundingClientRect().top;
      let cur = 1;

      const blocks = vstageEl.querySelectorAll('[data-vpageblk]');
      blocks.forEach((bl) => { if (bl.getBoundingClientRect().top - top <= 60) cur = +bl.dataset.vpageblk; });

      const atBottom = vstageEl.scrollTop + vstageEl.clientHeight >= vstageEl.scrollHeight - 2;
      if (atBottom && blocks.length) cur = +blocks[blocks.length - 1].dataset.vpageblk;

      if (cur !== st.page) {
        st.page = cur;
        updateToolbar();
      }
    });

    vstageEl.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(VS.zoom + (e.deltaY < 0 ? 10 : -10));
    }, { passive: false });
  }

  paintPdfCanvases(scope.root, VS.zoom);
}
