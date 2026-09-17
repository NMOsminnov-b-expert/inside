import { manifest } from './manifest.js';
import { loadRecord } from './records.js';
import { viewVehicle } from './view.js';
import { bindVehicle } from './ctrl.js';

function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function main(host) {
  host.ensureStyle('./app/kernel/docViewer.css');
  const scope = host.scope;
  let route = host.route;
  let rec = loadRecord(route.ocId);
  const ctx = {
    host, scope, manifest, today: todayStr(),
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
    scope.setHTML(viewVehicle(ctx));
    bindVehicle(ctx);
  }

  draw();
  return {
    onRoute(nextRoute) {
      route = nextRoute;
      rec = loadRecord(route.ocId);
      draw();
    },
  };
}
