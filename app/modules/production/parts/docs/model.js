// Списки документов внутри записи ОЦ.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: файл здесь живёт как blob-ссылка в памяти вкладки —
// после перезагрузки страницы он пропадает, и это нормально для макета. На
// сервере понадобится настоящая загрузка в хранилище, постоянный адрес файла,
// проверка типа и размера на стороне сервера и права доступа к нему.
// scope: 'oc' | 'mech-new' | <oi.id>
import { getPdfPageCount, getPdfPageAspects } from '../viewer/pdf.js';

// Страницы документа. У реального PDF — по странице на каждую страницу файла:
// именно из этого списка живут лента миниатюр, счётчик «/ N» и навигация, поэтому
// одной «real»-страницей (как было) весь этот функционал оказывался мёртвым.
// kind: 'pdf' — рисуется в canvas через viewer/pdf.js; src — номер страницы В
// ИСХОДНОМ файле. src обязателен и не равен позиции в массиве: после удаления
// лишней страницы остальные должны продолжать показывать свои исходные страницы,
// а не съехать на одну.
export function ensureDocPages(d) {
  if (d.pages) return;

  if (d.file && d.file.kind === 'pdf') {
    const n = Math.max(1, d.file.pageCount || 1);
    d.pages = Array.from({ length: n }, (_, i) => ({ kind: 'pdf', src: i + 1 }));
  } else if (d.file && d.file.kind === 'image') {
    d.pages = [{ kind: 'image' }];
  } else if (d.file) {
    d.pages = [{ kind: 'other' }];
  } else {
    // Файла нет — страниц нет. Раньше здесь строились три НАРИСОВАННЫЕ страницы
    // (kind 'title'/'skel'): серые полоски, изображавшие скан. Убраны целиком —
    // документ приходит настоящим файлом, а рисованный лист выдавал себя за него.
    d.pages = [];
  }
}

// Выбор реального файла системным диалогом. Возвращает null, если пользователь отменил.
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
    input.click();
  });
}

// Нет бэкенда — файл целиком живёт в памяти на вкладке, поэтому ограничиваем
// размер, чтобы не подвесить страницу большим файлом.
export const MAX_DOC_FILE_MB = 15;

export function isFileTooLarge(file) {
  return file.size > MAX_DOC_FILE_MB * 1024 * 1024;
}

function fileKindOf(mime) {
  if ((mime || '').startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}

// object URL (blob:) вместо data:-URI: работает и для PDF.js, и для картинок,
// и для скачивания, и не раздувает память base64-строкой.
//
// Асинхронная: у PDF сразу выясняем число страниц и пропорции — из них строятся
// d.pages (лента миниатюр, счётчик «/ N») и габариты листа. Все 6 мест вызова
// уже были написаны как `await attachedFileFrom(file)`, поэтому переход на
// настоящую асинхронность не потребовал правок ни в одном из них.
export async function attachedFileFrom(file) {
  const dataUrl = URL.createObjectURL(file);
  const kind = fileKindOf(file.type);
  const f = { name: file.name, mime: file.type || '', kind, dataUrl, size: file.size };

  if (kind === 'pdf') {
    f.pageCount = await getPdfPageCount(dataUrl);
    // Пропорции на КАЖДУЮ страницу: у документа со смешанной ориентацией
    // одной общей пропорции недостаточно (см. viewer/pdf.js).
    f.pageAspects = await getPdfPageAspects(dataUrl);
    f.aspect = f.pageAspects[0] || null;
  }

  return f;
}

export function docListFor(ctx, scope) {
  if (scope === 'oc') { ctx.rec.docs = ctx.rec.docs || []; return ctx.rec.docs; }
  // Массив создаётся здесь же, как и для ОЦ с литерой: раньше при незаданном
  // ui.mechDocs возвращался ВРЕМЕННЫЙ пустой массив, и прикреплённый в него
  // документ молча пропадал. Пока просмотрщик в мастере не показывался без
  // документа, кнопка прикрепления была недостижима и дефект не проявлялся.
  if (scope === 'mech-new') { ctx.ui.mechDocs = ctx.ui.mechDocs || []; return ctx.ui.mechDocs; }
  const oi = ctx.rec.oi.find((o) => o.id === scope);
  if (!oi) return [];
  oi.docs = oi.docs || [];
  return oi.docs;
}

export function scopeLabel(sc) {
  return sc === 'oc' ? 'ОЦ' : (sc === 'mech-new' ? 'Новый' : 'ОИ');
}
