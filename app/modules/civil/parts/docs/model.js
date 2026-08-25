// Списки документов внутри записи ОЦ.
// scope: 'oc' | 'mech-new' | <oi.id>
export function ensureDocPages(d) {
  if (d.pages) return;
  // Реальный загруженный файл — одна «страница» с настоящим содержимым;
  // документ без файла (старые/сидовые записи) — как раньше, макет-заглушка.
  d.pages = d.file ? [{ kind: 'real' }] : Array.from({ length: 3 }, (_, i) => ({ kind: i === 0 ? 'title' : 'skel' }));
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

// object URL (blob:) вместо data:-URI — <embed type="application/pdf"> у Chrome
// не всегда отрисовывает PDF, встроенный как data:-URI (пустая белая страница),
// а blob: работает надёжно и для PDF, и для картинок, и для скачивания.
export function attachedFileFrom(file) {
  return { name: file.name, mime: file.type || '', kind: fileKindOf(file.type), dataUrl: URL.createObjectURL(file), size: file.size };
}

export function docListFor(ctx, scope) {
  if (scope === 'oc') { ctx.rec.docs = ctx.rec.docs || []; return ctx.rec.docs; }
  if (scope === 'mech-new') return ctx.ui.mechDocs || [];
  const oi = ctx.rec.oi.find((o) => o.id === scope);
  if (!oi) return [];
  oi.docs = oi.docs || [];
  return oi.docs;
}

export function scopeLabel(sc) {
  return sc === 'oc' ? 'ОЦ' : (sc === 'mech-new' ? 'Новый' : 'ОИ');
}
