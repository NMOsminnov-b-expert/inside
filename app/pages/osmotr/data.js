// Данные страницы осмотрщика: назначенные объекты одного осмотрщика со всем,
// что нужно на выезде (адрес, ЕНИ, участок по Кадастру, контакты учреждения,
// документы назначения, состав ОИ, описи), — для веб-страницы осмотрщика
// (osmotr.js); вынесено из моста приложения «Осмотр» (убран 17.11.2026)
// 16.11.2026 при переносе приложения в веб (решение пользователя 16.11.2026:
// «перенести из PWA все в веб»), код и поведение — прежние.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: эту сборку делает сервер (API назначений осмотрщика).
import { foldEniList } from '../../kernel/eniFold.js';
import { getType } from '../../kernel/registry.js';
import { assignmentsOfPerson, coversOi, deadlineOf, inventoryHolders } from '../../kernel/inspections.js';
import { reviewOf, resultsOf } from '../../kernel/inspectionResults.js';
import { inventoryById, inPart, partLabel } from '../../kernel/inventories.js';
import { geoByEni, centerOf, featuresInBox, dashed } from '../../kernel/cadastreGeo.js';
import { PARCEL_FIELDS, BUILD_FIELDS, buildsOfParcel, parcelRows } from '../../kernel/cadastreTip.js';
import { scheduleSave } from '../../kernel/persist.js';
import { institutionChain } from '../../kernel/contacts.js';
import { loadTask, ownOis, oiLabel } from '../inspection/tasks.js';
import { gpsOfObject } from '../inspections/route.js';

// Сущность объекта в приложении (решение пользователя 03.11.2026 по аудиту:
// «3 сущности. ТС, недвижка и опись. Документы - раздел»): объект-ТС — сама
// машина (снимки и «Документы» прямо в объекте), опись — механизмы, остальное —
// недвижимость (литеры, квартира, участки; ТС и механизмы внутри — своими ОИ).
export const entityOf = (typeId) => (typeId === 'vehicle' ? 'vehicle' : typeId === 'mechanisms' ? 'inventory' : 'real');

export const REAL = 'Недвижимое';
export const VEHICLES = 'Транспортные средства';
export const LAND = 'Земельный участок';
export const digits = (s) => String(s || '').replace(/\D/g, '');

// Папка ОИ в приложении (путь от объекта): литера — «Литера А» (написание макета,
// решение 03.11.2026), по ней же ищет разбор архива (letterOf); участок — своя
// папка по ЕНИ («Земельный участок/<ЕНИ>»: участков в объекте бывает несколько);
// ТС — по госномеру в «Транспортных средствах»; у объекта-ТС его ТС — сам объект.
export function folderOf(oi, rec, entity, landNo) {
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
// Сведения для задачи осмотрщика строками «подпись — значение» (решение пользователя 06.11.2026 по задаче
// ТС: «Марка, госномер + контакт»): у ТС — марка и модель, госномер, VIN; без адреса — адрес учреждения.
export function factsOf(rec) {
  const v = (rec.vehicle || {}).f || {};
  const out = [];
  const add = (label, value) => { if (value) out.push({ label, value: String(value) }); };
  if (rec.vehicle) {
    add('Марка и модель', [v.make, v.model].filter(Boolean).join(' '));
    add('Госномер', v.plate);
    add('VIN', v.vin);
  }
  if (!rec.address) add('Учреждение', [rec.institution, rec.podved].filter(Boolean).join(' · '));
  return out;
}

export function titleOf(rec, ocId) {
  const v = (rec.vehicle || {}).f || {};
  const ts = [v.make, v.plate].filter(Boolean).join(' · ');
  return clean(rec.address || ts || (rec.mech && rec.mech.name) || rec.name || rec.eni || ocId);
}

// Тип ОИ формы приложения (Params.OI_TYPES): квартира; литера жилого дома — «Жилой дом»; иначе — «Здание».
// По виду ОИ в системе (REALTY_OI_TYPES модулей): жилое — «Жилой дом», вид литеры «other» — «Прочее строение»,
// «aux» — «Вспомогательная постройка»; иначе — «Здание» (аудит 03.11.2026: тип не по виду ОЦ, а по самой литере).
export function oiTypeOf(oi, typeId) {
  if (oi.card === 'apartment') return 'Квартира';
  if (oi.card !== 'building' && oi.card !== 'aux') return '';
  if (oi.card === 'aux' || oi.litKind === 'aux') return 'Вспомогательная постройка';
  if (oi.residential || (typeId === 'residential-house' && !oi.litKind)) return 'Жилой дом';
  if (oi.litKind === 'other') return 'Прочее строение';
  return 'Здание';
}

export const clean = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();

// --- Опись: обмен с приложением (решение пользователя 03.11.2026: «Обмен с системой») ---
//
// Описи объекта — приложенные регионалом к назначениям (kernel/inventories.js) и единицы механизмов-ОИ (в том
// числе механизмы-ОЦ). В приложение — книгой Excel (запрос «inventory»), приложение заводит её своей описью в
// «Механизмах и оборудовании/<опись>». Обратно — файлами этой папки:
//   «Нерабочие.txt», «Требуется ремонт.txt», «Осмотрено ранее.txt» — инвентарники построчно → состояние позиции;
//   снимок в папке предмета (body.items — инвентарники из «Инвентарники.txt» папки) → снимок позиции, «осмотрено».
// У описи учреждения — отметки описи (markItem, addItemPhoto); у механизмов-ОИ — поля формы осмотра единиц
// (u.<id>.found / state).
export const MACHINES = 'Механизмы и оборудование';

export function inventoriesOf(rec, list, ois) {
  const out = [];
  const seen = new Set();
  list.flatMap((a) => a.inventories || []).forEach((id) => {
    const inv = inventoryById(id);
    if (!inv || seen.has(id)) return;
    seen.add(id);
    // Деление описи (решение пользователя 06.11.2026 «Нужны оба варианта»): свои позиции — по частям
    // своих назначений (нет части — вся опись); у чужих — кто осматривает, отметки по ним не принимаются.
    const mine = list.filter((a) => (a.inventories || []).includes(id));
    const own = (it) => mine.some((a) => inPart(it, (a.invParts || {})[id]));
    const others = inventoryHolders(id).filter((h) => !mine.some((a) => a.id === h.assignId));
    const whoOf = (it) => others.filter((h) => inPart(it, h.part)).map((h) => h.person).join(', ');
    out.push({ id, kind: 'inv', title: inv.title, part: mine.map((a) => partLabel((a.invParts || {})[id])).join('; '), items: inv.items.map((it, i) => ({ id: it.id, no: it.no || i + 1, inv: it.inv || '', name: it.name, place: it.place || '',
      qty: it.qty || 1, cost: it.costInitial || '', balance: it.costBalance || '', priority: it.priority || '', list: it.list || '', dept: it.dept || '',
      model: it.model || '', kind: it.kind || '', mol: it.mol || '',
      own: own(it), who: own(it) ? '' : whoOf(it) || 'не в вашей части' })) });
  });
  ois.filter((o) => o.card === 'mech').forEach((o) => {
    out.push({ id: 'mech:' + o.id, kind: 'mech', oiId: o.id, title: oiLabel(o),
      items: (o.mechanisms || []).map((u, i) => ({ id: u.id, no: i + 1, inv: u.inv || '', name: u.name || 'Единица', place: '', qty: u.qty || 1, cost: u.cost || '', balance: '', priority: '', list: '', dept: '',
        model: (u.params && u.params.model) || u.model || '', kind: u.type || '', mol: '', own: true, who: '' })) });
  });
  return out.map((x) => ({ ...x, folder: `${MACHINES}/${clean(x.title)}` }));
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
// Участки подтянулись — кто ждёт (страница, мост рамки), перерисуется. Возвращает отписку.
const geoDone = new Set();
export const onGeoDone = (fn) => { geoDone.add(fn); return () => geoDone.delete(fn); };

export async function fillGeo(objects) {
  // Нет участка — или есть одна рамка без контура (контур нужен карте): подтянуть.
  // Нет участка, нет контура или нет сведений участка (props) — подтянуть.
  const queue = objects.filter(({ rec }) => !(rec.geo && rec.geo.extent && rec.geo.contour && rec.geo.contour.length && rec.geo.props) && String(rec.eni || '').replace(/\D/g, '').length === 13
    && !geoTried.has(rec.id));
  if (!queue.length || geoRunning) return;
  geoRunning = true;
  let got = 0;
  const one = async ({ rec }) => {
    geoTried.add(rec.id);
    const res = await geoByEni(rec.eni);
    if (res.error || !res.extent) return;
    // Сведения участка и строения на нём — слоями картосервера в рамке участка (всё, что отдаёт Кадастр).
    const box = [res.extent[0] - 0.0002, res.extent[1] - 0.0002, res.extent[2] + 0.0002, res.extent[3] + 0.0002];
    const [ps, bs] = await Promise.all([featuresInBox('ENI_WGS84', box, PARCEL_FIELDS, 200).catch(() => []), featuresInBox('ENI_BUILDINGS', box, BUILD_FIELDS, 200).catch(() => [])]);
    const own = ps.find((f) => String((f.properties || {}).PROPCODE || '') === dashed(res.eni));
    const props = own ? { ...own.properties } : {};
    const builds = buildsOfParcel(res.eni, bs).map((f) => ({ properties: f.properties || {} }));
    rec.geo = { extent: res.extent, contour: res.contour, house: res.house, eni: res.eni, at: res.at, src: res.src || 'Кадастр', by: 'ЕНИ',
      purpose: res.purpose || '', use: res.use || '', ownForm: res.ownForm || '', props, builds };
    rec.gps = centerOf(res.extent);
    got += 1;
  };
  const work = async () => { while (queue.length) await one(queue.shift()); };
  // Сбой Кадастра не оставляет флаг поднятым: следующий вызов снова подтянет.
  try { await Promise.all([work(), work(), work()]); } finally { geoRunning = false; }
  if (got) { scheduleSave(); geoDone.forEach((fn) => fn()); }
}

// Контур участка — внешнее кольцо первого многоугольника, [[долгота, широта]…] (не больше 200 точек).
export function ringOf(geo) {
  const ring = geo && geo.contour && geo.contour[0] && geo.contour[0][0];
  if (!Array.isArray(ring) || ring.length < 3) return [];
  const step = Math.max(1, Math.ceil(ring.length / 200));
  return ring.filter((_, i) => i % step === 0).map(([x, y]) => [+x, +y]);
}

// Назначенные объекты осмотрщика: по одному на ОЦ.
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function myObjects(person) {
  const by = new Map();
  const today = isoDay();
  // Снятое регионалом сегодня — до конца дня с меткой «Снято регионалом» (решение 06.11.2026 «Метка + уведомление»).
  const mine = assignmentsOfPerson(person, { live: false });
  const keep = (a) => a.state !== 'removed' || (String(a.removedAt || '').slice(0, 10) === today
    && !mine.some((b) => b !== a && b.typeId === a.typeId && b.ocId === a.ocId && b.state !== 'removed'));
  mine.filter(keep).forEach((a) => {
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
      // ЕНИ — назначенных ОИ (решение пользователя 05.11.2026 «Только назначенных ОИ»), объект целиком — всех.
      eni: foldEniList(ois.map((x) => x.eni).filter(Boolean)) || rec.eni || '', address: rec.address || '', institution: [rec.institution, rec.podved].filter(Boolean).join(' · '),
      lat: gps ? gps[0] : null, lon: gps ? gps[1] : null, contour: ringOf(rec.geo), geoSrc: rec.geo && rec.geo.src ? rec.geo.src : '',
      // Сведения участка по Кадастру — строками, как подпись участка на карте макета (kernel/cadastreTip.js).
      parcel: rec.geo && rec.geo.extent ? parcelRows({ NAZNACHENI: rec.geo.purpose, PROPFOR_NAME: rec.geo.use, PROPFORM_NAME: rec.geo.ownForm, DOMCODE: rec.geo.house, ...(rec.geo.props || {}) },
        rec.geo.contour ? { type: 'MultiPolygon', coordinates: rec.geo.contour } : null, rec.geo.builds || []) : [],
      ois, docs, contacts, returned, facts: factsOf(rec),
      // Снято регионалом сегодня; запрос переноса и ответ на него (решения 06.11.2026).
      removed: list.every((a) => a.state === 'removed'), removedAt: list.every((a) => a.state === 'removed') ? (list[0].removedAt || '') : '',
      moveReq: (list.find((a) => a.moveReq) || {}).moveReq || null,
      moveRefused: (list.find((a) => a.moveRefused) || {}).moveRefused || null,
      // Сканы на пересъёмку: какой документ, к какому ОИ, какие страницы и почему (решение 06.11.2026).
      retakes: (resultsOf(typeId, ocId).scans || []).filter((x) => x.retake).map((x) => ({ title: x.title || '', oiId: x.oiId || '',
        reason: x.retake.reason || '', pages: x.retake.pages || [], at: x.retake.at || '' })),
      inventories: inventoriesOf(rec, list, ownOis(rec).filter((o) => whole || list.some((a) => coversOi(a, o.id))))
        .map(({ id, kind, title, folder, items }) => ({ id, kind, title, folder, count: items.length })),
    });
  });
  // Незаконченное — первым, в нём ближайшее: плановая дата, затем срок.
  const rank = (x) => (x.state === 'done' ? 1 : 0);
  return out.sort((a, b) => rank(a) - rank(b) || (a.plannedAt || '9').localeCompare(b.plannedAt || '9') || (a.deadline || '9').localeCompare(b.deadline || '9'));
}

// Документы записи с постоянными номерами: свои — «doc-<i>», ОИ — «<ОИ>:doc-<i>», если у документа нет id.
export function docsOf(rec) {
  const own = (rec.docs || []).map((doc, i) => ({ doc, id: doc.id || `doc-${i}`, owner: 'Объект оценки', oiId: '' }));
  const oi = (rec.oi || []).flatMap((o) => (o.docs || []).map((doc, i) => ({ doc, id: doc.id || `${o.id}:doc-${i}`, owner: oiLabel(o), oiId: o.id })));
  return [...own, ...oi];
}

// Объект осмотрщика: было его назначение, в том числе снятое или переданное —
// снятое на телефоне всё равно уходит (решение 03.11.2026: «Даже если осмотр
// закончен, пока есть то, что относится к обьекту - отправляем»).
export function findObject(person, id) {
  const [typeId, ocId] = String(id || '').split('|');
  const rec = typeId && ocId ? loadTask(typeId, ocId) : null;
  const mine = rec && assignmentsOfPerson(person, { live: false }).some((a) => a.typeId === typeId && a.ocId === ocId);
  if (!mine) throw new Error('объект не назначен этому осмотрщику');
  return { typeId, ocId, rec };
}

// Опись назначения целиком (с позициями) — для экрана описи на веб-странице осмотрщика; не назначена — null.
export function inventoryOf(person, objId, invId) {
  let o;
  try { o = findObject(person, objId); } catch { return null; }
  const list = assignmentsOfPerson(person, { live: false }).filter((a) => a.typeId === o.typeId && a.ocId === o.ocId);
  return inventoriesOf(o.rec, list, ownOis(o.rec)).find((x) => x.id === invId) || null;
}
