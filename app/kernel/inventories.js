// Описи оборудования и механизмов учреждений и отметки их позиций на осмотре
// (этап Б, запись графа osmotr-opisey-i-skany-ustroystvo-etapov-b-v; ответы
// пользователя 27–29.10.2026).
//
// Опись принадлежит учреждению или подведу (Б1, В5), а не объекту оценки;
// регионал прикладывает описи к назначению (Б2), осмотрщик отмечает позиции
// (Б4). Отметки — у описи, а не у назначения (Б3): одну опись осматривают на
// нескольких объектах и выездах, на объект выходят несколько осмотрщиков (В12
// «Да, можно»), счёт «осмотрено N из M» общий; у отметки — кто, когда, по
// какому назначению. Скан по описи после приёма ЦОД — документ позиции (В13
// «К позиции описи»), документы позиций видны в поиске по всем документам.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: база описей — реестр описей (tz-reestr-opisey,
// репозиторий reestr-opisey: опись-версия, позиции, ключ позиции); здесь —
// демо-описи, собранные детерминированно. Отметки — записи осмотра с автором
// и временем на сервере, снимки — в файловом хранилище; на месте связь
// бывает плохой — приложение копит отметки и отправляет, когда связь есть.
import { registerPersisted, scheduleSave } from './persist.js';
import { keepFileLocally } from './localFiles.js';

// --- демо-база ---------------------------------------------------------------
// Детерминированно: одни и те же описи при каждом запуске.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const KINDS = [
  ['Компьютер в комплекте', 'Каб.', 45000, 38000],
  ['Ноутбук HP ProBook 450', 'Каб.', 62000, 51000],
  ['МФУ Canon i-SENSYS', 'Каб.', 24000, 18000],
  ['Принтер HP LaserJet', 'Каб.', 16000, 12000],
  ['Кондиционер Midea 12', 'Каб.', 38000, 30000],
  ['Стол письменный', 'Каб.', 9000, 7000],
  ['Шкаф для документов', 'Каб.', 12000, 9000],
  ['Кресло офисное', 'Каб.', 7500, 6000],
  ['Сейф металлический', 'Архив', 21000, 18000],
  ['Проектор Epson EB-X51', 'Конф.-зал', 54000, 42000],
  ['Котёл газовый водогрейный', 'Котельная', 1840000, 1200000],
  ['Насос циркуляционный Grundfos', 'Котельная', 86000, 60000],
  ['Генератор дизельный 30 кВт', 'Гараж', 980000, 640000],
  ['Сварочный аппарат', 'Мастерская', 42000, 30000],
  ['Станок сверлильный', 'Мастерская', 155000, 98000],
];

function makeItems(seed, n, prefix) {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const [name, place, ci, cb] = KINDS[Math.floor(r() * KINDS.length)];
    const qty = r() < 0.15 ? 2 + Math.floor(r() * 6) : 1;
    const k = 0.6 + r() * 0.4;
    const pr = ci >= 500000 ? 1 : ci >= 40000 ? (r() < 0.6 ? 1 : 2) : r() < 0.3 ? 2 : 3;
    return {
      id: `${prefix}-${i + 1}`, no: i + 1, inv: `${prefix.toUpperCase()}-${String(1000 + i * 7 + Math.floor(r() * 5)).padStart(6, '0')}`,
      name, place: `${place} ${place === 'Каб.' ? 100 + Math.floor(r() * 30) : ''}`.trim(),
      qty, costInitial: Math.round(ci * qty), costBalance: Math.round(cb * qty * k), priority: pr,
      list: pr === 3 ? 'Резерв' : 'Основной', sheet: 'Опись', year: 2012 + Math.floor(r() * 13),
    };
  });
}

// Владелец описи — учреждение и подвед, как в записях ОЦ (названия).
const DEMO = [
  { id: 'inv-mt-adm', title: 'Опись ОС — Административный департамент', institution: 'Министерство для ТЕСТА', podved: 'Административный департамент', items: makeItems(11, 64, 'ad') },
  { id: 'inv-mt-kot', title: 'Опись оборудования котельной', institution: 'Министерство для ТЕСТА', podved: 'Административный департамент', items: makeItems(23, 18, 'kt') },
  { id: 'inv-mt', title: 'Опись ОС — центральный аппарат', institution: 'Министерство для ТЕСТА', podved: '', items: makeItems(37, 40, 'ca') },
  { id: 'inv-mo-osh', title: 'Опись ОС — Ошское городское управление', institution: 'Министерство образования (ТЕСТ)', podved: 'Ошское городское управление', items: makeItems(53, 48, 'os') },
];

export function allInventories() {
  return DEMO.map((d) => ({ ...d, total: d.items.length }));
}
export function inventoryById(id) {
  return DEMO.find((d) => d.id === id) || null;
}
// Описи учреждения записи: своего подведа, учреждения без подведа и того же
// учреждения целиком (Б2 «учреждения записи, его подведов и вышестоящих»).
export function inventoriesForRecord(rec) {
  if (!rec || !rec.institution) return [];
  return DEMO.filter((d) => d.institution === rec.institution && (!d.podved || !rec.podved || d.podved === rec.podved));
}
// Поиск описи регионалом по учреждению и названию (Б2): слова в любом порядке.
export function findInventories(q) {
  const words = String(q || '').toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
  return DEMO.filter((d) => {
    const hay = `${d.title} ${d.institution} ${d.podved}`.toLowerCase().replace(/ё/g, 'е');
    return words.every((w) => hay.includes(w));
  });
}

// --- отметки позиций ---------------------------------------------------------
// Ключ — «опись|позиция». Отметка: state — 'seen' (осмотрено) | 'missing'
// (не найдено на месте); cond — состояние оборудования (Рабочее …, как в
// карточке механизмов); photos; comment; by, at, assignId.
const marks = new Map();
const extras = new Map();   // опись → позиции «Нет в описи»
const itemDocs = new Map(); // «опись|позиция» → документы позиции (принятые сканы)

registerPersisted('inventories.marks', {
  snapshot: () => ({ marks: [...marks.entries()], extras: [...extras.entries()], docs: [...itemDocs.entries()] }),
  restore: (saved) => {
    marks.clear(); extras.clear(); itemDocs.clear();
    if (!saved || typeof saved !== 'object') return;
    (saved.marks || []).forEach(([k, v]) => { if (k && v) marks.set(k, v); });
    (saved.extras || []).forEach(([k, v]) => { if (k && Array.isArray(v)) extras.set(k, v); });
    (saved.docs || []).forEach(([k, v]) => { if (k && Array.isArray(v)) itemDocs.set(k, v); });
  },
});

const mk = (invId, itemId) => `${invId}|${itemId}`;
export const markOf = (invId, itemId) => marks.get(mk(invId, itemId)) || null;

// Отметить позицию: patch — { state, cond, comment }; кто и по какому
// назначению — всегда последние.
export function markItem(invId, itemId, patch, { by = '', assignId = '' } = {}) {
  const k = mk(invId, itemId);
  const cur = marks.get(k) || { photos: [] };
  const next = { ...cur, ...patch, by, assignId, at: new Date().toISOString() };
  marks.set(k, next);
  scheduleSave();
  return next;
}
export function unmarkItem(invId, itemId) {
  const cur = marks.get(mk(invId, itemId));
  if (!cur) return;
  // Снимки остаются: снятие отметки — не удаление снятого.
  marks.set(mk(invId, itemId), { photos: cur.photos || [] });
  scheduleSave();
}

let seq = 0;
export function addItemPhoto(invId, itemId, file, { by = '', assignId = '' } = {}) {
  const k = mk(invId, itemId);
  const cur = marks.get(k) || { photos: [] };
  const photo = { id: 'ip-' + Date.now().toString(36) + '-' + (++seq), name: file.name || 'снимок', size: file.size, at: new Date().toISOString(), by, assignId };
  photo.dataUrl = URL.createObjectURL(file);
  keepFileLocally(file, photo);
  marks.set(k, { ...cur, photos: [...(cur.photos || []), photo] });
  scheduleSave();
  return photo;
}

// «Нет в описи» — предмет есть на месте, в описи его нет (Б4).
export function extrasOf(invId) {
  return extras.get(invId) || [];
}
export function addExtra(invId, { name, comment = '' }, { by = '', assignId = '' } = {}) {
  const list = extras.get(invId) || [];
  const x = { id: 'ex-' + Date.now().toString(36) + '-' + (++seq), name: String(name || '').trim() || 'Без названия', comment, by, assignId, at: new Date().toISOString(), photos: [] };
  extras.set(invId, [...list, x]);
  scheduleSave();
  return x;
}

// Документы позиции (В13): принятый ЦОД скан по описи.
export function itemDocsOf(invId, itemId) {
  return itemDocs.get(mk(invId, itemId)) || [];
}
export function addItemDoc(invId, itemId, doc) {
  const k = mk(invId, itemId);
  itemDocs.set(k, [...(itemDocs.get(k) || []), doc]);
  scheduleSave();
  return doc;
}
// Все документы позиций — для поиска по всем документам.
export function allItemDocs() {
  const out = [];
  itemDocs.forEach((docs, k) => {
    const [invId, itemId] = k.split('|');
    const inv = inventoryById(invId);
    const item = inv && inv.items.find((x) => x.id === itemId);
    docs.forEach((d) => out.push({ doc: d, inv, item }));
  });
  return out;
}

// Ход описи (Б5): осмотрено / не найдено / нерабочих / в ремонте / сегодня /
// нет в описи — всего и по спискам и приоритетам.
export function progressOf(invId, today = new Date().toISOString().slice(0, 10)) {
  const inv = inventoryById(invId);
  if (!inv) return null;
  const p = { total: inv.items.length, seen: 0, missing: 0, broken: 0, repair: 0, today: 0, photos: 0, extra: extrasOf(invId).length, byPriority: {} };
  inv.items.forEach((it) => {
    const m = markOf(invId, it.id);
    const pr = (p.byPriority[it.priority] = p.byPriority[it.priority] || { total: 0, seen: 0 });
    pr.total++;
    if (!m) return;
    p.photos += (m.photos || []).length;
    if (m.state === 'seen') { p.seen++; pr.seen++; }
    if (m.state === 'missing') p.missing++;
    if (m.cond === 'Нерабочее') p.broken++;
    if (m.cond === 'В ремонте') p.repair++;
    if (m.state && String(m.at || '').slice(0, 10) === today) p.today++;
  });
  return p;
}

// Отчёт по описи (Б5, листы — как в приложении «Осмотр», термин
// opis-oborudovaniya-i-mehanizmov): «Итог» по спискам и приоритетам, лист на
// каждый список, «По дням», «Нет в описи». Листы — для kernel/xlsx.js.
export function inventoryReportSheets(invId) {
  const inv = inventoryById(invId);
  if (!inv) return [];
  const ddmm = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
  const rowsOf = inv.items.map((it) => ({ it, m: markOf(invId, it.id) || {} }));
  const lists = [...new Set(inv.items.map((it) => it.list))];
  const sumBy = (pick) => {
    const r = rowsOf.filter(pick);
    const seen = r.filter((x) => x.m.state === 'seen' || x.m.state === 'missing');
    return [r.length, seen.length, r.length - seen.length, r.length ? Math.round((seen.length / r.length) * 100) : 0,
      seen.reduce((n, x) => n + (x.it.costInitial || 0), 0), r.filter((x) => x.m.cond === 'Нерабочее').length,
      r.filter((x) => x.m.state === 'missing').length];
  };
  const total = [];
  lists.forEach((l) => {
    total.push([l, 'все', ...sumBy((x) => x.it.list === l)]);
    [1, 2, 3].forEach((p) => { if (rowsOf.some((x) => x.it.list === l && x.it.priority === p)) total.push([l, `П${p}`, ...sumBy((x) => x.it.list === l && x.it.priority === p)]); });
  });
  total.push(['Всего', '', ...sumBy(() => true)]);
  const head = ['№', 'Инв. номер', 'Наименование', 'Место', 'Кол-во', 'Первонач. стоимость, сом', 'Балансовая стоимость, сом', 'Приоритет',
    'Осмотрено', 'Состояние', 'Снимков', 'Документов', 'Комментарий', 'Отметил', 'Когда'];
  const listSheets = lists.map((l) => ({
    name: l,
    head,
    rows: rowsOf.filter((x) => x.it.list === l).map(({ it, m }) => [it.no, it.inv, it.name, it.place, it.qty, it.costInitial, it.costBalance, `П${it.priority}`,
      m.state === 'seen' ? 'Да' : m.state === 'missing' ? 'Не найдено' : 'Нет', m.cond || '', (m.photos || []).length, itemDocsOf(invId, it.id).length,
      m.comment || '', m.by || '', m.at ? `${ddmm(m.at)} ${m.at.slice(11, 16)}` : '']),
    widths: [6, 14, 36, 16, 8, 14, 14, 9, 11, 18, 8, 10, 30, 18, 16],
  }));
  const days = new Map();
  rowsOf.forEach(({ m }) => { if (m.state && m.at) { const d = m.at.slice(0, 10); days.set(d, (days.get(d) || 0) + 1); } });
  return [
    { name: 'Итог', head: ['Список', 'Приоритет', 'Позиций', 'Осмотрено', 'Не осмотрено', '% осмотрено', 'Первонач. стоимость осмотренного, сом', 'Нерабочих', 'Не найдено'],
      rows: total, widths: [12, 10, 10, 10, 12, 11, 20, 10, 11] },
    ...listSheets,
    { name: 'По дням', head: ['Дата', 'Отмечено позиций'], rows: [...days.entries()].sort().map(([d, n]) => [ddmm(d), n]), widths: [12, 12] },
    { name: 'Нет в описи', head: ['Название', 'Комментарий', 'Кто', 'Когда'],
      rows: extrasOf(invId).map((x) => [x.name, x.comment || '', x.by || '', ddmm(x.at)]), widths: [36, 40, 18, 12] },
  ];
}
