// Статистика осмотров: период, показатели осмотрщика, медиана команды,
// области, ряды графиков и листы выгрузки xlsx.
//
// Задача графа ekran-statistiki-osmotrov-pokazateli-i-vygruzka-xlsx
// (14.10.2026, «Надо бы добить экран статистики. С возможностью выгрузки
// отчетов. как по всем, так и по конкретному осмотрщику»). Взятые показатели
// — сроки, выработка на рабочий день, факт против нормы, пробег и бензин на
// объект, дисциплина отчётов, области, сравнение с командой; сводка с ОИ по
// видам и переключатель периода — пункты 4 и 4.1 ТЗ panel-osmotrov-tz.
// Всё считается из тех же данных, что остальные разделы панели.
import { getType } from '../../kernel/registry.js';
import { allAssignments, eventsOf, deadlineOf, workdayOf, isLive } from '../../kernel/inspections.js';
import { dayOf, regionOf, queueBase, isOverdue, employeeSummary } from './model.js';
import { inspectMinutes } from './route.js';

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (iso) => new Date(iso + 'T00:00:00');
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MON_SHORT = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const ROMAN = ['I', 'II', 'III', 'IV'];

// --- период -------------------------------------------------------------------------
//
// Неделя (пн–вс), месяц или квартал; offset — шагов назад от текущего.
// Границы — от сегодняшней даты, годы не зашиты. Текущий период — по
// сегодня: дни впереди ещё не наступили, и в рабочие дни они не идут.
export const PERIOD_UNITS = [['week', 'Неделя'], ['month', 'Месяц'], ['quarter', 'Квартал']];

export function periodOf(unit, offset) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  let from;
  let to;
  if (unit === 'week') {
    from = new Date(t); from.setDate(t.getDate() - ((t.getDay() + 6) % 7) - 7 * offset);
    to = new Date(from); to.setDate(from.getDate() + 6);
  } else if (unit === 'quarter') {
    const q = Math.floor(t.getMonth() / 3) - offset;
    from = new Date(t.getFullYear(), q * 3, 1);
    to = new Date(from.getFullYear(), from.getMonth() + 3, 0);
  } else {
    from = new Date(t.getFullYear(), t.getMonth() - offset, 1);
    to = new Date(from.getFullYear(), from.getMonth() + 1, 0);
  }
  const f = isoDay(from);
  const e = isoDay(to);
  const today = isoDay(t);
  let label;
  if (unit === 'week') {
    label = from.getMonth() === to.getMonth()
      ? `${from.getDate()}–${to.getDate()} ${MON_SHORT[to.getMonth()]} ${to.getFullYear()}`
      : `${from.getDate()} ${MON_SHORT[from.getMonth()]} – ${to.getDate()} ${MON_SHORT[to.getMonth()]} ${to.getFullYear()}`;
  } else if (unit === 'quarter') label = `${ROMAN[Math.floor(from.getMonth() / 3)]} квартал ${from.getFullYear()}`;
  else label = `${MONTHS[from.getMonth()]} ${from.getFullYear()}`;
  return { unit, offset, from: f, to: e, upto: e < today ? e : today, label, current: offset === 0 };
}

const ddmmyyyy = (iso) => (iso ? iso.split('-').reverse().join('.') : '');
export const periodText = (p) => `${ddmmyyyy(p.from)} – ${ddmmyyyy(p.upto)}`;

// --- виды ОИ ------------------------------------------------------------------------

export const OI_KINDS = [
  ['building', 'Литеры'], ['land', 'Участки'], ['apartment', 'Квартиры'],
  ['vehicle', 'ТС'], ['mech', 'Механизмы'], ['aux', 'Вспом. постройки'],
];
// Назначение без перечня ОИ — весь объект; вид — по типу ОЦ.
const KIND_OF_TYPE = { vehicle: 'vehicle', mechanisms: 'mech', 'land-plot': 'land', apartment: 'apartment' };

function recordOf(cache, typeId, ocId) {
  const k = typeId + '|' + ocId;
  if (!cache.has(k)) {
    const t = getType(typeId);
    cache.set(k, (t && t.records.loadRecord(ocId)) || null);
  }
  return cache.get(k);
}

function kindsOf(cache, a, out) {
  const ids = a.oiIds || [];
  if (!ids.length) {
    const k = KIND_OF_TYPE[a.typeId] || 'building';
    out[k] = (out[k] || 0) + 1;
    return;
  }
  const rec = recordOf(cache, a.typeId, a.ocId);
  const byId = new Map(((rec && rec.oi) || []).map((o) => [o.id, o]));
  ids.forEach((id) => {
    const o = byId.get(id);
    const k = o && OI_KINDS.some(([x]) => x === o.card) ? o.card : 'building';
    out[k] = (out[k] || 0) + 1;
  });
}

// --- показатели осмотрщика ----------------------------------------------------------

const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const ratio = (n, d) => (d ? n / d : null);

// Показатели за период; ctx — общее на один расчёт (кэш записей, сводки,
// первые снимки назначений, итоги отчётов по людям).
function personStats(ctx, name) {
  const { all, period, cache } = ctx;
  const inRange = (day) => !!day && day >= period.from && day <= period.to;
  const done = allAssignments().filter((a) => a.person === name && a.state === 'done' && inRange(dayOf(a.doneAt)));
  const kinds = {};
  done.forEach((a) => kindsOf(cache, a, kinds));
  const oi = done.reduce((n, a) => n + ((a.oiIds && a.oiIds.length) || 1), 0);
  const objects = new Set(done.map((a) => a.typeId + '|' + a.ocId)).size;

  const t = { photos: 0, notes: 0, mismatch: 0, found: 0 };
  eventsOf({ person: name }).forEach((e) => {
    if (!inRange(dayOf(e.at))) return;
    if (e.kind === 'photos') t.photos += e.count || 0;
    if (e.kind === 'note') t.notes++;
    if (e.kind === 'mismatch') t.mismatch++;
    if (e.kind === 'found') t.found++;
  });

  // Рабочие дни периода — по графику, без отпусков, больничных и до приёма.
  let workdays = 0;
  for (let d = parse(period.from); isoDay(d) <= period.upto; d.setDate(d.getDate() + 1)) {
    if (workdayOf(name, isoDay(d)).ok) workdays++;
  }

  // Сроки: закончено к плановой дате и к сроку осмотра; опоздание — дни
  // после плановой даты у опоздавших.
  let planN = 0; let onPlan = 0; let lateDays = 0; let lateN = 0; let dlN = 0; let onDl = 0;
  // Факт против нормы: длительность — от первых снимков до окончания
  // (как «по факту» в нормах осмотра), норма — по виду здания и площади.
  let factMin = 0; let normMin = 0; let normN = 0;
  done.forEach((a) => {
    const day = dayOf(a.doneAt);
    if (a.plannedAt) {
      planN++;
      if (day <= a.plannedAt) onPlan++;
      else { lateN++; lateDays += daysBetween(a.plannedAt, day); }
    }
    const dl = deadlineOf(a.typeId, a.ocId);
    if (dl) { dlN++; if (day <= dl) onDl++; }
    const first = ctx.firstPhoto.get(a.id);
    const s = all.get(a.typeId + '|' + a.ocId);
    if (first && s) {
      const min = (new Date(a.doneAt) - new Date(first)) / 60000;
      if (min > 0 && min <= 600) { factMin += min; normMin += inspectMinutes(s); normN++; }
    }
  });

  const r = ctx.reports.get(name) || { km: 0, litres: 0, onTime: 0, late: 0, missedReports: 0 };
  const repAll = r.onTime + r.late + r.missedReports;
  return {
    name, objects, oi, kinds, ...t, workdays,
    oiPerDay: ratio(oi, workdays),
    planN, onPlanShare: ratio(onPlan, planN), lateAvg: lateN ? lateDays / lateN : (planN ? 0 : null),
    dlN, onDlShare: ratio(onDl, dlN),
    normN, normRatio: normMin ? factMin / normMin : null,
    km: r.km, litres: r.litres, kmPerObj: objects && r.km ? r.km / objects : null, lPerObj: objects && r.litres ? r.litres / objects : null,
    repOnTime: r.onTime, repLate: r.late, repMissed: r.missedReports, repShare: ratio(r.onTime, repAll),
  };
}

// Расчёт по набору людей за период: строки людей и медиана команды.
export function statsFor(all, names, period) {
  const firstPhoto = new Map();
  eventsOf({}).forEach((e) => { if (e.kind === 'photos' && (!firstPhoto.has(e.assignId) || e.at < firstPhoto.get(e.assignId))) firstPhoto.set(e.assignId, e.at); });
  const reports = new Map(employeeSummary(all, names, period.from, period.upto).map((r) => [r.name, r]));
  const ctx = { all, period, cache: new Map(), firstPhoto, reports };
  const rows = names.map((n) => personStats(ctx, n));
  const median = {};
  METRICS.forEach((m) => { median[m.key] = medianOf(rows.map((r) => r[m.key])); });
  const total = { objects: 0, oi: 0, photos: 0, notes: 0, mismatch: 0, found: 0, km: 0, litres: 0, repOnTime: 0, repLate: 0, repMissed: 0, kinds: {} };
  rows.forEach((r) => {
    Object.keys(total).forEach((k) => { if (k !== 'kinds') total[k] += r[k] || 0; });
    Object.entries(r.kinds).forEach(([k, v]) => { total.kinds[k] = (total.kinds[k] || 0) + v; });
  });
  total.objects = new Set(allAssignments().filter((a) => names.includes(a.person) && a.state === 'done'
    && dayOf(a.doneAt) >= period.from && dayOf(a.doneAt) <= period.to).map((a) => a.typeId + '|' + a.ocId)).size;
  return { rows, median, total };
}

function medianOf(values) {
  const v = values.filter((x) => x !== null && x !== undefined && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Показатели сравнения — порядок строк у осмотрщика и столбцов у всех.
// better — какое направление лучше: подсветка «хуже медианы» у осмотрщика.
export const METRICS = [
  { key: 'oi', label: 'Осмотрено ОИ', short: 'ОИ', fmt: 'int', better: 'up' },
  { key: 'objects', label: 'Объектов', fmt: 'int', better: 'up' },
  { key: 'oiPerDay', label: 'ОИ на рабочий день', short: 'ОИ в раб. день', fmt: 'dec', better: 'up', hint: 'Осмотренные ОИ, делённые на рабочие дни периода без отпусков и больничных' },
  { key: 'onPlanShare', label: 'Закончено к плановой дате', short: 'К план. дате', fmt: 'pct', better: 'up', hint: 'Доля законченных назначений, осмотренных не позже плановой даты' },
  { key: 'lateAvg', label: 'Опоздание к плановой дате, дн.', short: 'Опозд., дн.', fmt: 'dec', better: 'down', hint: 'Среднее число дней после плановой даты у опоздавших осмотров' },
  { key: 'onDlShare', label: 'Закончено к сроку осмотра', short: 'К сроку', fmt: 'pct', better: 'up', hint: 'Доля законченных назначений с поставленным сроком, осмотренных не позже срока' },
  { key: 'normRatio', label: 'Факт к норме осмотра', short: 'Факт / норма', fmt: 'pct', better: 'down', hint: 'Время осмотра от первых снимков до окончания к норме по виду здания и площади; меньше 100% — быстрее нормы' },
  { key: 'kmPerObj', label: 'Пробег на объект, км', short: 'Км на объект', fmt: 'dec', better: 'down' },
  { key: 'lPerObj', label: 'Бензин на объект, л', short: 'Л на объект', fmt: 'dec', better: 'down' },
  { key: 'repShare', label: 'Отчёты дня вовремя', short: 'Отчёты вовремя', fmt: 'pct', better: 'up', hint: 'Утренние и вечерние отчёты, сданные вовремя, от всех положенных' },
];

export function fmtMetric(v, fmt) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (fmt === 'pct') return `${Math.round(v * 100)}%`;
  if (fmt === 'dec') return v.toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return v.toLocaleString('ru-RU');
}

// Хуже медианы команды заметно (больше чем на 10%) — для подсветки.
export function worseThanMedian(m, v, med) {
  if (v === null || med === null || v === undefined || !Number.isFinite(v) || !Number.isFinite(med) || !med) return false;
  return m.better === 'up' ? v < med * 0.9 : v > med * 1.1;
}

// --- области ------------------------------------------------------------------------
//
// Где не хватает людей: осмотрено за период, ждёт назначения, просрочено,
// осмотрщиков (по области профиля или по объектам).
export function regionRows(all, people, period) {
  const by = new Map();
  const row = (r) => {
    const k = r || 'без области';
    if (!by.has(k)) by.set(k, { region: k, objects: new Set(), oi: 0, waiting: 0, overdue: 0, people: 0 });
    return by.get(k);
  };
  allAssignments().forEach((a) => {
    const s = all.get(a.typeId + '|' + a.ocId);
    if (!s) return;
    if (a.state === 'done' && dayOf(a.doneAt) >= period.from && dayOf(a.doneAt) <= period.to) {
      const x = row(regionOf(s));
      x.objects.add(a.typeId + '|' + a.ocId);
      x.oi += (a.oiIds && a.oiIds.length) || 1;
    }
    if (isLive(a) && isOverdue(a)) row(regionOf(s)).overdue++;
  });
  queueBase(all).forEach((s) => { row(regionOf(s)).waiting++; });
  people.filter((p) => !p.fired).forEach((p) => (p.regions.length ? p.regions : ['без области']).forEach((r) => { row(r).people++; }));
  return [...by.values()].map((x) => ({ ...x, objects: x.objects.size }))
    .sort((a, b) => b.waiting + b.overdue - (a.waiting + a.overdue) || a.region.localeCompare(b.region, 'ru'));
}

// --- ряды графиков ------------------------------------------------------------------
//
// Неделя — по рабочим дням (выходные пропущены: осмотров по выходным нет);
// месяц и квартал — по неделям: дневные линии по шести людям рваные, по ним
// не видно, кто как работает (так решено и для прежних графиков 12.10.2026).
// x — начало шага, секунды местной полуночи.
export function seriesOf(names, period) {
  const steps = [];
  if (period.unit !== 'week') {
    const d = parse(period.from);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    for (; isoDay(d) <= period.upto; d.setDate(d.getDate() + 7)) steps.push(isoDay(d));
    // Первая неделя — с начала периода: раньше него не считается.
    if (steps.length && steps[0] < period.from) steps[0] = period.from;
  } else {
    for (const d = parse(period.from); isoDay(d) <= period.upto; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) steps.push(isoDay(d));
    }
  }
  const stepOf = (day) => {
    if (day < period.from || day > period.upto) return -1;
    for (let i = steps.length - 1; i >= 0; i--) if (day >= steps[i]) return i;
    return -1;
  };
  const oi = names.map(() => new Array(steps.length).fill(0));
  const photos = names.map(() => new Array(steps.length).fill(0));
  const pos = new Map(names.map((n, i) => [n, i]));
  const byId = new Map(allAssignments().map((a) => [a.id, a]));
  eventsOf({}).forEach((e) => {
    const p = pos.get(e.person);
    if (p === undefined) return;
    const i = stepOf(dayOf(e.at));
    if (i < 0) return;
    if (e.kind === 'done') { const a = byId.get(e.assignId); oi[p][i] += (a && a.oiIds && a.oiIds.length) || 1; }
    if (e.kind === 'photos') photos[p][i] += e.count || 0;
  });
  return { xs: steps.map((s) => parse(s).getTime() / 1000), step: period.unit === 'week' ? 'day' : 'week', oi, photos };
}

// --- выгрузка xlsx ------------------------------------------------------------------
//
// Лист на тему; шапка закреплена, автофильтр (kernel/xlsx.js). Состав
// согласован пользователем 14.10.2026 («Листы: Подходит»).
const num = (v, frac = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '' : Math.round(v * 10 ** frac) / 10 ** frac);
const pct = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '' : Math.round(v * 100));
const metricCell = (m, v) => (m.fmt === 'pct' ? pct(v) : m.fmt === 'int' ? (v ?? '') : num(v));
const metricHead = (m) => (m.fmt === 'pct' ? `${m.label}, %` : m.label);
const kindHead = OI_KINDS.map(([, l]) => l);
const kindCells = (kinds) => OI_KINDS.map(([k]) => kinds[k] || 0);

function summaryRows(st) {
  return st.rows.map((r) => [r.name, r.workdays, r.photos, r.notes, r.mismatch, r.found, ...kindCells(r.kinds),
    ...METRICS.map((m) => metricCell(m, r[m.key])), num(r.km), num(r.litres), r.repOnTime, r.repLate, r.repMissed]);
}
const SUMMARY_HEAD = () => ['Осмотрщик', 'Рабочих дней', 'Снимков', 'Заметок', 'Расхождений', 'Выявлено', ...kindHead,
  ...METRICS.map(metricHead), 'Пробег, км', 'Литры', 'Отчётов вовремя', 'Отчётов поздно', 'Отчётов не сдано'];

function seriesRows(names, period) {
  const s = seriesOf(names, period);
  const rows = [];
  s.xs.forEach((x, i) => {
    const day = isoDay(new Date(x * 1000));
    names.forEach((n, p) => { if (s.oi[p][i] || s.photos[p][i]) rows.push([ddmmyyyy(day), n, s.oi[p][i], s.photos[p][i]]); });
  });
  return { name: s.step === 'week' ? 'По неделям' : 'По дням', head: [s.step === 'week' ? 'Неделя с' : 'Дата', 'Осмотрщик', 'Осмотрено ОИ', 'Снимков'], rows, widths: [12, 34, 14, 10] };
}

export function allSheets(all, people, period) {
  const names = people.filter((p) => !p.fired).map((p) => p.name);
  const st = statsFor(all, names, period);
  const kindRows = OI_KINDS.map(([k, l]) => [l, ...st.rows.map((r) => r.kinds[k] || 0), st.total.kinds[k] || 0]);
  return [
    { name: 'Сводка', head: SUMMARY_HEAD(), rows: [...summaryRows(st),
      ['Медиана команды', '', '', '', '', '', ...OI_KINDS.map(() => ''), ...METRICS.map((m) => metricCell(m, st.median[m.key])), '', '', '', '', '']],
    widths: [34, 10, 10, 10, 12, 10, ...OI_KINDS.map(() => 10), ...METRICS.map(() => 14), 11, 9, 11, 11, 11] },
    seriesRows(names, period),
    { name: 'По областям', head: ['Область', 'Осмотрено объектов', 'Осмотрено ОИ', 'Ждёт назначения', 'Просрочено', 'Осмотрщиков'],
      rows: regionRows(all, people, period).map((r) => [r.region, r.objects, r.oi, r.waiting, r.overdue, r.people]), widths: [26, 14, 12, 14, 12, 12] },
    { name: 'По видам ОИ', head: ['Вид ОИ', ...names, 'Итого'], rows: kindRows, widths: [20, ...names.map(() => 16), 10] },
  ];
}

export function personSheets(all, people, name, period) {
  const names = people.filter((p) => !p.fired).map((p) => p.name);
  if (!names.includes(name)) names.push(name);
  const st = statsFor(all, names, period);
  const me = st.rows.find((r) => r.name === name);
  const cache = new Map();
  const done = allAssignments().filter((a) => a.person === name && a.state === 'done' && dayOf(a.doneAt) >= period.from && dayOf(a.doneAt) <= period.to)
    .sort((a, b) => String(a.doneAt).localeCompare(String(b.doneAt)));
  const evs = eventsOf({ person: name });
  const objRows = done.map((a) => {
    const s = all.get(a.typeId + '|' + a.ocId) || {};
    const k = {};
    kindsOf(cache, a, k);
    const of = (kind) => evs.filter((e) => e.assignId === a.id && e.kind === kind);
    return [ddmmyyyy(dayOf(a.doneAt)), ddmmyyyy(a.plannedAt), ddmmyyyy(deadlineOf(a.typeId, a.ocId)), s.eniAll || s.eni || '', s.title || '',
      regionOf(s) || '', (a.oiIds && a.oiIds.length) || 1, OI_KINDS.filter(([x]) => k[x]).map(([x, l]) => `${l} ${k[x]}`).join(', '),
      of('photos').reduce((n, e) => n + (e.count || 0), 0), of('mismatch').length, of('found').length];
  });
  const days = (st.rows.length ? employeeSummary(all, [name], period.from, period.upto)[0].days : []).slice().reverse();
  return [
    { name: 'Сводка', head: ['Показатель', 'Значение', 'Медиана команды'], rows: [
      ['Рабочих дней', me.workdays, ''], ['Снимков', me.photos, ''], ['Заметок', me.notes, ''], ['Расхождений', me.mismatch, ''], ['Выявлено', me.found, ''],
      ...OI_KINDS.map(([k, l]) => [`ОИ: ${l}`, me.kinds[k] || 0, '']),
      ...METRICS.map((m) => [metricHead(m), metricCell(m, me[m.key]), metricCell(m, st.median[m.key])]),
      ['Пробег, км', num(me.km), ''], ['Литры', num(me.litres), ''],
      ['Отчётов вовремя', me.repOnTime, ''], ['Отчётов поздно', me.repLate, ''], ['Отчётов не сдано', me.repMissed, ''],
    ], widths: [36, 14, 16] },
    seriesRows([name], period),
    { name: 'Осмотренные объекты', head: ['Осмотрен', 'Плановая дата', 'Срок осмотра', 'ЕНИ', 'Объект', 'Область', 'ОИ', 'Виды ОИ', 'Снимков', 'Расхождений', 'Выявлено'],
      rows: objRows, widths: [11, 13, 13, 22, 40, 18, 6, 26, 9, 12, 10] },
    { name: 'Отчёты дня', head: ['Дата', 'Утренний', 'Вечерний', 'Пробег, км', 'Литры', 'Объектов в плане', 'Осмотрено по отчёту'],
      rows: days.map(({ date, d, planned, inspected }) => [ddmmyyyy(date),
        d.morning ? (d.late ? 'поздно' : 'вовремя') : d.missingMorning ? 'не сдан' : '',
        d.evening ? (d.eveningLate ? 'поздно' : 'вовремя') : d.missingEvening ? 'не сдан' : '',
        d.km ?? '', d.litres ?? '', planned, inspected ?? '']), widths: [11, 11, 11, 11, 9, 14, 16] },
  ];
}

// Имя файла — латиницей, как у остальных выгрузок панели.
const LAT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ң: 'n', ө: 'o', ү: 'u' };
const lat = (t) => [...String(t).toLowerCase()].map((c) => (c in LAT ? LAT[c] : /[a-z0-9]/.test(c) ? c : '-')).join('').replace(/-+/g, '-').replace(/^-|-$/g, '');
export const exportName = (person, period) => `statistika-osmotrov_${person ? lat(person.split(' ')[0]) : 'vse'}_${period.from}_${period.upto}.xlsx`;
