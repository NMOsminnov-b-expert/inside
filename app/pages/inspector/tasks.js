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
import { sortedTypes, getType, migrateLiterKinds, tsName, tsFoundKinds } from '../../kernel/registry.js';
import { session } from '../../kernel/session.js';
import { hereNow } from '../../kernel/geoHere.js';
import { tasksOf, allAssignments, isLive, assignmentsOf } from '../../kernel/inspections.js';
import { resultsOf, valuesOf, saveResults, addResultPhoto, addResultScan, replaceScanPages, addResultVoice, markDone } from '../../kernel/inspectionResults.js';
import { retakesOf } from '../../kernel/scanQueue.js';

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

// Категории снимков по виду ОИ. У ТС — категории блока «Фото с осмотра»
// карточки ТС (vehicle/photos.js: «Машина», «Модули» — задача пользователя
// 23.09.2026) и общие «Документы на месте», «Прочее»; «Модули» — только у
// машины с модулями. Категории здания у ТС были ни к чему (замечание
// пользователя 28.10.2026).
export function photoCatsOf(oi) {
  if (!oi || oi.card !== 'vehicle') return PHOTO_CATS;
  const mods = ((oi.vehicle && oi.vehicle.modules) || []).length;
  return ['Машина', ...(mods ? ['Модули'] : []), 'Документы на месте', 'Прочее'];
}

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
export const replaceScan = (typeId, ocId, id, files) => replaceScanPages(typeId, ocId, id, files, { by: currentInspector() });
export { retakesOf };
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

// Кто осматривает — считается по всем записям, а спрашивают об этом на каждой
// отрисовке много раз (перечень ОИ, снимки по ОИ): ответ держим до конца
// текущей задачи браузера.
let curMemo = null;
export function currentInspector() {
  if (viewAs) return viewAs;
  if (curMemo !== null) return curMemo;
  curMemo = pickInspector();
  setTimeout(() => { curMemo = null; }, 0);
  return curMemo;
}

function pickInspector() {
  // Сначала человек из сессии: если осмотры на него есть, показываем его.
  const me = session.state.person;
  const list = inspectorsInData();
  if (list.some((x) => x.name === me)) return me;

  return list.length ? list[0].name : me;
}

export function setInspector(name) {
  viewAs = name || null;
  curMemo = null;
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
      // ОЦ «ТС» — сама машина: один объект осмотра.
      oiCount: (s.metrics && s.metrics.oiCount) || 1,
      pendingNotes: (s.metrics && s.metrics.pendingNotes) || 0,
      // По назначению ждёт, пока назначение действует и осмотр не закончен;
      // без назначения — прежнее правило по статусу.
      pending: assign ? isLive(assign) && !st.done : s.status === READY_STATUS && !st.done,
      plannedAt: assign ? assign.plannedAt || '' : '',
      // Назначенные ОИ: 0 — объект целиком.
      oiAssigned: oiIds.length,
      assignId: assign ? assign.id : '',
      // Движимое (ТС) без адреса и координат: в плане и списке — «Адрес
      // уточняется на месте», на карту и в маршрут не ставится (запись графа
      // osmotr-ts-na-meste-i-po-snimkam).
      addrPending: addrPending(typeId, ocId),
      photos: st.photos.length,
      // Возвращённые ЦОД сканы, которые осмотрщик ещё не переснял.
      retakes: retakesOf(typeId, ocId).length,
      done: st.done,
    });
  });

  out.sort(order);
  return onlyPending ? out.filter((x) => x.pending) : out;
}

function addrPending(typeId, ocId) {
  const t = getType(typeId);
  if (!t || t.manifest.assetKind !== 'movable' || !t.records.loadRecord) return false;
  const rec = t.records.loadRecord(ocId);
  return !!rec && !String(rec.address || '').trim() && !String(rec.gps || '').trim();
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
    if (oi.draft) return ['Выявлено', 'ТС', name || (oi.vehicle || {}).category].filter(Boolean).join(' · ');
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

// --- выявленные объекты ---------------------------------------

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

// ОЦ «ТС» — сама машина, объектов имущества у записи нет (rec.vehicle — те же
// сведения, что oi.vehicle у ТС внутри недвижимости). Осматривается она той же
// формой, что ТС-ОИ, — как объект «ts» этой записи.
export const SELF_TS = 'ts';
const selfTs = (rec) => (rec && rec.vehicle && !(rec.oi || []).length
  ? [{ id: SELF_TS, card: 'vehicle', vehicle: rec.vehicle, name: tsName(rec), docs: [], ocSelf: true }] : []);

// ОИ, назначенные осмотрщику по объекту: null — объект целиком или назначений
// нет (прежнее правило: осмотрщик видит все ОИ). ТС, переданное другому
// осмотрщику (решение пользователя 27.10.2026: «ТС может быть переназначен
// отдельно от ОЦ»), у прежнего из перечня уходит.
export function assignedOiIds(typeId, ocId) {
  const me = currentInspector();
  const mine = assignmentsOf(typeId, ocId).filter((a) => a.person === me);
  if (!mine.length || mine.some((a) => !a.oiIds || !a.oiIds.length)) return null;
  return new Set(mine.flatMap((a) => a.oiIds));
}

// Учтённые ОИ записи (назначенные этому осмотрщику) и выявленные — один
// список для осмотрщика.
export function inspOis(rec, typeId, ocId) {
  const ids = assignedOiIds(typeId, ocId);
  const own = [...((rec && rec.oi) || []), ...selfTs(rec)].filter((o) => !ids || ids.has(o.id));
  return [...own, ...foundOi(typeId, ocId)];
}
// Сколько ОИ записи осматривают другие осмотрщики — строкой в перечне.
export function othersOiCount(rec, typeId, ocId) {
  const ids = assignedOiIds(typeId, ocId);
  return ids ? ((rec && rec.oi) || []).filter((o) => !ids.has(o.id)).length : 0;
}

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

// Выявленное ТС (ответ пользователя на В2 27.10.2026; запись графа
// osmotr-ts-na-meste-i-po-snimkam): черновик ОИ «Транспортное средство» —
// вид, марка, номера, где стоит, описание и источник сведений («видел сам» или
// «со слов» контактного лица). Снимки и документы — по id черновика, как у
// выявленного здания. Сохраняется, когда есть хотя бы одно сведение: описание,
// снимок или документ.
export function newFoundTs(by = '') {
  return {
    id: 'found-' + Date.now().toString(36) + (++foundSeq),
    card: 'vehicle',
    draft: true,
    cat: 'ts',
    vehicle: { kind: '', category: '', f: {}, modules: [], extra: [] },
    name: '',
    where: '',
    note: '',
    source: { kind: 'self' },
    foundBy: by,
    foundAt: stamp(new Date()),
  };
}
export const foundTsKinds = () => tsFoundKinds();
export function foundTsCounts(typeId, ocId, id) {
  const st = taskState(typeId, ocId);
  return {
    photos: st.photos.filter((p) => p.oiId === id).length,
    scans: (st.scans || []).filter((x) => x.oiId === id).length,
  };
}
// Пустое ли выявленное ТС: нет ни описания, ни снимка, ни документа.
export function foundTsEmpty(typeId, ocId, d) {
  const n = foundTsCounts(typeId, ocId, d.id);
  return !String(d.note || '').trim() && !n.photos && !n.scans;
}
// Правка поля выявленного ТС (черновик или сохранённое).
export function setFoundTs(d, key, value, contacts = []) {
  const v = d.vehicle;
  if (key === 'kind') {
    v.category = value;
    // Спецтехника — свой вид объекта у карточки ТС (tsModel.js, SELF_CAT).
    v.kind = !value ? '' : value === tsFoundKinds().slice(-1)[0] ? 'self' : 'base';
  } else if (['make', 'plate', 'vin'].includes(key)) v.f[key] = value;
  else if (key === 'where' || key === 'note') d[key] = value;
  else if (key === 'contactId') {
    const c = contacts.find((x) => x.id === value);
    d.source = { ...d.source, contactId: value, label: c ? c.name || c.phone || '' : '' };
  } else if (key === 'fio') d.source = { ...d.source, name: value, label: value };
  else if (key === 'phone') d.source = { ...d.source, phone: value };
  d.name = [v.f.make, v.f.plate].filter(Boolean).join(' · ');
}
export function addFoundTs(typeId, ocId, d) {
  delete d.err;
  foundOi(typeId, ocId).push(d);
  saveResults();
  return d;
}
// Отменённый черновик: снимки и документы остаются в осмотре без привязки —
// «Любые фото с осмотров — важная информация».
export function dropFoundTsDraft(typeId, ocId, id) {
  const st = taskState(typeId, ocId);
  st.photos.forEach((p) => { if (p.oiId === id) p.oiId = ''; });
  (st.scans || []).forEach((x) => { if (x.oiId === id) x.oiId = ''; });
  saveResults();
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
  (st.scans || []).forEach((x) => { if (x.oiId === id) x.oiId = ''; });
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
  // Место съёмки — координаты телефона (ответ В4 27.10.2026, kernel/geoHere.js):
  // приходят после снимка; нет разрешения или сигнала — снимок без места.
  const photo = addResultPhoto(typeId, ocId, file, {
    oiId,
    cat: cat || PHOTO_CATS[0],
    gps: '',
    // Полная отметка времени с поясом: прежнее «ГГГГ-ММ-ДД ЧЧ:ММ», вырезанное
    // из UTC-строки, читалось как местное, и снимки показывали время по UTC
    // (замечание пользователя 15.10.2026: «Я в поясе +6»).
    at: new Date().toISOString(),
  });
  hereNow().then((place) => { if (place) { photo.place = place; saveResults(); } });
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
  const ois = inspOis(rec, typeId, ocId);

  st.photos.forEach((p) => {
    const oi = ois.find((o) => o.id === p.oiId);
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
