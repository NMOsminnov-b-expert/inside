// Доступ просмотрщика к данным модуля.
//
// Просмотрщик живёт в ядре и одинаков для всех типов ОЦ (решение пользователя
// 21.09.2026: «просмотрщик меняем везде, вносим его в ядро»). Но документы,
// фото, справочник видов документов, выдача идентификаторов и лог действий —
// у каждого модуля свои, а правило проекта запрещает ядру знать модули
// (app/README.md). Поэтому модуль при монтировании отдаёт сюда свои функции, а
// просмотрщик зовёт их по именам, не зная, чьи они.
//
// Набор один на страницу: одновременно смонтирован ровно один модуль ОЦ
// (kernel/boot.js), и просмотрщик в отдельном окне показывает его же данные.

import { allResults } from '../inspectionResults.js';

let deps = null;

export function setViewerDeps(d) {
  deps = d;
}

function need() {
  if (!deps) {
    throw new Error('Просмотрщик: модуль не передал доступ к своим данным — '
      + 'вызовите setViewerDeps() при монтировании (kernel/viewer/deps.js)');
  }
  return deps;
}

// Что доступно в этом окружении: у карточки ОЦ — всё, у страниц «Документы» и
// «Учреждения» нет фото, сравнения, прикрепления, архива и правки страниц
// (kernel/viewer/pageViewer.js). По умолчанию доступно всё.
export const can = (what) => {
  const c = need().can;
  return !c || c[what] !== false;
};

// --- документы ---------------------------------------------------------------
export const docListFor = (ctx, scope) => need().docListFor(ctx, scope);
export const ensureDocPages = (d) => need().ensureDocPages(d);
export const attachedFileFrom = (file) => need().attachedFileFrom(file);
export const isFileTooLarge = (file) => need().isFileTooLarge(file);
export const maxFileMb = () => need().maxFileMb;
export const scopeLabel = (scope) => need().scopeLabel(scope);
export const nextDocId = (rec) => need().nextDocId(rec);
export const docTypes = () => need().docTypes();

// --- фото ---------------------------------------------------------------------
// Снимки осмотра (вкладка «Результаты осмотра», kernel/inspectionTab.js) —
// держатель того же вида, что у ОИ, но читает его ядро само: у модулей свой
// порядок и перечень категорий (у ТС — только «Машина» и «Модули»), а
// категории осмотра — свои.
const own = (oi) => !!(oi && oi.inspectionPhotos);
const ownGroups = (oi) => Object.keys(oi.photos || {}).map((cat) => ({ cat, items: Array.from({ length: oi.photos[cat] }, (_, i) => ({ cat, i })) }));
// Снимки осмотрщика в фото самой карточки ОИ — следом за снимками карточки, категориями «С осмотра · …» (пользователь
// 23.11.2026: снимки осмотрщика «должны быть видны всегда и там и там. Обязательно. В обычных цо ои так же»). Только
// смотреть: перенос и правка — у снимков карточки. Без демо при выключенных тестовых данных (allResults).
export const INSP_CAT = 'С осмотра · ';
export const isInspCat = (cat) => String(cat || '').startsWith(INSP_CAT);
function inspFiles(oi) {
  if (!oi || !oi.id) return {};
  const out = {};
  allResults().forEach((r) => (r.photos || []).forEach((p) => {
    if (p.oiId !== oi.id) return;
    const cat = INSP_CAT + (p.cat || 'Прочее');
    (out[cat] = out[cat] || []).push({ id: p.id, name: p.name || p.cat || 'Снимок', dataUrl: p.dataUrl || '', at: p.at, by: p.by, turn: p.turn || 0 });
  }));
  return out;
}
const inspGroups = (oi) => Object.entries(inspFiles(oi)).map(([cat, files]) => ({ cat, items: files.map((_, i) => ({ cat, i })) }));
export const photoPages = (oi) => (own(oi) ? ownGroups(oi).flatMap((g) => g.items) : [...need().photoPages(oi), ...inspGroups(oi).flatMap((g) => g.items)]);
export const photoGroups = (oi) => (own(oi) ? ownGroups(oi) : [...need().photoGroups(oi), ...inspGroups(oi)]);
export const photoFileAt = (oi, cat, i) => (own(oi) ? (((oi.photoFiles || {})[cat] || [])[i] || null)
  : isInspCat(cat) ? ((inspFiles(oi)[cat] || [])[i] || null) : need().photoFileAt(oi, cat, i));
export const catLabel = (oi, cat) => (own(oi) || isInspCat(cat) ? cat : need().catLabel(oi, cat));

// --- лог действий и архив ------------------------------------------------------
export const pushDocPageLog = (rec, d, action, page) => need().pushDocPageLog(rec, d, action, page);
export const archiveInfo = () => ({ typeId: need().typeId, typeLabel: need().typeLabel });
