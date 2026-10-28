// Съёмка документа на экране осмотрщика (этап В, пункт В1; запись графа
// osmotr-opisey-i-skany-ustroystvo-etapov-b-v): страницы с камеры или из файлов;
// у каждой — четыре угла, которые перетаскиваются поверх затемнённого фона,
// поворот и фильтр (цвет, серый, ч/б); лента страниц с перестановкой и
// удалением. «Готово» выравнивает каждую страницу по её углам
// (перспективное преобразование на canvas) и отдаёт готовые JPEG.
//
// Редактор — блок на экране, не окно. Состояние (страницы, углы, поворот,
// фильтр) живёт в объекте, который создаёт newEditor(): экран осмотрщика
// перерисовывается целиком, и редактор после этого собирается заново
// mountScanEditor() из того же объекта.
//
// Плавность на слабом железе: пока палец тянет угол, перерисовывается только
// рамка (лёгкий слой поверх снимка), а выравнивание — одно, по «Готово».
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: края документа в макете не ищутся — углы стоят с
// отступом от краёв, осмотрщик ставит их сам. Развилка: поиск краёв на
// телефоне (быстрее обратная связь, нужна библиотека компьютерного зрения в
// приложении) или на сервере (угол можно поправить после отправки; сервер
// получает исходный снимок и углы, а не только выровненную страницу).
import { pickFile, pickFiles, isFileTooLarge, MAX_DOC_FILE_MB } from '../../kernel/fileUpload.js';

const MARGIN = 0.04;       // отступ углов от краёв по умолчанию
const PREVIEW_SIDE = 1400; // длинная сторона снимка для показа на экране
const SRC_SIDE = 3000;     // длинная сторона исходника для выравнивания
const OUT_SIDE = 2000;     // длинная сторона готовой страницы
const OUT_QUALITY = 0.85;  // качество JPEG
const FILTERS = [
  { key: 'color', label: 'Цвет' },
  { key: 'gray', label: 'Серый' },
  { key: 'bw', label: 'Ч/б' },
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const defaultCorners = () => [
  { x: MARGIN, y: MARGIN }, { x: 1 - MARGIN, y: MARGIN },
  { x: 1 - MARGIN, y: 1 - MARGIN }, { x: MARGIN, y: 1 - MARGIN },
];

export const newEditor = () => ({ pages: [], cur: 0 });

// Размер страницы в её нынешнем повороте.
const dimsOf = (p) => (p.rot % 180 ? { w: p.h, h: p.w } : { w: p.w, h: p.h });

// Нарисовать снимок с поворотом в canvas заданного размера (размер — в
// повёрнутом виде).
function paintRot(cv, src, rot, w, h) {
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  const c = cv.getContext('2d');
  const sw = rot % 180 ? cv.height : cv.width;
  const sh = rot % 180 ? cv.width : cv.height;
  c.save();
  c.translate(cv.width / 2, cv.height / 2);
  c.rotate((rot * Math.PI) / 180);
  c.drawImage(src, -sw / 2, -sh / 2, sw, sh);
  c.restore();
}

// Загрузить файлы как страницы редактора. Что не открылось как картинка —
// пропускается; возвращает число пропущенных.
export async function addEditorPages(ed, files) {
  let bad = 0;
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch (e) {
      URL.revokeObjectURL(url);
      bad += 1;
      continue;
    }
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const k = Math.min(1, PREVIEW_SIDE / Math.max(w, h));
    const prev = document.createElement('canvas');
    prev.width = Math.max(1, Math.round(w * k));
    prev.height = Math.max(1, Math.round(h * k));
    prev.getContext('2d').drawImage(img, 0, 0, prev.width, prev.height);
    ed.pages.push({ id: 'se-' + Math.random().toString(36).slice(2, 9), url, img, prev, w, h, rot: 0, filter: 'color', corners: defaultCorners() });
  }
  if (files.length && ed.pages.length) ed.cur = ed.pages.length - 1;
  return bad;
}

export function disposeEditor(ed) {
  (ed.pages || []).forEach((p) => { try { URL.revokeObjectURL(p.url); } catch (e) { /* уже */ } });
  ed.pages = [];
  ed.cur = 0;
}

// --- выравнивание по углам --------------------------------------------------

// Углы по кругу: верхний левый, верхний правый, нижний правый, нижний левый.
function orderQuad(pts) {
  const by = (f, pick) => pts.reduce((a, b) => (pick(f(b), f(a)) ? b : a));
  const tl = by((p) => p.x + p.y, (a, b) => a < b);
  const br = by((p) => p.x + p.y, (a, b) => a > b);
  const tr = by((p) => p.x - p.y, (a, b) => a > b);
  const bl = by((p) => p.x - p.y, (a, b) => a < b);
  return [tl, tr, br, bl];
}

// Гомография из прямоугольника результата (u,v) в четырёхугольник исходника
// (x,y): восемь коэффициентов, решение системы 8×8 методом Гаусса.
function homography(dst, src) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = dst[i];
    const { x, y } = src[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  for (let c = 0; c < 8; c++) {
    let m = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
    if (Math.abs(A[m][c]) < 1e-9) throw new Error('вырожденный четырёхугольник');
    [A[c], A[m]] = [A[m], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row, i) => row[8] / row[i]);
}

// Обратное отображение по пикселям с билинейной выборкой.
function warp(srcCv, quad, W, H) {
  const sw = srcCv.width;
  const sh = srcCv.height;
  const sd = srcCv.getContext('2d').getImageData(0, 0, sw, sh).data;
  const h = homography([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], quad);
  const out = new ImageData(W, H);
  const od = out.data;
  let o = 0;
  for (let v = 0; v < H; v++) {
    const vv = v + 0.5;
    for (let u = 0; u < W; u++, o += 4) {
      const uu = u + 0.5;
      const d = h[6] * uu + h[7] * vv + 1;
      const x = clamp((h[0] * uu + h[1] * vv + h[2]) / d - 0.5, 0, sw - 1);
      const y = clamp((h[3] * uu + h[4] * vv + h[5]) / d - 0.5, 0, sh - 1);
      const x0 = x | 0;
      const y0 = y | 0;
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = x - x0;
      const fy = y - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      od[o] = sd[i00] * w00 + sd[i10] * w10 + sd[i01] * w01 + sd[i11] * w11;
      od[o + 1] = sd[i00 + 1] * w00 + sd[i10 + 1] * w10 + sd[i01 + 1] * w01 + sd[i11 + 1] * w11;
      od[o + 2] = sd[i00 + 2] * w00 + sd[i10 + 2] * w10 + sd[i01 + 2] * w01 + sd[i11 + 2] * w11;
      od[o + 3] = 255;
    }
  }
  return out;
}

// Серый и чёрно-белый: порог чёрно-белого — по Оцу (одна гистограмма).
function applyFilter(img, kind) {
  if (kind === 'color') return;
  const d = img.data;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
    d[i] = d[i + 1] = d[i + 2] = g;
    hist[g] += 1;
  }
  if (kind !== 'bw') return;
  const total = d.length / 4;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let wB = 0;
  let sB = 0;
  let best = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sB += t * hist[t];
    const between = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > thr ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
}

const toBlob = (cv) => new Promise((res) => cv.toBlob(res, 'image/jpeg', OUT_QUALITY));
const idle = () => new Promise((r) => setTimeout(r, 0));

// Одна страница → готовый JPEG-файл.
async function renderPage(p, n) {
  const { w: dw, h: dh } = dimsOf(p);
  const k = Math.min(1, SRC_SIDE / Math.max(dw, dh));
  const src = document.createElement('canvas');
  paintRot(src, p.img, p.rot, dw * k, dh * k);
  const px = p.corners.map((c) => ({ x: c.x * src.width, y: c.y * src.height }));
  let quad = orderQuad(px);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let W = Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2]));
  let H = Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]));
  const ko = Math.min(1, OUT_SIDE / Math.max(W, H, 1));
  W = Math.max(1, Math.round(W * ko));
  H = Math.max(1, Math.round(H * ko));
  let img;
  try {
    img = warp(src, quad, W, H);
  } catch (e) {
    // Вырожденные углы — берём страницу целиком.
    quad = [{ x: 0, y: 0 }, { x: src.width, y: 0 }, { x: src.width, y: src.height }, { x: 0, y: src.height }];
    W = src.width;
    H = src.height;
    img = warp(src, quad, W, H);
  }
  applyFilter(img, p.filter);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  out.getContext('2d').putImageData(img, 0, 0);
  const blob = await toBlob(out);
  src.width = src.height = out.width = out.height = 0;
  return new File([blob], `скан-стр-${n}.jpg`, { type: 'image/jpeg' });
}

// Все страницы → файлы. progress(i, n) — для подписи кнопки.
export async function renderPages(ed, progress) {
  const files = [];
  for (let i = 0; i < ed.pages.length; i++) {
    if (progress) progress(i + 1, ed.pages.length);
    await idle();
    files.push(await renderPage(ed.pages[i], i + 1));
  }
  return files;
}

// --- экран --------------------------------------------------------------------

const ROT_ICO = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M15.5 10a5.5 5.5 0 1 1-1.8-4.1M15 3v3.5h-3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function html(ed) {
  const n = ed.pages.length;
  const p = ed.pages[ed.cur];
  const strip = n ? `<ul class="sced-strip" aria-label="Страницы документа">${ed.pages.map((q, i) => `<li>
      <button type="button" class="sced-th ${i === ed.cur ? 'on' : ''}" data-sced-pick="${i}" aria-label="Страница ${i + 1} из ${n}" aria-current="${i === ed.cur}"><canvas data-sced-th="${i}"></canvas><b>${i + 1}</b></button></li>`).join('')}</ul>` : '';
  return `<div class="sced">
    ${p ? `<div class="sced-wrap" data-sced-wrap>
        <div class="sced-stage" data-sced-stage>
          <canvas class="sced-img" data-sced-img></canvas>
          <canvas class="sced-ov" data-sced-ov></canvas>
          ${[0, 1, 2, 3].map((i) => `<button type="button" class="sced-h" data-sced-h="${i}" aria-label="Угол ${i + 1} из 4: перетащите, стрелки — сдвиг"></button>`).join('')}
        </div>
      </div>
      <p class="ins-hint sced-hint">Перетащите углы на края документа.</p>
      <div class="sced-tools">
        <button type="button" class="ins-btn sced-b" data-sced-rot>${ROT_ICO} Повернуть</button>
        <div class="sced-seg" role="group" aria-label="Фильтр страницы">${FILTERS.map((f) => `<button type="button" class="sced-fb ${p.filter === f.key ? 'on' : ''}" data-sced-flt="${f.key}" aria-pressed="${p.filter === f.key}">${f.label}</button>`).join('')}</div>
      </div>
      ${strip}
      <div class="sced-order">
        <button type="button" class="ins-btn sced-b" data-sced-move="-1" ${ed.cur === 0 ? 'disabled' : ''} aria-label="Страницу левее">‹ Левее</button>
        <button type="button" class="ins-btn sced-b" data-sced-move="1" ${ed.cur === n - 1 ? 'disabled' : ''} aria-label="Страницу правее">Правее ›</button>
        <button type="button" class="ins-btn sced-b sced-del" data-sced-del aria-label="Удалить страницу">Удалить</button>
      </div>` : '<p class="ins-empty">Снимите страницы документа или выберите готовые снимки: углы и поворот настраиваются у каждой страницы.</p>'}
    <div class="sced-add">
      <button type="button" class="ins-btn sced-b" data-sced-cam>Снять</button>
      <button type="button" class="ins-btn sced-b" data-sced-files>Из файлов</button>
    </div>
    <div class="sced-go">
      <button type="button" class="ins-btn ins-btn-main ins-btn-wide" data-sced-done ${n ? '' : 'disabled'}>Готово${n ? ' · ' + n + ' стр.' : ''}</button>
      <button type="button" class="ins-btn ins-btn-wide" data-scan-cancel>Отмена</button>
    </div>
  </div>`;
}

// Собрать редактор в root. cb: { onDone(files), toast(text, tone) }.
export function mountScanEditor(root, ed, cb) {
  if (!root) return;
  let busy = false;
  let raf = 0;

  const build = () => {
    root.innerHTML = html(ed);
    if (ed.pages[ed.cur]) {
      paintThumbs();
      layout();
    }
  };

  const paintThumbs = () => {
    root.querySelectorAll('[data-sced-th]').forEach((cv) => {
      const p = ed.pages[+cv.dataset.scedTh];
      const { w, h } = dimsOf(p);
      const k = 96 / Math.max(w, h);
      paintRot(cv, p.prev, p.rot, w * k, h * k);
      cv.style.filter = p.filter === 'color' ? '' : p.filter === 'gray' ? 'grayscale(1)' : 'grayscale(1) contrast(3)';
    });
  };

  // Размер сцены по ширине блока и высоте экрана; снимок и рамка — под него.
  const layout = () => {
    const wrap = root.querySelector('[data-sced-wrap]');
    const stage = root.querySelector('[data-sced-stage]');
    const p = ed.pages[ed.cur];
    if (!wrap || !stage || !p) return;
    const cs = getComputedStyle(wrap);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const cw = Math.max(80, wrap.clientWidth - padX);
    const maxH = Math.max(220, Math.min(window.innerHeight * 0.6, 560));
    const { w, h } = dimsOf(p);
    const s = Math.min(cw / w, maxH / h);
    const sw = Math.max(40, Math.round(w * s));
    const sh = Math.max(40, Math.round(h * s));
    stage.style.width = sw + 'px';
    stage.style.height = sh + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const img = stage.querySelector('[data-sced-img]');
    paintRot(img, p.prev, p.rot, sw * dpr, sh * dpr);
    img.className = 'sced-img f-' + p.filter;
    const ov = stage.querySelector('[data-sced-ov]');
    ov.width = Math.round(sw * dpr);
    ov.height = Math.round(sh * dpr);
    drawFrame();
  };

  // Лёгкий слой: затемнение вне рамки и сама рамка, ручки — по процентам.
  const drawFrame = () => {
    const stage = root.querySelector('[data-sced-stage]');
    const p = ed.pages[ed.cur];
    if (!stage || !p) return;
    const ov = stage.querySelector('[data-sced-ov]');
    const c = ov.getContext('2d');
    const W = ov.width;
    const H = ov.height;
    c.clearRect(0, 0, W, H);
    const order = orderQuad(p.corners.map((q) => ({ x: q.x * W, y: q.y * H })));
    c.beginPath();
    c.rect(0, 0, W, H);
    order.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
    c.closePath();
    c.fillStyle = 'rgba(8, 20, 38, 0.55)';
    c.fill('evenodd');
    c.beginPath();
    order.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
    c.closePath();
    c.lineWidth = Math.max(2, W / 260);
    c.strokeStyle = '#ffffff';
    c.stroke();
    stage.querySelectorAll('[data-sced-h]').forEach((hd, i) => {
      hd.style.left = (p.corners[i].x * 100) + '%';
      hd.style.top = (p.corners[i].y * 100) + '%';
    });
  };
  const frame = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawFrame(); }); };

  const setCur = (i) => { ed.cur = clamp(i, 0, ed.pages.length - 1); build(); };

  // --- ручки: Pointer Events с захватом указателя ---
  const drag = { id: null, i: -1, dx: 0, dy: 0 };
  root.addEventListener('pointerdown', (e) => {
    const hd = e.target.closest('[data-sced-h]');
    if (!hd || busy) return;
    const stage = root.querySelector('[data-sced-stage]');
    const r = stage.getBoundingClientRect();
    const p = ed.pages[ed.cur];
    const i = +hd.dataset.scedH;
    drag.id = e.pointerId;
    drag.i = i;
    // Палец перекрывает точку: держим смещение между пальцем и центром ручки.
    drag.dx = p.corners[i].x * r.width - (e.clientX - r.left);
    drag.dy = p.corners[i].y * r.height - (e.clientY - r.top);
    try { hd.setPointerCapture(e.pointerId); } catch (err) { /* нет захвата */ }
    hd.classList.add('drag');
    e.preventDefault();
  });
  root.addEventListener('pointermove', (e) => {
    if (drag.id !== e.pointerId) return;
    const stage = root.querySelector('[data-sced-stage]');
    const r = stage.getBoundingClientRect();
    const p = ed.pages[ed.cur];
    p.corners[drag.i] = {
      x: clamp((e.clientX - r.left + drag.dx) / r.width, 0, 1),
      y: clamp((e.clientY - r.top + drag.dy) / r.height, 0, 1),
    };
    frame();
  });
  const endDrag = (e) => {
    if (drag.id !== e.pointerId) return;
    drag.id = null;
    root.querySelectorAll('.sced-h.drag').forEach((x) => x.classList.remove('drag'));
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);

  // Клавиатура: стрелки двигают угол на 1% (Shift — на 5%): замена
  // перетаскиванию (WCAG 2.2, 2.5.7).
  root.addEventListener('keydown', (e) => {
    const hd = e.target.closest && e.target.closest('[data-sced-h]');
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!hd || !dir) return;
    const p = ed.pages[ed.cur];
    const c = p.corners[+hd.dataset.scedH];
    const st = e.shiftKey ? 0.05 : 0.01;
    c.x = clamp(c.x + dir[0] * st, 0, 1);
    c.y = clamp(c.y + dir[1] * st, 0, 1);
    e.preventDefault();
    frame();
  });

  // --- кнопки ---
  const addFiles = async (files) => {
    const ok = files.filter((f) => {
      if (isFileTooLarge(f)) { cb.toast && cb.toast(`Не добавлено «${f.name}»: больше ${MAX_DOC_FILE_MB} МБ`, 'warn'); return false; }
      return true;
    });
    if (!ok.length) return;
    const bad = await addEditorPages(ed, ok);
    if (bad && cb.toast) cb.toast(`Не открылось как снимок: ${bad}`, 'warn');
    build();
  };

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || busy || !root.contains(b)) return;
    const p = ed.pages[ed.cur];
    if (b.dataset.scedPick !== undefined) { setCur(+b.dataset.scedPick); return; }
    if (b.hasAttribute('data-sced-cam')) {
      const f = await pickFile('image/*', { capture: 'environment' });
      if (f) await addFiles([f]);
    } else if (b.hasAttribute('data-sced-files')) {
      await addFiles(await pickFiles('image/*'));
    } else if (b.hasAttribute('data-sced-rot') && p) {
      // Поворот по часовой: точка (x, y) переходит в (1 − y, x).
      p.rot = (p.rot + 90) % 360;
      p.corners = p.corners.map((c) => ({ x: 1 - c.y, y: c.x }));
      build();
    } else if (b.dataset.scedFlt && p) {
      p.filter = b.dataset.scedFlt;
      build();
    } else if (b.dataset.scedMove && p) {
      const j = ed.cur + +b.dataset.scedMove;
      if (j < 0 || j >= ed.pages.length) return;
      [ed.pages[ed.cur], ed.pages[j]] = [ed.pages[j], ed.pages[ed.cur]];
      ed.cur = j;
      build();
    } else if (b.hasAttribute('data-sced-del') && p) {
      try { URL.revokeObjectURL(p.url); } catch (err) { /* уже */ }
      ed.pages.splice(ed.cur, 1);
      ed.cur = clamp(ed.cur, 0, Math.max(0, ed.pages.length - 1));
      build();
    } else if (b.hasAttribute('data-sced-done') && ed.pages.length) {
      busy = true;
      const label = b.textContent;
      root.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      try {
        const files = await renderPages(ed, (i, n) => { b.textContent = `Обработка ${i} из ${n}…`; });
        busy = false;
        cb.onDone(files);
      } catch (err) {
        busy = false;
        b.textContent = label;
        root.querySelectorAll('button').forEach((x) => { x.disabled = false; });
        if (cb.toast) cb.toast('Не удалось обработать страницы: ' + (err.message || err), 'warn');
      }
    }
  });

  // Поворот экрана и смена ширины — сцена пересчитывается.
  if (typeof ResizeObserver === 'function') {
    let first = true;
    let lastW = 0;
    const ro = new ResizeObserver(() => {
      if (!root.isConnected) { ro.disconnect(); return; }
      const wrap = root.querySelector('[data-sced-wrap]');
      const w = wrap ? wrap.clientWidth : 0;
      if (first) { first = false; lastW = w; return; }
      if (w !== lastW) { lastW = w; layout(); }
    });
    ro.observe(root);
  }

  build();
}
