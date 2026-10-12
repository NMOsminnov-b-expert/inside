// Данные панели осмотров: очередь к назначению, действующие назначения,
// осмотрщики и их загрузка. Записи — через kernel/registry.js (страница не
// импортирует модули типов ОЦ), назначения — kernel/inspections.js.
//
// ТЗ — запись графа panel-osmotrov-tz, разделы 3 и 3.1–3.5.
import { sortedTypes, getType } from '../../kernel/registry.js';
import { eniRegion } from '../../kernel/fmt.js';
import {
  allAssignments, assignmentsOf, isLive, isDefaultDoc, ASSIGN_STATES, eventsOf, regionsOf,
} from '../../kernel/inspections.js';
import { inspectorsInData, oiLabel, READY_STATUS } from '../inspector/tasks.js';

export { READY_STATUS };

const key = (typeId, ocId) => `${typeId}|${ocId}`;
export const stateLabel = (k) => (ASSIGN_STATES.find((s) => s.key === k) || {}).label || k;

// Сводки всех записей — одним проходом на отрисовку данных: панель смотрит
// во все типы ОЦ сразу, а запрос по id у реестра нет.
export function summaries() {
  const map = new Map();
  sortedTypes().forEach((t) => {
    const res = t.records.queryRecords({ filter: {}, offset: 0, limit: Number.MAX_SAFE_INTEGER });
    res.rows.forEach((s) => map.set(key(t.manifest.id, s.id), { ...s, typeId: t.manifest.id }));
  });
  return map;
}

export const regionOf = (s) => eniRegion(s.eni) || '';

// --- очередь «К назначению» -----------------------------------------------------

// Объекты в статусе «Удостоверен по документам» без действующего назначения
// (ТЗ 3.2). Назначенный хотя бы на один ОИ объект в очереди не стоит — его
// остальные ОИ назначаются из вкладки «Назначено».
export function queueRows(all, f) {
  const busy = new Set(allAssignments().filter(isLive).map((a) => key(a.typeId, a.ocId)));
  const q = (f.q || '').trim().toLowerCase();
  const out = [];
  all.forEach((s, k) => {
    if (s.status !== READY_STATUS || busy.has(k)) return;
    if (f.type && s.typeId !== f.type) return;
    if (f.region && regionOf(s) !== f.region) return;
    if (q && !`${s.eniAll || s.eni} ${s.title} ${s.institution} ${s.city}`.toLowerCase().includes(q)) return;
    out.push(s);
  });
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

// Значения фильтров — из самих данных, а не перечнем в коде (правило
// «не подгонять под нынешние данные»).
export function queueFacets(all) {
  const types = new Map();
  const regions = new Map();
  all.forEach((s) => {
    if (s.status !== READY_STATUS) return;
    types.set(s.typeId, s.typeLabel);
    const r = regionOf(s);
    if (r) regions.set(r, (regions.get(r) || 0) + 1);
  });
  return {
    types: [...types.entries()].map(([id, label]) => ({ id, label })),
    regions: [...regions.keys()].sort((a, b) => a.localeCompare(b, 'ru')),
  };
}

// --- «Назначено» -----------------------------------------------------------------

export function assignedRows(all, f) {
  const q = (f.q || '').trim().toLowerCase();
  return allAssignments()
    .filter((a) => isLive(a) && (!f.person || a.person === f.person))
    .map((a) => ({ a, s: all.get(key(a.typeId, a.ocId)) }))
    .filter(({ a, s }) => s && (!q || `${s.eniAll || s.eni} ${s.title} ${a.person}`.toLowerCase().includes(q)))
    .sort((x, y) => String(x.a.plannedAt || '9999').localeCompare(String(y.a.plannedAt || '9999'))
      || String(y.a.at).localeCompare(String(x.a.at)));
}

// Дата — местная, а не по UTC: сутки считаются по местной полуночи
// (практика panel-podval-deystviy-vybor-strokoy-dannye-chestno).
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const isOverdue = (a) => !!a.plannedAt && a.plannedAt < todayIso() && isLive(a);

// --- осмотрщики ---------------------------------------------------------------------

// Все осмотрщики с загрузкой: в работе (действующие назначения), из них
// просрочено, закончено за 30 дней.
// all — сводки записей (summaries): нужны для области по коду ЕНИ.
export function inspectorRows(all) {
  const live = new Map();
  const late = new Map();
  const done = new Map();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  allAssignments().forEach((a) => {
    if (isLive(a)) {
      live.set(a.person, (live.get(a.person) || 0) + 1);
      if (isOverdue(a)) late.set(a.person, (late.get(a.person) || 0) + 1);
    } else if (a.state === 'done' && a.doneAt >= since) {
      done.set(a.person, (done.get(a.person) || 0) + 1);
    }
  });
  const names = new Set([...inspectorsInData().map((x) => x.name), ...live.keys()]);
  return [...names].map((name) => ({
    name,
    live: live.get(name) || 0,
    late: late.get(name) || 0,
    done: done.get(name) || 0,
    // Свободных рабочих дней на две недели — кому можно дать задачи.
    free: freeDays(name, 10),
    ...regionsOf(name, (typeId, ocId) => { const s = all && all.get(typeId + '|' + ocId); return s ? s.eni : ''; }),
  })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

// --- состав объекта для окна назначения ------------------------------------------

// Описи — документы-перечни оборудования и механизмов (запись графа
// opis-oborudovaniya-i-mehanizmov). В карточке они лежат документами вида
// «Инвентаризационный список» или «Опись».
const isInventory = (d) => /опис|инвентаризац/i.test(`${d.type || ''} ${d.name || ''}`);

// ОИ записи и документы — сгруппированные по владельцу: сначала объект
// оценки, затем каждый ОИ (ТЗ 3.3).
export function objectContents(typeId, ocId) {
  const t = getType(typeId);
  const rec = t && t.records.loadRecord(ocId);
  if (!rec) return null;
  const doc = (d, owner) => ({ id: d.id, type: d.type || '', name: d.name || '', date: d.date || '', owner, def: isDefaultDoc(d.type || d.name) });
  const groups = [{ id: '', label: 'Объект оценки', docs: (rec.docs || []).map((d) => doc(d, '')) }];
  (rec.oi || []).forEach((o) => groups.push({ id: o.id, label: oiLabel(o), docs: (o.docs || []).map((d) => doc(d, o.id)) }));
  const all = groups.flatMap((g) => g.docs);
  return {
    rec,
    oi: (rec.oi || []).map((o) => ({ id: o.id, label: oiLabel(o) })),
    groups: groups.map((g) => ({ ...g, docs: g.docs.filter((d) => !isInventory(d)) })),
    inventories: all.filter(isInventory),
    taken: assignmentsOf(typeId, ocId),
  };
}

// --- графики и история (ТЗ раздел 4, 3.6) ------------------------------------------
// Сутки — местные (isoDay); выходные в графиках не показываются: осмотров по
// выходным нет, а пустые столбцы через каждые пять отнимали бы место.

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const dayOf = (iso) => (iso ? isoDay(new Date(iso)) : '');

function workdays(from, count, dir) {
  const out = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + from);
  while (out.length < count) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(isoDay(d));
    d.setDate(d.getDate() + dir);
  }
  return dir < 0 ? out.reverse() : out;
}

const oiCount = (a) => (a.oiIds && a.oiIds.length) || 1;



// Итог за период: ОИ, объекты, снимки, заметки, расхождения, выявленное.
export function periodTotals(person, sinceDay) {
  const t = { oi: 0, objects: new Set(), photos: 0, notes: 0, mismatch: 0, found: 0 };
  eventsOf({ person }).forEach((e) => {
    if (dayOf(e.at) < sinceDay) return;
    if (e.kind === 'done') { const a = allAssignments().find((x) => x.id === e.assignId); t.oi += a ? oiCount(a) : 1; t.objects.add(e.typeId + '|' + e.ocId); }
    if (e.kind === 'photos') t.photos += e.count || 0;
    if (e.kind === 'note') t.notes += 1;
    if (e.kind === 'mismatch') t.mismatch += 1;
    if (e.kind === 'found') t.found += 1;
  });
  return { ...t, objects: t.objects.size };
}


export const EVENT_LABELS = {
  assigned: 'назначен на осмотр', updated: 'назначение изменено', progress: 'начал осмотр',
  done: 'закончил осмотр', removed: 'назначение снято',
  photos: 'загрузил снимки', note: 'внёс заметку', mismatch: 'отметил расхождение', found: 'отметил выявленное',
};

// История: события новыми сверху; фильтр — осмотрщик, вид, день, поиск.
export function historyRows(all, f) {
  const q = (f.q || '').trim().toLowerCase();
  return eventsOf({ person: f.person || '' })
    .filter((e) => (!f.kind || e.kind === f.kind) && (!f.day || dayOf(e.at) === f.day))
    .map((e) => ({ e, s: all.get(e.typeId + '|' + e.ocId) }))
    .filter(({ e, s }) => s && (!q || `${s.eniAll || s.eni} ${s.title} ${e.person} ${e.text || ''}`.toLowerCase().includes(q)))
    .sort((x, y) => String(y.e.at).localeCompare(String(x.e.at)));
}

// --- календарь выездов, свободные дни, ряды для uPlot ------------------------------
// Выезд — объект в день: законченный осмотр (по событию «закончил осмотр»)
// или плановая дата действующего назначения. Несколько ОИ одного объекта в
// один день — один выезд (просьба пользователя 12.10.2026: «график выездов,
// аля календарь, при наведении на дату информация за этот день»).

export function tripsMonth(all, person, year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));     // понедельник недели 1-го числа
  const byDay = new Map();
  const put = (day, k, kind, a, extra) => {
    if (!byDay.has(day)) byDay.set(day, new Map());
    const m = byDay.get(day);
    const s = all.get(k);
    if (!m.has(k + kind)) m.set(k + kind, { kind, key: k, title: s ? s.title : '—', type: s ? s.typeLabel : '', oi: 0, photos: 0 });
    const t = m.get(k + kind);
    t.oi += (a && a.oiIds && a.oiIds.length) || 1;
    t.photos += (extra && extra.photos) || 0;
  };
  const photosOf = new Map();
  eventsOf({ person }).forEach((e) => { if (e.kind === 'photos') photosOf.set(e.assignId, (photosOf.get(e.assignId) || 0) + (e.count || 0)); });
  allAssignments().forEach((a) => {
    if (person && a.person !== person) return;
    const k = a.typeId + '|' + a.ocId;
    if (a.state === 'done' && a.doneAt) put(dayOf(a.doneAt), k, 'done', a, { photos: photosOf.get(a.id) });
    else if (isLive(a) && a.plannedAt) put(a.plannedAt, k, isOverdue(a) ? 'late' : 'plan', a);
  });
  const today = todayIso();
  const weeks = [];
  const d = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const iso = isoDay(d);
      const trips = byDay.has(iso) ? [...byDay.get(iso).values()] : [];
      week.push({ day: iso, n: d.getDate(), inMonth: d.getMonth() === month, weekend: i >= 5, today: iso === today, past: iso < today, trips });
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
    if (d.getMonth() !== month && w >= 3) break;
  }
  return weeks;
}

// Свободные рабочие дни на ближайшие n рабочих дней — без плановых осмотров.
export function freeDays(person, n = 10) {
  const span = workdays(0, n, 1);
  const busy = new Set(allAssignments().filter((a) => isLive(a) && a.person === person && a.plannedAt).map((a) => a.plannedAt));
  return span.filter((d) => !busy.has(d)).length;
}

// Ряды для uPlot — по неделям: дневные линии рваные (выходные — ноль, дни
// без выездов — провал), по ним не видно, кто как работает; дневная
// детализация — в календаре выездов. x — понедельник недели (секунды,
// местная полночь), последние weeks законченных недель: текущая неделя только
// началась, и её неполный итог читался бы как провал в конце линии.
export function weeklySeries(names, weeks = 8) {
  const mon = new Date();
  mon.setHours(0, 0, 0, 0);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) - weeks * 7);
  const xs = [];
  const starts = [];
  for (let i = 0; i < weeks; i++) {
    const d = new Date(mon); d.setDate(d.getDate() + i * 7);
    xs.push(d.getTime() / 1000); starts.push(isoDay(d));
  }
  const end = new Date(mon); end.setDate(end.getDate() + weeks * 7);
  const endDay = isoDay(end);
  const weekOf = (day) => { if (day >= endDay) return -1; for (let i = weeks - 1; i >= 0; i--) if (day >= starts[i]) return i; return -1; };
  const oi = names.map(() => new Array(weeks).fill(0));
  const photos = names.map(() => new Array(weeks).fill(0));
  const pos = new Map(names.map((n, i) => [n, i]));
  const byId = new Map(allAssignments().map((a) => [a.id, a]));
  eventsOf({}).forEach((e) => {
    const p = pos.get(e.person);
    if (p === undefined) return;
    const i = weekOf(dayOf(e.at));
    if (i < 0) return;
    if (e.kind === 'done') { const a = byId.get(e.assignId); oi[p][i] += (a && a.oiIds && a.oiIds.length) || 1; }
    if (e.kind === 'photos') photos[p][i] += e.count || 0;
  });
  return { xs, oi, photos };
}

// Выезды дня по назначениям — для панели подробностей: кто, куда (объект,
// ОИ), зачем (комментарий менеджера, назначенные документы) и что вышло
// (снимки, заметки, расхождения, выявленное). person пуст — все осмотрщики.
export function tripsOfDay(all, person, day) {
  const evs = eventsOf({ person });
  const out = [];
  allAssignments().forEach((a) => {
    if (person && a.person !== person) return;
    let kind = '';
    if (a.state === 'done' && a.doneAt && dayOf(a.doneAt) === day) kind = 'done';
    else if (isLive(a) && a.plannedAt === day) kind = isOverdue(a) ? 'late' : 'plan';
    if (!kind) return;
    const s = all.get(a.typeId + '|' + a.ocId);
    const c = objectContents(a.typeId, a.ocId);
    const mine = evs.filter((e) => e.assignId === a.id);
    out.push({
      a, s, kind,
      oi: a.oiIds && a.oiIds.length && c ? c.oi.filter((o) => a.oiIds.includes(o.id)).map((o) => o.label) : [],
      photos: mine.filter((e) => e.kind === 'photos').reduce((n, e) => n + (e.count || 0), 0),
      notes: mine.filter((e) => e.kind === 'note').map((e) => e.text),
      mismatch: mine.filter((e) => e.kind === 'mismatch').map((e) => e.field),
      found: mine.filter((e) => e.kind === 'found').map((e) => e.text),
    });
  });
  return out.sort((x, y) => x.a.person.localeCompare(y.a.person, 'ru'));
}
