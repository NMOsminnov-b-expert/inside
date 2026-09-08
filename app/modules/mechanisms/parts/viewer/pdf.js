// Отрисовка реальных PDF в макетные «листы» просмотрщика и в миниатюры.
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
// Кэш ограничен: на каждый разобранный документ PDF.js держит рабочий поток и
// его буферы, и без предела память вкладки росла бы весь рабочий день. Больше
// нескольких документов одновременно всё равно не смотрят, а вытесненный
// разберётся заново при следующем открытии.
const DOC_CACHE_LIMIT = 6;
const docCache = new Map();   // blobUrl -> Promise<PDFDocumentProxy>

function touch(blobUrl) {
  // Map помнит порядок вставки: перекладываем в конец, чтобы вытеснялся тот,
  // к которому дольше всех не обращались.
  const v = docCache.get(blobUrl);
  docCache.delete(blobUrl);
  docCache.set(blobUrl, v);
}

// Освободить разобранный документ. Вызывается при вытеснении из кэша и при
// окончательном удалении файла (parts/docs/model.js).
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

// Соотношение сторон КАЖДОЙ страницы — чтобы лист принял пропорции реальной
// страницы ещё до её отрисовки. Раньше бралась пропорция только первой страницы
// и применялась ко всем: в документе со смешанной ориентацией альбомная
// страница до отрисовки сидела в портретном боксе и выглядела перевёрнутой.
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

// Что уже нарисовано в конкретном canvas: чтобы не перерисовывать страницу на
// каждый клик по интерфейсу (ctx.render() зовётся часто), но перерисовывать при
// реальной смене масштаба — иначе canvas мылится при зуме.
const painted = new WeakMap();  // canvas -> ключ (url|страница|ступень масштаба)

// Масштаб рендера. Берётся из ФАКТИЧЕСКОЙ ширины листа, а не из константы: в
// режиме «Сравнение» лист узкий (.cmp-body .vpage{width:380px}) против 430px в
// обычном режиме, и на константе страница оказалась бы мыльной или обрезанной.
//
// Зум ОБЯЗАТЕЛЬНО входит в масштаб: лист увеличивается через CSS zoom на ленте,
// то есть растягивается уже готовый битмап. Без этого множителя на 200% в canvas
// шириной 430px показывалось 860px — ровно вдвое мыльно.
function renderScaleFor(canvas, viewportAt1, zoom) {
  const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth || 430;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const zoomFactor = Math.max(1, (zoom || 100) / 100);
  return Math.min(MAX_SCALE, (cssWidth / viewportAt1.width) * dpr * zoomFactor);
}

// «Ступень» масштаба = шаг зума в интерфейсе (10%). Более крупная ступень
// экономила бы перерисовки, но тогда битмап не совпадает с реальным размером
// показа и страница слегка мылится — именно на это была жалоба.
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

  // Миниатюра рисуется в фиксированную ширину и от зума не зависит.
  const scale = thumbWidth
    ? (thumbWidth * Math.min(window.devicePixelRatio || 1, 2)) / base.width
    : renderScaleFor(canvas, base, zoom);

  // В ключ входит и фактическая ширина листа: она меняется не только зумом —
  // в «Сравнении» половину можно свернуть, и оставшийся лист становится вдвое
  // шире. Без ширины в ключе страница считалась бы уже нарисованной и
  // растягивалась бы старым битмапом, то есть мылилась.
  const widthBucket = Math.round((canvas.clientWidth || 0) / 20) * 20;
  const key = `${blobUrl}|${srcPage}|${thumbWidth ? 'thumb' : zoomBucket(zoom) + '|' + widthBucket}`;
  if (painted.get(canvas) === key) return;

  const viewport = page.getViewport({ scale });

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
// Сюда попадают и большие страницы, и миниатюры — у миниатюр свой data-атрибут
// с целевой шириной, потому что их разрешение не зависит от зума ленты.
//
// root — необязательное ограничение области. Обязателен там, где зум свой у
// каждого блока (режим «Сравнение»): без него смена зума в одной колонке
// перерисовывала бы страницы и в другой, чужим масштабом.
export function paintPdfCanvases(ctx, zoom, root) {
  const within = root || ctx.scope.root;
  within.querySelectorAll('canvas[data-pdf-src]').forEach((canvas) => {
    const thumbWidth = canvas.dataset.pdfThumb ? +canvas.dataset.pdfThumb : 0;
    paintOne(canvas, zoom, thumbWidth).catch((e) => {
      console.warn('PDF: не удалось отрисовать страницу', e);
      canvas.classList.add('failed');
    });
  });
}
