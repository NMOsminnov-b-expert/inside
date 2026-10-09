import { manifest } from './manifest.js';
import { loadRecord } from './records.js';
import { viewVehicle } from './view.js';
import { bindVehicle } from './ctrl.js';
import { setViewerDeps } from '../../kernel/viewer/deps.js';
import { bindViewerHotkeys } from '../../kernel/viewer/ctrl.js';
import { bindFileDrop } from '../../kernel/viewer/files.js';
import { bindStickyHead } from '../../kernel/stickyHead.js';
import { viewerDeps } from './viewerDeps.js';
import { photoSetOf } from './photos.js';
import { persistView, VIEWER_KEEP } from '../../kernel/viewState.js';

function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

// Состояние карточки между отрисовками и между заходами: открытый документ,
// режим просмотрщика, свёрнутость шкалы статусов и блоков, доли колонок.
// Живёт на уровне модуля и сохраняется (решение пользователя 09.10.2026: «в
// каком виде мы страницу закрываем, в таком же она потом должна
// открываться», kernel/viewState.js); прежде — внутри монтирования и
// пропадало при каждом уходе с экрана. recId — чья это раскладка: свёртки
// блока сторон, вида объекта и раскрытый модуль решаются для каждой записи
// заново.
const ui = {};
persistView('vehicle', ui, [...VIEWER_KEEP, 'partiesOpen', 'tsKindOpen', 'tsModule', 'tsClosed', 'tsInspect',
  'growSizes', 'recId']);
const RECORD_KEYS = ['partiesOpen', 'tsKindOpen', 'tsModule', 'viewerDoc'];
function forRecord(id) {
  if (ui.recId !== id) RECORD_KEYS.forEach((k) => { delete ui[k]; });
  ui.recId = id;
}

export function main(host) {
  const scope = host.scope;
  let route = host.route;
  // Объектов имущества у ТС нет, но просмотрщик ядра перебирает rec.oi
  // (перенос фото к другой литере, боковая панель) — пустой перечень.
  const load = (id) => { const r = loadRecord(id); if (r) r.oi = r.oi || []; return r; };
  let rec = load(route.ocId);
  forRecord(route.ocId);
  const ctx = {
    host, scope, manifest, today: todayStr(), ui, tab: 'general', view: 'oc',
    get rec() { return rec; },
    // Снимки ТС держит сама запись — просмотрщик ядра берёт их у ctx.oi
    // (photos.js). Вид экрана остаётся «oc»: документы — объекта оценки.
    get oi() { return rec ? photoSetOf(rec) : null; },
    get route() { return route; },
    render: () => draw(),
    toast: host.toast,
  };

  function draw() {
    if (!rec) {
      scope.setHTML('<div class="card card-pad">Объект оценки не найден.<button class="btn btn-ghost btn-sm" data-vehicle-back>В меню</button></div>');
      scope.$('[data-vehicle-back]').onclick = () => host.toMenu();
      return;
    }
    host.setCrumbs([...host.originCrumbs(), { label: manifest.label, current: true }]);
    host.setDrawer(null);
    // Просмотрщик виден по умолчанию; прячется только крестиком.
    if (!ui.viewerClosed && !ui.viewer) ui.viewer = { mode: 'doc' };
    scope.setHTML(viewVehicle(ctx));
    bindVehicle(ctx);
    // Шапка после отрисовки — новый узел: следить за её высотой заново, иначе
    // просмотрщик остаётся со старым отступом и заезжает под шапку (так же
    // делают остальные типы ОЦ; в модуле ТС этого не было).
    if (scope.watchStickyHead) scope.watchStickyHead();
    if (scope.syncStickyHead) scope.syncStickyHead();
  }

  // Просмотрщик живёт в ядре и данные модуля получает отсюда (deps.js).
  setViewerDeps(viewerDeps);
  bindStickyHead(scope);
  bindViewerHotkeys(ctx);
  bindFileDrop(ctx);

  draw();
  return {
    onRoute(nextRoute) {
      // Другая запись — свёртки и раскрытый модуль решаются для неё заново;
      // свёрнутые блоки машины — свои у каждой записи (ui.tsClosed по id).
      forRecord(nextRoute.ocId);
      route = nextRoute;
      rec = load(route.ocId);
      draw();
    },
  };
}
