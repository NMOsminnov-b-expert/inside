// Загрузка файла для страниц уровня kernel (не привязанных ни к одному модулю
// ОЦ) — отдельная копия механики, которая уже есть в modules/*/parts/docs/model.js.
// Модуль импортировать нельзя (kernel не знает ни одного типа ОЦ).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: файл живёт blob-ссылкой в памяти вкладки и пропадает
// при перезагрузке — на сервере нужна настоящая загрузка в хранилище с
// постоянным адресом и проверкой типа/размера на стороне сервера.
import { getPdfPageCount, getPdfPageAspects } from './pdfRender.js';

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
    input.click();
  });
}

export const MAX_DOC_FILE_MB = 15;

export function isFileTooLarge(file) {
  return file.size > MAX_DOC_FILE_MB * 1024 * 1024;
}

export function fileKindOf(mime) {
  if ((mime || '').startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}

// object URL (blob:) вместо data:-URI — не раздувает память base64-строкой и
// одинаково хорошо открывается и в просмотрщике, и при скачивании.
//
// Асинхронная: у PDF сразу выясняем число страниц и пропорции каждой — из них
// строится f.pages для полноценного просмотрщика (лента миниатюр, счётчик
// «/ N»), см. ensureFilePages ниже — тот же приём, что в
// modules/*/parts/docs/model.js.
export async function attachedFileFrom(file) {
  const dataUrl = URL.createObjectURL(file);
  const kind = fileKindOf(file.type);
  const f = { name: file.name, mime: file.type || '', kind, dataUrl, size: file.size };

  if (kind === 'pdf') {
    f.pageCount = await getPdfPageCount(dataUrl);
    f.pageAspects = await getPdfPageAspects(dataUrl);
    f.aspect = f.pageAspects[0] || null;
  }

  return f;
}

// Страницы файла для просмотрщика — по странице на каждую страницу PDF,
// картинка и «прочее» — одной страницей.
export function ensureFilePages(f) {
  if (f.pages) return;

  if (f.kind === 'pdf') {
    const n = Math.max(1, f.pageCount || 1);
    f.pages = Array.from({ length: n }, (_, i) => ({ kind: 'pdf', src: i + 1 }));
  } else if (f.kind === 'image') {
    f.pages = [{ kind: 'image' }];
  } else {
    f.pages = [{ kind: 'other' }];
  }
}
