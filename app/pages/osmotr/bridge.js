// Мост E•state ↔ приложение «Осмотр» (PWA в рамке страницы осмотрщиков).
//
// Решения пользователя 03.11.2026 (граф: integraciya-prilozheniya-osmotr-s-e-state-…):
// учётная запись — E•state; в приложении только назначенные объекты; есть
// связь — отправка по мере съёмки, нет — копится и уходит позже.
//
// Обмен — сообщениями между окнами (postMessage), только со своей рамкой:
//   приложение → E•state  { osmotr: 1, id, t, body } (+ blob — файл)
//   E•state → приложение  { osmotr: 1, re: id, ok, body, blob, error }
//                         { osmotr: 1, t: 'changed' } — назначения поменялись
// Запросы: hello — кто вошёл; assignments — назначенные объекты со всем, что
// нужно на выезде; doc — файл документа; send — файл из папки объекта (снимок,
// значения формы, голос, PDF) в «Результаты осмотра»; finish — «Осмотр
// закончен»; exit — назад в систему.
//
// Объект приложения — объект оценки целиком: назначения одного осмотрщика на
// один ОЦ (бывает несколько — по разным ОИ) сводятся в один объект.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: те же запросы — HTTP API сервера с входом по учётной
// записи (токен), а не сообщения окну макета; файлы — в хранилище сервера.
// Приложение вне рамки (на телефоне) ходит на сервер напрямую.
import { session, roleLabel } from '../../kernel/session.js';
import { getType } from '../../kernel/registry.js';
import { assignmentsOfPerson, coversOi, deadlineOf, startWork, finishWork, myAssignsOn, logEvent, changed } from '../../kernel/inspections.js';
import { reviewOf, resultsOf, saveResults, valuesOf, addResultPhoto } from '../../kernel/inspectionResults.js';
import { inventoryById, markItem, markOf, addItemPhoto } from '../../kernel/inventories.js';
import { xlsxBytes } from '../../kernel/xlsx.js';
import { getValue, setValue } from '../../kernel/fieldSchema.js';
import { geoByEni, centerOf } from '../../kernel/cadastreGeo.js';
import { scheduleSave } from '../../kernel/persist.js';
import { institutionChain } from '../../kernel/contacts.js';
import { loadTask, ownOis, oiLabel } from '../inspector/tasks.js';
import { gpsOfObject } from '../inspections/route.js';
import { applyEntries, markDeleted } from '../inspector/archiveImport.js';

const SOURCE = 'приложение «Осмотр»';
const INSPECTING = new Set(['insp', 'any', 'admin']);

// Сущность объекта в приложении (решение пользователя 03.11.2026 по аудиту:
// «3 сущности. ТС, недвижка и опись. Документы - раздел»): объект-ТС — сама
// машина (снимки и «Документы» прямо в объекте), опись — механизмы, остальное —
// недвижимость (литеры, квартира, участки; ТС и механизмы внутри — своими ОИ).
const entityOf = (typeId) => (typeId === 'vehicle' ? 'vehicle' : typeId === 'mechanisms' ? 'inventory' : 'real');

const REAL = 'Недвижимое';
const VEHICLES = 'Транспортные средства';
const LAND = 'Земельный участок';
const digits = (s) => String(s || '').replace(/\D/g, '');

// Папка ОИ в приложении (путь от объекта): литера — «Литера А» (написание макета,
// решение 03.11.2026), по ней же ищет разбор архива (letterOf); участок — своя
// папка по ЕНИ («Земельный участок/<ЕНИ>»: участков в объекте бывает несколько);
// ТС — по госномеру в «Транспортных средствах»; у объекта-ТС его ТС — сам объект.
function folderOf(oi, rec, entity, landNo) {
  if (oi.card === 'vehicle') {
    if (entity === 'vehicle') return { path: '' };
    const plate = String(((oi.vehicle || {}).f || {}).plate || '').trim();
    return { path: `${VEHICLES}/${clean(plate || oi.name || 'ТС')}` };
  }
  if (oi.card === 'land') return { path: `${REAL}/${LAND}/${digits(oi.eni) || digits(rec.eni) || 'Участок ' + landNo}` };
  if (oi.card === 'apartment') return { path: `${REAL}/${clean('Квартира' + (oi.flat ? ' №' + oi.flat : ''))}` };
  if (oi.card === 'building') return { path: `${REAL}/${clean(oi.letter ? 'Литера ' + oi.letter : (oi.name || 'Строение'))}` };
  if (oi.card === 'aux') return { path: `${REAL}/${clean(oi.name || 'Вспомогательная постройка')}` };
  return null; // механизмы — описью (обмен описью)
}

// Название объекта в приложении (имя папки): адрес; у ТС — марка и госномер; у механизмов — опись.
function titleOf(rec, ocId) {
  const v = (rec.vehicle || {}).f || {};
  const ts = [v.make, v.plate].filter(Boolean).join(' · ');
  return clean(rec.address || ts || (rec.mech && rec.mech.name) || rec.name || rec.eni || ocId);
}

// Тип ОИ формы приложения (Params.OI_TYPES): квартира; литера жилого дома — «Жилой дом»; иначе — «Здание».
// По виду ОИ в системе (REALTY_OI_TYPES модулей): жилое — «Жилой дом», вид литеры «other» — «Прочее строение»,
// «aux» — «Вспомогательная постройка»; иначе — «Здание» (аудит 03.11.2026: тип не по виду ОЦ, а по самой литере).
function oiTypeOf(oi, typeId) {
  if (oi.card === 'apartment') return 'Квартира';
  if (oi.card !== 'building' && oi.card !== 'aux') return '';
  if (oi.card === 'aux' || oi.litKind === 'aux') return 'Вспомогательная постройка';
  if (oi.residential || (typeId === 'residential-house' && !oi.litKind)) return 'Жилой дом';
  if (oi.litKind === 'other') return 'Прочее строение';
  return 'Здание';
}

const clean = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();

// --- Опись: обмен с приложением (решение пользователя 03.11.2026: «Обмен с системой») ---
//
// Описи объекта — приложенные регионалом к назначениям (kernel/inventories.js) и единицы механизмов-ОИ (в том
// числе механизмы-ОЦ). В приложение — книгой Excel (запрос «inventory»), приложение заводит её своей описью в
// «Механизмах и оборудовании/<опись>». Обратно — файлами этой папки:
//   «Нерабочие.txt», «Требуется ремонт.txt», «Осмотрено ранее.txt» — инвентарники построчно → состояние позиции;
//   снимок в папке предмета (body.items — инвентарники из «Инвентарники.txt» папки) → снимок позиции, «осмотрено».
// У описи учреждения — отметки описи (markItem, addItemPhoto); у механизмов-ОИ — поля формы осмотра единиц
// (u.<id>.found / state).
const MACHINES = 'Механизмы и оборудование';
const MARK_FILES = { 'Нерабочие.txt': 'Нерабочее', 'Требуется ремонт.txt': 'В ремонте', 'Осмотрено ранее.txt': '' };
const invKey = (s) => String(s || '').toUpperCase().replace(/[\s\-–—.]/g, '');

function inventoriesOf(rec, list, ois) {
  const out = [];
  const seen = new Set();
  list.flatMap((a) => a.inventories || []).forEach((id) => {
    const inv = inventoryById(id);
    if (!inv || seen.has(id)) return;
    seen.add(id);
    out.push({ id, kind: 'inv', title: inv.title, items: inv.items.map((it, i) => ({ id: it.id, no: it.no || i + 1, inv: it.inv || '', name: it.name, place: it.place || '',
      qty: it.qty || 1, cost: it.costInitial || '', balance: it.costBalance || '', priority: it.priority || '', list: it.list || '' })) });
  });
  ois.filter((o) => o.card === 'mech').forEach((o) => {
    out.push({ id: 'mech:' + o.id, kind: 'mech', oiId: o.id, title: oiLabel(o),
      items: (o.mechanisms || []).map((u, i) => ({ id: u.id, no: i + 1, inv: u.inv || '', name: u.name || 'Единица', place: '', qty: u.qty || 1, cost: u.cost || '', balance: '', priority: '', list: '' })) });
  });
  return out.map((x) => ({ ...x, folder: `${MACHINES}/${clean(x.title)}` }));
}

// Позиция по инвентарнику из приложения: инвентарный номер или «№N» (у позиции без номера).
function itemOf(inv, key) {
  const k = String(key || '').trim();
  if (/^№\s*\d+$/.test(k)) return inv.items.find((it) => String(it.no) === k.replace(/\D/g, ''));
  return inv.items.find((it) => it.inv && invKey(it.inv) === invKey(k));
}

async function inventoryBook(inv) {
  const head = ['№', 'Инв. номер', 'Наименование', 'Место', 'Кол-во', 'Первонач. стоимость, сом', 'Балансовая стоимость, сом', 'Приоритет', 'Список'];
  const rows = inv.items.map((it) => [it.no, it.inv, it.name, it.place, it.qty, it.cost, it.balance, it.priority, it.list]);
  return new Blob([await xlsxBytes([{ name: 'Опись', head, rows }])], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Файл из «Механизмов и оборудования» → отметки описи. Итог — как у applyEntries: принят ли и почему.
async function applyInventory({ typeId, ocId, rec, list, person, assignId }, rel, blob, items) {
  const parts = rel.split('/');
  const inv = inventoriesOf(rec, list, ownOis(rec)).find((x) => rel.startsWith(x.folder + '/'));
  if (!inv) return { taken: false, why: 'опись не из назначения' };
  const inner = parts.slice(inv.folder.split('/').length);
  const name = inner[inner.length - 1];
  const vals = inv.kind === 'mech' ? valuesOf(typeId, ocId, inv.oiId) : null;
  const mark = (it, patch) => {
    if (vals) {
      if (patch.state === 'seen') setValue(vals, `u.${it.id}.found`, 'Найдено');
      if (patch.cond !== undefined) setValue(vals, `u.${it.id}.state`, patch.cond);
    } else {
      const cur = markOf(inv.id, it.id) || {};
      markItem(inv.id, it.id, { ...patch, state: patch.state || cur.state || 'seen' }, { by: person, assignId });
    }
  };
  if (inner.length === 1 && name in MARK_FILES) {
    const listed = (await blob.text()).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((k) => itemOf(inv, k)).filter(Boolean);
    const cond = MARK_FILES[name];
    listed.forEach((it) => mark(it, cond ? { cond, app: name } : { state: 'seen', comment: 'осмотрено ранее' }));
    // Снятые в приложении отметки — снимаются и здесь (только те, что ставило приложение этим файлом).
    if (cond) inv.items.filter((it) => !listed.includes(it)).forEach((it) => {
      if (vals) { if ((getValue(vals, `u.${it.id}.state`) || '') === cond) setValue(vals, `u.${it.id}.state`, ''); }
      else { const m = markOf(inv.id, it.id); if (m && m.app === name && m.cond === cond) markItem(inv.id, it.id, { cond: '', app: '' }, { by: person, assignId }); }
    });
    saveResults(); changed();
    return { taken: true, why: '' };
  }
  if (/\.(jpe?g|png|webp|heic)$/i.test(name)) {
    const hit = (items || []).map((k) => itemOf(inv, k)).filter(Boolean);
    if (!hit.length) return { taken: false, why: 'снимок не в папке предмета описи' };
    for (const it of hit) {
      mark(it, { state: 'seen' });
      if (!vals) {
        const m = markOf(inv.id, it.id) || {};
        if (!(m.photos || []).some((p) => p.name === name)) addItemPhoto(inv.id, it.id, new File([blob], name, { type: blob.type || 'image/jpeg' }), { by: person, assignId });
      }
    }
    if (vals) {
      // Снимки механизмов-ОИ — снимками результатов к этому ОИ, категория — наименование единицы.
      if (!(resultsOf(typeId, ocId).photos || []).some((p) => p.name === name && p.oiId === inv.oiId)) {
        addResultPhoto(typeId, ocId, new File([blob], name, { type: blob.type || 'image/jpeg' }), { oiId: inv.oiId, cat: hit[0].name, by: person, source: SOURCE });
      }
    }
    saveResults(); changed();
    return { taken: true, why: '' };
  }
  return { taken: true, why: '' }; // книга описи, отчёт, журнал — служебное приложения
}

// --- Место участка по ЕНИ для карты осмотрщика (пользователь 03.11.2026: «Запусти для карты подтягивание ЕНИ…
// отобрази на карте осмотрщиков. Обязательно») ---
//
// У назначенного объекта с ЕНИ, у которого в карточке ещё нет участка из Кадастра, рамка и контур подтягиваются
// тем же путём, что «Координаты по ЕНИ» в карточке и «Координаты из Кадастра» в реестре (kernel/cadastreGeo.js,
// прокси tools/cadastre/proxy.py), и записываются в карточку ОЦ (rec.geo, точка — центр рамки). Фоном, по три
// запроса разом: ответ на «assignments» не ждёт Кадастра; закончили — приложению «changed», карта перерисуется.
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: место по ЕНИ подтягивает бэкенд при назначении, с кэшем — приложение получает готовое.
const geoTried = new Set();
let geoRunning = false;
let geoDone = null;

async function fillGeo(objects) {
  // Нет участка — или есть одна рамка без контура (контур нужен карте): подтянуть.
  const queue = objects.filter(({ rec }) => !(rec.geo && rec.geo.extent && rec.geo.contour && rec.geo.contour.length) && String(rec.eni || '').replace(/\D/g, '').length === 13
    && !geoTried.has(rec.id));
  if (!queue.length || geoRunning) return;
  geoRunning = true;
  let got = 0;
  const one = async ({ rec }) => {
    geoTried.add(rec.id);
    const res = await geoByEni(rec.eni);
    if (res.error || !res.extent) return;
    rec.geo = { extent: res.extent, contour: res.contour, house: res.house, eni: res.eni, at: res.at, src: res.src || 'Кадастр', by: 'ЕНИ' };
    rec.gps = centerOf(res.extent);
    got += 1;
  };
  const work = async () => { while (queue.length) await one(queue.shift()); };
  await Promise.all([work(), work(), work()]);
  geoRunning = false;
  if (got) { scheduleSave(); if (geoDone) geoDone(); }
}

// Контур участка — внешнее кольцо первого многоугольника, [[долгота, широта]…] (не больше 200 точек).
function ringOf(geo) {
  const ring = geo && geo.contour && geo.contour[0] && geo.contour[0][0];
  if (!Array.isArray(ring) || ring.length < 3) return [];
  const step = Math.max(1, Math.ceil(ring.length / 200));
  return ring.filter((_, i) => i % step === 0).map(([x, y]) => [+x, +y]);
}

// Назначенные объекты осмотрщика: по одному на ОЦ.
function myObjects(person) {
  const by = new Map();
  assignmentsOfPerson(person, { live: false }).filter((a) => a.state !== 'removed').forEach((a) => {
    const k = a.typeId + '|' + a.ocId;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(a);
  });
  const out = [];
  by.forEach((list, key) => {
    const { typeId, ocId } = list[0];
    const rec = loadTask(typeId, ocId);
    if (!rec) return;
    const t = getType(typeId);
    const whole = list.some((a) => !a.oiIds || !a.oiIds.length);
    const entity = entityOf(typeId);
    let landNo = 0;
    const ois = ownOis(rec).filter((o) => whole || list.some((a) => coversOi(a, o.id)))
      .map((o) => ({ o, f: folderOf(o, rec, entity, o.card === 'land' ? ++landNo : 0) })).filter((x) => x.f)
      .map(({ o, f }) => ({ id: o.id, kind: o.card, label: oiLabel(o), path: f.path, depth: f.path ? f.path.split('/').length : 0,
        oiType: oiTypeOf(o, typeId), eni: digits(o.eni),
        review: (reviewOf(typeId, ocId, o.id) || {}).state || '', reason: (reviewOf(typeId, ocId, o.id) || {}).reason || '' }));
    // Документы назначения: выбранные регионалом (пусто — все), у каждого — чей (ОИ) и есть ли файл.
    const docIds = new Set(list.flatMap((a) => a.docs || []));
    const docs = docsOf(rec).filter((d) => !docIds.size || docIds.has(d.id))
      .map((d) => ({ id: d.id, name: clean((d.doc.file && d.doc.file.name) || d.doc.name || d.doc.type || 'Документ'), type: d.doc.type || '',
        owner: d.owner, oiId: d.oiId, file: !!(d.doc.file && d.doc.file.dataUrl) }));
    const state = list.every((a) => a.state === 'done') ? 'done' : list.some((a) => a.state === 'progress') ? 'progress' : 'assigned';
    const gps = gpsOfObject(typeId, ocId);
    // Возвраты — только по ОИ, которые всё ещё «возвращены» (принятый заново ОИ возврат снимает).
    const stillBack = (ids) => (ids || []).some((id) => (reviewOf(typeId, ocId, id) || {}).state === 'returned');
    const returned = list.flatMap((a) => (a.returned || []).filter((r) => stillBack(r.oiIds))
      .map((r) => ({ oiIds: r.oiIds || [], reason: r.reason || '', at: r.at || '', by: r.by || '' })));
    const contacts = institutionChain(rec.institution, rec.podved).flatMap((x) => x.contacts)
      .map((c) => ({ name: c.name || '', role: c.position || '', phone: c.phone || '' })).filter((c) => c.name || c.phone).slice(0, 12);
    out.push({
      id: key, typeId, ocId, entity, typeLabel: t ? t.manifest.label : '', title: titleOf(rec, ocId),
      state, plannedAt: list.map((a) => a.plannedAt).filter(Boolean).sort()[0] || '', deadline: deadlineOf(typeId, ocId) || '',
      note: list.map((a) => a.note).filter(Boolean).join('\n'), by: list[0].by || '',
      eni: rec.eni || '', address: rec.address || '', institution: [rec.institution, rec.podved].filter(Boolean).join(' · '),
      lat: gps ? gps[0] : null, lon: gps ? gps[1] : null, contour: ringOf(rec.geo), geoSrc: rec.geo && rec.geo.src ? rec.geo.src : '',
      ois, docs, contacts, returned,
      inventories: inventoriesOf(rec, list, ownOis(rec).filter((o) => whole || list.some((a) => coversOi(a, o.id))))
        .map(({ id, kind, title, folder, items }) => ({ id, kind, title, folder, count: items.length })),
    });
  });
  // Незаконченное — первым, в нём ближайшее: плановая дата, затем срок.
  const rank = (x) => (x.state === 'done' ? 1 : 0);
  return out.sort((a, b) => rank(a) - rank(b) || (a.plannedAt || '9').localeCompare(b.plannedAt || '9') || (a.deadline || '9').localeCompare(b.deadline || '9'));
}

// Документы записи с постоянными номерами: свои — «doc-<i>», ОИ — «<ОИ>:doc-<i>», если у документа нет id.
function docsOf(rec) {
  const own = (rec.docs || []).map((doc, i) => ({ doc, id: doc.id || `doc-${i}`, owner: 'Объект оценки', oiId: '' }));
  const oi = (rec.oi || []).flatMap((o) => (o.docs || []).map((doc, i) => ({ doc, id: doc.id || `${o.id}:doc-${i}`, owner: oiLabel(o), oiId: o.id })));
  return [...own, ...oi];
}

// Объект осмотрщика: было его назначение, в том числе снятое или переданное —
// снятое на телефоне всё равно уходит (решение 03.11.2026: «Даже если осмотр
// закончен, пока есть то, что относится к обьекту - отправляем»).
function findObject(person, id) {
  const [typeId, ocId] = String(id || '').split('|');
  const rec = typeId && ocId ? loadTask(typeId, ocId) : null;
  const mine = rec && assignmentsOfPerson(person, { live: false }).some((a) => a.typeId === typeId && a.ocId === ocId);
  if (!mine) throw new Error('объект не назначен этому осмотрщику');
  return { typeId, ocId, rec };
}

const handlers = {
  hello() {
    const { person, role } = session.state;
    return { person, role, roleLabel: roleLabel(role), system: 'E•state', canInspect: INSPECTING.has(role) };
  },
  assignments() {
    const items = myObjects(session.state.person);
    // Место по ЕНИ — фоном (fillGeo); ответ — сразу.
    fillGeo(items.map((x) => ({ rec: loadTask(x.typeId, x.ocId) })).filter((x) => x.rec)).catch(() => { geoRunning = false; });
    return { items };
  },
  async doc(body) {
    const { rec } = findObject(session.state.person, body.assignId);
    const hit = docsOf(rec).find((d) => d.id === body.id);
    const f = hit && hit.doc.file;
    if (!f || !f.dataUrl) throw new Error('у документа нет файла');
    const blob = await (await fetch(f.dataUrl)).blob();
    return { body: { name: clean(f.name || hit.doc.name), mime: f.mime || blob.type }, blob };
  },
  async inventory(body) {
    const { typeId, ocId, rec } = findObject(session.state.person, body.assignId);
    const list = assignmentsOfPerson(session.state.person, { live: false }).filter((a) => a.typeId === typeId && a.ocId === ocId);
    const inv = inventoriesOf(rec, list, ownOis(rec)).find((x) => x.id === body.id);
    if (!inv) throw new Error('описи нет в назначении');
    return { body: { title: inv.title, count: inv.items.length }, blob: await inventoryBook(inv) };
  },
  async send(body, blob) {
    const person = session.state.person;
    const { typeId, ocId, rec } = findObject(person, body.assignId);
    if (!blob) throw new Error('нет файла');
    startWork(person, typeId, ocId);
    if (String(body.rel || '').startsWith(MACHINES + '/')) {
      const list = assignmentsOfPerson(person, { live: false }).filter((a) => a.typeId === typeId && a.ocId === ocId);
      return applyInventory({ typeId, ocId, rec, list, person, assignId: (list[0] || {}).id || '' }, String(body.rel), blob, body.items || []);
    }
    const depth = Number.isFinite(+body.depth) && body.depth !== '' ? +body.depth : undefined;
    const sum = await applyEntries(typeId, rec, [{ rel: String(body.rel || ''), oiId: body.oiId || '', depth, read: async () => blob }], { source: SOURCE });
    const res = sum.results[0] || { taken: false, why: 'не разобран' };
    // Принят ли файл: приложение отмечает отправленным только принятое, отказ — с причиной на объекте.
    return { taken: res.taken, why: res.why, photos: sum.photos, values: sum.values, voices: sum.voices, scans: sum.scans, repeated: sum.repeated };
  },
  // Удалено на телефоне после отправки — в системе пометка «удалено осмотрщиком» (решение 03.11.2026: «Система копит всё»).
  deleted(body) {
    const person = session.state.person;
    const { typeId, rec } = findObject(person, body.assignId);
    return { n: markDeleted(typeId, rec, String(body.rel || ''), { oiId: body.oiId || '', by: person }) };
  },
  finish(body) {
    const person = session.state.person;
    const { typeId, ocId } = findObject(person, body.assignId);
    return { n: finishWork(person, typeId, ocId, body.done !== false, { incomplete: !!body.incomplete }) };
  },
  // Осмотр не состоялся (решение 03.11.2026: исходы «Нужны»): событие осмотра с причиной — регионалу в историю и
  // статистику; в «Результатах осмотра» — последним исходом. Состояние назначения не меняется: решает регионал.
  outcome(body) {
    const person = session.state.person;
    const { typeId, ocId } = findObject(person, body.assignId);
    const text = [body.reason, body.note].filter(Boolean).join(' — ');
    myAssignsOn(person, typeId, ocId).forEach((a) => logEvent('outcome', a, { text }));
    resultsOf(typeId, ocId).outcome = { reason: String(body.reason || ''), note: String(body.note || ''), by: person, at: new Date().toISOString() };
    saveResults();
    changed();
    return {};
  },
  exit() {
    setTimeout(() => { if (history.length > 1) history.back(); else location.hash = '#/'; }, 0);
    return {};
  },
};

// Подключить мост к рамке; возвращает отключение.
export function connectBridge(frame) {
  const target = () => frame.contentWindow;
  const reply = (msg, transfer) => { const w = target(); if (w) w.postMessage({ osmotr: 1, ...msg }, location.origin); };
  const onMessage = async (e) => {
    if (e.source !== target() || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.osmotr !== 1 || !m.id || !handlers[m.t]) return;
    try {
      const r = await handlers[m.t](m.body || {}, m.blob || null);
      const withBlob = r && r.blob instanceof Blob;
      reply({ re: m.id, ok: true, body: withBlob ? r.body : r, blob: withBlob ? r.blob : null });
    } catch (err) {
      reply({ re: m.id, ok: false, error: String((err && err.message) || err) });
    }
  };
  // Регионал назначил, снял, вернул на доосмотр — приложение перечитает.
  let t = 0;
  const onChanged = () => { clearTimeout(t); t = setTimeout(() => reply({ t: 'changed' }), 400); };
  window.addEventListener('message', onMessage);
  window.addEventListener('inside:inspections', onChanged);
  const unsub = session.subscribe(onChanged);
  geoDone = onChanged;
  return () => {
    window.removeEventListener('message', onMessage);
    window.removeEventListener('inside:inspections', onChanged);
    if (typeof unsub === 'function') unsub();
    clearTimeout(t);
  };
}
