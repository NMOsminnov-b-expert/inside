// Интерфейс осмотрщика: мои осмотры → задача → объект / документы / фото,
// и осмотр каждого объекта имущества отдельно.
//
// Решение пользователя 08.09.2026: осмотры — это два отдельных интерфейса, и
// у осмотрщика он мобильный, отдельными экранами в этом же макете, но сами
// экраны адаптивные. Здесь сделана вторая половина — то, что видит и делает
// сам осмотрщик; назначение осмотров региональным менеджером будет отдельным
// экраном.
//
// Что осмотрщик может: смотреть карточку ОЦ с её ОИ (только чтение), открывать
// назначенные документы, снимать и разбирать фото с привязкой к объекту
// имущества, заполнять поля осмотра по каждому ОИ, писать заметку и отмечать,
// что осмотр закончен. Статус «Осмотрен» ставит ЦОД — поэтому отметка здесь
// только сообщает ему, что можно проверять.
//
// Поля осмотра строятся из описания (form.js) конструктором ядра
// (kernel/fieldSchema.js) — в этом файле нет ни одной подписи поля.
import { MENU_HREF, INSP_HREF, inspHref } from '../../kernel/router.js';
import { pickFile, isFileTooLarge, MAX_DOC_FILE_MB } from '../../kernel/fileUpload.js';
import { bindFields, filledCount, requiredLeft } from '../../kernel/fieldSchema.js';
import {
  myTasks, loadTask, taskState, assetValues, inspectorsInData, currentInspector,
  setInspector, addPhoto, removePhoto, movePhoto, photoById, photoGroups,
  taskDocs, oiOptions, premises, addPremise, removePremise,
  foundOi, addFoundOi, removeFoundOi, PHOTO_CATS, dayTrips,
} from './tasks.js';
import { allAssignments, assignmentById, isLive, takeForDay, skipDay } from '../../kernel/inspections.js';
import { planModel, planHTML, planListHTML, planMarks, planMatch, PLAN_STEP, planPoints, taskPoints, planMapHTML, planPickHTML, PLAN_POINT_KINDS } from './plan.js';
import { reportOf, saveReport, dayReport, reportTime, profileOf, eventsOf, poaDaysLeft, allCadRequests, cadRequest, cadSummary, cadKindLabel, cadFileName, answerCadRow, CAD_RESULTS } from '../../kernel/inspections.js';
import { codeByName } from '../../kernel/institutions.js';
import { fmtEni } from '../../kernel/fmt.js';
import { sortedTypes } from '../../kernel/registry.js';
import { allFields, sections, mismatchHint } from './form.js';
import { dayRoute, gpsOfObject } from '../inspections/route.js';
import { summaries } from '../inspections/model.js';
import { loadMapLibre, createMap, ownParcelsGL, emptyFC } from '../../kernel/mapgl.js';
import { attachCadastreGL } from '../../kernel/cadastreLayersGL.js';
import { geoByEni } from '../../kernel/cadastreGeo.js';
import {
  listHTML, taskHTML, objectHTML, assetHTML, docsHTML, photoHTML, lightboxHTML, dayReportsHTML, reportFormHTML, cadListHTML, cadScreenHTML, notesHTML, sectionNavHTML, navLinks, HAS_PREMISES,
} from './views.js';

const SECTIONS = ['task', 'object', 'docs', 'photo'];

export function mountInspector(host) {
  const { scope } = host;
  let route = host.route;
  // Вход — пункт бокового меню «Осмотры (осмотрщики)» (14.10.2026; кнопка
  // «Экран осмотрщика» в панели регионалов убрана). Адрес #/insp?as=<ФИО> —
  // экран так, как его видит этот осмотрщик.
  const takeAs = (r) => { if (r && r.query && r.query.as) setInspector(r.query.as); };
  takeAs(route);

  const ui = {
    // Открывают экран, чтобы поехать на осмотр, — поэтому по умолчанию
    // показываем то, что ждёт осмотра, а не весь список.
    onlyPending: true,
    openOi: null,
    // К чему привязать следующий снимок. Пустое — возьмём первый ОИ записи.
    photoOi: '',
    cat: PHOTO_CATS[0],
    // Разделы формы, свёрнутые ВРУЧНУЮ. По умолчанию открыты все: свёрнутое
    // заранее приходится разворачивать (замечание пользователя 08.09.2026).
    collapsed: [],
    // Вкладка «Сегодня» — весь план (plan.js): поиск, сколько строк
    // нарисовано, открытая форма снятия с дня, свёрнутое прошлое.
    planQ: '',
    planLimit: PLAN_STEP,
    skipOpen: '',
    skipErr: '',
    pastOpen: false,
  };

  const rec = () => loadTask(route.typeId, route.ocId);

  // --- отчёты за день ------------------------------------------------------
  //
  // Черновик формы живёт, пока открыт экран отчёта; при входе собирается из
  // сданного отчёта или из выездов дня (утром отмечены все места, вечером —
  // законченные осмотры).
  const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  let rp = null;
  let rpErr = '';
  function draftFor(kind) {
    const date = isoToday();
    const person = currentInspector();
    const r = reportOf(person, date, kind);
    const trips = dayTrips(date);
    return {
      kind, date, person,
      // Утром: отмеченные выезды (по назначению) и места, дописанные вручную.
      pick: r ? trips.filter((t) => (r.places || []).includes(t.label)).map((t) => t.assignId) : trips.map((t) => t.assignId),
      extra: r ? (r.places || []).filter((x) => !trips.some((t) => t.label === x)) : [],
      done: r ? [...(r.done || [])] : trips.filter((t) => t.done).map((t) => t.assignId),
      odometer: r ? r.odometer || '' : '',
      photo: r ? r.photo || '' : '',
      noOdometer: r ? !!r.noOdometer : false,
      route: r && r.route && r.route.length ? [...r.route] : ['дом', ''],
      km: r ? r.km || '' : '',
      note: r ? r.note || '' : '',
    };
  }
  const numOf = (v) => { const n = parseFloat(String(v || '').replace(',', '.').replace(/\s/g, '')); return Number.isFinite(n) ? n : null; };
  function rpPreview() {
    if (!rp || rp.kind !== 'evening') return null;
    const m = reportOf(rp.person, rp.date, 'morning');
    let km = null;
    let by = '';
    if (!rp.noOdometer && m && numOf(m.odometer) !== null && numOf(rp.odometer) !== null && numOf(rp.odometer) >= numOf(m.odometer)) {
      km = numOf(rp.odometer) - numOf(m.odometer); by = 'по одометру';
    } else if (rp.noOdometer && numOf(rp.km) !== null) { km = numOf(rp.km); by = 'по маршруту'; }
    if (km === null) return null;
    const cons = numOf(profileOf(rp.person).car.consumption);
    return { km, by, litres: cons === null ? null : Math.round(km * cons) / 100 };
  }
  // Чего не хватает — первым по порядку экрана; вместе с полем для курсора.
  function rpMissing() {
    if (rp.kind === 'morning' && !rp.pick.length && !rp.extra.length) return ['Отметьте, куда выезжаете, или добавьте место', '[data-rp-extra]'];
    if (!rp.noOdometer) {
      if (numOf(rp.odometer) === null) return ['Укажите показание одометра', '[data-rp="odometer"]'];
      if (!rp.photo) return ['Сфотографируйте одометр', '[data-rp-shoot]'];
      const m = rp.kind === 'evening' ? reportOf(rp.person, rp.date, 'morning') : null;
      if (m && numOf(m.odometer) !== null && numOf(rp.odometer) < numOf(m.odometer)) {
        return [`Показание меньше утреннего (${Number(m.odometer).toLocaleString('ru-RU')} км)`, '[data-rp="odometer"]'];
      }
    } else if (rp.kind === 'evening') {
      if (rp.route.filter((x) => x.trim()).length < 2) return ['Укажите маршрут: откуда и куда ездили', '[data-rp-pt]'];
      if (numOf(rp.km) === null) return ['Укажите пробег по маршруту', '[data-rp="km"]'];
    }
    return null;
  }
  function renderReport(kind) {
    if (!rp || rp.kind !== kind || rp.date !== isoToday() || rp.person !== currentInspector()) { rp = draftFor(kind); rpErr = ''; }
    const r = reportOf(rp.person, rp.date, kind);
    scope.setHTML(reportFormHTML({
      kind, date: rp.date, person: rp.person, draft: rp, trips: dayTrips(rp.date),
      existing: r ? reportTime(r.at) : '', prev: kind === 'evening' ? reportOf(rp.person, rp.date, 'morning') : null,
      preview: rpPreview(), err: rpErr,
    }));
  }
  // Уведомления о себе (пункт 8.2): события по своим назначениям за три дня
  // — назначено, перенесена дата, снято; срок доверенности за 14 дней.
  //
  // ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: доставка — пушем приложения или в WhatsApp; здесь —
  // список на экране «Мои осмотры».
  // «Сегодня» — весь план осмотрщика по дням (plan.js). Сегодняшние выезды —
  // в порядке маршрута дня, того же, что видит регионал (dayRoute: ближайший
  // следующий от дома); без координат — в конце.
  //
  // «Новое» — назначено после прошлого открытия плана. Время прошлого
  // открытия читается один раз за заход на экран, иначе метки гасли бы от
  // любой перерисовки.
  // ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: «просмотрено» — у учётной записи осмотрщика на
  // сервере (иначе на втором телефоне всё снова «новое»).
  const seenMemo = new Map();
  function planSeen(person) {
    if (seenMemo.has(person)) return seenMemo.get(person);
    const k = 'ins.planSeen.' + person;
    let prev = '';
    try { prev = localStorage.getItem(k) || ''; localStorage.setItem(k, new Date().toISOString()); } catch (e) { /* без хранилища — без меток «Новое» */ }
    seenMemo.set(person, prev);
    return prev;
  }

  function planParts(all) {
    const date = isoToday();
    const me = currentInspector();
    const q = ui.planQ.trim();
    let sums = null;
    const sumsOf = () => (sums || (sums = summaries()));
    // Снятие с дня — у назначения; снятое сегодня показывается в дне
    // зачёркнутым, а не в «Без даты».
    const tasks = all.map((t) => {
      const a = t.assignId ? assignmentById(t.assignId) : null;
      const skip = a && a.skips && a.skips.length ? a.skips[a.skips.length - 1] : null;
      return skip ? { ...t, skip } : t;
    });
    const skippedToday = tasks.filter((t) => t.skip && t.skip.date === date && !t.plannedAt);
    // Снятые регионалом за две недели — кроме переназначенных тому же
    // человеку (у объекта есть действующее назначение).
    const since = new Date(Date.now() - 14 * 864e5).toISOString();
    const liveKeys = new Set(all.map((t) => t.key));
    const removed = allAssignments()
      .filter((a) => a.person === me && a.state === 'removed' && (a.removedAt || '') >= since && !liveKeys.has(a.typeId + '|' + a.ocId))
      .map((a) => {
        const s = sumsOf().get(a.typeId + '|' + a.ocId);
        return s ? { at: a.removedAt, t: { key: a.typeId + '|' + a.ocId, typeId: a.typeId, ocId: a.ocId, title: s.title, typeLabel: s.typeLabel, institution: s.institution, eni: s.eniAll || s.eni, plannedAt: a.plannedAt, assignId: a.id } } : null;
      })
      .filter(Boolean);
    const m = planModel({ tasks: tasks.filter((t) => !skippedToday.includes(t)), removed, today: date, q });
    const route = m.today.length ? dayRoute(sumsOf(), me, date) : null;
    const order = route ? route.stops.filter((x) => x.fixed).map((x) => x.key) : [];
    const rank = (t) => { const i = order.indexOf(t.typeId + '|' + t.ocId); return i < 0 ? 1e6 : i; };
    const stops = m.today.slice().sort((a, b) => rank(a) - rank(b)).map((t) => {
      const ll = gpsOfObject(t.typeId, t.ocId);
      return { t, ll, links: ll ? navLinks([ll]) : {} };
    });
    const pts = stops.filter((x) => x.ll && !x.t.done).map((x) => x.ll);
    const events = eventsOf({ person: me }).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const seenAt = planSeen(me);
    return {
      m, today: date, q, stops,
      points: planPoints({ m, stops, today: date, gpsOf: gpsOfT }),
      skips: skippedToday.filter((t) => planMatch(t, q)).map((t) => ({ t, reason: t.skip.reason, note: t.skip.note })),
      routeLinks: navLinks(pts), app: navApp(),
      marksOf: (t) => planMarks(t, events, seenAt),
      limit: ui.planLimit, skipOpen: ui.skipOpen, skipErr: ui.skipErr, pastOpen: ui.pastOpen,
    };
  }
  // Поиск и «Показать ещё» перерисовывают только список: поле поиска не
  // пересоздаётся, фокус и клавиатура на телефоне не пропадают.
  function renderPlanList() {
    const box = scope.$('[data-plan-list]');
    if (!box) { render(); return; }
    const parts = planParts(myTasks());
    box.innerHTML = planListHTML(parts);
    setPlanPoints(parts.points, false);
  }

  // --- карта задачи и участок по Кадастру ---------------------------------
  //
  // Контур — rec.geo карточки; нет его — полученный сейчас по ЕНИ (geoMemo,
  // в памяти вкладки, в карточку не пишется: данные карточки правит ЦОД).
  // ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: полученный на выезде контур — заявкой ЦОД или
  // сразу в карточку по правам; карта — со своего сервера тайлов и с
  // заранее скачанной областью для работы без связи.
  const geoMemo = new Map();
  const geoOf = (r) => geoMemo.get(route.typeId + '|' + route.ocId) || (r.geo && r.geo.extent ? r.geo : null);
  // В карточке только рамка (так её получают по ЕНИ, когда контур не пришёл)
  // — контур дозапрашивается сам: рамку карта рисует точкой, и участка не
  // было видно (замечание пользователя 14.10.2026: «Участок не
  // отображается»). Раз на задачу: ответ «контура нет» не повторяем.
  const contourTried = new Set();
  function fillContour(r, geo) {
    const key = route.typeId + '|' + route.ocId;
    if (!geo || !geo.extent || geo.contour || !r.eni || contourTried.has(key)) return;
    contourTried.add(key);
    geoByEni(r.eni).then((g) => {
      if (!g.contour) return;
      geoMemo.set(key, { ...geo, contour: g.contour, house: g.house || geo.house, at: g.at, saved: false });
      if (route.typeId + '|' + route.ocId === key && (route.section || 'task') === 'task') render();
    });
  }
  const parseLL = (v) => { const m = /(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/.exec(String(v || '')); return m ? [+m[1], +m[2]] : null; };
  let taskMap = null;
  async function mountTaskMap(geo, ll) {
    if (taskMap) { taskMap.remove(); taskMap = null; }
    const el = scope.$('[data-ins-map]');
    if (!el || !ll) return;
    const gl = await loadMapLibre(host.ensureStyle);
    if (!el.isConnected) return;
    // Карта двигается одним пальцем в обоих режимах (решение пользователя
    // 14.10.2026: «Двигать карту двумя пальцами неудобно... Оставь одним»;
    // совместные жесты — двумя пальцами — сняты).
    const map = await createMap(gl, el, { center: [ll[1], ll[0]], zoom: 16 });
    if (!el.isConnected) { map.remove(); return; }
    taskMap = map;
    // Соседние участки и строения — только когда контур уже получен с
    // Кадастра: без связи с порталом (прокси не поднят) их запросы падали бы
    // на каждом открытии задачи.
    if (geo && geo.extent) attachCadastreGL(gl, map);
    // Есть контур — карта по нему; нет — точка объекта на масштабе 16, чтобы
    // были видны улицы вокруг (рамка из одной точки приближала до 18).
    const box = ownParcelsGL(map, [geo && geo.extent ? geo : { extent: [ll[1], ll[0], ll[1], ll[0]] }]);
    if (box && geo && geo.extent) map.fitBounds(box, { padding: 32, maxZoom: 18, animate: false });
    taskMapView = { box: geo && geo.extent ? box : null, center: [ll[1], ll[0]] };
    if (mapBig) placeBig();
  }

  // --- план на карте («Сегодня», «Задачи») -------------------------------
  //
  // Та же карта и те же два режима, что у задачи (одна карта на экране).
  // Координаты объектов запоминаются на время экрана: запись грузится один
  // раз, а не на каждую перерисовку.
  const gpsMemo = new Map();
  const gpsOfT = (t) => {
    if (!gpsMemo.has(t.key)) gpsMemo.set(t.key, gpsOfObject(t.typeId, t.ocId));
    return gpsMemo.get(t.key);
  };
  let planPts = [];
  let planMarkers = [];
  let planGl = null;
  let planFitAll = false;
  async function mountPlanMap(points, { fitAll = false } = {}) {
    if (taskMap) { taskMap.remove(); taskMap = null; }
    planPts = points;
    planFitAll = fitAll;
    planMarkers = [];
    const el = scope.$('[data-plan-map]');
    if (!el) return;
    const gl = await loadMapLibre(host.ensureStyle);
    if (!el.isConnected) return;
    const map = await createMap(gl, el, { center: [74.6, 42.87], zoom: 6.5 });
    if (!el.isConnected) { map.remove(); return; }
    taskMap = map;
    planGl = gl;
    map.addSource('plan', { type: 'geojson', data: emptyFC() });
    map.addLayer({ id: 'plan-pt', type: 'circle', source: 'plan', filter: ['==', ['get', 'n'], 0],
      paint: { 'circle-radius': 8, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
    map.on('click', 'plan-pt', (e) => { if (e.features && e.features[0]) pickPlanPoint(e.features[0].properties.key); });
    map.on('mouseenter', 'plan-pt', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'plan-pt', () => { map.getCanvas().style.cursor = ''; });
    setPlanPoints(planPts, true);
    if (mapBig) placeBig();
  }
  function setPlanPoints(points, fit) {
    planPts = points;
    if (!taskMap || !taskMap.getSource('plan')) return;
    const color = (k) => (PLAN_POINT_KINDS.find((x) => x.key === k) || PLAN_POINT_KINDS[2]).color;
    // Важное — поверх: будущее снизу, сегодняшнее сверху.
    const layer = { future: 0, done: 1, overdue: 2, today: 3 };
    const drawn = points.slice().sort((a, b) => (layer[a.kind] || 0) - (layer[b.kind] || 0));
    taskMap.getSource('plan').setData({ type: 'FeatureCollection', features: drawn.map((p) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [p.ll[1], p.ll[0]] }, properties: { key: p.key, n: p.n, color: color(p.kind) } })) });
    planMarkers.forEach((mk) => mk.remove());
    planMarkers = points.filter((p) => p.n).map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ins-mk';
      b.textContent = String(p.n);
      b.dataset.key = p.key;
      b.setAttribute('aria-label', `${p.n}: ${p.title}`);
      b.addEventListener('click', (ev) => { ev.stopPropagation(); pickPlanPoint(p.key); });
      return new planGl.Marker({ element: b }).setLngLat([p.ll[1], p.ll[0]]).addTo(taskMap);
    });
    if (fit) fitPlan();
    pickPlanPoint('');
  }
  // Рамка карты: в «Сегодня» — сегодняшние выезды (нет их — несделанное,
  // потом будущее), в «Задачах» — все точки списка.
  function fitPlan() {
    let sel = planPts;
    if (!planFitAll) {
      for (const k of ['today', 'overdue', 'future', 'done']) {
        const part = planPts.filter((p) => p.kind === k);
        if (part.length) { sel = part; break; }
      }
    }
    if (!sel.length || !taskMap) { taskMapView = null; return; }
    const lons = sel.map((p) => p.ll[1]);
    const lats = sel.map((p) => p.ll[0]);
    const box = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
    // Сверху справа — кнопка «Развернуть», снизу справа — масштаб: точки
    // держатся в стороне от них, иначе крайнюю нельзя нажать.
    const pad = { top: 64, right: 60, bottom: 56, left: 32 };
    taskMapView = { box, maxZoom: 15, pad };
    taskMap.fitBounds(box, { padding: pad, maxZoom: 15, animate: false });
  }
  function pickPlanPoint(key) {
    const box = scope.$('[data-plan-pick]');
    if (!box) return;
    const p = key ? planPts.find((x) => x.key === key) : null;
    box.hidden = !p;
    box.innerHTML = p ? planPickHTML(p) : '';
    planMarkers.forEach((mk) => mk.getElement().classList.toggle('on', !!p && mk.getElement().dataset.key === p.key));
  }

  // Два режима карты задачи (замечание пользователя 14.10.2026: «Карта
  // крайне неудобна... в 2-х режимах. Почти на весь экран и в малом режиме»):
  // малая — в блоке «Куда ехать»; большая — всё место между шапкой и нижней
  // панелью (поверх содержимого, на месте, без окна). Свернуть — кнопкой или
  // Esc. Карта та же: переключение не перезагружает слои.
  let mapBig = false;
  let taskMapView = null;
  function placeBig() {
    const w = scope.$('[data-ins-map-w]');
    const body = scope.$('.ins-body');
    if (!w) return;
    if (mapBig && body) {
      const r = body.getBoundingClientRect();
      Object.assign(w.style, { top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px' });
    } else {
      ['top', 'left', 'width', 'height'].forEach((k) => { w.style[k] = ''; });
    }
  }
  function setMapBig(on) {
    mapBig = on;
    const w = scope.$('[data-ins-map-w]');
    const t = scope.$('[data-map-big]');
    if (!w) return;
    w.classList.toggle('is-big', on);
    placeBig();
    if (t) {
      t.setAttribute('aria-pressed', String(on));
      t.setAttribute('aria-label', on ? 'Свернуть карту' : 'Развернуть карту');
      t.title = on ? 'Свернуть карту' : 'Развернуть карту';
      t.innerHTML = on
        ? '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M16 9h-5V4M4 11h5v5M11 9l6-6M9 11l-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M12 3h5v5M8 17H3v-5M17 3l-6 6M3 17l6-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    if (!taskMap) return;
    taskMap.resize();
    if (taskMapView && taskMapView.box) taskMap.fitBounds(taskMapView.box, { padding: taskMapView.pad || (on ? 48 : 32), maxZoom: taskMapView.maxZoom || 18, animate: false });
  }
  scope.on('click', '[data-map-big]', () => setMapBig(!mapBig));
  scope.onDocument('keydown', (e) => { if (e.key === 'Escape' && mapBig) setMapBig(false); });
  window.addEventListener('resize', placeBig);

  // «Назад» из задачи — в тот раздел верхнего уровня, откуда пришли.
  const homeHref = () => (ui.homeTab && ui.homeTab !== 'today' ? `${INSP_HREF}?tab=${ui.homeTab}` : INSP_HREF);

  // Выбранный навигатор — удобство одного телефона, в памяти браузера.
  // ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: можно держать в профиле осмотрщика, чтобы выбор
  // переезжал с ним на новый телефон.
  function navApp() {
    try { return localStorage.getItem('inside.insp.nav') || ''; } catch (e) { return ''; }
  }
  function setNavApp(v) {
    try { localStorage.setItem('inside.insp.nav', v); } catch (e) { /* без памяти — спросим снова */ }
  }

  function myNotes() {
    const me = currentInspector();
    const since = new Date(Date.now() - 3 * 864e5).toISOString();
    const KIND = { assigned: 'Новое назначение', moved: 'Перенесена дата', removed: 'Назначение снято' };
    const titles = new Map(myTasks().map((t) => [t.typeId + '|' + t.ocId, t.title]));
    const out = eventsOf({ person: me })
      .filter((e) => KIND[e.kind] && e.at >= since && e.who !== me)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, 5)
      .map((e) => ({ title: `${KIND[e.kind]} · ${new Date(e.at).toLocaleDateString('ru-RU').slice(0, 5)}`,
        text: [titles.get(e.typeId + '|' + e.ocId), e.text].filter(Boolean).join(' · '),
        href: e.kind === 'removed' ? '' : `#/insp/${encodeURIComponent(e.typeId)}/${encodeURIComponent(e.ocId)}`, tone: e.kind === 'removed' ? 'warn' : '' }));
    const d = poaDaysLeft(me);
    if (d !== null && d <= 14) out.unshift({ title: 'Доверенность', text: d < 0 ? `истекла ${-d} дн. назад` : d === 0 ? 'истекает сегодня' : `истекает через ${d} дн.`, tone: 'off' });
    return out;
  }

  // --- запросы документов (раздел 5) -----------------------------------------
  //
  // Черновик ответа по строке живёт, пока открыт экран запроса: итог, дата
  // сканирования, комментарий, выбранный PDF (ещё не сохранён).
  let cad = null;
  const cadErr = {};
  function cadDraftOf(id) {
    const r = cadRequest(id);
    return { id, rows: Object.fromEntries(r.rows.map((x) => [x.id, { result: x.result || '', scanDate: x.scanDate || '', answer: x.answer || '', file: null }])) };
  }
  function renderCad(id) {
    if (!cad || cad.id !== id) { cad = cadDraftOf(id); Object.keys(cadErr).forEach((k) => delete cadErr[k]); }
    const r = cadRequest(id);
    const sums = new Map();
    sortedTypesSummary(sums);
    scope.setHTML(cadScreenHTML({
      req: r, kindLabel: cadKindLabel(r.kind), results: CAD_RESULTS,
      rows: r.rows.map((row) => {
        const code = codeByName(row.inst);
        return { row, code, title: (sums.get(row.typeId + '|' + row.ocId) || {}).title || '', draft: cad.rows[row.id],
          fileName: (row.file && row.file.name) || cadFileName(row, code), err: cadErr[row.id] || '' };
      }),
    }));
  }
  // Подписи объектов строк — из сводок реестра (запрос по id у реестра нет).
  function sortedTypesSummary(out) {
    const need = new Set(cadRequest(cad.id).rows.map((x) => x.typeId));
    sortedTypes().forEach((t) => {
      if (!need.has(t.manifest.id)) return;
      t.records.queryRecords({ filter: {}, offset: 0, limit: 100000 }).rows.forEach((s) => out.set(t.manifest.id + '|' + s.id, s));
    });
  }

  // Снимок одометра ужимается до 480 px по длинной стороне: так он
  // сохраняется вместе с отчётом и переживает перезагрузку.
  //
  // ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: снимок — файл в хранилище в исходном качестве, с
  // временем съёмки из EXIF (проверка, что снят в этот день); здесь — сжатая
  // копия в данных отчёта.
  const shrink = (file) => new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 480 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
    img.src = url;
  });

  // --- отрисовка ----------------------------------------------------------

  // Шапка всегда одной высоты. Сжатие при прокрутке (сделано 14.10.2026 по
  // «прятать в минимальный режим») снято тем же днём по замеру: новая шапка —
  // две короткие строки, сжатие экономило 15 px, а на пороге всё содержимое
  // разом съезжало на эти 15 px — «поведение напоминает желе при скролле».
  // Прокручивается содержимое экрана, а не вся страница (inspector.css).
  const content = () => scope.$('.ins-body');
  // Идёт переход к разделу из строки разделов: текущий раздел отмечен сразу
  // и на ходу не пересчитывается — иначе при дальнем переходе подсветка
  // перескакивала по каждому пройденному разделу и строка разделов дёргалась
  // вбок (замечание пользователя 14.10.2026; замер: 5 смен подсветки и 4
  // сдвига строки за переход «Коммуникации → Комментарии» против 1 и 1).
  let jumping = false;
  let pinned = null;
  function onScroll() {
    if (!content() || jumping) return;
    markCurrentSection();
  }
  scope.onDocument('scroll', onScroll, true);
  // Колесо над шапкой, строкой разделов и панелью разделов прокручивает
  // содержимое: они стоят вне прокрутки, и колесо над ними иначе не делало
  // ничего (замер 14.10.2026). Горизонтальное колесо над строкой разделов —
  // её собственное.
  scope.onDocument('wheel', (e) => {
    if (jumping || e.ctrlKey) return;
    const t = e.target;
    if (!t.closest || !t.closest('.ins') || t.closest('.ins-body') || t.closest('.ms-drop, .pick-menu')) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const pane = content();
    if (!pane) return;
    e.preventDefault();
    pane.scrollBy({ top: e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * pane.clientHeight : e.deltaY });
  }, { passive: false });
  // Текущий раздел в строке разделов — последний, чей заголовок ушёл под неё.
  function markCurrentSection() {
    const nav = scope.$('[data-secnav]');
    if (!nav) return;
    const edge = nav.getBoundingClientRect().bottom + 12;
    let cur = '';
    scope.$$('[data-sec-box]').forEach((b) => { if (b.getBoundingClientRect().top <= edge) cur = b.dataset.secBox; });
    // После перехода из строки разделов — нажатый раздел, пока экран стоит
    // там же: у последних разделов страница кончается раньше, чем их
    // заголовок встаёт под строку, и подсветка перескакивала на предыдущий.
    const pane = content();
    if (pinned && pane && Math.abs(pane.scrollTop - pinned.y) < 4) cur = pinned.key;
    else pinned = null;
    nav.querySelectorAll('[data-goto-sec]').forEach((b) => {
      const on = b.dataset.gotoSec === cur;
      if (on !== (b.getAttribute('aria-current') === 'true')) {
        if (!on) { b.removeAttribute('aria-current'); return; }
        b.setAttribute('aria-current', 'true');
        // Текущий раздел — в видимую часть строки. Вбок — только саму строку:
        // scrollIntoView прокрутил бы и экран, сбивая переход к разделу.
        if (b.offsetLeft < nav.scrollLeft) nav.scrollLeft = b.offsetLeft - 8;
        else if (b.offsetLeft + b.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = b.offsetLeft + b.offsetWidth - nav.clientWidth + 8;
      }
    });
  }

  function render() {
    draw();
    onScroll();
  }

  function draw() {
    const { typeId, ocId } = route;
    const section = SECTIONS.includes(route.section) ? route.section : 'task';

    if (!typeId && route.query && route.query.cad && cadRequest(route.query.cad)) {
      renderCad(route.query.cad);
      return;
    }

    if (!typeId && route.query && (route.query.report === 'morning' || route.query.report === 'evening')) {
      renderReport(route.query.report);
      return;
    }

    if (!typeId || !ocId) {
      // Список берём один раз целиком: из него же считаются оба счётчика в
      // переключателе, иначе «Все мои» показывало бы число ждущих осмотра.
      const all = myTasks();
      const pending = all.filter((t) => t.pending);
      const tab = ['today', 'tasks', 'cad', 'notes'].includes(route.query && route.query.tab) ? route.query.tab : 'today';
      ui.homeTab = tab;
      const notesList = myNotes();
      const cadOpen = allCadRequests().filter((r) => r.person === currentInspector() && cadSummary(r).wait).length;
      const listed = ui.onlyPending ? pending : all;
      const parts = tab === 'today' ? planParts(all) : null;
      const tPts = tab === 'tasks' ? taskPoints(listed, isoToday(), gpsOfT) : null;
      // Легенда — только виды, которые есть на карте.
      const kindsOf = (pts) => [...new Set(pts.map((x) => x.kind))];
      scope.setHTML(listHTML({
        tab,
        today: parts ? planHTML({ ...parts,
          map: planMapHTML({ kinds: kindsOf(parts.points), label: 'План на карте: сегодняшние выезды номерами по маршруту, несделанное и будущее точками' }) }) : '',
        tasksMap: tPts && tPts.length ? planMapHTML({ kinds: kindsOf(tPts), label: 'Задачи на карте по состоянию' }) : '',
        counts: { today: all.filter((t) => t.plannedAt === isoToday() && !t.done).length, cad: cadOpen, notes: notesList.length },
        tasks: listed,
        total: all.length,
        pendingCount: pending.length,
        inspectors: inspectorsInData(),
        person: currentInspector(),
        onlyPending: ui.onlyPending,
        backHref: MENU_HREF,
        notes: notesList.length ? notesHTML(notesList) : '',
        cad: cadListHTML(allCadRequests().filter((r) => r.person === currentInspector()).map((r) => {
          const t = cadSummary(r);
          return { id: r.id, no: r.no, kindLabel: cadKindLabel(r.kind), due: r.due, wait: t.wait, got: t.got, total: t.total, late: !!(r.due && r.due < isoToday() && t.wait) };
        }).filter((r) => r.wait)),
        reports: (() => {
          const d = dayReport(currentInspector(), isoToday());
          const p = profileOf(currentInspector());
          return dayReportsHTML({
            morning: d.morning ? reportTime(d.morning.at) : '', evening: d.evening ? reportTime(d.evening.at) : '',
            from: p.schedule.from, to: p.schedule.to, missingMorning: d.missingMorning, missingEvening: d.missingEvening,
          });
        })(),
      }));
      if (parts) mountPlanMap(parts.points);
      else if (tPts && tPts.length) mountPlanMap(tPts, { fitAll: true });
      else if (taskMap) { taskMap.remove(); taskMap = null; }
      return;
    }

    const r = rec();
    if (!r) {
      scope.setHTML(`<div class="ins"><div class="ins-body">
        <p class="ins-empty">Объект не найден: возможно, его убрали в архив.</p>
        <a class="ins-btn ins-btn-main ins-btn-wide" href="${INSP_HREF}">К моим осмотрам</a>
      </div></div>`);
      return;
    }

    const state = taskState(typeId, ocId);
    const docs = taskDocs(r);
    const hrefFor = (s) => inspHref({ typeId, ocId, section: s });
    const counts = { docs: docs.length, photo: state.photos.length };
    const taskHref = inspHref({ typeId, ocId });
    const oiList = oiOptions(r);

    // Осмотр одного объекта имущества — подраздел «Объекта»: раздел в панели
    // остаётся тот же, а «назад» ведёт к перечню, а не к задаче.
    if (section === 'object' && route.oiId) {
      const oi = (r.oi || []).find((o) => o.id === route.oiId);
      if (oi) {
        scope.setHTML(assetHTML({
          rec: r,
          oi,
          typeId,
          values: assetValues(typeId, ocId, oi.id),
          premises: premises(typeId, ocId, oi.id),
          collapsed: ui.collapsed,
          // Фото прикрепляются в своём разделе, но с уже выбранным объектом:
          // осмотрщик пришёл из осмотра этой литеры, и переспрашивать нечего.
          photoHref: inspHref({ typeId, ocId, section: 'photo' }),
          hrefFor,
          counts,
          backHref: inspHref({ typeId, ocId, section: 'object' }),
          savedText: savedTextOf(typeId, ocId, oi.id),
          oiPhotos: taskState(typeId, ocId).photos.filter((p) => p.oiId === oi.id).length,
        }));
        return;
      }
    }

    if (section === 'object') {
      scope.setHTML(objectHTML({
        rec: r,
        openOi: ui.openOi,
        found: foundOi(typeId, ocId),
        hrefFor,
        assetHref: (oiId) => inspHref({ typeId, ocId, section: 'object', oiId }),
        // Число заполненных полей у ОИ — по нему видно, что осмотр начат.
        filledFor: (oiId) => filledCount(allFields(typeId, (r.oi || []).find((o) => o.id === oiId)), assetValues(typeId, ocId, oiId)),
        counts,
        backHref: taskHref,
      }));
      return;
    }

    if (section === 'docs') {
      scope.setHTML(docsHTML({ rec: r, docs, hrefFor, counts, backHref: taskHref }));
      return;
    }

    if (section === 'photo') {
      const oiId = ui.photoOi || (oiList[0] ? oiList[0].id : '');
      scope.setHTML(photoHTML({
        groups: photoGroups(r, typeId, ocId),
        total: state.photos.length,
        oiId,
        cat: ui.cat,
        oiList,
        hrefFor,
        counts,
        backHref: taskHref,
        eni: fmtEni(r.eni),
      }));
      return;
    }

    const geo = geoOf(r);
    const ll = parseLL(r.gps) || (geo && geo.extent ? [(geo.extent[1] + geo.extent[3]) / 2, (geo.extent[0] + geo.extent[2]) / 2] : null);
    scope.setHTML(taskHTML({ rec: r, state, hrefFor, counts, backHref: homeHref(), geo, ll, app: navApp(), geoMsg: ui.geoMsg || '' }));
    mountTaskMap(geo, ll);
    fillContour(r, geo);
  }

  // --- поля осмотра -------------------------------------------------------
  //
  // Значения пишет конструктор ядра; экран только решает, перерисовываться ли.
  // На выборе чипа — да: от него зависят счётчики обязательного. На вводе
  // текста — нет, иначе поле теряло бы фокус на каждом символе.
  bindFields(scope, {
    // Функцией, а не объектом: раздел меняется, и значения должны браться на
    // момент события, а не на момент монтажа экрана.
    values: () => assetValues(route.typeId, route.ocId, route.oiId),
    // Перечень полей — по виду открытого ОИ (у каждого вида своя форма).
    fields: () => allFields(route.typeId, curOi()),
    onChange: (field, value, opts) => {
      markSaved();
      // Мультивыбор пересобран на месте — перерисовка закрыла бы список.
      if (opts && opts.inPlace) { refreshSum(); return; }
      if (!opts || !opts.typing) {
        render();
        return;
      }
      // По ходу набора экран не перерисовываем (поле потеряет фокус), но
      // расхождение с документами обновляем сразу: сигнал, который появляется
      // только после сохранения, на осмотре бесполезен.
      if (field.tpFrom) refreshHint(field);
    },
  });

// Обновить подсказку одного поля, не перерисовывая экран.
  function refreshHint(field) {
    const box = scope.$(`[data-fs-field="${field.key}"] .ins-fs-hint`);
    if (!box) return;

    const r = rec();
    const oi = r && (r.oi || []).find((o) => o.id === route.oiId);
    const text = mismatchHint(field, assetValues(route.typeId, route.ocId, route.oiId), oi, { photos: oiPhotos() });
    box.textContent = text;
    box.classList.toggle('warn', /^РАСХОДИТСЯ/.test(text));
    refreshSum();
  }

  // Счётчик заполненного в закреплённой полосе — тоже без перерисовки: он
  // должен идти вместе с вводом, иначе показывает вчерашнее число.
  // Полоса хода под шапкой, строка разделов и «сохранено» — без
  // перерисовки: они идут вместе с вводом, а перерисовка сняла бы фокус.
  function refreshSum() {
    const bar = scope.$('[data-ins-prog]');
    if (!bar) return;
    const values = assetValues(route.typeId, route.ocId, route.oiId);
    const fields = allFields(route.typeId, curOi());
    const filled = filledCount(fields, values);
    bar.style.width = (fields.length ? Math.round((filled / fields.length) * 100) : 0) + '%';
    const nav = scope.$('[data-secnav]');
    const r = rec();
    if (nav && r) {
      const cur = nav.querySelector('[aria-current="true"]');
      const curKey = cur ? cur.dataset.gotoSec : '';
      nav.outerHTML = sectionNavHTML(sections(route.typeId, curOi()), values,
        HAS_PREMISES.includes((curOi() || {}).card || 'building') ? premises(route.typeId, route.ocId, route.oiId).length : null, requiredLeft(fields, values));
      const again = curKey && scope.$(`[data-secnav] [data-goto-sec="${curKey}"]`);
      if (again) again.setAttribute('aria-current', 'true');
    }
    const saved = scope.$('[data-ins-saved]');
    if (saved) saved.textContent = savedTextOf(route.typeId, route.ocId, route.oiId);
  }

  // Открытый ОИ и его снимки — для формы по виду ОИ и правила «нерабочее —
  // только при снимках».
  const curOi = () => { const r = rec(); return r && (r.oi || []).find((o) => o.id === route.oiId); };
  const oiPhotos = () => (route.typeId && route.ocId ? taskState(route.typeId, route.ocId).photos.filter((p) => p.oiId === route.oiId).length : 0);

  // Сохранение — само (макет: значения и так в памяти вкладки). Время
  // последней правки — по ОИ, для отметки «сохранено ЧЧ:ММ» в шапке.
  // ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь уходит черновик осмотра ОИ на сервер (или в
  // очередь отправки, когда нет связи); отметка — по ответу сервера, а без
  // связи — «сохранено на телефоне». Развилка: отправлять каждое изменение
  // или пачкой раз в несколько секунд.
  const savedAt = new Map();
  function markSaved() {
    savedAt.set(`${route.typeId}|${route.ocId}|${route.oiId}`, new Date());
  }
  function savedTextOf(typeId, ocId, oiId) {
    const d = savedAt.get(`${typeId}|${ocId}|${oiId}`);
    return d ? `✓ сохранено ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
  }

  // --- обработчики экранов ------------------------------------------------
  //
  // Вешаются ОДИН раз на корень экрана: разметка переписывается на каждой
  // отрисовке, и слушатели на самих элементах пришлось бы навешивать заново
  // (этим уже отличались заметки и состав в карточках ОИ).

  // Отчёт за день: отметки, поля, снимок, маршрут, отправка.
  const rpToggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  scope.on('click', '[data-rp-place]', (e, el) => { rp.pick = rpToggle(rp.pick, el.dataset.rpPlace); render(); });
  scope.on('click', '[data-rp-done]', (e, el) => { rp.done = rpToggle(rp.done, el.dataset.rpDone); render(); });
  scope.on('click', '[data-rp-noodo]', () => { rp.noOdometer = !rp.noOdometer; rpErr = ''; render(); });
  scope.on('input', '[data-rp]', (e, el) => {
    rp[el.dataset.rp] = el.value;
    if (el.dataset.rp !== 'note') {
      const sum = scope.$('.ins-rp-sum');
      const pv = rpPreview();
      if (sum && pv) sum.innerHTML = `Пробег за день <b>${pv.km} км</b> ${pv.by}${pv.litres !== null ? ` · бензин <b>${pv.litres.toLocaleString('ru-RU')} л</b>` : ''}`;
      else if (!sum && pv) render();
    }
  });
  scope.on('input', '[data-rp-pt]', (e, el) => { rp.route[+el.dataset.rpPt] = el.value; });
  scope.on('click', '[data-rp-pt-add]', () => { rp.route.push(''); render(); const all = scope.$$('[data-rp-pt]'); if (all.length) all[all.length - 1].focus(); });
  scope.on('click', '[data-rp-pt-drop]', (e, el) => { rp.route.splice(+el.dataset.rpPtDrop, 1); render(); });
  const addExtra = () => {
    const inp = scope.$('[data-rp-extra]');
    const v = inp ? inp.value.trim() : '';
    if (!v) { if (inp) inp.focus(); return; }
    if (!rp.extra.includes(v)) rp.extra.push(v);
    render();
  };
  scope.on('click', '[data-rp-extra-add]', addExtra);
  scope.on('keydown', '[data-rp-extra]', (e) => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } });
  scope.on('click', '[data-rp-extra-drop]', (e, el) => { rp.extra = rp.extra.filter((x) => x !== el.dataset.rpExtraDrop); render(); });
  scope.on('click', '[data-rp-shoot]', async () => {
    const file = await pickFile('image/*', { capture: 'environment' });
    if (!file) return;
    if (isFileTooLarge(file)) { host.toast(`Снимок больше ${MAX_DOC_FILE_MB} МБ — уменьшите качество съёмки`, 'warn'); return; }
    const url = await shrink(file);
    if (!url) { host.toast('Снимок не открылся — попробуйте ещё раз', 'warn'); return; }
    rp.photo = url;
    rpErr = '';
    render();
  });
  scope.on('click', '[data-rp-unshoot]', () => { rp.photo = ''; render(); });
  scope.on('click', '[data-rp-send]', () => {
    const miss = rpMissing();
    if (miss) {
      rpErr = miss[0];
      render();
      const el = scope.$(miss[1]);
      if (el) el.focus();
      return;
    }
    const data = {
      person: rp.person, date: rp.date, kind: rp.kind, noOdometer: rp.noOdometer,
      odometer: rp.noOdometer ? '' : String(numOf(rp.odometer)), photo: rp.noOdometer ? '' : rp.photo,
    };
    if (rp.kind === 'morning') {
      const trips = dayTrips(rp.date);
      data.places = [...trips.filter((t) => rp.pick.includes(t.assignId)).map((t) => t.label), ...rp.extra];
    }
    else Object.assign(data, { done: rp.done, note: rp.note.trim(), route: rp.noOdometer ? rp.route.map((x) => x.trim()).filter(Boolean) : [], km: rp.noOdometer ? String(numOf(rp.km)) : '' });
    const had = !!reportOf(rp.person, rp.date, rp.kind);
    saveReport(data);
    host.toast(had ? 'Отчёт сохранён' : `${rp.kind === 'morning' ? 'Утренний' : 'Вечерний'} отчёт сдан`, 'ok');
    rp = null;
    location.hash = INSP_HREF;
  });

  // Запрос документов: итог, файл, дата сканирования, причина, сохранение.
  scope.on('click', '[data-cad-res]', (e, el) => {
    const [rowId, res] = el.dataset.cadRes.split('|');
    cad.rows[rowId].result = res;
    delete cadErr[rowId];
    render();
  });
  scope.on('input', '[data-cad-scan]', (e, el) => { cad.rows[el.dataset.cadScan].scanDate = el.value; });
  scope.on('input', '[data-cad-ans]', (e, el) => { cad.rows[el.dataset.cadAns].answer = el.value; });
  scope.on('click', '[data-cad-file]', async (e, el) => {
    const rowId = el.dataset.cadFile;
    const file = await pickFile('application/pdf');
    if (!file) return;
    if (isFileTooLarge(file)) { host.toast(`Файл больше ${MAX_DOC_FILE_MB} МБ`, 'warn'); return; }
    if (file.type && file.type !== 'application/pdf') { host.toast('Нужен файл PDF', 'warn'); return; }
    cad.rows[rowId].file = file;
    delete cadErr[rowId];
    render();
  });
  scope.on('click', '[data-cad-save]', async (e, el) => {
    const rowId = el.dataset.cadSave;
    const d = cad.rows[rowId];
    const req = cadRequest(cad.id);
    const row = req.rows.find((x) => x.id === rowId);
    let miss = '';
    let at = '';
    if (d.result === 'got' && !d.file && !row.file) { miss = 'Прикрепите PDF'; at = `[data-cad-file="${rowId}"]`; }
    else if (d.result === 'got' && !d.scanDate) { miss = 'Укажите дату сканирования'; at = `[data-cad-scan="${rowId}"]`; }
    else if (d.result !== 'got' && !d.answer.trim()) { miss = 'Укажите причину'; at = `[data-cad-ans="${rowId}"]`; }
    if (miss) { cadErr[rowId] = miss; render(); const x = scope.$(at); if (x) x.focus(); return; }
    await answerCadRow(cad.id, rowId, { result: d.result, scanDate: d.scanDate, answer: d.answer.trim(), file: d.file,
      fileName: cadFileName(row, codeByName(row.inst)) });
    d.file = null;
    delete cadErr[rowId];
    render();
    host.toast(d.result === 'got' ? 'Ответ сохранён, файл — в документах объекта' : 'Ответ сохранён', 'ok');
  });

  scope.on('click', '[data-only]', (e, el) => {
    ui.onlyPending = el.dataset.only === '1';
    render();
  });

  // --- план осмотрщика (вкладка «Сегодня») ---------------------------------
  let planQTimer = 0;
  scope.on('input', '[data-plan-q]', (e, el) => {
    clearTimeout(planQTimer);
    planQTimer = setTimeout(() => { ui.planQ = el.value; ui.planLimit = PLAN_STEP; renderPlanList(); }, 150);
  });
  scope.on('click', '[data-plan-more]', () => { ui.planLimit += PLAN_STEP; renderPlanList(); });
  scope.on('click', '[data-plan-past]', () => { ui.pastOpen = !ui.pastOpen; renderPlanList(); });
  scope.on('click', '[data-plan-take]', (e, el) => {
    const a = assignmentById(el.dataset.planTake);
    if (!a || !isLive(a)) return;
    takeForDay(a.id, isoToday());
    host.toast('Взято на сегодня — регионал увидит, что не по плану', 'ok');
    renderPlanList();
  });
  scope.on('click', '[data-plan-skip]', (e, el) => { ui.skipOpen = el.dataset.planSkip; ui.skipErr = ''; renderPlanList(); });
  scope.on('change', '[data-plan-skip-reason]', () => {
    if (!ui.skipErr) return;
    ui.skipErr = '';
    const er = scope.$('.ins-pl-err');
    if (er) er.remove();
  });
  scope.on('click', '[data-plan-skip-cancel]', () => { ui.skipOpen = ''; ui.skipErr = ''; renderPlanList(); });
  scope.on('click', '[data-plan-skip-go]', (e, el) => {
    const reason = (scope.$('[data-plan-skip-reason]') || {}).value || '';
    const note = ((scope.$('[data-plan-skip-note]') || {}).value || '').trim();
    if (!reason) { ui.skipErr = 'Выберите причину — её получит регионал'; renderPlanList(); return; }
    if (reason === 'Другое' && !note) { ui.skipErr = 'Для «Другое» напишите причину в комментарии'; renderPlanList(); return; }
    skipDay(el.dataset.planSkipGo, isoToday(), reason, note);
    ui.skipOpen = ''; ui.skipErr = '';
    host.toast('Снято с дня, причина отправлена регионалу', 'ok');
    render();
  });

  scope.on('change', '[data-view-as]', (e, el) => {
    setInspector(el.value);
    render();
  });

  scope.on('click', '[data-copy-gps]', async (e, el) => {
    const gps = el.dataset.copyGps;
    try {
      await navigator.clipboard.writeText(gps);
      host.toast('Координаты скопированы', 'ok');
    } catch (err) {
      // Буфер обмена без защищённого соединения недоступен — показываем
      // значение, чтобы его можно было переписать вручную.
      host.toast('Скопировать не удалось: ' + gps, 'warn');
    }
  });

  // Заметку пишем в состояние по ходу ввода и НЕ перерисовываем экран.
  scope.on('input', '[data-own-note]', (e, el) => {
    if (route.typeId && route.ocId) taskState(route.typeId, route.ocId).note = el.value;
  });

  scope.on('click', '[data-toggle-done]', () => {
    const st = taskState(route.typeId, route.ocId);
    st.done = !st.done;
    host.toast(st.done ? 'Осмотр отмечен как завершённый' : 'Отметка снята', 'ok');
    render();
  });

  scope.on('click', '[data-oi]', (e, el) => {
    ui.openOi = ui.openOi === el.dataset.oi ? null : el.dataset.oi;
    render();
  });

  // --- помещения --------------------------------------------------------

  // Свернуть или развернуть раздел формы. По умолчанию открыты все — сворачивает
  // только сам осмотрщик, если раздел ему сейчас не нужен.
  scope.on('click', '[data-sec]', (e, el) => {
    const key = el.dataset.sec;
    const i = ui.collapsed.indexOf(key);
    if (i >= 0) ui.collapsed.splice(i, 1); else ui.collapsed.push(key);
    render();
  });

  scope.on('click', '[data-pm-add]', () => {
    addPremise(route.typeId, route.ocId, route.oiId);
    render();
  });

  scope.on('click', '[data-pm-drop]', (e, el) => {
    removePremise(route.typeId, route.ocId, route.oiId, el.dataset.pmDrop);
    render();
  });

  // Ввод в помещение НЕ перерисовывает экран: иначе поле теряло бы фокус.
  scope.on('input', '[data-pm-name]', (e, el) => {
    const pm = premises(route.typeId, route.ocId, route.oiId)
      .find((x) => x.id === el.dataset.pmName);
    if (pm) pm.name = el.value;
  });

  scope.on('input', '[data-pm-area]', (e, el) => {
    const pm = premises(route.typeId, route.ocId, route.oiId)
      .find((x) => x.id === el.dataset.pmArea);
    if (pm) pm.area = el.value;
  });

  // Переход к разделу из строки разделов: свёрнутый раскрывается, экран
  // прокручивается так, чтобы заголовок раздела встал под строку разделов.
  scope.on('click', '[data-goto-sec]', (e, el) => {
    const key = el.dataset.gotoSec;
    const i = ui.collapsed.indexOf(key);
    if (i >= 0) { ui.collapsed.splice(i, 1); render(); }
    const pane = content();
    if (!pane || !scope.$(`[data-sec-box="${key}"]`)) return;
    const targetOf = () => {
      const nav = scope.$('[data-secnav]');
      const top = nav ? nav.getBoundingClientRect().bottom : 0;
      return pane.scrollTop + scope.$(`[data-sec-box="${key}"]`).getBoundingClientRect().top - top - 8;
    };
    const target = Math.max(0, Math.min(targetOf(), pane.scrollHeight - pane.clientHeight));
    scope.$$('[data-secnav] [data-goto-sec]').forEach((b) => {
      if (b.dataset.gotoSec === key) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    if (Math.abs(target - pane.scrollTop) < 2) { pinned = { key, y: pane.scrollTop }; return; }
    jumping = true;
    // Человек сам прервал переход (колесо, касание, мышь, клавиша — замечание
    // пользователя 14.10.2026): плавную прокрутку останавливаем на месте, и
    // шапка с текущим разделом пересчитываются по тому, где экран встал.
    const BREAK = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    // Ни колесо, ни касание плавную прокрутку сами не прерывают (замер
    // 14.10.2026 в Chromium: переход доезжал до конца, движение колеса
    // пропадало). Касание, мышь, клавиша — останавливаем на месте; колесо —
    // останавливаем и прокручиваем на его величину.
    const interrupt = (e) => {
      if (!jumping) return;
      let y = pane.scrollTop;
      if (e.type === 'wheel') {
        e.preventDefault();
        y += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * pane.clientHeight : e.deltaY;
      }
      pane.scrollTo({ top: y, behavior: 'auto' });
      done(false);
    };
    // reached — переход дошёл до конца: тогда нажатый раздел остаётся
    // отмеченным; прерванный — отмечается тот, где экран встал.
    const done = (reached = true) => {
      if (!jumping) return;
      jumping = false;
      pane.removeEventListener('scrollend', onEnd);
      BREAK.forEach((t) => document.removeEventListener(t, interrupt, true));
      clearTimeout(guard);
      pinned = reached ? { key, y: pane.scrollTop } : null;
      onScroll();
    };
    const onEnd = () => done(Math.abs(pane.scrollTop - target) < 4);
    // scrollend есть не везде — запасной выход по времени.
    const guard = setTimeout(onEnd, 1200);
    pane.addEventListener('scrollend', onEnd);
    // Слушаем весь экран, а не только содержимое: после нажатия на раздел
    // курсор стоит над строкой разделов, вне прокрутки. Колесо — не
    // пассивно: его собственная прокрутка заменяется своей.
    BREAK.forEach((t) => document.addEventListener(t, interrupt, { capture: true, passive: t !== 'wheel' }));
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    pane.scrollTo({ top: target, behavior: still ? 'auto' : 'smooth' });
    if (still) done(true);
  });

  // Контур участка с Кадастра по ЕНИ — на месте, если в карточке его нет.
  scope.on('click', '[data-cad-geo]', async (e, el) => {
    const r = rec();
    if (!r) return;
    el.disabled = true;
    const msg = scope.$('[data-cad-geo-msg]');
    if (msg) msg.textContent = 'Запрашиваю Кадастр…';
    const g = await geoByEni(r.eni);
    if (g.error) {
      ui.geoMsg = `Не получилось: ${g.error}`;
    } else {
      geoMemo.set(route.typeId + '|' + route.ocId, { ...g, by: 'ЕНИ', saved: false });
      ui.geoMsg = '';
    }
    render();
  });

  // «Ехать»: выбор навигатора раскрывается на месте; выбранный запоминается.
  scope.on('click', '[data-go-open]', (e, el) => {
    const pick = scope.$(`[data-go-pick="${el.dataset.goOpen}"]`);
    if (!pick) return;
    pick.hidden = !pick.hidden;
    el.setAttribute('aria-expanded', String(!pick.hidden));
  });
  scope.on('click', '[data-go-app]', (e, el) => {
    if (navApp() === el.dataset.goApp) return;
    setNavApp(el.dataset.goApp);
    // Перерисовка — после перехода по ссылке: кнопки «Ехать» станут прямыми.
    setTimeout(render, 0);
  });

  // ЕНИ в шапке — касанием в буфер: его сверяют и вписывают на месте.
  scope.on('click', '[data-ins-copy]', async (e, el) => {
    try {
      await navigator.clipboard.writeText(el.dataset.insCopy);
      host.toast('ЕНИ скопирован', 'ok');
    } catch (err) {
      host.toast('Скопировать не удалось — ЕНИ виден в шапке', 'warn');
    }
  });

  // --- объекты, выявленные на осмотре -------------------------------------

  scope.on('click', '[data-found-add]', () => {
    const kind = (scope.$('[data-found-kind]') || {}).value;
    addFoundOi(route.typeId, route.ocId, kind);
    host.toast('Объект добавлен и помечен «выявлен на осмотре»', 'ok');
    render();
  });

  scope.on('click', '[data-found-drop]', async (e, el) => {
    const ok = await host.confirm({
      title: 'Убрать объект?',
      text: 'Выявленный объект и всё, что к нему записано, пропадёт.',
      okLabel: 'Убрать', danger: true,
    });
    if (!ok) return;
    removeFoundOi(route.typeId, route.ocId, el.dataset.foundDrop);
    render();
  });

  scope.on('input', '[data-found-name]', (e, el) => {
    const f = foundOi(route.typeId, route.ocId).find((x) => x.id === el.dataset.foundName);
    if (f) f.name = el.value;
  });

  scope.on('input', '[data-found-note]', (e, el) => {
    const f = foundOi(route.typeId, route.ocId).find((x) => x.id === el.dataset.foundNote);
    if (f) f.note = el.value;
  });

  // --- фото ---------------------------------------------------------------

  scope.on('change', '[data-oi-pick]', (e, el) => { ui.photoOi = el.value; });
  scope.on('change', '[data-cat]', (e, el) => { ui.cat = el.value; });

  scope.on('click', '[data-shoot]', async () => {
    const r = rec();
    const oiList = oiOptions(r || {});
    const oiId = ui.photoOi || (oiList[0] ? oiList[0].id : '');
    if (!oiId) {
      host.toast('Не к чему привязать снимок: в объекте нет ОИ', 'warn');
      return;
    }

    const file = await pickFile('image/*', { capture: 'environment' });
    if (!file) return;
    if (isFileTooLarge(file)) {
      host.toast(`Снимок больше ${MAX_DOC_FILE_MB} МБ — уменьшите качество съёмки`, 'warn');
      return;
    }

    const res = addPhoto(route.typeId, route.ocId, file, { oiId, cat: ui.cat });
    if (res.error) {
      host.toast(res.error, 'warn');
      return;
    }
    render();
  });

  scope.on('change', '[data-move]', (e, el) => {
    movePhoto(route.typeId, route.ocId, el.dataset.move, { cat: el.value });
    host.toast('Снимок перенесён в «' + el.value + '»', 'ok');
    closeLightbox();
    render();
  });

  scope.on('change', '[data-move-oi]', (e, el) => {
    movePhoto(route.typeId, route.ocId, el.dataset.moveOi, { oiId: el.value });
    host.toast('Снимок привязан к другому объекту', 'ok');
    closeLightbox();
    render();
  });

  scope.on('click', '[data-drop]', async (e, el) => {
    const ok = await host.confirm({
      title: 'Удалить снимок?',
      text: 'Снимок пропадёт из осмотра. Отменить будет нельзя.',
      okLabel: 'Удалить', danger: true,
    });
    if (!ok) return;
    removePhoto(route.typeId, route.ocId, el.dataset.drop);
    closeLightbox();
    render();
  });

  // Просмотр снимка — слоем поверх, без перехода: осмотрщик открывает снимок,
  // чтобы решить «переснять или нет», и должен вернуться в сетку одним
  // касанием. Здесь же перенос и удаление — в сетке для них нет ширины.
  function closeLightbox() {
    const lb = scope.$('[data-lb]');
    if (lb) lb.remove();
  }

  scope.on('click', '[data-shot]', (e, el) => {
    const p = photoById(route.typeId, route.ocId, el.dataset.shot);
    if (!p) return;
    closeLightbox();
    scope.root.insertAdjacentHTML('beforeend', lightboxHTML(p, oiOptions(rec() || {})));
  });

  scope.on('click', '[data-lb-close]', closeLightbox);
  scope.onDocument('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

  render();

  return {
    onRoute(next) {
      const sameTask = next.typeId === route.typeId && next.ocId === route.ocId;
      // Развёрнутая карта — только на своём экране: любой переход её сворачивает.
      mapBig = false;
      route = next;
      takeAs(next);
      // Открыли другую задачу — раскрытый ОИ от прошлой не нужен.
      if (!sameTask) {
        ui.openOi = null;
        ui.photoOi = '';
      }
      render();
    },
    destroy() {
      closeLightbox();
      window.removeEventListener('resize', placeBig);
      if (taskMap) { taskMap.remove(); taskMap = null; }
    },
  };
}
