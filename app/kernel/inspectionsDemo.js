// Демо-история осмотров — чтобы графикам и истории панели осмотров было что
// показывать (просьба пользователя 12.10.2026 «не вижу… графиков с демо
// данными»). В демо-наборе 16 записей и три осмотрщика; на них строится:
//   * прошлое — 45 рабочих дней законченных осмотров по ОИ (снимки, заметки);
//   * будущее — плановые осмотры на три недели вперёд;
//   * частично осмотренный объект — у первой записи «Удостоверен по
//     документам» с несколькими ОИ первый ОИ осмотрен, второй назначен, прочие
//     свободны (просьба пользователя 12.10.2026 «А где частично осмотренные?»).
// Генератор детерминированный (mulberry32 от постоянного зерна), даты — от
// сегодняшнего дня (правило «годы и периоды не зашивать»). Демо-назначения
// помечены demo: true и не трогают записи: resp.insp не пишут. Очередь «К
// назначению» считает свободные ОИ, поэтому частичный демо-объект в ней
// остаётся со своей полосой покрытия.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: демо-данных нет — история и загрузка строятся из
// настоящих назначений и журнала.
import { sortedTypes } from './registry.js';

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const READY = 'Удостоверен по документам';
const NOTES = [
  'Кровля протекает над входом', 'Доступ в подвал закрыт — нужен ключ у завхоза',
  'Табличка с номером отсутствует', 'Фасад после ремонта', 'Котёл не работает с прошлого сезона',
  'Ограждение частично разобрано', 'Ответственный на месте — сопровождал',
];

const dayAt = (base, shift, hour) => {
  const d = new Date(base);
  d.setDate(d.getDate() + shift);
  d.setHours(hour, Math.floor(hour * 7 % 60), 0, 0);
  return d;
};
const isWorkday = (d) => d.getDay() !== 0 && d.getDay() !== 6;
const isoLocalDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function demoInspections() {
  const recs = [];
  const people = new Set();
  sortedTypes().forEach((t) => {
    const res = t.records.queryRecords({ filter: {}, offset: 0, limit: 1000 });
    res.rows.forEach((s) => {
      const r = t.records.loadRecord(s.id);
      if (!r) return;
      if (s.resp && s.resp.insp) people.add(s.resp.insp);
      recs.push({ typeId: t.manifest.id, ocId: s.id, status: s.status, oi: (r.oi || []).map((o) => o.id), place: [s.institution, s.title].filter(Boolean).join(' — ') });
    });
  });
  const names = [...people].sort((a, b) => a.localeCompare(b, 'ru'));
  if (!names.length || !recs.length) return { assignments: [], events: [], reports: [], profiles: [] };

  const rnd = mulberry32(20261012);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const assignments = [];
  const events = [];
  let n = 0;
  const ev = (a, kind, at, extra = {}) => events.push({
    id: `demo-ev-${++n}`, at: at.toISOString(), who: kind === 'assigned' ? 'Региональный менеджер (демо)' : a.person,
    kind, assignId: a.id, typeId: a.typeId, ocId: a.ocId, person: a.person, demo: true, ...extra,
  });

  // Прошлое: у каждого осмотрщика в рабочий день 0–3 ОИ.
  const pool = recs.filter((r) => r.status !== READY && r.oi.length);
  names.forEach((person, pi) => {
    for (let back = 45; back >= 1; back--) {
      const day = dayAt(today, -back, 9);
      if (!isWorkday(day)) continue;
      const k = Math.floor(rnd() * (pi === 0 ? 4 : 3.2));
      for (let j = 0; j < k; j++) {
        const r = pick(pool);
        const oiId = pick(r.oi);
        const at = dayAt(today, -back - 2 - Math.floor(rnd() * 5), 10);
        // Окончание — после снимков и заметок того же осмотра.
        const done = dayAt(today, -back, 12 + j * 2);
        const a = {
          id: `demo-as-${++n}`, typeId: r.typeId, ocId: r.ocId, person, oiIds: [oiId], docs: [], inventories: [],
          plannedAt: isoLocalDate(day), note: '', by: 'Региональный менеджер (демо)', at: at.toISOString(),
          state: 'done', doneAt: done.toISOString(), demo: true,
        };
        assignments.push(a);
        ev(a, 'assigned', at);
        const photos = 6 + Math.floor(rnd() * 34);
        ev(a, 'photos', dayAt(today, -back, 10 + j * 2), { count: photos });
        if (rnd() < 0.35) ev(a, 'note', dayAt(today, -back, 11 + j * 2), { text: pick(NOTES) });
        if (rnd() < 0.15) ev(a, 'mismatch', dayAt(today, -back, 11 + j * 2), { field: 'Материал кровли' });
        if (rnd() < 0.08) ev(a, 'found', dayAt(today, -back, 11 + j * 2), { text: 'Навес у склада' });
        ev(a, 'done', done);
      }
    }
  });

  // Будущее: плановые на три недели вперёд, 0–3 в рабочий день; у первого
  // осмотрщика плотнее — чтобы на карте загрузки было видно перегруз.
  names.forEach((person, pi) => {
    for (let fwd = 0; fwd <= 21; fwd++) {
      const day = dayAt(today, fwd, 9);
      if (!isWorkday(day)) continue;
      const k = Math.floor(rnd() * (pi === 0 ? 4.6 : 3));
      for (let j = 0; j < k; j++) {
        const r = pick(pool);
        const at = dayAt(today, -1 - Math.floor(rnd() * 6), 15);
        const a = {
          id: `demo-as-${++n}`, typeId: r.typeId, ocId: r.ocId, person, oiIds: [pick(r.oi)], docs: [], inventories: [],
          plannedAt: isoLocalDate(day), note: '', by: 'Региональный менеджер (демо)', at: at.toISOString(),
          state: fwd === 0 && j === 0 ? 'progress' : 'assigned', doneAt: '', demo: true,
        };
        assignments.push(a);
        ev(a, 'assigned', at);
      }
    }
    // Пара просроченных — плановая дата прошла, осмотр не закончен.
    if (pi < 2) {
      const r = pick(pool);
      const day = dayAt(today, -3 - pi, 9);
      const a = {
        id: `demo-as-${++n}`, typeId: r.typeId, ocId: r.ocId, person, oiIds: [pick(r.oi)], docs: [], inventories: [],
        plannedAt: isoLocalDate(day), note: '', by: 'Региональный менеджер (демо)', at: dayAt(today, -8, 15).toISOString(),
        state: 'assigned', doneAt: '', demo: true,
      };
      assignments.push(a);
      ev(a, 'assigned', new Date(a.at));
    }
  });

  // Частично осмотренный объект очереди.
  const partial = recs.find((r) => r.status === READY && r.oi.length >= 3);
  if (partial) {
    const person = names[1 % names.length];
    const doneDay = dayAt(today, -4, 12);
    const a1 = {
      id: `demo-as-${++n}`, typeId: partial.typeId, ocId: partial.ocId, person, oiIds: [partial.oi[0]], docs: [], inventories: [],
      plannedAt: isoLocalDate(dayAt(today, -4, 9)), note: 'Первым — основное здание', by: 'Региональный менеджер (демо)',
      at: dayAt(today, -7, 15).toISOString(), state: 'done', doneAt: doneDay.toISOString(), demo: true,
    };
    assignments.push(a1);
    ev(a1, 'assigned', new Date(a1.at));
    ev(a1, 'photos', dayAt(today, -4, 10), { count: 41 });
    ev(a1, 'note', dayAt(today, -4, 11), { text: 'Доступ на кровлю закрыт' });
    ev(a1, 'done', doneDay);
    const a2 = {
      id: `demo-as-${++n}`, typeId: partial.typeId, ocId: partial.ocId, person: names[2 % names.length], oiIds: [partial.oi[1]], docs: [], inventories: [],
      plannedAt: isoLocalDate(dayAt(today, 3, 9)), note: '', by: 'Региональный менеджер (демо)',
      at: dayAt(today, -1, 15).toISOString(), state: 'assigned', doneAt: '', demo: true,
    };
    assignments.push(a2);
    ev(a2, 'assigned', new Date(a2.at));
  }

  const { reports, profiles } = demoReports(names, assignments, recs, today, rnd);
  return { assignments, events, reports, profiles, activities: demoActivities(names, assignments, today) };
}

// Авто осмотрщиков и их отчёты за день (ТЗ рабочего дня, раздел 3): утренний
// около начала дня (часть — позже, это поздний выезд), вечерний к концу;
// изредка отчёта нет; у одного из десяти дней одометра нет — маршрут
// адресами. Снимок одометра в демо — картинка с показанием.
const CARS = [
  { make: 'Toyota Corolla', year: '2012', engine: '1.6', consumption: '8.5', plate: '01KG 214 ABE', fuel: 'АИ-92', note: '' },
  { make: 'Honda Fit', year: '2009', engine: '1.3', consumption: '6.5', plate: '02KG 773 BAK', fuel: 'АИ-92', note: '' },
  { make: 'Toyota Land Cruiser Prado', year: '2015', engine: '2.8', consumption: '11', plate: '01KG 905 ACM', fuel: 'Дизель', note: 'для области, горные дороги' },
];
const odoPhoto = (v) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect width="240" height="120" rx="10" fill="#1d2430"/>'
  + '<text x="120" y="34" fill="#8fa3bd" font-family="Arial" font-size="13" text-anchor="middle">ODO km</text>'
  + '<rect x="22" y="48" width="196" height="46" rx="6" fill="#0b0f15"/>'
  + '<text x="120" y="82" fill="#f2c94c" font-family="Consolas,monospace" font-size="30" text-anchor="middle" letter-spacing="3">'
  + String(v).padStart(6, '0') + '</text></svg>');
const STREETS = ['ул. Советская', 'пр. Чуй', 'ул. Ленина', 'ул. Токтогула', 'ул. Ахунбаева'];

function demoReports(names, assignments, recs, today, rnd) {
  const reports = [];
  const profiles = [];
  const placeOf = new Map(recs.map((r) => [r.typeId + '|' + r.ocId, r.place]));
  const at = (iso, h, m) => { const d = new Date(iso + 'T00:00:00'); d.setHours(h, m, 0, 0); return d.toISOString(); };
  let n = 0;
  names.forEach((person, pi) => {
    const car = CARS[pi % CARS.length];
    profiles.push({ id: person, phone: `+996 555 10${pi} 2${pi}${pi}`, phoneType: pi % 2 ? 'ios' : 'android', car: { ...car },
      schedule: { days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' }, absences: [], demo: true });
    let odo = 84000 + pi * 37000 + Math.floor(rnd() * 900);
    for (let back = 45; back >= 1; back--) {
      const d = new Date(today);
      d.setDate(d.getDate() - back);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const iso = isoLocalDate(d);
      const mine = assignments.filter((a) => a.person === person && a.plannedAt === iso);
      if (!mine.length) continue;
      const places = mine.map((a) => placeOf.get(a.typeId + '|' + a.ocId) || '').filter(Boolean);
      const km = 18 + Math.floor(rnd() * (pi === 2 ? 190 : 110));
      const noOdo = rnd() < 0.1;
      const odo0 = odo;
      odo += km;
      // Утро: обычно 08:20–08:59; примерно каждый пятый — позже начала дня.
      const late = rnd() < 0.2;
      const mh = late ? 9 + Math.floor(rnd() * 2) : 8;
      const mm = late ? 5 + Math.floor(rnd() * 50) : 20 + Math.floor(rnd() * 39);
      if (rnd() > 0.04) {
        reports.push({ id: `demo-rp-${++n}`, person, date: iso, kind: 'morning', at: at(iso, mh, mm), by: person, demo: true,
          places, odometer: noOdo ? '' : String(odo0), photo: noOdo ? '' : odoPhoto(odo0), noOdometer: noOdo });
      }
      // Вечер: 17:30–19:00; изредка не сдан.
      if (rnd() > 0.06) {
        reports.push({ id: `demo-rp-${++n}`, person, date: iso, kind: 'evening', at: at(iso, 17 + Math.floor(rnd() * 2), 30 + Math.floor(rnd() * 29)), by: person, demo: true,
          done: mine.filter((a) => a.state === 'done').map((a) => a.id),
          odometer: noOdo ? '' : String(odo), photo: noOdo ? '' : odoPhoto(odo), noOdometer: noOdo,
          route: noOdo ? ['дом', ...places.slice(0, 3), STREETS[Math.floor(rnd() * STREETS.length)], 'дом'] : [], km: noOdo ? String(km) : '', note: '' });
      }
    }
  });
  return { reports, profiles };
}


// Работа вне выездов (ТЗ рабочего дня, раздел 4): прошедшие будни без
// выездов — работа дома (разбор снимков по категориям); у второго — 
// командировка в Ош на следующей неделе, у первого — осмотр для партнёров.
function demoActivities(names, assignments, today) {
  const out = [];
  let n = 0;
  const iso = (k) => { const d = new Date(today); d.setDate(d.getDate() + k); return isoLocalDate(d); };
  const dow = (k) => { const d = new Date(today); d.setDate(d.getDate() + k); return d.getDay(); };
  names.forEach((person, pi) => {
    for (let k = -30; k <= -1; k++) {
      if (dow(k) === 0 || dow(k) === 6) continue;
      const day = iso(k);
      if (assignments.some((a) => a.person === person && a.plannedAt === day)) continue;
      out.push({ id: `demo-ac-${++n}`, person, kind: 'home', from: day, to: day, note: 'разбор снимков по категориям', by: 'Региональный менеджер (демо)', demo: true });
    }
    if (pi === 1) {
      let k = 7; while (dow(k) !== 1) k++;
      out.push({ id: `demo-ac-${++n}`, person, kind: 'trip', from: iso(k), to: iso(k + 2), region: 'Ош', address: 'г. Ош, гостиница «Алай»', note: '', by: 'Региональный менеджер (демо)', demo: true });
    }
    if (pi === 0) {
      out.push({ id: `demo-ac-${++n}`, person, kind: 'partner', from: iso(4), to: iso(4), project: 'Оценка для банка', object: 'Склад, г. Кант', time: '14:00', note: '', by: 'Региональный менеджер (демо)', demo: true });
    }
  });
  return out;
}