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
// Координаты записи: поле GPS, а если пусто — центр рамки участка Кадастра
// (как gpsOfObject в pages/inspections/route.js; ядро страницу не импортирует).
const parseLL = (v) => { const m = /(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/.exec(String(v || '')); return m ? [+m[1], +m[2]] : null; };
const llOf = (r) => parseLL(r.gps) || (r.geo && r.geo.extent ? [(r.geo.extent[1] + r.geo.extent[3]) / 2, (r.geo.extent[0] + r.geo.extent[2]) / 2] : null);
const roadKm = (a, b) => {
  const rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.3;
};
// Час езды: по городу 30 км/ч, дальше 60 — около 45 км по дороге.
const NEAR_KM = 45;
const isoLocalDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// isDefaultDoc — правило «документ по умолчанию» из ядра (параметром, чтобы
// не замыкать импорт ядра на себя).
export function demoInspections({ isDefaultDoc = () => false } = {}) {
  const recs = [];
  const people = new Set();
  sortedTypes().forEach((t) => {
    // Без предела: с демо-объёмом первые 1000 строк — одни синтетические, и
    // записи сида до демо не доходили (статистика пустела, 13.10.2026).
    const res = t.records.queryRecords({ filter: {}, offset: 0, limit: Number.MAX_SAFE_INTEGER });
    res.rows.forEach((s) => {
      // Синтетические записи демо-объёма (…-b<N>) не открываем: loadRecord
      // собирает полную запись и кладёт её в список, и с объёмом 1000 по
      // умолчанию (13.10.2026) каждый старт собирал тысячу карточек, а счётчики
      // реестра считали их дважды. Очередь «К назначению» видит их и так — по
      // сводкам.
      // Состав осмотрщиков — и из них (по сводке, без открытия): иначе он
      // зависел от правок сида, и демо-история менялась от перезагрузки к
      // перезагрузке.
      if (s.resp && s.resp.insp) people.add(s.resp.insp);
      if (/-b\d+$/.test(s.id)) return;
      const r = t.records.loadRecord(s.id);
      if (!r) return;
      const defDocs = [...(r.docs || []), ...(r.oi || []).flatMap((o) => o.docs || [])].filter((d) => d && isDefaultDoc(d.type || d.name)).map((d) => d.id);
      recs.push({ typeId: t.manifest.id, ocId: s.id, status: s.status, oi: (r.oi || []).map((o) => o.id), defDocs, place: [s.institution, s.title].filter(Boolean).join(' — '), eni: s.eni || '', inst: s.institution || '', area: (s.metrics && s.metrics.area) || 0, kind: s.typeLabel || '', ll: llOf(r) });
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

  // Норма осмотра в демо — те же значения по умолчанию, что в
  // pages/inspections/route.js (NORM_KINDS); ядро страницу не импортирует.
  const demoMinutes = (r) => {
    const k = /производ|склад/i.test(r.kind) ? [20, 0.012] : /граждан|нежил/i.test(r.kind) ? [25, 0.03] : /дом/i.test(r.kind) ? [20, 0.06]
      : /квартир/i.test(r.kind) ? [15, 0.1] : /участ|земел/i.test(r.kind) ? [10, 0.002] : [20, 0.02];
    return k[0] + (r.area || 0) * k[1];
  };

  // Объекты осмотрщика — по реальным координатам: в часе езды от его дома
  // (дорога ≈ прямая × 1,3, как в маршруте дня), а если рядом ничего нет —
  // три ближайших. С 14.10.2026 демо-объекты стоят на настоящих участках по
  // всей стране, и случайный выбор давал бишкекскому осмотрщику Нарын, Токмок
  // и Кара-Суу в один день — день перегружался на 18 часов, а маршрут не
  // предлагал ничего (замечание пользователя 15.10.2026 «маршрут дня
  // правим»; «система рекомендаций… адаптивной к реальным данным»).
  const pool = recs.filter((r) => r.status !== READY && r.oi.length);
  const near = names.map((person, pi) => {
    const home = parseLL(HOMES[pi % HOMES.length][1]);
    const by = pool.map((r) => ({ r, km: r.ll && home ? roadKm(home, r.ll) : Infinity })).sort((a, b) => a.km - b.km);
    const close = by.filter((x) => x.km <= NEAR_KM).map((x) => x.r);
    return close.length ? close : by.slice(0, 3).map((x) => x.r);
  });
  const pickFor = (pi) => pick(near[pi]);

  // Прошлое: у каждого осмотрщика в рабочий день 0–3 ОИ.
  names.forEach((person, pi) => {
    for (let back = 45; back >= 1; back--) {
      const day = dayAt(today, -back, 9);
      if (!isWorkday(day)) continue;
      const k = Math.floor(rnd() * (pi === 0 ? 4 : 3.2));
      for (let j = 0; j < k; j++) {
        const r = pickFor(pi);
        const oiId = pick(r.oi);
        const at = dayAt(today, -back - 2 - Math.floor(rnd() * 5), 10);
        // Окончание — после снимков и заметок того же осмотра.
        // Длительность — около нормы осмотра по виду и площади (маршруты,
        // пункт 7.4: нормы «по факту» считаются из этих осмотров); разброс
        // ±25 % без генератора, чтобы не сдвигать остальное демо.
        const start = dayAt(today, -back, 10 + j * 2);
        const done = new Date(start.getTime() + demoMinutes(r) * (0.8 + ((n * 37) % 50) / 100) * 60000);
        const a = {
          id: `demo-as-${++n}`, typeId: r.typeId, ocId: r.ocId, person, oiIds: [oiId], docs: [], inventories: [],
          plannedAt: isoLocalDate(day), note: '', by: 'Региональный менеджер (демо)', at: at.toISOString(),
          state: 'done', doneAt: done.toISOString(), demo: true,
        };
        assignments.push(a);
        ev(a, 'assigned', at);
        const photos = 6 + Math.floor(rnd() * 34);
        ev(a, 'photos', start, { count: photos });
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
        const r = pickFor(pi);
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
      const r = pickFor(pi);
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
  const deadlines = demoAssignDetails(names, assignments, recs, profiles, today);
  return { assignments, events, reports, profiles, activities: demoActivities(names, assignments, today), cadastre: demoCadastre(names, recs, today), plans: demoPlans(names, assignments, recs, today), deadlines };
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
// Дома осмотрщиков (маршрут дня, пункт 7.2): Бишкек, Бишкек, Кант.
const HOMES = [['г. Бишкек, ул. Ахунбаева, 120', '42.8420, 74.5880'], ['г. Бишкек, мкр. Джал, 15', '42.8250, 74.5650'], ['г. Кант, ул. Ленина, 40', '42.8920, 74.8480']];
const STREETS = ['ул. Советская', 'пр. Чуй', 'ул. Ленина', 'ул. Токтогула', 'ул. Ахунбаева'];

function demoReports(names, assignments, recs, today, rnd) {
  const reports = [];
  const profiles = [];
  const placeOf = new Map(recs.map((r) => [r.typeId + '|' + r.ocId, r.place]));
  const at = (iso, h, m) => { const d = new Date(iso + 'T00:00:00'); d.setHours(h, m, 0, 0); return d.toISOString(); };
  let n = 0;
  names.forEach((person, pi) => {
    const car = CARS[pi % CARS.length];
    profiles.push({ id: person, phone: `+996 555 10${pi} 2${pi}${pi}`, phoneType: pi % 2 ? 'ios' : 'android', car: { ...car }, cadastre: pi === 0, regions: [pi === 2 ? 'Чуй' : 'Бишкек'],
      homeAddress: HOMES[pi % HOMES.length][0], homeGps: HOMES[pi % HOMES.length][1],
      // Ответственное лицо: двое — за текущим пользователем макета, третий —
      // за вторым регионалом (демо).
      manager: pi < 2 ? 'Осминнов Н.' : 'Сатыбалдиев Улан (демо)',
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
      out.push({ id: `demo-ac-${++n}`, person, kind: 'trip', from: iso(k), to: iso(k + 2), region: 'Ош', address: 'г. Ош, гостиница «Алай»', homeGps: '40.5300, 72.7950', note: '', by: 'Региональный менеджер (демо)', demo: true });
    }
    if (pi === 0) {
      out.push({ id: `demo-ac-${++n}`, person, kind: 'partner', from: iso(4), to: iso(4), project: 'Оценка для банка', object: 'Склад, г. Кант', time: '14:00', note: '', by: 'Региональный менеджер (демо)', demo: true });
    }
  });
  return out;
}

// Запросы документов (ТЗ рабочего дня, раздел 5): у первого осмотрщика —
// запрос в кадастр, часть строк отвечена; у второго — документы на месте,
// без ответа. Файлов в демо нет; имя — по правилу «№ + ЕНИ + название».
function demoCadastre(names, recs, today) {
  if (!names.length) return [];
  const iso = (k) => { const d = new Date(today); d.setDate(d.getDate() + k); return isoLocalDate(d); };
  const at = (k, h) => { const d = new Date(today); d.setDate(d.getDate() + k); d.setHours(h, 15, 0, 0); return d.toISOString(); };
  const pool = recs.filter((r) => r.eni).slice(0, 8);
  const DOCS = ['Кадастровый план', 'Поэтажный план', 'Технический паспорт', 'Госакт на земельный участок'];
  const by = 'Региональный менеджер (демо)';
  const row = (r, i, extra = {}) => ({ id: `demo-cl-${r.ocId}-${i}`, typeId: r.typeId, ocId: r.ocId, inst: r.inst, eni: r.eni, doc: DOCS[i % DOCS.length], note: i === 1 ? 'нужна свежая выписка' : '', result: '', ...extra });
  const out = [];
  const a = pool.slice(0, 5).map((r, i) => row(r, i));
  if (a[0]) Object.assign(a[0], { result: 'got', scanDate: iso(-3), answer: '', answeredAt: at(-2, 16), answeredBy: names[0], file: {} });
  if (a[1]) Object.assign(a[1], { result: 'got', scanDate: iso(-2), answer: 'выписка от 2023 г.', answeredAt: at(-2, 16), answeredBy: names[0], file: {} });
  if (a[2]) Object.assign(a[2], { result: 'none', answer: 'по ЕНИ сведений в кадастре нет', answeredAt: at(-1, 11), answeredBy: names[0] });
  out.push({ id: 'demo-cr-1', no: 1, person: names[0], kind: 'cadastre', due: iso(3), note: 'к оценке по Министерству', at: at(-6, 10), by, rows: a, demo: true });
  if (names[1]) {
    out.push({ id: 'demo-cr-2', no: 2, person: names[1], kind: 'site', due: iso(5), note: 'запросить у завхоза на месте', at: at(-1, 15), by,
      rows: pool.slice(5, 8).map((r, i) => row(r, i + 1)), demo: true });
  }
  return out;
}

// План месяца (пункт 7.1): на будни до конца месяца — область и учреждения
// по назначениям дня; у второго осмотрщика неделя командировки — Ош.
function demoPlans(names, assignments, recs, today) {
  const out = [];
  const inst = new Map(recs.map((r) => [r.typeId + '|' + r.ocId, r.inst]));
  const REG = ['Бишкек', 'Бишкек', 'Чуй'];
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  names.forEach((person, pi) => {
    for (const d = new Date(today); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const iso = isoLocalDate(d);
      const insts = [...new Set(assignments.filter((a) => a.person === person && a.plannedAt === iso).map((a) => inst.get(a.typeId + '|' + a.ocId)).filter(Boolean))];
      const k = Math.round((d - today) / 864e5);
      const osh = pi === 1 && k >= 7 && k <= 11 && d.getDay() >= 1 && d.getDay() <= 3;
      out.push({ id: `demo-pl-${pi}-${iso}`, person, date: iso, region: osh ? 'Ош' : REG[pi % REG.length], district: '', institutions: insts.join('; '), note: '', demo: true });
    }
  });
  return out;
}

// Подробности назначений (просьба пользователя 12.10.2026 «Добавь демо
// данные к назначению»): документы для осмотрщика — по умолчанию из записи
// (кадастровый и поэтажный план), комментарии менеджера к части
// действующих, сроки осмотра объектов (прошедший, на этой неделе, дальше),
// отгул на день с плановым выездом — «План на отсутствие». Без генератора
// случайных чисел — остальное демо не сдвигается.
const MANAGER_NOTES = [
  'Ключи у завхоза — позвонить накануне',
  'Сначала основное здание, потом котельную',
  'Сфотографировать счётчики и щитовую',
  'На кровлю — через охрану, пропуск заказан',
  'Сверить площади с техпаспортом на месте',
  'Ответственный на месте с 10:00',
];
function demoAssignDetails(names, assignments, recs, profiles, today) {
  const iso = (k) => { const d = new Date(today); d.setDate(d.getDate() + k); return isoLocalDate(d); };
  const byKey = new Map(recs.map((r) => [r.typeId + '|' + r.ocId, r]));
  let i = 0;
  assignments.forEach((a) => {
    const r = byKey.get(a.typeId + '|' + a.ocId);
    if (r && !a.docs.length) a.docs = [...r.defDocs];
    if ((a.state === 'assigned' || a.state === 'progress') && !a.note && (i++ % 3 === 0)) a.note = MANAGER_NOTES[i % MANAGER_NOTES.length];
  });
  // Сроки: объекты очереди (удостоверены, не все ОИ покрыты) и часть
  // назначенных — прошедший, ближайший, через две недели.
  const by = 'Региональный менеджер (демо)';
  const at = new Date(today).toISOString();
  const deadlines = [];
  const put = (k, date) => { if (!deadlines.some((d) => d.id === k)) deadlines.push({ id: k, date, by, at, demo: true }); };
  const ready = recs.filter((r) => r.status === READY);
  [-2, 3, 14].forEach((k, j) => { if (ready[j]) put(ready[j].typeId + '|' + ready[j].ocId, iso(k)); });
  assignments.filter((a) => a.state === 'assigned' && a.plannedAt >= iso(0)).slice(0, 6).forEach((a, j) => put(a.typeId + '|' + a.ocId, iso(j % 2 ? 9 : 5)));
  // Отгул у третьего осмотрщика на день с плановым выездом.
  const who = names[2 % names.length];
  const clash = assignments.find((a) => a.person === who && a.state === 'assigned' && a.plannedAt >= iso(5));
  const prof = profiles.find((p) => p.id === who);
  if (clash && prof) prof.absences = [...(prof.absences || []), { id: 'demo-ab-1', kind: 'dayoff', from: clash.plannedAt, to: clash.plannedAt, note: 'отгул по семейным обстоятельствам' }];
  return deadlines;
}
