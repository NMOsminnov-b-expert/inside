// Мои осмотры: откуда берутся задачи и что осмотрщик к ним добавляет.
//
// Задача — назначение на осмотр (kernel/inspections.js, ТЗ панели осмотров
// 12.10.2026): региональный менеджер назначает осмотрщика на объект или его
// ОИ, с документами, описями и плановой датой. Объекты, где человек стоит в
// resp.insp без назначения (назначенные до появления назначений), тоже его
// задачи — по прежнему правилу: ждут осмотра в статусе «Удостоверен по
// документам».
//
// Записи берём через kernel/registry.js: страница не имеет права импортировать
// модуль типа ОЦ напрямую (см. архитектурные правила в app/README.md).
import { sortedTypes, getType, migrateLiterKinds } from '../../kernel/registry.js';
import { session } from '../../kernel/session.js';
import { tasksOf, allAssignments, isLive } from '../../kernel/inspections.js';
import { resultsOf, valuesOf, saveResults, addResultPhoto, addResultScan, addResultVoice, markDone } from '../../kernel/inspectionResults.js';

// Статус, в котором объект ждёт осмотра. Тот же, что в срезе «Мне осмотреть»:
// до удостоверения по документам осматривать нечего — данные ЦОД ещё не готовы.
export const READY_STATUS = 'Удостоверен по документам';

// Лимит снимков из ТЗ: 250 на основное строение и участок, 50 на
// вспомогательное. Здесь общий лимит на задачу — по строениям он разойдётся,
// когда фото будут привязываться к литере, а не к осмотру целиком.
export const PHOTO_LIMIT = 250;

export const PHOTO_CATS = [
  'Фасад', 'Внутр. помещения', 'Кровля', 'Конструкции',
  'Земельный участок', 'Документы на месте', 'Прочее',
];

// Снимок, ещё не отнесённый к категории (16.10.2026: «надо оставить на
// распределить потом. При том не даём завершить осмотр, пока не распределили
// фото»). Категорией съёмки не является — в перечень выбора не входит.
export const UNSORTED = 'Не распределено';

// Контакты, добавленные осмотрщиком на месте (решение пользователя 16.10.2026:
// «У осмотрщика должна быть возможность добавить контакты с комментариями»).
// Поля — как у контактов карточек и учреждений (kernel/contacts.js): имя,
// должность, телефон, почта, комментарий.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: контакт с осмотра — заявка ЦОД: добавить в контакты
// объекта или учреждения, с автором и временем; развилка — переносить сами
// или оставлять при осмотре.
export function voicesOf(typeId, ocId, oiId = null) {
  const st = taskState(typeId, ocId);
  if (!Array.isArray(st.voices)) st.voices = [];
  return oiId === null ? st.voices : st.voices.filter((v) => (v.oiId || '') === oiId);
}
export const addVoice = (typeId, ocId, blob, opts) => addResultVoice(typeId, ocId, blob, { ...opts, by: currentInspector() });
export function removeVoice(typeId, ocId, id) {
  const list = voicesOf(typeId, ocId);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  try { URL.revokeObjectURL(list[i].dataUrl); } catch (e) { /* уже отозвана */ }
  list.splice(i, 1);
  saveResults();
}

export function scansOf(typeId, ocId) {
  const st = taskState(typeId, ocId);
  if (!Array.isArray(st.scans)) st.scans = [];
  return st.scans;
}
export const addScan = (typeId, ocId, files, opts) => addResultScan(typeId, ocId, files, { ...opts, by: currentInspector() });
export function removeScan(typeId, ocId, id) {
  const list = scansOf(typeId, ocId);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  list[i].pages.forEach((p) => { try { URL.revokeObjectURL(p.dataUrl); } catch (e) { /* уже отозвана */ } });
  list.splice(i, 1);
  saveResults();
}

export function contactsOf(typeId, ocId) {
  const st = taskState(typeId, ocId);
  if (!Array.isArray(st.contacts)) st.contacts = [];
  return st.contacts;
}
export const unsortedCount = (typeId, ocId) => taskState(typeId, ocId).photos.filter((p) => p.cat === UNSORTED).length;

const key = (typeId, ocId) => `${typeId}|${ocId}`;

// Состояние осмотра — в ядре и сохраняется (kernel/inspectionResults.js,
// 15.10.2026): прежде жило в памяти вкладки и пропадало при перезагрузке.
export const taskState = (typeId, ocId) => resultsOf(typeId, ocId);
export { saveResults, markDone };

// Значения осмотра ОДНОГО объекта имущества. Осмотр ведётся по ОИ, а не по
// записи целиком — так устроена и рабочая система (адрес её экрана:
// /inspections/<id>/assets/<assetId>), и это единственный способ описать
// литеру и котельную по-разному.
export const assetValues = (typeId, ocId, oiId) => valuesOf(typeId, ocId, oiId);

// --- кто осматривает ------------------------------------------------------
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: осмотрщик — это вошедший пользователь, и выбора здесь
// нет. В макете человека выбирают, иначе экран пуст: демо-данные назначены
// реальным фамилиям, а сессия по умолчанию — «Осминнов Н.», у которого осмотров
// нет. Выбор держим на странице, а не в сессии: смена сессии перекрасила бы
// весь остальной интерфейс.
let viewAs = null;

export function inspectorsInData() {
  const names = new Map();
  sortedTypes().forEach((t) => {
    const res = t.records.queryRecords({ filter: {}, offset: 0, limit: 100000 });
    res.rows.forEach((s) => {
      const who = (s.resp && s.resp.insp) || '';
      if (who) names.set(who, (names.get(who) || 0) + 1);
    });
  });
  // Назначенные на отдельные ОИ в resp.insp могут не попасть — поле одно на
  // запись; их берём из назначений.
  allAssignments().forEach((a) => {
    if (isLive(a) && !names.has(a.person)) names.set(a.person, 0);
  });
  return [...names.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'));
}

export function currentInspector() {
  if (viewAs) return viewAs;

  // Сначала человек из сессии: если осмотры на него есть, показываем его.
  const me = session.state.person;
  const list = inspectorsInData();
  if (list.some((x) => x.name === me)) return me;

  return list.length ? list[0].name : me;
}

export function setInspector(name) {
  viewAs = name || null;
}

// --- список задач ---------------------------------------------------------

// Ждущие осмотра — вперёд: экран открывают, чтобы поехать, а не чтобы читать
// историю. Внутри группы порядок по дате обновления, свежие сверху.
function order(a, b) {
  if (a.pending !== b.pending) return a.pending ? -1 : 1;
  // Ждущие — по плановой дате, ближайшие сверху; без даты — после датированных.
  if (a.pending && (a.plannedAt || b.plannedAt)) return String(a.plannedAt || '9999').localeCompare(String(b.plannedAt || '9999'));
  return String(b.updatedAt).localeCompare(String(a.updatedAt));
}

export function myTasks({ onlyPending = false } = {}) {
  const person = currentInspector();
  const tasks = tasksOf(person);
  if (!tasks.length) return [];

  // Сводки строк — одним запросом на тип: задач немного, а запрос по id
  // у реестра нет.
  const rowsOf = new Map();
  const needTypes = new Set(tasks.map((t) => t.typeId));
  sortedTypes().forEach((t) => {
    if (!needTypes.has(t.manifest.id)) return;
    const res = t.records.queryRecords({ filter: {}, offset: 0, limit: 100000 });
    res.rows.forEach((s) => rowsOf.set(key(t.manifest.id, s.id), s));
  });

  const out = [];
  tasks.forEach(({ typeId, ocId, assign, oiIds = [] }) => {
    const s = rowsOf.get(key(typeId, ocId));
    if (!s) return;
    const st = taskState(typeId, ocId);
    out.push({
      key: key(typeId, ocId),
      typeId,
      ocId,
      typeLabel: s.typeLabel,
      title: s.title,
      eni: s.eniAll || s.eni,
      status: s.status,
      institution: s.institution,
      updatedAt: s.updatedAt,
      oiCount: (s.metrics && s.metrics.oiCount) || 0,
      pendingNotes: (s.metrics && s.metrics.pendingNotes) || 0,
      // По назначению ждёт, пока назначение действует и осмотр не закончен;
      // без назначения — прежнее правило по статусу.
      pending: assign ? isLive(assign) && !st.done : s.status === READY_STATUS && !st.done,
      plannedAt: assign ? assign.plannedAt || '' : '',
      // Назначенные ОИ: 0 — объект целиком.
      oiAssigned: oiIds.length,
      assignId: assign ? assign.id : '',
      photos: st.photos.length,
      done: st.done,
    });
  });

  out.sort(order);
  return onlyPending ? out.filter((x) => x.pending) : out;
}

// Полная запись нужна на экране задачи: координаты, примечания, документы и
// перечень ОИ в сводке лежат в записи, а не в её сводке для реестра.
export function loadTask(typeId, ocId) {
  const t = getType(typeId);
  if (!t || !t.records.loadRecord) return null;
  const rec = t.records.loadRecord(ocId) || null;
  // Вид литеры — тем же правилом, что карточка при открытии: иначе у записи,
  // не открытой в карточке, «Тип объекта имущества» в осмотре пуст, а
  // карточка показала бы «Гражданская».
  if (rec) migrateLiterKinds(rec);
  return rec;
}

// Документы на осмотр — все, что есть у записи: и её собственные, и документы
// её объектов имущества. На месте осмотрщику нужны и гос. акт участка, и
// техпаспорт литеры; раскладывать их по разным экранам значит заставить его
// искать. У каждого документа помечаем, чей он, — иначе непонятно, к какой
// литере относится техпаспорт.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь будет ВЫБОРКА, назначенная региональным
// менеджером (решение пользователя 08.09.2026 — осмотрщик видит документы,
// которые ему назначили), а не всё, что есть у записи.
export function taskDocs(rec) {
  const out = [];

  (rec.docs || []).forEach((d) => out.push({ doc: d, owner: 'Объект оценки' }));

  (rec.oi || []).forEach((o) => {
    (o.docs || []).forEach((d) => out.push({ doc: d, owner: oiLabel(o) }));
  });

  return out;
}

// Подпись объекта имущества — то, чем осмотрщик его называет вслух. Нужна и
// фотографиям, и документам: снимок без литеры бесполезен, а «паспорт котла»
// без указания котла не найти (требование пользователя 08.09.2026).
//
// Транспортных средств в макете пока нет отдельным видом ОИ, но когда они
// появятся, они попадут в тот же перечень — подпись считается по виду
// карточки, а не по заранее перечисленным типам.
export function oiLabel(oi) {
  if (!oi) return 'Объект имущества';

  // Наименование не повторяем, если оно совпадает с видом: у участка name
  // обычно и есть «Земельный участок», и подпись задваивалась.
  const raw = String(oi.name || '').trim();
  const same = (kind) => raw.toLowerCase() === kind.toLowerCase();
  const name = raw;

  if (oi.card === 'building') {
    // Выявленное на осмотре — по факту, без литеры.
    if (oi.draft) return ['Выявлено', name || foundCat(oi.cat).label].join(' · ');
    const head = oi.letter ? 'Литера ' + oi.letter : 'Строение';
    return same(head) ? head : [head, name].filter(Boolean).join(' · ');
  }
  if (oi.card === 'apartment') {
    return ['Квартира' + (oi.flat ? ' №' + oi.flat : ''), name].filter(Boolean).join(' · ');
  }
  if (oi.card === 'land') {
    return same('Земельный участок') ? 'Земельный участок'
      : ['Земельный участок', name].filter(Boolean).join(' · ');
  }
  // Механизмы и оборудование и транспортное средство — в любом типе ОЦ:
  // подпись уже собрана из состава единиц или из марки и госномера.
  if (oi.card === 'mech') {
    return ['Механизмы и оборудование', name].filter(Boolean).join(' · ');
  }
  if (oi.card === 'vehicle') {
    return ['Транспортное средство', name].filter(Boolean).join(' · ');
  }
  if (oi.card === 'movable') {
    const kind = oi.kind === 'ОФИС' ? 'Офисная техника'
      : oi.kind === 'ТС' ? 'Транспортное средство' : 'Механизм';
    return [kind, name, oi.serial].filter(Boolean).join(' · ');
  }

  return name || 'Объект имущества';
}

// Список ОИ записи для выбора: к чему привязать снимок.
export function oiOptions(rec, typeId = '', ocId = '') {
  const list = typeId && ocId ? inspOis(rec, typeId, ocId) : (rec.oi || []);
  return list.map((o) => ({ id: o.id, label: oiLabel(o) }));
}

// --- помещения и выявленные объекты ---------------------------------------

// Помещения строения. В рабочей системе такой раздел есть («Помещения» с
// кнопкой «Добавить помещение»), но в присланном снимке он пуст — состав
// строки оттуда не виден. Здесь пара, без которой помещение не описать:
// наименование и площадь. Состав уточним по заполненному примеру.
export function premises(typeId, ocId, oiId) {
  const v = assetValues(typeId, ocId, oiId);
  if (!Array.isArray(v.premises)) v.premises = [];
  return v.premises;
}

let premiseSeq = 0;

export function addPremise(typeId, ocId, oiId) {
  const list = premises(typeId, ocId, oiId);
  list.push({ id: 'pm-' + Date.now().toString(36) + (++premiseSeq), name: '' });
  saveResults();
  return list;
}

export function removePremise(typeId, ocId, oiId, id) {
  const list = premises(typeId, ocId, oiId);
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list.splice(i, 1);
  saveResults();
}

// Выявленные на осмотре здания — неутверждённые литеры (решение пользователя
// 15.10.2026, запись графа vyyavlennye-na-osmotre-zdaniya-…): «Увидел здание
// — добавил его… По сути то же меню создания ОИ, однако сильно упрощенное»;
// «для него всё должно выглядеть как обычная литера на участке». Черновик —
// объект имущества того же вида (card 'building'), категория задаёт вид
// литеры и признак жилого: по ним форма осмотра подбирает разделы
// (производственные параметры, класс капитальности). Лежит в результатах
// осмотра, а не в составе записи: новую карточку заводят только ЦОД и оценка
// после разбора на вкладке «Результаты осмотра» карточки ОЦ. Буквы нет —
// «Выявленное называем по факту», литеру ставят по техпаспорту.
//
// Пока осмотр не завершён, осмотрщик правит черновик, переносит снимки и
// значения в учтённую литеру и удаляет созданное («сам осмотрщик может
// понять, что допустил ошибку»); после завершения черновик закрыт и ждёт
// разбора («По завершению осмотра»).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: заявка на добавление объекта имущества с автором и
// временем; на месте без связи — копится на телефоне и уходит с осмотром.
export const FOUND_CATS = [
  { key: 'house', label: 'Жилой дом', residential: true, litKind: '' },
  { key: 'civil', label: 'Гражданское здание', residential: false, litKind: 'civil' },
  { key: 'prod', label: 'Производственно-складское', residential: false, litKind: 'prod' },
  { key: 'other', label: 'Прочее (навес, сарай…)', residential: false, litKind: 'other' },
];
export const foundCat = (key) => FOUND_CATS.find((c) => c.key === key) || FOUND_CATS[FOUND_CATS.length - 1];

export function foundOi(typeId, ocId) {
  const st = taskState(typeId, ocId);
  if (!Array.isArray(st.found)) st.found = [];
  // Прежние записи «выявлено» (вид словом, без карточки) — черновиками
  // категории «Прочее»: вид становится названием.
  st.found.forEach((f) => {
    if (f.card) return;
    Object.assign(f, { card: 'building', draft: true, cat: 'other', litKind: 'other', residential: false, name: f.name || f.kind || '', landId: '' });
  });
  return st.found;
}

// Учтённые ОИ записи и выявленные — один список для осмотрщика.
export const inspOis = (rec, typeId, ocId) => [...((rec && rec.oi) || []), ...foundOi(typeId, ocId)];
export const isFoundLocked = (typeId, ocId) => !!taskState(typeId, ocId).done;

let foundSeq = 0;
const two = (n) => String(n).padStart(2, '0');
// Местное время осмотра, как его видит осмотрщик: «15.10.2026 14:05».
const stamp = (d) => `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;

export function addFoundOi(typeId, ocId, { cat = 'other', name = '', landId = '', by = '' } = {}) {
  const c = foundCat(cat);
  const item = {
    id: 'found-' + Date.now().toString(36) + (++foundSeq),
    card: 'building',
    draft: true,
    cat: c.key,
    litKind: c.litKind,
    residential: c.residential,
    name: String(name || '').trim(),
    note: '',
    landId,
    foundBy: by,
    foundAt: stamp(new Date()),
  };
  foundOi(typeId, ocId).push(item);
  saveResults();
  return item;
}

// Перенести выявленное в учтённую литеру: снимки — к ней, значения осмотра —
// в её пустые поля (заполненное у литеры не трогаем). Возвращает, сколько
// снимков и значений перенесено.
export function moveFoundTo(typeId, ocId, id, oiId) {
  const st = taskState(typeId, ocId);
  let photos = 0;
  st.photos.forEach((p) => { if (p.oiId === id) { p.oiId = oiId; photos += 1; } });
  const from = st.assets[id] || {};
  const to = valuesOf(typeId, ocId, oiId);
  let values = 0;
  Object.entries(from).forEach(([k, v]) => {
    const empty = to[k] == null || to[k] === '' || (Array.isArray(to[k]) && !to[k].length);
    if (empty && v != null && v !== '' && !(Array.isArray(v) && !v.length)) { to[k] = v; values += 1; }
  });
  saveResults();
  return { photos, values };
}

// Удалить выявленное. Снимки не пропадают — остаются без привязки к объекту
// («Любые фото с осмотров — важная информация»).
export function removeFoundOi(typeId, ocId, id) {
  const st = taskState(typeId, ocId);
  const list = foundOi(typeId, ocId);
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list.splice(i, 1);
  st.photos.forEach((p) => { if (p.oiId === id) p.oiId = ''; });
  delete st.assets[id];
  saveResults();
}


// --- фото -----------------------------------------------------------------

export function addPhoto(typeId, ocId, file, { oiId = '', cat = '' } = {}) {
  const st = taskState(typeId, ocId);
  if (st.photos.length >= PHOTO_LIMIT) return { error: `Больше ${PHOTO_LIMIT} снимков на осмотр не нужно` };
  // К какому объекту имущества относится снимок: без этого фото кровли не
  // отличить от фото кровли соседней литеры.
  //
  // ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: координаты снимка ТЗ требует для каждого фото — из
  // EXIF файла или у геолокации устройства в момент съёмки; это работа
  // сервера и приложения, а не макета.
  const photo = addResultPhoto(typeId, ocId, file, {
    oiId,
    cat: cat || PHOTO_CATS[0],
    gps: '',
    // Полная отметка времени с поясом: прежнее «ГГГГ-ММ-ДД ЧЧ:ММ», вырезанное
    // из UTC-строки, читалось как местное, и снимки показывали время по UTC
    // (замечание пользователя 15.10.2026: «Я в поясе +6»).
    at: new Date().toISOString(),
  });
  return { photo };
}

export function removePhoto(typeId, ocId, id) {
  const st = taskState(typeId, ocId);
  const i = st.photos.findIndex((p) => p.id === id);
  if (i < 0) return;
  // Ссылку освобождаем сразу: снимков за смену набирается много, и держать
  // выброшенные blob'ы в памяти телефона незачем.
  try { URL.revokeObjectURL(st.photos[i].dataUrl); } catch (e) { /* уже отозвана */ }
  st.photos.splice(i, 1);
  saveResults();
}

// Перенос снимка — прямое требование ТЗ («должна быть предусмотрена
// возможность переноса фото в другую позицию»). Переносить можно и в другую
// категорию, и к другому объекту имущества: на осмотре легко снять кровлю и
// приписать её соседней литере.
export function movePhoto(typeId, ocId, id, patch = {}) {
  const p = taskState(typeId, ocId).photos.find((x) => x.id === id);
  if (!p) return;
  if (patch.cat !== undefined) p.cat = patch.cat;
  if (patch.oiId !== undefined) p.oiId = patch.oiId;
  saveResults();
}

export function photoById(typeId, ocId, id) {
  return taskState(typeId, ocId).photos.find((x) => x.id === id) || null;
}

// Снимки сгруппированы по объекту имущества, а внутри — по категории: именно
// так их потом разбирают в отчёте, и так же их ищет сам осмотрщик («где у меня
// кровля литеры Б»).
export function photoGroups(rec, typeId, ocId) {
  const st = taskState(typeId, ocId);
  const byOi = new Map();

  st.photos.forEach((p) => {
    const oi = inspOis(rec, typeId, ocId).find((o) => o.id === p.oiId);
    const key = p.oiId || '';
    if (!byOi.has(key)) {
      byOi.set(key, { label: oi ? oiLabel(oi) : 'Без привязки к объекту', cats: new Map() });
    }
    const cats = byOi.get(key).cats;
    if (!cats.has(p.cat)) cats.set(p.cat, []);
    cats.get(p.cat).push(p);
  });

  return byOi;
}

// Выезды осмотрщика на день — для отчётов за день (ТЗ рабочего дня, раздел 3):
// утром — куда выезжает, вечером — что осмотрено. Подпись места — как в
// отчётах: учреждение — объект.
export function dayTrips(date) {
  return myTasks().filter((t) => t.assignId && t.plannedAt === date).map((t) => ({
    assignId: t.assignId,
    label: [t.institution, t.title].filter(Boolean).join(' — '),
    title: t.title,
    sub: [t.institution, t.eni].filter(Boolean).join(' · '),
    done: t.done,
  }));
}
