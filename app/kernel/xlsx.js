// Выгрузка таблиц в .xlsx прямо из браузера. Правило проекта: табличное —
// в xlsx, и таблицей должно быть удобно пользоваться: закреплённая шапка,
// автофильтр, разумные ширины столбцов.
//
// Библиотека — SheetJS (app/vendor/xlsx, README там же), подгружается при
// первой выгрузке. Закрепление шапки SheetJS Community не пишет — поэтому
// после записи в лист вставляется <pane> через встроенный в него разбор zip.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: отчёты на большие периоды собирает сервер (там же
// оформление — жирная шапка, перенос текста); в макете — в браузере из
// данных вкладки.

let lib = null;
const load = async () => {
  if (!lib) lib = await import('../vendor/xlsx/xlsx.mjs');
  return lib;
};

// sheets: [{ name, head: [подписи], rows: [[значения]], widths?: [символов] }]
export async function xlsxBytes(sheets) {
  const X = await load();
  const wb = X.utils.book_new();
  sheets.forEach(({ name, head, rows, widths = [] }) => {
    const ws = X.utils.aoa_to_sheet([head, ...rows]);
    ws['!cols'] = head.map((h, i) => ({
      wch: widths[i] || Math.min(60, Math.max(8, String(h).length, ...rows.map((r) => String(r[i] ?? '').length)) + 2),
    }));
    if (rows.length) {
      ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: head.length - 1 } }) };
    }
    X.utils.book_append_sheet(wb, ws, String(name).slice(0, 31));
  });
  const data = X.write(wb, { type: 'array', bookType: 'xlsx' });
  const zip = X.CFB.read(new Uint8Array(data), { type: 'array' });
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  zip.FullPaths.forEach((path, i) => {
    if (!/xl\/worksheets\/sheet\d+\.xml$/.test(path)) return;
    const f = zip.FileIndex[i];
    const xml = dec.decode(f.content).replace('<sheetView workbookViewId="0"/>',
      '<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
      + '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>');
    f.content = enc.encode(xml);
    f.size = f.content.length;
  });
  return X.CFB.write(zip, { fileType: 'zip', type: 'array' });
}

export async function downloadXlsx(fileName, sheets) {
  const bytes = await xlsxBytes(sheets);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
