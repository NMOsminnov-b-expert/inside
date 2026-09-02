import { initShell, contentRoot, setCrumbs, setDrawer, updateDrawer, setActiveNav } from '../shell/shell.js';
import { createScope } from './scope.js';
import { start, parse, build, go, MENU_HREF } from './router.js';
import { ensureStyle } from './css.js';
import { toast } from './toast.js';
import { confirmDialog, promptDialog, selectDialog } from './dialog.js';
import { installOverflowTip } from './overflowTip.js';
import { OC_TYPES, getType } from './registry.js';
import { mountOcMenu } from '../pages/ocMenu/ocMenu.js';
import { mountArchive, canViewArchive } from '../pages/archive/archive.js';
import { mountDocs } from '../pages/docs/docs.js';

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
  if (route.name === 'archive') {
    // Доступ к архиву — тот же принцип, что у лога действий: администратор и
    // «любая роль» видят всё, сотрудник — свои учреждения. Кому показывать
    // нечего, тот не должен попасть на экран и по прямой ссылке.
    unmount();
    resetShellSlots();
    setActiveNav('archive');

    const scope = createScope(contentRoot());
    const host = makeHost(route, scope, null);
    await host.ensureStyle('./app/pages/archive/archive.css');

    if (!canViewArchive()) {
      document.body.dataset.page = 'archive';
      scope.setHTML(`<div class="card card-pad">Архив доступен администратору и сотрудникам,
        за которыми закреплены учреждения. Выберите роль или учреждения в реестре объектов оценки.
        <button class="btn btn-ghost btn-sm" data-back-menu style="margin-left:10px">К объектам оценки</button></div>`);
      scope.on('click', '[data-back-menu]', () => go(MENU_HREF));
      current = { kind: 'archive-denied', instance: null, scope };
      return;
    }

    const instance = mountArchive(host);
    current = { kind: 'archive', instance, scope };
    return;
  }

  if (route.name === 'docs') {
    // Реестр «Документы» — виден всем без ограничений (не зависит от типов ОЦ
    // и от учреждений, в отличие от архива).
    if (current && current.kind === 'docs') {
      current.instance.onRoute(route);
      return;
    }
    unmount();
    resetShellSlots();
    setActiveNav('docs');

    const scope = createScope(contentRoot());
    const host = makeHost(route, scope, null);
    await host.ensureStyle('./app/pages/docs/docs.css');

    const instance = mountDocs(host);
    current = { kind: 'docs', instance, scope };
    return;
  }

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
  // Полный текст обрезанного значения при наведении — один механизм на весь
  // проект (Л1.4), см. kernel/overflowTip.js.
  installOverflowTip();
  start((route) => { onRoute(route); });
}

export { OC_TYPES, parse };
