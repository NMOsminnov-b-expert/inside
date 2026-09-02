// Отрисовка реальных PDF в просмотрщике «Документов» — копия
// modules/*/parts/viewer/pdf.js на уровне kernel (реестр «Документы» не
// зависит от типов ОЦ и не может импортировать код модуля).
//
// Каждая страница рисуется в свой <canvas> внутри обычного .vpage — так весь
// функционал просмотрщика (лента миниатюр, «‹ n/N ›», зум, поворот) работает
// на реальном PDF, а не только на встроенном ридере браузера (<embed>).
//
// PDF.js лежит копией в app/vendor/pdfjs (см. README там же). Грузится
// ленивым import() — у того, кто не открыл ни одного PDF, ~1.7 МБ не
// скачиваются вовсе.
const VENDOR = '../vendor/pdfjs/pdf.min.js';
const WORKER = new URL('../vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;

// Верхняя граница разрешения рендера: без неё на 400% зума канвас A4 раздувался бы
// в десятки мегапикселей на страницу.
const MAX_SCALE = 9;

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
// Кэш ограничен — без предела память вкладки росла бы весь рабочий день.
const DOC_CACHE_LIMIT = 6;
const docCache = new Map();   // blobUrl -> Promise<PDFDocumentProxy>

function touch(blobUrl) {
  const v = docCache.get(blobUrl);
  docCache.delete(blobUrl);
  docCache.set(blobUrl, v);
}

// Освободить разобранный документ — при вытеснении из кэша и при
// окончательном удалении файла (kernel/documentsRegistry.js).
export function releasePdf(blobUrl) {
  const entry = docCache.get(blobUrl);
  if (!entry) return;
  docCache.delete(blobUrl);
  Promise.resolve(entry).then((doc) => doc && doc.destroy && doc.destroy()).catch(() => {});
}

function loadDoc(blobUrl) {
  if (docCache.has(blobUrl)) {
    touch(blobUrl);
    return docCache.get(blobUrl);
  }

  docCache.set(blobUrl, loadLib().then((lib) => lib.getDocument(blobUrl).promise));
  while (docCache.size > DOC_CACHE_LIMIT) {
    releasePdf(docCache.keys().next().value);
  }
  return docCache.get(blobUrl);
}

// Число страниц нужно в момент прикрепления файла — из него строится
// f.pages (лента миниатюр, счётчик «/ N»).
export async function getPdfPageCount(blobUrl) {
  try {
    const doc = await loadDoc(blobUrl);
    return doc.numPages;
  } catch (e) {
    console.warn('PDF: не удалось прочитать число страниц', e);
    return 1;
  }
}

// Соотношение сторон КАЖДОЙ страницы — чтобы лист принял пропорции реальной
// страницы ещё до отрисовки (документ со смешанной ориентацией иначе на миг
// показывает альбомную страницу в портретном боксе).
export async function getPdfPageAspects(blobUrl) {
  try {
    const doc = await loadDoc(blobUrl);
    const out = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const vp = (await doc.getPage(n)).getViewport({ scale: 1 });
      out.push(vp.height / vp.width);
    }
    return out;
  } catch (e) {
    console.warn('PDF: не удалось прочитать пропорции страниц', e);
    return [];
  }
}

const painted = new WeakMap();  // canvas -> ключ (url|страница|ступень масштаба)

function renderScaleFor(canvas, viewportAt1, zoom) {
  const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth || 430;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const zoomFactor = Math.max(1, (zoom || 100) / 100);
  return Math.min(MAX_SCALE, (cssWidth / viewportAt1.width) * dpr * zoomFactor);
}

function zoomBucket(zoom) {
  return Math.round((zoom || 100) / 10) * 10;
}

async function paintOne(canvas, zoom, thumbWidth) {
  const blobUrl = canvas.dataset.pdfUrl;
  const srcPage = +canvas.dataset.pdfSrc;
  if (!blobUrl || !srcPage) return;

  const doc = await loadDoc(blobUrl);
  const page = await doc.getPage(Math.min(srcPage, doc.numPages));
  const base = page.getViewport({ scale: 1 });

  const scale = thumbWidth
    ? (thumbWidth * Math.min(window.devicePixelRatio || 1, 2)) / base.width
    : renderScaleFor(canvas, base, zoom);

  const widthBucket = Math.round((canvas.clientWidth || 0) / 20) * 20;
  const key = `${blobUrl}|${srcPage}|${thumbWidth ? 'thumb' : zoomBucket(zoom) + '|' + widthBucket}`;
  if (painted.get(canvas) === key) return;

  const viewport = page.getViewport({ scale });

  if (!canvas.isConnected) return;

  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  canvas.style.aspectRatio = `${base.width} / ${base.height}`;

  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  canvas.classList.add('ready');
  painted.set(canvas, key);
}

// Вызывается после отрисовки экрана: canvas'ы уже в DOM, но пустые.
// root — элемент, внутри которого искать canvas'ы (просмотрщик документа).
export function paintPdfCanvases(root, zoom) {
  if (!root) return;
  root.querySelectorAll('canvas[data-pdf-src]').forEach((canvas) => {
    const thumbWidth = canvas.dataset.pdfThumb ? +canvas.dataset.pdfThumb : 0;
    paintOne(canvas, zoom, thumbWidth).catch((e) => {
      console.warn('PDF: не удалось отрисовать страницу', e);
      canvas.classList.add('failed');
    });
  });
}
