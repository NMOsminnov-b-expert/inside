import { initShell, contentRoot, setCrumbs, setDrawer, updateDrawer, setActiveNav } from '../shell/shell.js';
import { createScope } from './scope.js';
import { start, parse, build, go, MENU_HREF } from './router.js';
import { ensureStyle } from './css.js';
import { toast } from './toast.js';
import { confirmDialog, promptDialog, selectDialog } from './dialog.js';
import { OC_TYPES, getType } from './registry.js';
import { mountOcMenu } from '../pages/ocMenu/ocMenu.js';

let current = null;   // { kind: 'menu' | typeId, instance, scope }

function resetShellSlots() {
  setDrawer(null);
  document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));
}

function unmount() {
  if (!current) return;
  if (current.instance && current.instance.destroy) current.instance.destroy();
  if (current.scope) current.scope.destroy();
  delete document.body.dataset.module;
  delete document.body.dataset.page;
  current = null;
}

function makeHost(route, scope, typeId) {
  return {
    root: scope.root,
    scope,
    route,
    typeId,

    // Навигация
    toMenu: () => go(MENU_HREF),
    navigate: (patch) => go(build({
      typeId: patch.typeId !== undefined ? patch.typeId : typeId,
      ocId: patch.ocId !== undefined ? patch.ocId : route.ocId,
      rest: patch.rest !== undefined ? patch.rest : route.rest,
      query: patch.query !== undefined ? patch.query : {},
    }), { replace: !!patch.replace }),
    hrefFor: (patch) => build({
      typeId: patch.typeId !== undefined ? patch.typeId : typeId,
      ocId: patch.ocId !== undefined ? patch.ocId : route.ocId,
      rest: patch.rest || [],
      query: patch.query || {},
    }),

    // Каркас
    setCrumbs,
    setDrawer,
    updateDrawer,

    // Общий визуал служебных вещей
    toast,
    confirm: confirmDialog,
    prompt: promptDialog,
    select: selectDialog,
    ensureStyle,
  };
}

async function onRoute(route) {
  if (route.name === 'menu') {
    if (current && current.kind === 'menu') {
      current.instance.onRoute(route);
      return;
    }
    unmount();
    resetShellSlots();
    setActiveNav('oc');

    document.body.dataset.page = 'oc-menu';

    const scope = createScope(contentRoot());
    const host = makeHost(route, scope, null);
    const instance = mountOcMenu(host);
    current = { kind: 'menu', instance, scope };
    return;
  }

  const type = getType(route.typeId);

  if (!type) {
    unmount();
    resetShellSlots();
    const scope = createScope(contentRoot());
    scope.setHTML(`<div class="card card-pad">Тип ОЦ «${route.typeId}» не зарегистрирован.
      <button class="btn btn-ghost btn-sm" data-back-menu style="margin-left:10px">В меню</button></div>`);
    scope.on('click', '[data-back-menu]', () => go(MENU_HREF));
    current = { kind: 'missing', instance: null, scope };
    return;
  }

  if (current && current.kind === route.typeId) {
    current.instance.onRoute(route);
    return;
  }

  unmount();
  resetShellSlots();
  setActiveNav('oc');

  const mod = await type.load();
  const scope = createScope(contentRoot());
  const host = makeHost(route, scope, route.typeId);

  document.body.dataset.module = route.typeId;
  await host.ensureStyle(type.styleHref);

  const instance = mod.main(host);
  current = { kind: route.typeId, instance, scope };
}

export function boot() {
  initShell();
  start((route) => { onRoute(route); });
}

export { OC_TYPES, parse };
