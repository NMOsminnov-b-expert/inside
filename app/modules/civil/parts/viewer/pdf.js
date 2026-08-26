// Отрисовка реальных PDF в макетные «листы» просмотрщика.
//
// Зачем вообще: до этого реальный файл вставлялся как <embed src="blob:">, то есть
// внутрь листа попадал встроенный PDF-ридер браузера со своей панелью, скроллом и
// зумом — и все органы управления макета (лента миниатюр, «‹ n/N ›», зум, поворот)
// на реальном документе не работали. Здесь каждая страница рисуется в свой <canvas>
// внутри обычного .vpage, поэтому весь уже написанный функционал просмотрщика
// работает на реальном PDF ровно так же, как на заглушках.
//
// PDF.js — единственная внешняя зависимость проекта, лежит копией в app/vendor/pdfjs
// (см. README там же, в т.ч. почему .js, а не .mjs). Грузится ленивым import() —
// у того, кто не открывал ни одного PDF, ~1.7 МБ не скачиваются вовсе.

const VENDOR = '../../../../vendor/pdfjs/pdf.min.js';
const WORKER = new URL('../../../../vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;

let libPromise = null;

function loadLib() {
  if (!libPromise) {
    libPromise = import(VENDOR).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = WORKER;
      return lib;
    });
  }
  return libPromise;
}

// Документ парсится один раз на файл, а не на каждую перерисовку интерфейса.
const docCache = new Map();   // blobUrl -> Promise<PDFDocumentProxy>

function loadDoc(blobUrl) {
  if (!docCache.has(blobUrl)) {
    docCache.set(blobUrl, loadLib().then((lib) => lib.getDocument(blobUrl).promise));
  }
  return docCache.get(blobUrl);
}

// Число страниц нужно в момент прикрепления файла — из него строится d.pages,
// а значит и лента миниатюр, и счётчик «/ N» (см. parts/docs/model.js).
export async function getPdfPageCount(blobUrl) {
  try {
    const doc = await loadDoc(blobUrl);
    return doc.numPages;
  } catch (e) {
    console.warn('PDF: не удалось прочитать число страниц', e);
    return 1;
  }
}

// Соотношение сторон первой страницы — чтобы лист принял пропорции реального
// документа (альбомный скан не должен растягиваться в портретный min-height).
export async function getPdfAspect(blobUrl) {
  try {
    const doc = await loadDoc(blobUrl);
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    return vp.height / vp.width;
  } catch {
    return null;
  }
}

// Отрисованное состояние конкретного canvas: чтобы не перерисовывать страницу на
// каждый клик по интерфейсу (ctx.render() зовётся часто), но перерисовывать при
// реальной смене масштаба — иначе canvas мылится при зуме.
const painted = new WeakMap();  // canvas -> `${blobUrl}|${srcPage}|${bucket}`

// Масштаб рендера берётся из ФАКТИЧЕСКОЙ ширины листа, а не из константы: в режиме
// «Сравнение» лист узкий (.cmp-body .vpage{width:380px}) против 430px в обычном
// режиме, и на константе страница оказалась бы мыльной или обрезанной.
function renderScaleFor(canvas, viewportAt1) {
  const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth || 430;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return (cssWidth / viewportAt1.width) * dpr;
}

// «Ступени» зума: перерисовываем не на каждый процент, а при заметном изменении,
// иначе на каждом шаге зума пересчитывался бы весь документ.
function zoomBucket(zoom) {
  return Math.round(zoom / 25) * 25;
}

async function paintOne(canvas, zoom) {
  const blobUrl = canvas.dataset.pdfUrl;
  const srcPage = +canvas.dataset.pdfSrc;
  if (!blobUrl || !srcPage) return;

  const key = `${blobUrl}|${srcPage}|${zoomBucket(zoom)}`;
  if (painted.get(canvas) === key) return;

  const doc = await loadDoc(blobUrl);
  const page = await doc.getPage(Math.min(srcPage, doc.numPages));

  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: renderScaleFor(canvas, base) });

  // Canvas мог уйти из DOM, пока грузилась страница (пользователь переключил
  // вкладку/режим) — тогда рисовать некуда и незачем.
  if (!canvas.isConnected) return;

  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  canvas.style.aspectRatio = `${base.width} / ${base.height}`;

  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  canvas.classList.add('ready');
  painted.set(canvas, key);
}

// Вызывается после отрисовки экрана (bindViewer): canvas'ы уже в DOM, но пустые.
export function paintPdfCanvases(ctx, zoom) {
  ctx.scope.$$('canvas[data-pdf-src]').forEach((canvas) => {
    paintOne(canvas, zoom).catch((e) => {
      console.warn('PDF: не удалось отрисовать страницу', e);
      canvas.classList.add('failed');
    });
  });
}
