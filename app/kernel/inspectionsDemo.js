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
import { allInventories } from './inventories.js';
import { sortedTypes, isTsHolder } from './registry.js';
import { stepOf } from './status/flow.js';
import { DEMO_PARCELS } from './demoParcels.js';

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
// Координаты синтетического объекта — его участок по ЕНИ (центр рамки), без
// сборки карточки.
let parcelLL = null;
const llByEni = (eni) => {
  if (!parcelLL) {
    parcelLL = new Map();
    Object.values(DEMO_PARCELS).forEach((list) => list.forEach((x) => {
      if (x.eni && x.ext) parcelLL.set(String(x.eni), [(x.ext[1] + x.ext[3]) / 2, (x.ext[0] + x.ext[2]) / 2]);
    }));
  }
  return parcelLL.get(String(eni || '').replace(/\D/g, '')) || null;
};
const isoLocalDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// isDefaultDoc — правило «документ по умолчанию» из ядра (параметром, чтобы
// не замыкать импорт ядра на себя).
// me — человек из сессии: демо осмотров ТС и запрос в кадастр выдаются и ему,
// чтобы этап А проверялся «на себе» (просьба пользователя 27.10.2026: «Я не
// вижу в осмотрах ни 1 записи. проверяю на себе»).
export function demoInspections({ isDefaultDoc = () => false, me = '' } = {}) {
  const recs = [];
  const people = new Set();
  sortedTypes().forEach((t) => {
    // Без предела: с демо-объёмом первые 1000 строк — одни синтетические, и
    // записи сида до демо не доходили (статистика пустела, 13.10.2026).
    const res = t.records.queryRecords({ filter: {}, offset: 0, limit: Number.MAX_SAFE_INTEGER });
    res.rows.forEach((s) => {
      // Состав осмотрщиков — и из синтетических (по сводке): иначе он зависел
      // от правок сида, и демо-история менялась от перезагрузки к перезагрузке.
      if (s.resp && s.resp.insp) people.add(s.resp.insp);
      const base = { typeId: t.manifest.id, ocId: s.id, status: s.status, place: [s.institution, s.title].filter(Boolean).join(' — '), eni: s.eni || '', inst: s.institution || '', area: (s.metrics && s.metrics.area) || 0, kind: s.typeLabel || '',
        cod: (s.resp && s.resp.cod) || '' };
      // Синтетические записи (…-b<N>) — по сводке, карточку не собираем:
      // loadRecord кладёт её в список, и тысяча сборок на каждом старте
      // тормозила и двоила счётчики (13.10.2026). Назначение на такой объект —
      // целиком (oiIds пуст), координаты — участок по ЕНИ.
      if (/-b\d+$/.test(s.id)) {
        recs.push({ ...base, oi: [], defDocs: [], ll: llByEni(s.eni) });
        return;
      }
      const r = t.records.loadRecord(s.id);
      if (!r) return;
      const defDocs = [...(r.docs || []), ...(r.oi || []).flatMap((o) => o.docs || [])].filter((d) => d && isDefaultDoc(d.type || d.name)).map((d) => d.id);
      // ts — ОЦ «ТС»; tsOi — ТС среди ОИ записи (демо осмотра ТС, ниже).
      recs.push({ ...base, oi: (r.oi || []).map((o) => o.id), defDocs, ll: llOf(r) || llByEni(s.eni),
        ts: isTsHolder(r), tsOi: (r.oi || []).filter(isTsHolder).map((o) => o.id),
        // Вид ОИ и единицы механизмов — для демо вкладки «Результаты осмотра».
        // ОЦ «Механизмы» без ОИ — перечень у самой записи, во вкладке это ОИ «mech».
        ois: (r.oi || []).length ? r.oi.map((o) => ({ id: o.id, card: o.card, litKind: o.litKind || '', units: (o.mechanisms || []).map((u) => u.id) }))
          : r.mech ? [{ id: 'mech', card: 'mech', litKind: '', units: (r.mech.mechanisms || []).map((u) => u.id) }] : [] });
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

  // Демо согласовано со шкалой статусов (указание пользователя 15.10.2026:
  // «Поправь все демо данные осмотров… Иначе буду за ошибки их принимать»).
  // Прежде объекты брались случайно с возвращением из 16 записей сида: один ОИ
  // назначался по 9 раз, осматривался дважды, назначения стояли на объектах
  // «В заполнении», а один день одного осмотрщика дробился на несколько
  // назначений одного объекта. Теперь:
  //   * прошлые осмотры — только объекты «Осмотрен» и дальше по шкале;
  //   * живые назначения — только «Направлен на осмотр», и у каждого такого
  //     объекта назначение есть;
  //   * объект участвует в демо один раз, назначение — на объект целиком;
  //   * осмотрщику — ближайший к его дому свободный объект (дорога ≈ прямая ×
  //     1,3, как в маршруте дня): день не разъезжается по стране.
  const INSPECTED = stepOf('Осмотрен');
  const donePool = recs.filter((r) => stepOf(r.status) >= INSPECTED);
  const livePool = recs.filter((r) => r.status === 'Направлен на осмотр');
  const used = new Set();
  const keyOf = (r) => r.typeId + '|' + r.ocId;
  const homes = names.map((_, pi) => parseLL(HOMES[pi % HOMES.length][1]));
  const kmFrom = (pi, r) => (r.ll && homes[pi] ? roadKm(homes[pi], r.ll) : 1e6);
  const takeNear = (pool, pi) => {
    let best = null;
    let bestKm = Infinity;
    pool.forEach((r) => {
      if (used.has(keyOf(r))) return;
      const km = kmFrom(pi, r);
      if (km < bestKm) { bestKm = km; best = r; }
    });
    if (best) used.add(keyOf(best));
    return best;
  };
  const nearestPerson = (r) => names.reduce((best, _, pi) => (kmFrom(pi, r) < kmFrom(best, r) ? pi : best), 0);

  // Прошлое: у каждого осмотрщика в рабочий день 0–3 объекта. День за днём,
  // осмотрщики по очереди — чтобы ближние объекты не достались одному.
  for (let back = 45; back >= 1; back--) {
    const day = dayAt(today, -back, 9);
    if (!isWorkday(day)) continue;
    names.forEach((person, pi) => {
      const k = Math.floor(rnd() * (pi === 0 ? 4 : 3.2));
      for (let j = 0; j < k; j++) {
        const r = takeNear(donePool, pi);
        if (!r) return;
        const at = dayAt(today, -back - 2 - Math.floor(rnd() * 5), 10);
        // Окончание — после снимков и заметок того же осмотра.
        // Длительность — около нормы осмотра по виду и площади (маршруты,
        // пункт 7.4: нормы «по факту» считаются из этих осмотров); разброс
        // ±25 % без генератора, чтобы не сдвигать остальное демо.
        const start = dayAt(today, -back, 10 + j * 2);
        const done = new Date(start.getTime() + demoMinutes(r) * (0.8 + ((n * 37) % 50) / 100) * 60000);
        const a = {
          id: `demo-as-${++n}`, typeId: r.typeId, ocId: r.ocId, person, oiIds: [], docs: [], inventories: [],
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
    });
  }

  const liveA = (r, person, day, state = 'assigned', at = dayAt(today, -1 - Math.floor(rnd() * 6), 15)) => {
    const a = {
      id: `demo-as-${++n}`, typeId: r.typeId, ocId: r.ocId, person, oiIds: [], docs: [], inventories: [],
      plannedAt: day ? isoLocalDate(day) : '', note: '', by: 'Региональный менеджер (демо)', at: at.toISOString(),
      state, doneAt: '', demo: true,
    };
    assignments.push(a);
    ev(a, 'assigned', at);
    return a;
  };

  // Пара просроченных — плановая дата прошла, осмотр не начат.
  names.slice(0, 2).forEach((person, pi) => {
    const r = takeNear(livePool, pi);
    if (r) liveA(r, person, dayAt(today, -3 - pi, 9), 'assigned', dayAt(today, -8, 15));
  });

  // Будущее: плановые на три недели вперёд, 0–2 в рабочий день; у первого
  // осмотрщика плотнее — чтобы на карте загрузки было видно перегруз.
  for (let fwd = 0; fwd <= 21; fwd++) {
    const day = dayAt(today, fwd, 9);
    if (!isWorkday(day)) continue;
    names.forEach((person, pi) => {
      // У первого осмотрщика сегодня — не меньше двух выездов: на нём показан
      // рабочий день («Сегодня», отчёты за день, маршрут).
      const k = Math.max(fwd === 0 && pi === 0 ? 2 : 0, Math.floor(rnd() * (pi === 0 ? 3.2 : 2.2)));
      for (let j = 0; j < k; j++) {
        const r = takeNear(livePool, pi);
        if (!r) return;
        liveA(r, person, day, fwd === 0 && j === 0 ? 'progress' : 'assigned');
      }
    });
  }

  // Остальные «Направлен на осмотр» — тоже назначены (статус без назначения
  // был бы той же ошибкой): ближайшему осмотрщику, на рабочие дни после трёх
  // недель плана.
  let later = 22;
  livePool.filter((r) => !used.has(keyOf(r))).forEach((r) => {
    used.add(keyOf(r));
    let day = dayAt(today, later, 9);
    while (!isWorkday(day)) { later += 1; day = dayAt(today, later, 9); }
    liveA(r, names[nearestPerson(r)], day);
    later += 1;
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
      // Выезд «недвижимость + ТС» (заметка пользователя 27.10.2026 «Часто ТС
      // осматривают вместе с недвижкой»): ТС объекта — в том же назначении.
      id: `demo-as-${++n}`, typeId: partial.typeId, ocId: partial.ocId, person: me || names[2 % names.length],
      // Описи учреждения (этап Б2): опись подведа и котельной — к тому же выезду.
      oiIds: [partial.oi[1], ...(partial.tsOi || []).filter((x) => x !== partial.oi[1])], docs: [],
      inventories: allInventories().filter((d) => d.institution === partial.inst).slice(0, 2).map((d) => d.id),
      plannedAt: isoLocalDate(dayAt(today, 3, 9)), note: '', by: 'Региональный менеджер (демо)',
      at: dayAt(today, -1, 15).toISOString(), state: 'assigned', doneAt: '', demo: true,
    };
    assignments.push(a2);
    ev(a2, 'assigned', new Date(a2.at));
  }

  const { reports, profiles } = demoReports(names, assignments, recs, today, rnd);
  const deadlines = demoAssignDetails(names, assignments, recs, profiles, today);
  const results = demoResultsTab(demoTs(names, recs, partial, assignments, events, today, () => ++n, me),
    recs, assignments, events, today, () => ++n, me, names);
  return { resultsVer: DEMO_RESULTS_VER, assignments, results, events, reports, profiles, activities: demoActivities(names, assignments, today), cadastre: demoCadastre(names, recs, today, me), plans: demoPlans(names, assignments, recs, today), deadlines };
}

// Осмотр ТС (этап А, запись графа osmotr-ts-na-meste-i-po-snimkam): записи
// ОЦ «ТС» назначены осмотрщикам — первому две на сегодня (одна без адреса:
// «Адрес уточняется на месте» в плане дня), остальные на ближайшие дни; ТС
// внутри записи недвижимости передано другому осмотрщику отдельно от
// остальных ОИ («ТС может быть переназначен отдельно от ОЦ»). Добавляются
// после остального демо и без генератора случайных чисел: прежняя
// демо-история не сдвигается.
function demoTs(names, recs, partial, assignments, events, today, next, me = '') {
  if (!names.length) return [];
  // Первый в перечне — человек из сессии: ему выезды по ТС сегодня и
  // переданное ТС.
  const list = me ? [me, ...names.filter((x) => x !== me)] : names;
  const who = (i) => list[i % list.length];
  const mk = (r, person, shift, oiIds = [], extra = {}) => {
    const at = dayAt(today, -2, 15);
    const a = {
      id: `demo-as-${next()}`, typeId: r.typeId, ocId: r.ocId, person, oiIds, docs: [], inventories: [],
      plannedAt: isoLocalDate(dayAt(today, shift, 9)), note: '', by: 'Региональный менеджер (демо)', at: at.toISOString(),
      state: 'assigned', doneAt: '', demo: true, ...extra,
    };
    assignments.push(a);
    events.push({ id: `demo-ev-${next()}`, at: at.toISOString(), who: a.by, kind: 'assigned', assignId: a.id,
      typeId: a.typeId, ocId: a.ocId, person, demo: true });
    return a;
  };
  const own = recs.filter((r) => r.ts);
  // Человеку из сессии — сегодня с адресом и без адреса и прицеп на
  // послезавтра.
  const plan = [[0, 0], [0, 0], [0, 2], [2, 1]];
  own.forEach((r, i) => { const [p, d] = plan[i % plan.length]; mk(r, who(p), d); });
  // ТС в записи недвижимости (кроме частичного объекта): назначение «объект
  // целиком» у одного, ТС передано другому — у прежнего явный перечень.
  const r = recs.find((x) => x !== partial && x.status === READY && (x.tsOi || []).length && x.oi.length > x.tsOi.length);
  if (!r) return demoTsResults(recs, partial, assignments, today);
  const from = who(1);
  const to = who(0);
  const a = mk(r, from, 2, r.oi.filter((x) => !r.tsOi.includes(x)));
  const b = mk(r, to, 3, [r.tsOi[0]]);
  const at = dayAt(today, -1, 11).toISOString();
  events.push({ id: `demo-ev-${next()}`, at, who: 'Региональный менеджер (демо)', kind: 'transferred', assignId: a.id,
    typeId: r.typeId, ocId: r.ocId, person: from, oiId: r.tsOi[0], to, text: `кому: ${to}`, demo: true });
  events.push({ id: `demo-ev-${next()}`, at, who: 'Региональный менеджер (демо)', kind: 'received', assignId: b.id,
    typeId: r.typeId, ocId: r.ocId, person: to, oiId: r.tsOi[0], from, text: `от: ${from}`, demo: true });
  return demoTsResults(recs, partial, assignments, today);
}

// Демо-результаты осмотра ТС — чтобы этап А был виден без ручного ввода
// (вымышленные данные): КамАЗ с КМУ — форма заполнена частично, одно
// расхождение (госномер), адрес на момент осмотра и место съёмки; прицеп — без
// результатов, осмотр с нуля; на объекте с выявленными зданиями —
// два выявленных ТС («видел сам» и «со слов» контактного лица).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: демо-результатов нет — результаты осмотра вносит
// осмотрщик на месте.
function demoTsResults(recs, partial, assignments, today) {
  const out = [];
  const two = (n) => String(n).padStart(2, '0');
  const stamp = (d) => `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
  const has = (id) => recs.some((r) => r.typeId === 'vehicle' && r.ocId === id);
  if (has('oc-vehicle-d2')) {
    const at = dayAt(today, 0, 10);
    out.push({
      typeId: 'vehicle', ocId: 'oc-vehicle-d2',
      assets: { ts: {
        ts: { addr: 'г. Бишкек, ул. Демонстрационная, 7 (стоянка у склада)',
          place: { lat: 42.8751, lon: 74.6049, acc: 9, at: at.toISOString() } },
        f: { plate: '02KG201DEM', vin: 'XTC43118000000002', chassisNo: 'XTC43118000000002', mileage: '214000', engineHours: '6100' },
      } },
    });
  }
  if (partial) {
    const a = assignments.find((x) => x.typeId === partial.typeId && x.ocId === partial.ocId && x.state === 'assigned');
    const by = a ? a.person : '';
    const foundAt = stamp(dayAt(today, 0, 11));
    const ts = (id, make, plate, category, where, note, source) => ({
      id, card: 'vehicle', draft: true, cat: 'ts',
      vehicle: { kind: 'base', category, f: { make, plate }, modules: [], extra: [] },
      name: [make, plate].filter(Boolean).join(' · '), where, note, source, foundBy: by, foundAt,
    });
    out.push({
      typeId: partial.typeId, ocId: partial.ocId,
      found: [
        ts('demo-found-ts-1', 'Toyota Hilux', '05KG515DEM', 'Легковое', 'Во дворе за складом',
          'Пикап, кузов с тентом, номер читается, ключей у охраны нет', { kind: 'self' }),
        ts('demo-found-ts-2', '', '', 'Грузовое', '',
          'Со слов сторожа, на территории стоит самосвал, его пригнали на ремонт', { kind: 'words', name: 'Сторож Иманалиев К. (демо)', label: 'Сторож Иманалиев К. (демо)' }),
      ],
    });
  }
  demoScans(out, recs, assignments, today);
  return out;
}

// Демо-сканы с осмотров — во всех состояниях очереди «Сканы с осмотров»
// (kernel/scanQueue.js): три ждут разбора (техпаспорт ТС в две страницы,
// документ литеры oi-cv1-b, план ОЦ), один принят, один возвращён на
// пересъёмку, один отклонён. Страницы — картинки с названием документа.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: демо-сканов нет — их снимает осмотрщик. У принятого
// демо-скана документа в записи нет (docId пуст): записи на старте демо не
// загружаются.
function demoScans(out, recs, assignments, today) {
  const find = (id) => recs.find((r) => r.ocId === id);
  const personOf = (r) => { const a = assignments.find((x) => x.typeId === r.typeId && x.ocId === r.ocId && x.state === 'assigned'); return a ? a.person : ''; };
  const add = (r, scans) => {
    let e = out.find((x) => x.typeId === r.typeId && x.ocId === r.ocId);
    if (!e) { e = { typeId: r.typeId, ocId: r.ocId }; out.push(e); }
    e.scans = (e.scans || []).concat(scans);
  };
  const page = (label, n, total) => ({ id: `demo-sp-${label.length}-${n}-${Math.abs(hash(label + n))}`, name: `${label}, стр. ${n}.svg`, size: 1800, type: 'image/svg+xml', dataUrl: scanPage(label, n, total) });
  const mk = (id, title, oiId, by, shiftDays, hour, nPages, review) => {
    const at = dayAt(today, shiftDays, hour).toISOString();
    const sc = { id, title, oiId, by, at, source: 'осмотр', status: review ? { accepted: 'принят', returned: 'возвращён', rejected: 'отклонён' }[review.state] : 'ждёт ЦОД',
      pages: Array.from({ length: nPages }, (_, i) => page(title, i + 1, nPages)) };
    if (review) sc.review = { reason: '', docId: '', by: 'Оператор ЦОД (демо)', at: dayAt(today, shiftDays, hour + 2).toISOString(), ...review };
    if (review && review.state === 'returned') sc.retake = { reason: review.reason, by: sc.review.by, at: sc.review.at };
    return sc;
  };
  const ts = find('oc-vehicle-d2');
  if (ts) {
    const by = personOf(ts);
    add(ts, [
      mk('demo-sc-1', 'Технический паспорт', '', by, 0, 11, 2, null),
      mk('demo-sc-5', 'Страховой полис', '', by, -2, 10, 1, { state: 'rejected', reason: 'Не тот объект' }),
    ]);
  }
  const cv = find('oc-cv-1');
  if (cv) {
    const by = personOf(cv);
    add(cv, [
      mk('demo-sc-2', 'Акт обмера литеры Б', 'oi-cv1-b', by, 0, 12, 1, null),
      mk('demo-sc-3', 'Поэтажный план', '', by, -1, 15, 1, null),
      mk('demo-sc-4', 'Свидетельство о праве собственности', '', by, -3, 14, 1, { state: 'accepted' }),
      mk('demo-sc-6', 'Договор аренды', 'oi-cv1-b', by, -2, 16, 2, { state: 'returned', reason: 'Снимок смазан, переснять страницу 2' }),
    ]);
  }
}

// Короткий хеш строки — для устойчивых id страниц демо.
const hash = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return h; };
// Страница демо-скана: лист с названием документа и номером страницы.
const scanPage = (label, n, total) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="594" viewBox="0 0 420 594"><rect width="420" height="594" fill="#f4f1e8"/>'
  + '<rect x="24" y="24" width="372" height="546" fill="none" stroke="#b9b29c" stroke-width="2"/>'
  + '<text x="210" y="90" fill="#3a3a3a" font-family="Arial" font-size="22" text-anchor="middle">' + label.replace(/[<&]/g, ' ') + '</text>'
  + '<text x="210" y="124" fill="#6b6b6b" font-family="Arial" font-size="14" text-anchor="middle">демо-скан · страница ' + n + ' из ' + total + '</text>'
  + [0, 1, 2, 3, 4, 5, 6].map((i) => '<rect x="48" y="' + (170 + i * 44) + '" width="' + (324 - (i % 3) * 40) + '" height="8" fill="#cfc9b6"/>').join('') + '</svg>');

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
// Дома демо-осмотрщиков и их область работы. Двое — в областях (Ош, Нарын):
// рекомендации «кто ближе» к дальней области (решение пользователя
// 15.10.2026) видны и в демо, а их назначения сами подбираются рядом с домом.
const HOMES = [['г. Бишкек, ул. Ахунбаева, 120', '42.8420, 74.5880', 'Бишкек'], ['г. Бишкек, мкр. Джал, 15', '42.8250, 74.5650', 'Бишкек'],
  ['г. Кант, ул. Ленина, 40', '42.8920, 74.8480', 'Чуй'], ['г. Ош, ул. Ленина, 200', '40.5280, 72.7985', 'Ош'],
  ['г. Нарын, ул. Ленина, 30', '41.4287, 75.9911', 'Нарын']];
const STREETS = ['ул. Советская', 'пр. Чуй', 'ул. Ленина', 'ул. Токтогула', 'ул. Ахунбаева'];

function demoReports(names, assignments, recs, today, rnd) {
  const reports = [];
  const profiles = [];
  const placeOf = new Map(recs.map((r) => [r.typeId + '|' + r.ocId, r.place]));
  const at = (iso, h, m) => { const d = new Date(iso + 'T00:00:00'); d.setHours(h, m, 0, 0); return d.toISOString(); };
  let n = 0;
  names.forEach((person, pi) => {
    const car = CARS[pi % CARS.length];
    profiles.push({ id: person, phone: `+996 555 10${pi} 2${pi}${pi}`, phoneType: pi % 2 ? 'ios' : 'android', car: { ...car }, cadastre: pi === 0, regions: [HOMES[pi % HOMES.length][2]],
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
function demoCadastre(names, recs, today, me = '') {
  if (!names.length) return [];
  const iso = (k) => { const d = new Date(today); d.setDate(d.getDate() + k); return isoLocalDate(d); };
  const at = (k, h) => { const d = new Date(today); d.setDate(d.getDate() + k); d.setHours(h, 15, 0, 0); return d.toISOString(); };
  const pool = recs.filter((r) => r.eni).slice(0, 8);
  const DOCS = ['Кадастровый план', 'Поэтажный план', 'Технический паспорт', 'Госакт на земельный участок'];
  const by = 'Региональный менеджер (демо)';
  const row = (r, i, extra = {}) => ({ id: `demo-cl-${r.ocId}-${i}`, typeId: r.typeId, ocId: r.ocId, inst: r.inst, eni: r.eni, doc: DOCS[i % DOCS.length], note: i === 1 ? 'нужна свежая выписка' : '', result: '', ...extra });
  const out = [];
  const a = pool.slice(0, 5).map((r, i) => row(r, i));
  // Ответ «Получен» — файл у строки ждёт проверки ЦОД (kernel/scanQueue.js).
  const gotFile = (r) => ({ name: `${r.eni} ${r.doc}.pdf`, attached: { name: `${r.eni} ${r.doc}.svg`, mime: 'image/svg+xml', kind: 'image', dataUrl: scanPage(r.doc, 1, 1), size: 1800 } });
  if (a[0]) Object.assign(a[0], { result: 'got', scanDate: iso(-3), answer: '', answeredAt: at(-2, 16), answeredBy: names[0], file: gotFile(a[0]) });
  if (a[1]) Object.assign(a[1], { result: 'got', scanDate: iso(-2), answer: 'выписка от 2023 г.', answeredAt: at(-2, 16), answeredBy: names[0], file: gotFile(a[1]) });
  if (a[2]) Object.assign(a[2], { result: 'none', answer: 'по ЕНИ сведений в кадастре нет', answeredAt: at(-1, 11), answeredBy: names[0] });
  out.push({ id: 'demo-cr-1', no: 1, person: names[0], kind: 'cadastre', due: iso(3), note: 'к оценке по Министерству', at: at(-6, 10), by, rows: a, demo: true });
  if (names[1]) {
    out.push({ id: 'demo-cr-2', no: 2, person: names[1], kind: 'site', due: iso(5), note: 'запросить у завхоза на месте', at: at(-1, 15), by,
      rows: pool.slice(5, 8).map((r, i) => row(r, i + 1)), demo: true });
  }
  // Человеку из сессии — свой запрос в кадастр: одна строка отвечена, две ждут.
  if (me && !out.some((r) => r.person === me)) {
    const c = pool.slice(0, 3).map((r, i) => ({ ...row(r, i), id: `demo-cl-me-${r.ocId}-${i}` }));
    if (c[0]) Object.assign(c[0], { result: 'got', scanDate: iso(-1), answer: '', answeredAt: at(-1, 15), answeredBy: me, file: gotFile(c[0]) });
    out.push({ id: 'demo-cr-3', no: 3, person: me, kind: 'cadastre', due: iso(2), note: 'к оценке по Министерству', at: at(-2, 10), by, rows: c, demo: true });
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

// Демо вкладки «Результаты осмотра» карточки ОЦ (просьба пользователя
// 02.11.2026: «Добавь тестовые данные для проверки этого экрана. Мне
// необходимо просмотреть все самому в интерфейсе»). По объекту каждого типа
// недвижимости — значения осмотра по всем ОИ, снимки по категориям, заметка и
// контакт; состояния разные: закончен (жилой дом), закончен с пометкой
// «неполный» (квартира), двое осмотрщиков — один закончил, другой в работе
// (нежилое здание с механизмами и ТС), в работе (участок). Объекты —
// «Удостоверен по документам», где ЦОД — человек из сессии: законченные видны
// в срезе «Осмотр закончен — проверить». Без генератора случайных чисел и после
// остального демо — прежняя история не сдвигается. Данные вымышленные.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: демо-результатов нет — их вносит осмотрщик.
const DEMO_VALUES = {
  land: { location: 'На окраине населенного пункта', roadLocation: 'Вблизи междугородней трассы (до 300 м)', corner: 'Угловой',
    encumbrance: 'Нет', form: 'Прямоугольная', relief: 'Ровный', electricity: 'Подведены', centralWater: 'Подведены',
    gasification: 'Проходят рядом', improvementRank: 'Частично благоустроен', note: 'Участок огорожен, въезд с улицы, покрытие частично асфальт' },
  apartment: { aptFloor: '4', aptBuildingFloors: '9', aptRooms: '3', aptSeries: 'Серия 97', aptLocation: 'Угловое',
    electricity: 'Подведены', centralHeating: 'Подведены', note: 'Окна заменены, в одной комнате следы протечки на потолке' },
  building: { buildType: 'Отдельностоящее', floorsN: '2', electricity: 'Подведены', centralWater: 'Подведены',
    sewerage: 'Подведены', gasification: 'Проходят рядом', centralHeating: 'Подведены', note: 'Фасад требует покраски, кровля без видимых протечек' },
  vehicle: { 'ts.addr': 'Во дворе объекта, у гаражей', 'f.plate': '01KG123DEM', 'f.mileage': '187400' },
};
const LIT_VALUES = {
  civil: { litKind: 'Гражданская', purposeFact_civil: 'Административно-офисное', cap_civil_arch: 'Современная', cap_civil_constr: 'Капитальная' },
  prod: { litKind: 'Производственно-складская', purposeFact_prod: 'Склад', cap_prod_crane: 'Нет' },
};
const PHOTO_CATS_DEMO = {
  building: ['Фасад', 'Внутр. помещения', 'Кровля'], land: ['Земельный участок'], apartment: ['Внутр. помещения', 'Фасад'],
  mech: ['Прочее'], vehicle: ['Машина'],
};
const HUES = { 'Фасад': 205, 'Внутр. помещения': 32, 'Кровля': 0, 'Земельный участок': 110, 'Прочее': 270, 'Машина': 180 };

function photoImg(label, cat, n) {
  const h = HUES[cat] == null ? 210 : HUES[cat];
  // Светлота — по кругу из пяти: снимков в категории бывают десятки.
  const t = ((n - 1) % 5) + 1;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">'
    + `<rect width="480" height="360" fill="hsl(${h},35%,${78 - t * 6}%)"/><rect x="0" y="230" width="480" height="130" fill="hsl(${h},25%,${62 - t * 5}%)"/>`
    + `<text x="240" y="160" fill="#26323f" font-family="Arial" font-size="26" text-anchor="middle">${cat}</text>`
    + `<text x="240" y="196" fill="#3d4a59" font-family="Arial" font-size="15" text-anchor="middle">${label} · демо-снимок ${n}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const box = keys.reduce((o, k) => (o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {}), obj);
  box[last] = value;
}

function oiValues(oi, part = 1) {
  const v = {};
  const base = oi.card === 'mech' ? {} : (DEMO_VALUES[oi.card] || {});
  const keys = Object.keys(base);
  keys.slice(0, Math.max(1, Math.round(keys.length * part))).forEach((k) => setPath(v, k, base[k]));
  if (oi.card === 'building' && LIT_VALUES[oi.litKind]) Object.entries(LIT_VALUES[oi.litKind]).forEach(([k, x]) => { v[k] = x; });
  if (oi.card === 'mech') {
    oi.units.slice(0, Math.max(1, Math.round(oi.units.length * part))).forEach((u, i) => {
      setPath(v, `u.${u}.found`, 'Найдено');
      setPath(v, `u.${u}.inv`, `ИНВ-00${i + 1}24`);
      setPath(v, `u.${u}.serial`, `SN-DEMO-${4410 + i}`);
      setPath(v, `u.${u}.state`, i ? 'Условно пригодное' : 'Рабочее');
    });
  }
  return v;
}

function demoResultsTab(prev, recs, assignments, events, today, next, me, names) {
  const out = prev.slice();
  if (!names.length) return out;
  const list = me ? [me, ...names.filter((x) => x !== me)] : names;
  const who = (i) => list[i % list.length];
  // Всё демо вкладки — на человека из сессии (пользователь 02.11.2026: «Все
  // демо данные на мой аккаунт вешаем»); второй осмотрщик — только у нежилого.
  const p0 = me || who(1);
  const own = (a) => {
    events.filter((x) => x.assignId === a.id).forEach((x) => { x.person = p0; if (x.who === a.person) x.who = p0; });
    a.person = p0;
  };
  const rec = (id) => recs.find((r) => r.ocId === id && (r.ois || []).length);
  const mine = (r) => assignments.filter((a) => a.typeId === r.typeId && a.ocId === r.ocId && a.state !== 'removed');
  const evt = (a, kind, d, extra = {}) => events.push({ id: `demo-ev-${next()}`, at: d.toISOString(), who: kind === 'assigned' ? a.by : a.person, kind,
    assignId: a.id, typeId: a.typeId, ocId: a.ocId, person: a.person, demo: true, ...extra });
  const mkA = (r, person, oiIds, state, dayShift, incomplete = false) => {
    const at = dayAt(today, dayShift - 3, 15);
    const a = {
      id: `demo-as-${next()}`, typeId: r.typeId, ocId: r.ocId, person, oiIds, docs: [], inventories: [],
      plannedAt: isoLocalDate(dayAt(today, dayShift, 9)), note: '', by: 'Региональный менеджер (демо)', at: at.toISOString(),
      state, doneAt: '', demo: true,
    };
    assignments.push(a);
    evt(a, 'assigned', at);
    return setState(a, state, dayShift, incomplete);
  };
  // Перевести назначение демо: «В работе» и «Осмотр закончен» с событиями.
  function setState(a, state, dayShift, incomplete = false) {
    if (state === 'assigned') return a;
    evt(a, 'progress', dayAt(today, dayShift, 10));
    a.state = state;
    if (state === 'done') {
      a.doneAt = dayAt(today, dayShift, 13).toISOString();
      a.incomplete = !!incomplete;
      evt(a, 'done', dayAt(today, dayShift, 13), incomplete ? { text: 'неполный осмотр' } : {});
    }
    return a;
  }
  const entry = (r) => {
    let e = out.find((x) => x.typeId === r.typeId && x.ocId === r.ocId);
    if (!e) { e = { typeId: r.typeId, ocId: r.ocId }; out.push(e); }
    e.assets = e.assets || {};
    e.photos = e.photos || [];
    e.contacts = e.contacts || [];
    return e;
  };
  const fill = (r, ois, by, dayShift, part = 1) => {
    const e = entry(r);
    ois.forEach((oi) => {
      e.assets[oi.id] = oiValues(oi, part);
      (PHOTO_CATS_DEMO[oi.card] || ['Прочее']).forEach((cat, i) => {
        e.photos.push({ id: `demo-ph-${r.ocId}-${oi.id}-${i}`, name: `${cat}.svg`, size: 1500, type: 'image/svg+xml',
          dataUrl: photoImg(oi.card === 'mech' ? 'Механизмы' : 'Объект имущества', cat, i + 1),
          at: dayAt(today, dayShift, 10 + i).toISOString(), oiId: oi.id, cat, by });
      });
    });
    return e;
  };

  // Жилой дом «Осмотрен» — осмотр закончен целиком, все ОИ, контакт и заметка.
  const house = rec('oc-rh-2');
  if (house && !mine(house).length) {
    const p = p0;
    mkA(house, p, [], 'done', -3);
    const e = fill(house, house.ois, p, -3);
    e.note = 'Доступ ко всем помещениям был, сопровождал завхоз';
    e.contacts.push({ id: 'demo-ct-oc-rh-2', name: 'Асанов Бакыт (демо)', role: 'завхоз', phone: '+996 555 010 203' });
  }
  // Участок «Осмотрен» — закончен.
  const land = rec('oc-lp-1');
  if (land && !mine(land).length) {
    const p = p0;
    mkA(land, p, [], 'done', -2);
    fill(land, land.ois, p, -2).note = 'Границы на местности совпадают с планом, ограждение по периметру';
  }
  // Производственное «Осмотрен» — значения к уже законченному назначению.
  const prod = rec('oc-pr-1');
  if (prod) {
    const a = mine(prod).find((x) => x.state === 'done');
    if (a) { own(a); fill(prod, prod.ois, p0, -5); }
  }
  // Нежилое «Удостоверен по документам», двое осмотрщиков: литера закончена
  // (a1 прежнего демо), механизмы и ТС — в работе у второго.
  const civ = rec('oc-cv-1');
  if (civ) {
    mine(civ).forEach((a) => {
      const ois = civ.ois.filter((o) => a.oiIds.includes(o.id));
      if (a.state === 'done') fill(civ, ois, a.person, -4);
      else { setState(a, 'progress', 0); fill(civ, ois, a.person, 0, 0.5); }
    });
    entry(civ).note = 'Литера осмотрена; оборудование котельной и ТС — в работе у второго осмотрщика';
  }
  // Квартира «Удостоверен по документам»: закончена с пометкой «неполный»
  // (внесена половина значений), ТС передано другому и ещё не осмотрено.
  // Квартира — закончена с пометкой «неполный» (внесена половина значений).
  // Не oc-ap-2: там демо передачи ТС (demoTs), и закрытое назначение прежнего
  // осмотрщика снова показывало ему переданное ТС.
  const flat = recs.find((x) => x.typeId === 'apartment' && x.ocId !== 'oc-ap-2' && !/-b\d+$/.test(x.ocId)
    && (x.ois || []).some((o) => o.card === 'apartment') && !mine(x).length);
  if (flat) {
    mkA(flat, p0, [], 'done', -1, true);
    const ois = flat.ois.filter((o) => o.card === 'apartment').slice(0, 1);
    fill(flat, ois, p0, -1, 0.5).note = 'Жильцы не пустили в одну комнату — осмотрена частично';
  }
  // Для среза ЦОД «Осмотр закончен — проверить»: объект демо-объёма, где ЦОД —
  // человек из сессии (в сиде ЦОД у всех записей другой). Состав ОИ у таких
  // записей не собирается (см. выше) — результаты по объекту в целом.
  const forSlice = recs.find((r) => r.status === READY && /-b\d+$/.test(r.ocId) && me && r.cod === me && !mine(r).length);
  if (forSlice) richSlice(forSlice, mkA, entry, p0, today);
  // ОЦ «Механизмы и оборудование» — осмотр закончен, значения по единицам.
  const mechOc = recs.find((r) => r.typeId === 'mechanisms' && (r.ois || []).length && r.ois[0].units.length && !mine(r).length);
  if (mechOc) {
    mkA(mechOc, p0, [], 'done', -2);
    fill(mechOc, mechOc.ois, p0, -2).note = 'Оборудование на месте, инвентарные номера сверены по табличкам';
  }
  return out;
}

// Версия демо-результатов: сохранённое в браузере демо прежней версии
// заменяется новым (kernel/inspectionResults.js, seedDemoResults); введённое
// руками не трогается. Поднимать при изменении демо-результатов.
const DEMO_RESULTS_VER = '2026-11-02-срез';

// Объект среза ЦОД «Осмотр закончен — проверить» — «в боевом режиме»
// (пользователь 02.11.2026: «Заполни детальными тестовыми данными. Снимками и
// т.д. (просто снимки - заглушки)»): осмотр закончен целиком; по объекту —
// заметка, контакты, два скана документов, голосовая заметка и снимки; по
// каждому ОИ — все значения осмотра и десятки снимков-заглушек по категориям.
//
// Объект — синтетическая запись демо-объёма: её карточку генератор не
// собирает (сборка кладёт запись в список и меняет счётчики реестра, 13.10.2026),
// поэтому значения и снимки по ОИ дописываются при первом открытии вкладки
// «Результаты осмотра», когда карточка уже собрана (completeRichDemo).
const RICH_PHOTOS = {
  building: [['Фасад', 14], ['Внутр. помещения', 48], ['Кровля', 9], ['Конструкции', 6]],
  land: [['Земельный участок', 12]],
  apartment: [['Внутр. помещения', 22], ['Фасад', 4]],
  mech: [['Прочее', 6]],
  vehicle: [['Машина', 8]],
};
const CARD_WORD = { building: 'Литера', land: 'Участок', apartment: 'Квартира', mech: 'Механизмы', vehicle: 'ТС' };

function richShot(e, ocId, oiId, cat, n, label, t0, by) {
  const k = e.photos.length + 1;
  e.photos.push({ id: `demo-ph-${ocId}-${k}`, name: `${cat} ${n}.svg`, size: 1500, type: 'image/svg+xml', dataUrl: photoImg(label, cat, n),
    at: new Date(t0 + k * 47000).toISOString(), oiId, cat, by });
}

function richSlice(r, mkA, entry, by, today) {
  mkA(r, by, [], 'done', -1);
  const e = entry(r);
  const t0 = dayAt(today, -1, 9).getTime();
  e.note = 'Осмотрен целиком. Фасад требует покраски, в подвале следы подтопления; участок огорожен, въезд с улицы. Этажность по факту отличается от техпаспорта — надстроен мансардный этаж.';
  e.contacts.push({ id: `demo-ct-${r.ocId}-1`, name: 'Садыков Эрлан (демо)', role: 'завхоз', phone: '+996 555 101 202' },
    { id: `demo-ct-${r.ocId}-2`, name: 'Иманалиева Гульнара (демо)', role: 'бухгалтер учреждения', phone: '+996 700 303 404' });
  [['Фасад', 3], ['Прочее', 2]].forEach(([cat, cnt]) => { for (let i = 1; i <= cnt; i++) richShot(e, r.ocId, '', cat, i, 'Объект оценки', t0, by); });
  const at = (h) => dayAt(today, -1, h).toISOString();
  const pages = (title, n) => Array.from({ length: n }, (_, i) => ({ id: `demo-sp-${r.ocId}-${title.length}-${i + 1}`, name: `${title}, стр. ${i + 1}.svg`,
    size: 1800, type: 'image/svg+xml', dataUrl: scanPage(title, i + 1, n) }));
  e.scans = [
    { id: `demo-sc-${r.ocId}-1`, title: 'Технический паспорт', oiId: '', by, at: at(11), source: 'осмотр', status: 'ждёт ЦОД', pages: pages('Технический паспорт', 3) },
    { id: `demo-sc-${r.ocId}-2`, title: 'Акт осмотра с подписью завхоза', oiId: '', by, at: at(12), source: 'осмотр', status: 'ждёт ЦОД', pages: pages('Акт осмотра', 1) },
  ];
  e.voices = [{ id: `demo-vn-${r.ocId}-1`, name: 'заметка-подвал.wav', size: 8044, type: 'audio/wav', oiId: '', dur: 1, by, at: at(13), dataUrl: silenceWav() }];
  e.richPending = { by, t0 };
}

// Дописать значения и снимки по ОИ собранной карточки (см. richSlice): один
// раз, отметка richPending снимается. Возвращает, было ли что дописать.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: демо-результатов нет, функция уходит вместе с засевом.
export function completeRichDemo(res, rec) {
  if (!res || !res.richPending || !rec) return false;
  const { by, t0 } = res.richPending;
  (rec.oi || []).forEach((o) => {
    const oi = { id: o.id, card: o.card, litKind: o.litKind || '', units: (o.mechanisms || []).map((u) => u.id) };
    res.assets[oi.id] = oiValues(oi, 1);
    (RICH_PHOTOS[oi.card] || [['Прочее', 4]]).forEach(([cat, cnt]) => {
      for (let i = 1; i <= cnt; i++) richShot(res, rec.id, oi.id, cat, i, CARD_WORD[oi.card] || 'Объект имущества', t0, by);
    });
  });
  delete res.richPending;
  return true;
}

// Голосовая заметка-заглушка: секунда тишины (WAV, 8 кГц, 8 бит).
function silenceWav() {
  const n = 8000;
  const head = [0x52, 0x49, 0x46, 0x46, ...le(36 + n, 4), 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20, ...le(16, 4), ...le(1, 2), ...le(1, 2),
    ...le(8000, 4), ...le(8000, 4), ...le(1, 2), ...le(8, 2), 0x64, 0x61, 0x74, 0x61, ...le(n, 4)];
  const bin = String.fromCharCode(...head) + String.fromCharCode(128).repeat(n);
  return 'data:audio/wav;base64,' + (typeof btoa === 'function' ? btoa(bin) : '');
}
function le(v, bytes) { return Array.from({ length: bytes }, (_, i) => (v >> (8 * i)) & 255); }
