import { esc } from '../../kernel/dom.js';
import { ensureFilePages, pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../kernel/fileUpload.js';
import { paintPdfCanvases } from '../../kernel/pdfRender.js';

function filesOf(rec) {
  return (rec.docs || []).flatMap((doc) => (doc.files || []).map((file) => ({ ...file, docId: doc.id })));
}

function photosOf(rec) {
  return filesOf(rec).filter((file) => file.kind === 'image');
}

function currentFile(rec) {
  const files = filesOf(rec);
  return files.find((file) => file.id === rec.viewerFileId) || files[0] || null;
}

function filePageHTML(file, page) {
  if (page.kind === 'image') return `<img class="vimg" src="${file.dataUrl}" alt="${esc(file.name)}">`;
  if (page.kind === 'pdf') return `<canvas class="vpdf-canvas" data-pdf-src="${page.src}" data-pdf-url="${file.dataUrl}" aria-label="${esc(file.name)} · страница ${page.src}"></canvas><div class="vpdf-load"><div class="sk-h"></div><div class="sk-line"></div><div class="sk-line"></div></div>`;
  return `<div class="vempty-box">Предпросмотр недоступен для этого типа файла (${esc(file.mime || 'неизвестный формат')}).</div>`;
}

function toolbar(file, mode) {
  if (!file || mode === 'photo') return `<div class="vtoolbar"><div class="tool-group right"><span class="vtitle">${mode === 'photo' ? 'Фото' : 'Документы'}</span></div></div>`;
  ensureFilePages(file);
  const page = file.page || 1;
  return `<div class="vtoolbar"><div class="tool-group"><button class="tool-btn" data-vehicle-prev ${page <= 1 ? 'disabled' : ''}>‹</button><input class="page-input" data-vehicle-page value="${page}"><span class="muted">/ ${file.pages.length}</span><button class="tool-btn" data-vehicle-next ${page >= file.pages.length ? 'disabled' : ''}>›</button></div><div class="tool-group"><button class="tool-btn" data-vehicle-zoom-minus>−</button><span class="zoom-label" data-vehicle-zoom-label>100%</span><button class="tool-btn" data-vehicle-zoom-plus>+</button></div><div class="tool-group right"><span class="vtitle">${esc(file.name)}</span></div></div>`;
}

function stage(file, mode) {
  if (!file) return `<div class="vempty"><div class="vempty-box">Нет загруженных фотографий или документов</div><button class="btn btn-primary btn-sm" data-vehicle-upload>Добавить файл</button></div>`;
  ensureFilePages(file);
  return `<div class="vbody"><div class="vrail"><div class="vrail-list">${file.pages.map((page, i) => `<div class="vthumb doc ${page.kind === 'pdf' ? 'real' : ''} ${(file.page || 1) === i + 1 ? 'active' : ''}" data-vehicle-thumb="${i + 1}">${page.kind === 'pdf' ? `<canvas class="vthumb-canvas" data-pdf-src="${page.src}" data-pdf-url="${file.dataUrl}" data-pdf-thumb="128"></canvas>` : ''}<span class="vthumb-num">${i + 1}</span></div>`).join('')}</div></div><div class="vstage" data-vehicle-stage><div class="vribbon" data-vehicle-ribbon>${file.pages.map((page, i) => `<div class="vpage-wrap" data-vpageblk="${i + 1}"><div class="vpage" data-vpageinner>${filePageHTML(file, page)}</div></div>`).join('')}</div></div></div>`;
}

function compareHTML(rec) {
  const photos = photosOf(rec);
  const docs = filesOf(rec).filter((file) => file.kind !== 'image');
  const photo = photos[0];
  const doc = docs[0];
  if (doc) ensureFilePages(doc);
  return `<div class="vehicle-compare"><div><div class="vehicle-compare-title">Фото</div>${photo ? `<img class="vimg" src="${photo.dataUrl}" alt="${esc(photo.name)}">` : '<div class="vempty-box">Нет фотографий</div>'}</div><div><div class="vehicle-compare-title">Документ</div>${doc ? `<div class="vehicle-compare-page">${filePageHTML(doc, (doc.pages || [{ kind: 'other' }])[0])}</div>` : '<div class="vempty-box">Нет документов</div>'}</div></div>`;
}

export function vehicleViewerHTML(ctx) {
  const rec = ctx.rec;
  const mode = rec.viewerMode || 'photo';
  const file = mode === 'photo'
    ? photosOf(rec)[0] || null
    : mode === 'doc'
      ? filesOf(rec).find((item) => item.kind !== 'image' && item.id === rec.viewerFileId) || filesOf(rec).find((item) => item.kind !== 'image') || null
      : currentFile(rec);
  const photos = photosOf(rec);
  const files = filesOf(rec);
  if (file) ensureFilePages(file);
  const body = mode === 'compare' ? compareHTML(rec) : stage(mode === 'photo' ? (photos[0] || null) : file, mode);
  return `<div class="viewer vehicle-viewer"><div class="vmode"><button class="vmode-btn ${mode === 'photo' ? 'active' : ''}" data-vehicle-mode="photo">Фото · ${photos.length}</button><button class="vmode-btn ${mode === 'doc' ? 'active' : ''}" data-vehicle-mode="doc">Документы · ${files.length - photos.length}</button><button class="vmode-btn ${mode === 'compare' ? 'active' : ''}" data-vehicle-mode="compare">Сравнение</button></div>${mode === 'compare' ? '' : toolbar(mode === 'photo' ? (photos[0] || null) : file, mode)}${body}<div class="vehicle-viewer-actions"><button class="btn btn-primary btn-sm" data-vehicle-upload>Добавить фото или документ</button></div></div>`;
}

export function bindVehicleViewer(ctx) {
  const s = ctx.scope;
  s.$$('[data-vehicle-mode]').forEach((button) => button.onclick = () => { ctx.rec.viewerMode = button.dataset.vehicleMode; ctx.render(); });
  s.$$('[data-vehicle-upload]').forEach((button) => button.onclick = async () => {
    const file = await pickFile('image/*,.pdf');
    if (!file) return;
    if (isFileTooLarge(file)) { ctx.toast(`Файл больше ${MAX_DOC_FILE_MB} МБ`, 'warn'); return; }
    const attached = await attachedFileFrom(file);
    attached.id = `vehicle-file-${Date.now()}`;
    if (!ctx.rec.docs[0]) ctx.rec.docs.push({ id: `vehicle-doc-${ctx.rec.id}`, files: [] });
    ctx.rec.docs[0].files.push(attached);
    ctx.rec.viewerFileId = attached.id;
    ctx.rec.viewerMode = attached.kind === 'image' ? 'photo' : 'doc';
    ctx.render();
    ctx.toast('Файл добавлен', 'ok');
  });
  const file = currentFile(ctx.rec);
  if (!file || ctx.rec.viewerMode === 'photo' || ctx.rec.viewerMode === 'compare') return;
  const go = (page) => {
    ensureFilePages(file);
    file.page = Math.max(1, Math.min(file.pages.length, page));
    ctx.render();
  };
  const input = s.$('[data-vehicle-page]');
  if (input) input.onchange = () => go(+input.value || 1);
  const prev = s.$('[data-vehicle-prev]');
  if (prev) prev.onclick = () => go((file.page || 1) - 1);
  const next = s.$('[data-vehicle-next]');
  if (next) next.onclick = () => go((file.page || 1) + 1);
  s.$$('[data-vehicle-thumb]').forEach((thumb) => thumb.onclick = () => go(+thumb.dataset.vehicleThumb));
  paintPdfCanvases(s.root, 100);
}
