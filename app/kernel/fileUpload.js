// Загрузка файла для страниц уровня kernel (не привязанных ни к одному модулю
// ОЦ) — отдельная копия механики, которая уже есть в modules/*/parts/docs/model.js.
// Модуль импортировать нельзя (kernel не знает ни одного типа ОЦ), а полный
// разбор PDF (число страниц/пропорции, modules/*/parts/viewer/pdf.js) здесь не
// нужен: страница «Документы» не листает файл постранично, а открывает его в
// новой вкладке — как это уже делает архив документов (kernel/archive.js).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: файл живёт blob-ссылкой в памяти вкладки и пропадает
// при перезагрузке — на сервере нужна настоящая загрузка в хранилище с
// постоянным адресом и проверкой типа/размера на стороне сервера.

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
// одинаково хорошо открывается в новой вкладке/картинкой.
export function attachedFileFrom(file) {
  return { name: file.name, mime: file.type || '', kind: fileKindOf(file.type), dataUrl: URL.createObjectURL(file), size: file.size };
}
