import { manifest } from './manifest.js';
import { loadRecord, mechOf } from './records.js';
import { viewMech } from './view.js';
import { bindMech } from './ctrl.js';
import { setViewerDeps } from '../../kernel/viewer/deps.js';
import { bindViewerHotkeys } from '../../kernel/viewer/ctrl.js';
import { bindFileDrop } from '../../kernel/viewer/files.js';
import { bindStickyHead } from '../../kernel/stickyHead.js';
import { viewerDeps } from './viewerDeps.js';

// ОЦ «Механизмы и оборудование» — устроен как ОЦ «Транспортные средства»
// (vehicle/index.js), решение пользователя 28.09.2026.

function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function main(host) {
  const scope = host.scope;
  let route = host.route;
  // Объектов имущества у ОЦ механизмов нет, но просмотрщик ядра перебирает
  // rec.oi (перенос фото к другой литере, боковая панель) — пустой перечень.
  const load = (id) => { const r = loadRecord(id); if (r) r.oi = r.oi || []; return r; };
  let rec = load(route.ocId);
  const ui = {};
  const ctx = {
    host, scope, manifest, today: todayStr(), ui, tab: 'general', view: 'oc',
    get rec() { return rec; },
    // Снимки единиц держит перечень записи (rec.mech) — просмотрщик ядра берёт
    // их у ctx.oi. Вид экрана остаётся «oc»: документы — объекта оценки.
    get oi() { return rec ? mechOf(rec) : null; },
    get route() { return route; },
    render: () => draw(),
    toast: host.toast,
  };

  function draw() {
    if (!rec) {
      scope.setHTML('<div class="card card-pad">Объект оценки не найден.<button class="btn btn-ghost btn-sm" data-mech-back>В меню</button></div>');
      scope.$('[data-mech-back]').onclick = () => host.toMenu();
      return;
    }
    host.setCrumbs([...host.originCrumbs(), { label: manifest.label, current: true }]);
    host.setDrawer(null);
    // Просмотрщик виден по умолчанию; прячется только крестиком.
    if (!ui.viewerClosed && !ui.viewer) ui.viewer = { mode: 'doc' };
    scope.setHTML(viewMech(ctx));
    bindMech(ctx);
    if (scope.watchStickyHead) scope.watchStickyHead();
    if (scope.syncStickyHead) scope.syncStickyHead();
  }

  setViewerDeps(viewerDeps);
  bindStickyHead(scope);
  bindViewerHotkeys(ctx);
  bindFileDrop(ctx);

  draw();
  return {
    onRoute(nextRoute) {
      route = nextRoute;
      rec = load(route.ocId);
      draw();
    },
  };
}
