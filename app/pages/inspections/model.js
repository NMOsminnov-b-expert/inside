// Данные панели осмотров: очередь к назначению, действующие назначения,
// осмотрщики и их загрузка. Записи — через kernel/registry.js (страница не
// импортирует модули типов ОЦ), назначения — kernel/inspections.js.
//
// ТЗ — запись графа panel-osmotrov-tz, разделы 3 и 3.1–3.5.
import { sortedTypes, getType } from '../../kernel/registry.js';
import { eniRegion } from '../../kernel/fmt.js';
import {
  allAssignments, assignmentsOf, isLive, isDefaultDoc, ASSIGN_STATES, eventsOf, regionsOf,
  workdayOf, absenceOn, profileOf, profileNames, absenceLabel, deadlineOf, stallOf,
  dayReport, reportTime, activitiesOn, activityKind, planOf, allCadRequests,
} from '../../kernel/inspections.js';
import { inspectorsInData, oiLabel, READY_STATUS } from '../inspector/tasks.js';
import { institutionChain } from '../../kernel/contacts.js';

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

// Покрытие ОИ объекта осмотрами — по каждому ОИ: осмотрен (законченное
// назначение), назначен (действующее) или свободен. Назначение «объект
// целиком» (oiIds пуст) покрывает все ОИ. Слова пользователя 12.10.2026:
// «А где частично осмотренные?» — объект не пропадает из очереди, пока у
// него есть свободные ОИ.
//   cov.state: none — ни один ОИ не назначен и не осмотрен;
//              assigned — часть назначена, осмотренных нет;
//              inspected — часть осмотрена (остальные свободны или назначены);
//              full — свободных ОИ нет (в очередь не попадает).
export function coverageOf(typeId, ocId) {
  const t = getType(typeId);
  const rec = t && t.records.loadRecord(ocId);
  const ids = rec ? (rec.oi || []).map((o) => o.id) : [];
  const total = Math.max(ids.length, 1);
  const by = new Map();       // ОИ → { kind: 'done' | 'live', a }
  allAssignments().forEach((a) => {
    if (a.typeId !== typeId || a.ocId !== ocId) return;
    const kind = a.state === 'done' ? 'done' : isLive(a) ? 'live' : '';
    if (!kind) return;
    const cover = a.oiIds && a.oiIds.length ? a.oiIds : (ids.length ? ids : ['']);
    cover.forEach((id) => {
      const was = by.get(id);
      if (!was || (was.kind === 'live' && kind === 'done')) by.set(id, { kind, a });
    });
  });
  const list = ids.length ? ids : [''];
  const done = list.filter((id) => by.has(id) && by.get(id).kind === 'done').length;
  const live = list.filter((id) => by.has(id) && by.get(id).kind === 'live').length;
  const free = total - done - live;
  const state = free === 0 ? 'full' : done ? 'inspected' : live ? 'assigned' : 'none';
  return { total, done, live, free, state, by };
}

export const COVERAGE = [
  { key: '', label: 'Любое покрытие' },
  { key: 'none', label: 'Не назначены' },
  { key: 'assigned', label: 'Частично назначены' },
  { key: 'inspected', label: 'Частично осмотрены' },
];

// Очередь «К назначению» (ТЗ 3.2): объекты в статусе «Удостоверен по
// документам», у которых есть свободные ОИ. Фильтр f.cov — по покрытию.
export function queueRows(all, f) {
  const q = (f.q || '').trim().toLowerCase();
  const out = [];
  all.forEach((s) => {
    if (s.status !== READY_STATUS) return;
    if (f.type && s.typeId !== f.type) return;
    if (f.region && regionOf(s) !== f.region) return;
    if (q && !`${s.eniAll || s.eni} ${s.title} ${s.institution} ${s.city}`.toLowerCase().includes(q)) return;
    const cov = coverageOf(s.typeId, s.id);
    if (cov.state === 'full') return;
    if (f.cov && cov.state !== f.cov) return;
    out.push({ ...s, cov });
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
  // Справочник: профили, люди из записей и из назначений — любых, не только
  // действующих: осмотрщик, чьи назначения все переданы другому, остаётся в
  // справочнике со своей историей (прежде пропадал после перезагрузки).
  const names = new Set([...profileNames(), ...inspectorsInData().map((x) => x.name), ...allAssignments().map((a) => a.person).filter(Boolean)]);
  const today = todayIso();
  return [...names].map((name) => ({
    name,
    live: live.get(name) || 0,
    late: late.get(name) || 0,
    done: done.get(name) || 0,
    // Свободных рабочих дней на две недели — кому можно дать задачи.
    free: freeDays(name, 10),
    // Отсутствие сегодня (отпуск, больничный…) и увольнение — в списке и
    // в выборе осмотрщика при назначении.
    away: (() => { const ab = absenceOn(name, today); return ab ? { label: absenceLabel(ab.kind), to: ab.to } : null; })(),
    fired: profileOf(name).fired,
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
    cov: coverageOf(typeId, ocId),
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
  done: 'закончил осмотр', removed: 'назначение снято', moved: 'перенесена дата',
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
      // Нерабочий день человека: отпуск, больничный, выходной по графику.
      const wd = person ? workdayOf(person, iso) : { ok: true };
      week.push({ day: iso, n: d.getDate(), inMonth: d.getMonth() === month, weekend: i >= 5, today: iso === today, past: iso < today, trips,
        off: wd.ok ? '' : wd.reason, absence: wd.absence || null, acts: person ? activitiesOn(person, iso) : [], plan: person ? planOf(person, iso) : null });
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
    if (d.getMonth() !== month && w >= 3) break;
  }
  return weeks;
}

// Свободные дни на ближайшие n рабочих дней (пн–пт): день свободен, если
// человек по графику работает, не в отпуске и плановых осмотров нет.
export function freeDays(person, n = 10) {
  const span = workdays(0, n, 1);
  const busy = new Set(allAssignments().filter((a) => isLive(a) && a.person === person && a.plannedAt).map((a) => a.plannedAt));
  // Работа вне выездов (раздел 4 ТЗ рабочего дня) — день не свободный.
  return span.filter((d) => !busy.has(d) && workdayOf(person, d).ok && !activitiesOn(person, d).length).length;
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

// =====================================================================================
// Планирование (этап 2 решения upravlenie-osmotrschikami-instrumenty): место
// выезда, сроки, «кого назначить», доступность, контакты на месте, отборы.
// =====================================================================================

// Место выезда — город и район из адреса: объекты одного района — один выезд
// (ответ пользователя 12.10.2026 «Выезды по месту»). Район берётся из адреса
// («Октябрьский р-н»), город — из записи.
export function placeOf(s) {
  const t = String(s.title || '');
  const m = t.match(/([А-ЯЁA-Z][\wА-Яа-яЁё-]*\s+р-н)/);
  const city = s.city || (t.match(/(?:г\.|с\.|пгт\.?)\s*[А-ЯЁ][\wА-Яа-яЁё-]*/) || [''])[0];
  // У земельных участков район уже стоит в «городе» — второй раз не пишем.
  const district = m && !String(city).includes(m[1]) ? m[1] : '';
  return [city, district].filter(Boolean).join(', ') || 'Место не указано';
}

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };

// Срочность по сроку: hot — срок прошёл или через 3 дня и раньше; week — в
// ближайшие 7 дней; later — позже; none — срока нет.
export const DUE = [
  { key: 'hot', label: 'Горящие' },
  { key: 'week', label: 'На неделе' },
  { key: 'later', label: 'Позже' },
  { key: 'none', label: 'Без срока' },
];
export function dueOf(date) {
  if (!date) return 'none';
  const today = todayIso();
  if (date <= addDays(today, 3)) return 'hot';
  if (date <= addDays(today, 7)) return 'week';
  return 'later';
}

// Строки очереди с местом, сроком и покрытием — до фильтров (для счётчиков).
export function queueBase(all) {
  const out = [];
  all.forEach((s) => {
    if (s.status !== READY_STATUS) return;
    const cov = coverageOf(s.typeId, s.id);
    if (cov.state === 'full') return;
    const deadline = deadlineOf(s.typeId, s.id);
    out.push({ ...s, cov, deadline, due: dueOf(deadline), place: placeOf(s) });
  });
  return out;
}

// --- гибкие отборы (решение пользователя 13.10.2026: «Несколько значений в
// отборе, срок — период дат и площадь, район и населённый пункт,
// сохранённые наборы отборов») ------------------------------------------------
//
// Отбор — { facets: { ключ: [значения] }, ranges: { ключ: [с, по] } } и
// строка поиска. Внутри фасета значения — «или», между фасетами — «и»
// (практика фасетного поиска Baymard: несколько значений в фасете; запись
// графа gibkie-otbory-fasety-diapazony-nabory). Счётчик значения считается
// без своего фасета — видно, сколько прибавит отметка.

// Район — из адреса («Октябрьский р-н»), населённый пункт — из записи или
// адреса («г. Бишкек», «с. Таш-Тюбе»).
export function districtOf(s) {
  const m = String(s.title || '').match(/([А-ЯЁA-Z][\wА-Яа-яЁё-]*\s+р-н)/);
  return m ? m[1] : '';
}
// У земельных участков в «городе» бывает «Чуйская обл., Аламудунский р-н» —
// это область и район, а не населённый пункт: берётся только часть с
// «г.», «с.», «пгт».
const SETTLEMENT = /(?:^|[\s,])((?:г\.|с\.|пгт\.?)\s*[А-ЯЁ][\wА-Яа-яЁё-]*)/;
export function settlementOf(s) {
  const m = String(s.city || '').match(SETTLEMENT) || String(s.title || '').match(SETTLEMENT);
  return m ? m[1] : '';
}

// Фасеты и диапазоны очереди. val — значение строки (строка или список);
// order — порядок значений, если он задан смыслом, а не числом.
export const QUEUE_FACETS = [
  { key: 'due', title: 'Срок', val: (s) => s.due, order: DUE },
  { key: 'cov', title: 'Покрытие ОИ', val: (s) => s.cov.state, order: COVERAGE.filter((c) => c.key) },
  { key: 'region', title: 'Область', val: (s) => regionOf(s) },
  { key: 'district', title: 'Район', val: districtOf },
  { key: 'settlement', title: 'Населённый пункт', val: settlementOf },
  { key: 'type', title: 'Тип ОЦ', val: (s) => s.typeId, label: (s) => s.typeLabel },
  { key: 'inst', title: 'Учреждение', val: (s) => s.institution },
];
export const QUEUE_RANGES = [
  { key: 'deadline', title: 'Срок осмотра', kind: 'date', val: (s) => s.deadline },
  { key: 'area', title: 'Площадь, м²', kind: 'number', val: (s) => (s.metrics && s.metrics.area) || 0 },
  { key: 'free', title: 'Свободных ОИ', kind: 'number', val: (s) => s.cov.free },
];
// «Назначено» — строки { a, s }.
export const ASSIGNED_FACETS = [
  { key: 'pick', title: 'Отбор', val: ({ a }) => [...assignedPickOf(a)], order: ASSIGNED_PICKS_ORDER() },
  { key: 'person', title: 'Осмотрщик', val: ({ a }) => a.person },
  { key: 'region', title: 'Область', val: ({ s }) => regionOf(s) },
  { key: 'district', title: 'Район', val: ({ s }) => districtOf(s) },
  { key: 'type', title: 'Тип ОЦ', val: ({ s }) => s.typeId, label: ({ s }) => s.typeLabel },
];
export const ASSIGNED_RANGES = [
  { key: 'planned', title: 'Плановая дата', kind: 'date', val: ({ a }) => a.plannedAt },
];
function ASSIGNED_PICKS_ORDER() {
  return [{ key: 'late', label: 'Просрочено' }, { key: 'stall', label: 'Зависли' }, { key: 'today', label: 'Сегодня' },
    { key: 'week', label: 'На неделе' }, { key: 'away', label: 'План на отсутствие' }];
}

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
export const emptyFilter = () => ({ facets: {}, ranges: {} });
export function filterActive(f) {
  return Object.values(f.facets || {}).some((v) => v && v.length) || Object.values(f.ranges || {}).some((r) => r && (r[0] || r[1]));
}

// Отбор строк. skip — фасет, который не применять (для его счётчиков).
export function applyFilter(rows, facets, ranges, f, text, skip = '') {
  const q = (text || '').trim().toLowerCase();
  const fs = facets.filter((d) => d.key !== skip && (f.facets[d.key] || []).length);
  const rs = ranges.filter((d) => f.ranges[d.key] && (f.ranges[d.key][0] || f.ranges[d.key][1]));
  return rows.filter((r) => fs.every((d) => asList(d.val(r)).some((v) => f.facets[d.key].includes(v)))
    && rs.every((d) => {
      const [from, to] = f.ranges[d.key];
      const v = d.val(r);
      if (v === '' || v == null) return false;
      if (d.kind === 'number') return (from === '' || from == null || +v >= +from) && (to === '' || to == null || +v <= +to);
      return (!from || v >= from) && (!to || v <= to);
    })
    && (!q || textOf(r).toLowerCase().includes(q)));
}
function textOf(r) {
  const s = r.s || r;
  return `${s.eniAll || s.eni} ${s.title} ${s.institution} ${s.city || ''} ${r.a ? r.a.person : ''}`;
}

// Значения фасетов со счётчиками: [{ key, title, items: [[значение, подпись, число]] }].
export function facetValues(rows, facets, ranges, f, text) {
  return facets.map((d) => {
    const m = new Map();
    const labels = new Map();
    applyFilter(rows, facets, ranges, f, text, d.key).forEach((r) => asList(d.val(r)).forEach((v) => {
      if (!v) return;
      m.set(v, (m.get(v) || 0) + 1);
      if (d.label) labels.set(v, d.label(r));
    }));
    // Отмеченное, но сейчас не встречающееся, остаётся в списке с нулём —
    // иначе снять отметку было бы нечем.
    (f.facets[d.key] || []).forEach((v) => { if (!m.has(v)) m.set(v, 0); });
    const lab = (v) => (d.order ? (d.order.find((o) => o.key === v) || {}).label || v : labels.get(v) || v);
    // Значения с порядком по смыслу (срок, покрытие, отбор) — все, и с нулём:
    // список не прыгает от отбора к отбору.
    const items = d.order
      ? d.order.map((o) => [o.key, o.label, m.get(o.key) || 0])
      : [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'ru')).map(([v, n]) => [v, lab(v), n]);
    return { key: d.key, title: d.title, items };
  });
}

// Подписи применённых отборов — для строки «чипов».
export function filterChips(f, facets, ranges, labelOf) {
  const out = [];
  facets.forEach((d) => (f.facets[d.key] || []).forEach((v) => out.push({ kind: 'facet', key: d.key, value: v, text: `${d.title}: ${labelOf(d, v)}` })));
  ranges.forEach((d) => {
    const r = f.ranges[d.key];
    if (!r || !(r[0] || r[1])) return;
    const date = d.kind === 'date';
    const fmt = (x) => (date ? String(x).split('-').reverse().join('.') : String(x));
    const [a, b] = r;
    const text = a && b ? `${fmt(a)} – ${fmt(b)}` : a ? `${date ? 'с' : 'от'} ${fmt(a)}` : `${date ? 'по' : 'до'} ${fmt(b)}`;
    out.push({ kind: 'range', key: d.key, text: `${d.title}: ${text}` });
  });
  return out;
}

// Фильтры очереди: f.q, f.due, f.cov, f.region, f.type, f.inst. skip — какой
// фильтр не применять (счётчик фасета считается без самого фасета).
export function queueFilter(rows, f, skip = '') {
  const q = (f.q || '').trim().toLowerCase();
  return rows.filter((s) => (skip === 'due' || !f.due || s.due === f.due)
    && (skip === 'cov' || !f.cov || s.cov.state === f.cov)
    && (skip === 'region' || !f.region || regionOf(s) === f.region)
    && (skip === 'type' || !f.type || s.typeId === f.type)
    && (skip === 'inst' || !f.inst || s.institution === f.inst)
    && (!q || `${s.eniAll || s.eni} ${s.title} ${s.institution} ${s.city}`.toLowerCase().includes(q)));
}

// Счётчики фасетов — значения из данных.
export function queueCounts(rows, f) {
  const count = (key, valOf) => {
    const m = new Map();
    queueFilter(rows, f, key).forEach((s) => { const v = valOf(s); if (v) m.set(v, (m.get(v) || 0) + 1); });
    return m;
  };
  return {
    due: count('due', (s) => s.due),
    cov: count('cov', (s) => s.cov.state),
    region: count('region', (s) => regionOf(s)),
    type: count('type', (s) => s.typeId),
    typeLabel: new Map(rows.map((s) => [s.typeId, s.typeLabel])),
    inst: count('inst', (s) => s.institution),
  };
}

// Группы «выезд по месту»: горящие сверху (ближайший срок), затем по числу
// свободных ОИ. Внутри — по сроку.
export function tripGroups(rows) {
  const by = new Map();
  rows.forEach((s) => { if (!by.has(s.place)) by.set(s.place, []); by.get(s.place).push(s); });
  const minDue = (list) => list.map((s) => s.deadline).filter(Boolean).sort()[0] || '9999';
  return [...by.entries()].map(([place, list]) => ({
    place,
    rows: list.sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || String(b.updatedAt).localeCompare(String(a.updatedAt))),
    free: list.reduce((n, s) => n + s.cov.free, 0),
    nearest: minDue(list),
  })).sort((a, b) => a.nearest.localeCompare(b.nearest) || b.free - a.free || a.place.localeCompare(b.place, 'ru'));
}

// Доступность человека на ближайшие n рабочих дней: занятость планом и
// нерабочие дни (отпуск, график).
export function availability(person, n = 10) {
  const span = workdays(0, n, 1);
  const load = new Map();
  allAssignments().forEach((a) => { if (isLive(a) && a.person === person && a.plannedAt) load.set(a.plannedAt, (load.get(a.plannedAt) || 0) + 1); });
  return span.map((day) => {
    const w = workdayOf(person, day);
    const act = activitiesOn(person, day).map((a) => activityKind(a.kind).label + (a.region ? `: ${a.region}` : '')).join(', ');
    return { day, load: load.get(day) || 0, off: w.ok ? '' : w.reason, act };
  });
}

// «Кого назначить» — подбор «кому и когда» по настоящим данным: route.js,
// recommendAssign (15.10.2026).

// Контакты на месте: свои контакты объекта и контакты учреждения по цепочке
// (решение пользователя 12.10.2026 «Контакты на месте тоже добавляем»).
export function onSiteContacts(typeId, ocId) {
  const t = getType(typeId);
  const rec = t && t.records.loadRecord(ocId);
  if (!rec) return [];
  const own = (rec.contacts || []).map((c) => ({ ...c, from: 'объект' }));
  const chain = institutionChain(rec.institution, rec.podved).flatMap((x) => (x.contacts || []).map((c) => ({ ...c, from: x.node ? x.node.name : (x.name || 'учреждение') })));
  return [...own, ...chain].filter((c) => c && (c.name || c.phone));
}

// Быстрые отборы «Назначено».
export const ASSIGNED_PICKS = [
  { key: '', label: 'Все' },
  { key: 'late', label: 'Просрочено' },
  { key: 'stall', label: 'Зависли' },
  { key: 'today', label: 'Сегодня' },
  { key: 'week', label: 'На неделе' },
  { key: 'away', label: 'План на отсутствие' },
];
export function assignedPickOf(a) {
  const out = new Set();
  const today = todayIso();
  if (isOverdue(a)) out.add('late');
  if (stallOf(a)) out.add('stall');
  if (a.plannedAt === today) out.add('today');
  if (a.plannedAt && a.plannedAt >= today && a.plannedAt <= addDays(today, 7)) out.add('week');
  if (a.plannedAt && !workdayOf(a.person, a.plannedAt).ok) out.add('away');
  return out;
}

// --- отчёты за день (ТЗ рабочего дня осмотрщика, раздел 3) -------------------

// Строка дня осмотрщика: отчёты, план и осмотрено по отчёту.
function reportRow(name, date) {
  const d = dayReport(name, date);
  const planned = allAssignments().filter((a) => a.person === name && a.plannedAt === date && a.state !== 'removed');
  return { name, date, d, planned: planned.length, inspected: d.evening ? (d.evening.done || []).length : null };
}

// Все осмотрщики за день — «Отчёты за вчера» регионала (ТЗ 3.6).
export function reportDayRows(people, date) {
  return people.filter((p) => !p.fired).map((p) => reportRow(p.name, date));
}

// Итоги набора строк: сдано, поздно, пропуски, пробег и литры.
export function reportTotals(rows) {
  const t = { due: 0, morning: 0, evening: 0, late: 0, missing: 0, km: 0, litres: 0, inspected: 0, planned: 0 };
  rows.forEach(({ d, planned, inspected }) => {
    if (d.work && d.trips) t.due++;
    if (d.morning) t.morning++;
    if (d.evening) t.evening++;
    if (d.late) t.late++;
    if (d.missingMorning) t.missing++;
    if (d.missingEvening) t.missing++;
    if (d.km !== null) t.km += d.km;
    if (d.litres !== null) t.litres += d.litres;
    t.planned += planned;
    t.inspected += inspected || 0;
  });
  t.litres = Math.round(t.litres * 100) / 100;
  return t;
}

const datesBetween = (from, to) => {
  const out = [];
  const d = new Date(from + 'T00:00:00');
  for (let iso = from; iso <= to; d.setDate(d.getDate() + 1), iso = isoDay(d)) out.push(iso);
  return out;
};

// Дни осмотрщика за период: рабочие и те, где есть отчёт.
export function reportDays(name, from, to) {
  const today = isoDay(new Date());
  return datesBetween(from, to < today ? to : today).reverse()
    .map((date) => reportRow(name, date))
    .filter((r) => r.d.work || r.d.morning || r.d.evening);
}

// Отчёт для бухгалтерии (ТЗ 3.4): по осмотрщику и дню — пробег, литры, вид
// топлива, авто, показания одометра или маршрут адресами; цены нет.
export function accountingSheets(names, from, to) {
  const ddmm = (iso) => iso.split('-').reverse().join('.');
  const rows = [];
  const total = [];
  names.forEach((name) => {
    const p = profileOf(name);
    const t = { days: 0, km: 0, litres: 0, noEvening: 0 };
    reportDays(name, from, to).reverse().forEach(({ date, d }) => {
      if (d.missingEvening) t.noEvening++;
      if (!d.morning && !d.evening) return;
      if (d.km !== null) { t.days++; t.km += d.km; }
      if (d.litres !== null) t.litres += d.litres;
      rows.push([
        name, ddmm(date), p.car.make, p.car.plate, p.car.fuel, d.consumption ?? '',
        d.morning && d.morning.odometer ? +d.morning.odometer : '', d.evening && d.evening.odometer ? +d.evening.odometer : '',
        d.km ?? '', d.kmBy === 'odometer' ? 'по одометру' : d.kmBy === 'route' ? 'по маршруту' : '',
        d.evening && d.evening.route && d.evening.route.length ? d.evening.route.join(' → ') : '',
        d.litres ?? '',
        d.morning ? reportTime(d.morning.at) : 'нет', d.evening ? `${d.eveningLate ? ddmm(dayOf(d.evening.at)) + ' ' : ''}${reportTime(d.evening.at)}` : 'нет',
        [d.morning && d.morning.photo ? 'утро' : '', d.evening && d.evening.photo ? 'вечер' : ''].filter(Boolean).join(', ') || 'нет',
      ]);
    });
    total.push([name, [p.car.make, p.car.plate].filter(Boolean).join(' · '), p.car.fuel, t.days, t.km, Math.round(t.litres * 100) / 100, t.noEvening]);
  });
  return [
    { name: 'По дням', rows,
      head: ['Осмотрщик', 'Дата', 'Авто', 'Госномер', 'Топливо', 'Расход, л/100 км', 'Одометр утром', 'Одометр вечером',
        'Пробег, км', 'Пробег посчитан', 'Маршрут', 'Литры', 'Утренний отчёт', 'Вечерний отчёт', 'Снимки одометра'],
      widths: [34, 11, 24, 14, 9, 10, 12, 12, 10, 14, 50, 9, 10, 16, 14] },
    { name: 'Итог', rows: total,
      head: ['Осмотрщик', 'Авто', 'Топливо', 'Дней с пробегом', 'Пробег, км', 'Литры', 'Дней без вечернего отчёта'],
      widths: [34, 34, 9, 12, 11, 9, 14] },
  ];
}

// --- итоги по сотрудникам за период (ТЗ рабочего дня осмотрщика, раздел 9) ---
//
// По осмотрщику: дни с выездами, объекты и ОИ, снимки, пробег и литры,
// отчёты вовремя / поздно / пропущены, пропущенные выезды, кадастровые
// строки получено / нет / отказ. Всё — из тех же данных, что разделы панели.
export function employeeSummary(all, names, from, to) {
  const inRange = (iso) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  const today = isoDay(new Date());
  return names.map((name) => {
    const days = reportDays(name, from, to);
    const t = reportTotals(days);
    const done = allAssignments().filter((a) => a.person === name && a.state === 'done' && inRange(dayOf(a.doneAt)));
    const objects = new Set(done.map((a) => a.typeId + '|' + a.ocId)).size;
    const oi = done.reduce((n, a) => n + ((a.oiIds && a.oiIds.length) || 1), 0);
    const photos = eventsOf({ person: name }).filter((e) => e.kind === 'photos' && inRange(dayOf(e.at))).reduce((n, e) => n + (e.count || 0), 0);
    const tripDays = days.filter((r) => r.d.trips > 0).length;
    let onTime = 0;
    let late = 0;
    days.forEach(({ d }) => {
      if (d.morning) { if (d.late) late++; else onTime++; }
      if (d.evening) { if (d.eveningLate) late++; else onTime++; }
    });
    const missedTrips = allAssignments().filter((a) => a.person === name && isLive(a) && a.state === 'assigned' && a.plannedAt && a.plannedAt < today && inRange(a.plannedAt)).length;
    const cad = { got: 0, none: 0, refused: 0 };
    allCadRequests().filter((r) => r.person === name).forEach((r) => r.rows.forEach((x) => { if (x.result && inRange(x.answeredAt)) cad[x.result]++; }));
    return { name, tripDays, objects, oi, photos, km: t.km, litres: t.litres, onTime, late, missedReports: t.missing, missedTrips, cad, days };
  });
}
