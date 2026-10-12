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
      recs.push({ typeId: t.manifest.id, ocId: s.id, status: s.status, oi: (r.oi || []).map((o) => o.id) });
    });
  });
  const names = [...people].sort((a, b) => a.localeCompare(b, 'ru'));
  if (!names.length || !recs.length) return { assignments: [], events: [] };

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

  return { assignments, events };
}
