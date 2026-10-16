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
const blank = (typeId, ocId) => ({ id: key(typeId, ocId), typeId, ocId, note: '', photos: [], done: false, doneAt: '', assets: {}, found: [], contacts: [] });

registerPersisted('inspections.results', {
  snapshot: () => [...results.values()],
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    results.clear();
    saved.filter((r) => r && r.id).forEach((r) => {
      const [typeId, ocId] = String(r.id).split('|');
      results.set(r.id, { ...blank(typeId, ocId), ...r, assets: r.assets && typeof r.assets === 'object' ? r.assets : {} });
    });
  },
});

// Состояние осмотра объекта (создаётся при первом обращении).
export function resultsOf(typeId, ocId) {
  const k = key(typeId, ocId);
  if (!results.has(k)) results.set(k, blank(typeId, ocId));
  return results.get(k);
}

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

export function markDone(typeId, ocId, done) {
  const r = resultsOf(typeId, ocId);
  r.done = !!done;
  r.doneAt = done ? new Date().toISOString() : '';
  scheduleSave();
  return r;
}
