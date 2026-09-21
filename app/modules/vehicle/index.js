import { manifest } from './manifest.js';
import { loadRecord } from './records.js';
import { viewVehicle } from './view.js';
import { bindVehicle } from './ctrl.js';
import { setViewerDeps } from '../../kernel/viewer/deps.js';
import { bindViewerHotkeys } from '../../kernel/viewer/ctrl.js';
import { bindFileDrop } from '../../kernel/viewer/files.js';
import { bindStickyHead } from '../../kernel/stickyHead.js';
import { viewerDeps } from './viewerDeps.js';

function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function main(host) {
  const scope = host.scope;
  let route = host.route;
  let rec = loadRecord(route.ocId);
  // Состояние карточки между отрисовками: открытый документ, режим
  // просмотрщика, свёрнутость шкалы статусов, доли колонок.
  const ui = {};
  const ctx = {
    host, scope, manifest, today: todayStr(), ui, tab: 'general', view: 'oc', oi: null,
    get rec() { return rec; },
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
      route = nextRoute;
      rec = loadRecord(route.ocId);
      draw();
    },
  };
}
