// Результаты осмотра объекта — то, что осмотрщик вносит на месте: значения
// полей по каждому ОИ, заметка, снимки, отметка «осмотр завершён» и
// выявленное на осмотре.
//
// Жили в памяти вкладки осмотрщика (pages/inspector/tasks.js) и пропадали при
// перезагрузке; ЦОД их бы не увидел. Перенесены в ядро и сохраняются общей
// частью, как назначения: их читает и экран осмотрщика, и вкладка «Результаты
// осмотра» карточки ОЦ (решение пользователя 15.10.2026, запись графа
// vyyavlennye-na-osmotre-zdaniya-…). Снимки — как документы карточек: файл в
// хранилище браузера (kernel/localFiles.js), в данных — ссылка dataUrl и ключ.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: записи осмотра, привязанные к заданию на осмотр, со
// своим автором и временем; снимки — в файловом хранилище сервера. На месте
// связь бывает плохой — приложение копит записи и снимки на телефоне и
// отправляет, когда связь есть (развилка: очередь отправки и её показ).
import { registerPersisted, scheduleSave } from './persist.js';
import { keepFileLocally } from './localFiles.js';

const key = (typeId, ocId) => `${typeId}|${ocId}`;
const results = new Map();
const blank = (typeId, ocId) => ({ id: key(typeId, ocId), typeId, ocId, note: '', photos: [], done: false, doneAt: '', assets: {}, found: [], contacts: [], scans: [], voices: [] });

registerPersisted('inspections.results', {
  snapshot: () => [...results.values()],
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    results.clear();
    saved.filter((r) => r && r.id).forEach((r) => {
      const [typeId, ocId] = String(r.id).split('|');
      results.set(r.id, { ...blank(typeId, ocId), ...r, assets: r.assets && typeof r.assets === 'object' ? r.assets : {} });
    });
    seedDemoResults();
  },
});

// Демо-результаты осмотра (kernel/inspectionsDemo.js): добавляются, когда по
// объекту результатов ещё нет — и при первом запуске, и после восстановления
// сохранённого состояния, сделанного до их появления. Заведённое осмотрщиком
// не затирается.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: демо-результатов нет, эта подмешка уходит с засевом.
let demoResults = [];
function seedDemoResults() {
  demoResults.forEach((d) => {
    const k = key(d.typeId, d.ocId);
    if (!results.has(k)) results.set(k, { ...blank(d.typeId, d.ocId), ...JSON.parse(JSON.stringify(d)), id: k, demo: true });
  });
}
export function registerDemoResults(list) {
  demoResults = Array.isArray(list) ? list : [];
  seedDemoResults();
}

// Состояние осмотра объекта (создаётся при первом обращении).
export function resultsOf(typeId, ocId) {
  const k = key(typeId, ocId);
  if (!results.has(k)) results.set(k, blank(typeId, ocId));
  return results.get(k);
}

// Все результаты осмотров (без создания пустых) — очередь «Сканы с осмотров»
// (kernel/scanQueue.js) перебирает по ним сканы.
export const allResults = () => [...results.values()];

// Был ли осмотр объекта вообще — без создания пустой записи.
export function hasResults(typeId, ocId) {
  const r = results.get(key(typeId, ocId));
  return !!(r && (r.photos.length || r.found.length || r.note || r.done || Object.keys(r.assets).length));
}

// Значения осмотра одного ОИ.
export function valuesOf(typeId, ocId, oiId) {
  const a = resultsOf(typeId, ocId).assets;
  const k = oiId || '';
  if (!a[k] || typeof a[k] !== 'object') a[k] = {};
  return a[k];
}

// Правка дошла до данных — сохранить (с задержкой, пачкой).
export const saveResults = () => scheduleSave();

let photoSeq = 0;
export function addResultPhoto(typeId, ocId, file, fields) {
  const photo = { id: 'ph-' + Date.now().toString(36) + '-' + (++photoSeq), name: file.name || 'снимок', size: file.size, at: new Date().toISOString(), ...fields };
  photo.dataUrl = URL.createObjectURL(file);
  keepFileLocally(file, photo);
  resultsOf(typeId, ocId).photos.push(photo);
  scheduleSave();
  return photo;
}

// Документ, отсканированный осмотрщиком (решение пользователя 16.10.2026:
// «документы, отсканированные осмотрщиком помечаются, как с осмотра и их
// должен удостоверить и обработать ЦОД»): страницы — файлы, как снимки;
// состояние — «ждёт ЦОД», пока ЦОД его не удостоверил.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: скан — документ записи с источником «осмотр», автором
// и временем; удостоверение ЦОД — его действие с отметкой; развилка — куда
// скан попадает после удостоверения (документы ОЦ или ОИ) и что с
// отклонённым.
let scanSeq = 0;
function makeScanPages(files) {
  return files.map((file, i) => {
    const pg = { id: 'sp-' + Date.now().toString(36) + '-' + (++scanSeq) + '-' + i, name: file.name || 'страница', size: file.size, type: file.type || '' };
    pg.dataUrl = URL.createObjectURL(file);
    keepFileLocally(file, pg);
    return pg;
  });
}
export function addResultScan(typeId, ocId, files, { title = '', oiId = '', by = '' } = {}) {
  const pages = makeScanPages(files);
  const scan = { id: 'sc-' + Date.now().toString(36) + '-' + (++scanSeq), title: title || 'Документ с осмотра', oiId, by,
    at: new Date().toISOString(), source: 'осмотр', status: 'ждёт ЦОД', pages };
  const r = resultsOf(typeId, ocId);
  if (!Array.isArray(r.scans)) r.scans = [];
  r.scans.push(scan);
  scheduleSave();
  return scan;
}

// Пересъёмка возвращённого скана (этап В, пункт В3): новые страницы заменяют
// прежние, у скана снимается пометка возврата (scan.retake) и отметка разбора
// (scan.review) — в очереди «Сканы с осмотров» он снова «Ждёт разбора».
// Название и ОИ остаются прежними.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: пересъёмка — новая версия того же документа с
// сохранением прежней и причины возврата (история разбора); здесь прежние
// страницы и причина не хранятся.
export function replaceScanPages(typeId, ocId, scanId, files, { by = '' } = {}) {
  const scan = (resultsOf(typeId, ocId).scans || []).find((s) => s.id === scanId);
  if (!scan) throw new Error('Скан не найден');
  if (!scan.retake) throw new Error('Скан не возвращён на пересъёмку');
  if (!files.length) throw new Error('Нет страниц');
  (scan.pages || []).forEach((p) => { try { URL.revokeObjectURL(p.dataUrl); } catch (e) { /* уже отозвана */ } });
  scan.pages = makeScanPages(files);
  delete scan.retake;
  delete scan.review;
  scan.status = 'ждёт ЦОД';
  scan.at = new Date().toISOString();
  if (by) scan.by = by;
  scheduleSave();
  return scan;
}

// Голосовая заметка осмотрщика (решение пользователя 16.10.2026: «Голосовые
// заметки тоже»): к объекту в целом (oiId пуст) или к ОИ. Файл — как снимок.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: запись — файл осмотра на сервере с автором и
// временем; развилка — расшифровка в текст на сервере (поиск по заметкам) или
// только прослушивание.
let voiceSeq = 0;
export function addResultVoice(typeId, ocId, blob, { oiId = '', dur = 0, by = '' } = {}) {
  const ext = /ogg/.test(blob.type) ? 'ogg' : /mp4|aac/.test(blob.type) ? 'm4a' : 'webm';
  const file = new File([blob], `заметка-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`, { type: blob.type || 'audio/webm' });
  const v = { id: 'vn-' + Date.now().toString(36) + '-' + (++voiceSeq), name: file.name, size: file.size, type: file.type,
    oiId, dur: Math.round(dur), by, at: new Date().toISOString() };
  v.dataUrl = URL.createObjectURL(file);
  keepFileLocally(file, v);
  const r = resultsOf(typeId, ocId);
  if (!Array.isArray(r.voices)) r.voices = [];
  r.voices.push(v);
  scheduleSave();
  return v;
}

export function markDone(typeId, ocId, done) {
  const r = resultsOf(typeId, ocId);
  r.done = !!done;
  r.doneAt = done ? new Date().toISOString() : '';
  scheduleSave();
  return r;
}
