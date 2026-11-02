// Чтение ZIP-архива в браузере — для импорта архива приложения «Осмотр»
// (pages/inspector/archiveImport.js). Без библиотек: центральный каталог
// архива читается по спецификации ZIP (APPNOTE), сжатые записи
// распаковываются DecompressionStream('deflate-raw') браузера.
//
// Что поддержано: метод 0 (без сжатия) и 8 (deflate), имена в UTF-8 (флаг
// 0x800) и без флага — тоже как UTF-8 (так пишет приложение «Осмотр»), ZIP64
// для размеров и смещений. Не поддержано: шифрование и архив «по частям» —
// о нём сказано отказом.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: архив разбирает сервер при загрузке; в браузере
// останется только выбор файла.

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOC = 0x07064b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

function findEocd(view) {
  // Конец каталога — в последних 64 КБ + 22 байта (комментарий архива).
  const min = Math.max(0, view.byteLength - 65557);
  for (let i = view.byteLength - 22; i >= min; i--) if (view.getUint32(i, true) === SIG_EOCD) return i;
  return -1;
}

// ZIP64: поля, равные 0xFFFFFFFF, лежат в дополнительном поле 0x0001.
function zip64(view, extraAt, extraLen, want) {
  let p = extraAt;
  const end = extraAt + extraLen;
  while (p + 4 <= end) {
    const id = view.getUint16(p, true);
    const len = view.getUint16(p + 2, true);
    if (id === 0x0001) {
      let q = p + 4;
      const out = {};
      want.forEach((k) => { out[k] = Number(view.getBigUint64(q, true)); q += 8; });
      return out;
    }
    p += 4 + len;
  }
  return {};
}

// Записи архива: [{ path, size, dir, read: async () => Blob }].
export async function readZip(file) {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  const eocd = findEocd(view);
  if (eocd < 0) throw new Error('Это не ZIP-архив или архив неполный');
  if (view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 6, true) !== 0) {
    throw new Error('Архив «по частям» — соберите части в один архив');
  }
  let count = view.getUint16(eocd + 10, true);
  let cdOff = view.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOff === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && view.getUint32(loc, true) === SIG_EOCD64_LOC) {
      const e64 = Number(view.getBigUint64(loc + 8, true));
      count = Number(view.getBigUint64(e64 + 32, true));
      cdOff = Number(view.getBigUint64(e64 + 48, true));
    }
  }
  const dec = new TextDecoder('utf-8');
  const out = [];
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== SIG_CEN) throw new Error('Оглавление архива повреждено');
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    let csize = view.getUint32(p + 20, true);
    let usize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commLen = view.getUint16(p + 32, true);
    let loc = view.getUint32(p + 42, true);
    const path = dec.decode(new Uint8Array(buf, p + 46, nameLen)).replace(/\\/g, '/');
    if (csize === 0xffffffff || usize === 0xffffffff || loc === 0xffffffff) {
      const want = [];
      if (usize === 0xffffffff) want.push('usize');
      if (csize === 0xffffffff) want.push('csize');
      if (loc === 0xffffffff) want.push('loc');
      const z = zip64(view, p + 46 + nameLen, extraLen, want);
      usize = z.usize ?? usize; csize = z.csize ?? csize; loc = z.loc ?? loc;
    }
    const at = loc;
    const comp = csize;
    out.push({
      path, size: usize, dir: path.endsWith('/'),
      read: async () => {
        if (flags & 1) throw new Error(`«${path}» зашифрован`);
        if (view.getUint32(at, true) !== SIG_LOC) throw new Error(`«${path}»: запись повреждена`);
        const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
        const raw = new Blob([new Uint8Array(buf, start, comp)]);
        if (method === 0) return raw;
        if (method !== 8) throw new Error(`«${path}»: неизвестный способ сжатия ${method}`);
        return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      },
    });
    p += 46 + nameLen + extraLen + commLen;
  }
  return out;
}
