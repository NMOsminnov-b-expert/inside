import { initShell, contentRoot, setCrumbs, setDrawer, updateDrawer, setActiveNav } from '../shell/shell.js';
import { createScope } from './scope.js';
import { start, parse, build, go, MENU_HREF, INST_HREF, DOCS_HREF } from './router.js';
import { ensureStyle } from './css.js';
import { toast } from './toast.js';
import { confirmDialog, promptDialog, selectDialog } from './dialog.js';
import { installOverflowTip } from './overflowTip.js';
import { installSelectWatcher } from './dropdown.js';
import { setInstitutionProbe, setInstitutionRestorer, setInstitutionBranchRestorer, setDictRestorer } from './archive.js';
import { allNodes, restoreInstitutionEntry, restoreInstitutionBranchByName } from './institutions.js';
import { restoreDictEntry } from './dicts.js';
import { OC_TYPES, getType } from './registry.js';
import { mountOcMenu } from '../pages/ocMenu/ocMenu.js';
import { mountArchive, canViewArchive } from '../pages/archive/archive.js';
import { mountDocs } from '../pages/docs/docs.js';
import { mountDicts } from '../pages/dicts/dicts.js';
import { mountInstitutions } from '../pages/institutions/institutions.js';

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


// --- откуда пришли ---------------------------------------------------------
//
// Карточку ОЦ открывают из двух мест: из реестра объектов и из раздела
// «Учреждения». Путь в крошках и кнопка возврата должны вести туда же, откуда
// пришли, поэтому адрес несёт метку: ?from=inst&node=<id>&name=<название>.
// Название в адресе — чтобы крошка была осмысленной сразу, без обращения к
// дереву учреждений (оно живёт в другом разделе и может быть ещё не собрано).

function origin(route) {
  const q = (route && route.query) || {};
  if (q.from !== 'inst') return null;
  return { node: q.node || '', name: q.name || 'Учреждение' };
}

// kind — куда возвращаться, если метки происхождения нет: 'menu' (реестр
// объектов, по умолчанию) или 'docs' (реестр документов).
function backHref(route, kind) {
  const from = origin(route);
  if (!from) return kind === 'docs' ? DOCS_HREF : MENU_HREF;

  // И идентификатор, и название: id ведёт точно, а название выручает, если
  // страницу успели перезагрузить — узлы дерева живут в памяти вкладки.
  const parts = [];
  if (from.node) parts.push('node=' + encodeURIComponent(from.node));
  if (from.name) parts.push('name=' + encodeURIComponent(from.name));
  return INST_HREF + (parts.length ? '?' + parts.join('&') : '');
}

function backLabel(route, kind) {
  if (origin(route)) return 'К учреждению';
  return kind === 'docs' ? 'К документам' : 'К объектам оценки';
}

function originCrumbs(route, kind) {
  const from = origin(route);
  if (!from) {
    return kind === 'docs'
      ? [{ label: 'Главная', to: MENU_HREF }, { label: 'Документы', to: DOCS_HREF }]
      : [{ label: 'Главная', to: MENU_HREF }, { label: 'Объекты оценки', to: MENU_HREF }];
  }
  return [
    { label: 'Главная', to: MENU_HREF },
    { label: 'Учреждения', to: INST_HREF },
    { label: from.name, to: backHref(route, kind) },
  ];
}

function makeHost(route, scope, typeId) {
  return {
    root: scope.root,
    scope,
    route,
    typeId,

    // Навигация
    toMenu: () => go(backHref(route)),

    // Начало крошек и адрес возврата зависят от того, откуда пришли: из реестра
    // объектов или из раздела «Учреждения» (метка ?from=inst&node=<id> в адресе).
    // Модулю знать про разделы не нужно — он берёт готовое.
    originCrumbs: (kind) => originCrumbs(route, kind),
    backHref: (kind) => backHref(route, kind),
    backLabel: (kind) => backLabel(route, kind),
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
  if (route.name === 'dicts') {
    // Раздел открыт всем: состав перечней полезно видеть и оценщику, чтобы
    // понимать, откуда взялся список. Правит только администратор — это
    // решается внутри экрана (kernel/dicts.js, canEditDicts).
    unmount();
    resetShellSlots();
    const scope = createScope(contentRoot());
    const host = makeHost(route, scope, null);
    await host.ensureStyle('./app/pages/dicts/dicts.css');
    const instance = mountDicts(host);
    current = { kind: 'dicts', instance, scope };
    return;
  }

  if (route.name === 'institutions') {
    // Раздел открыт всем: он только показывает, что уже есть в объектах и
    // документах, и уводит туда же с готовым фильтром.
    unmount();
    resetShellSlots();
    const scope = createScope(contentRoot());
    const host = makeHost(route, scope, null);
    await host.ensureStyle('./app/pages/institutions/institutions.css');
    const instance = mountInstitutions(host);
    current = { kind: 'institutions', instance, scope };
    return;
  }

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
  // Выпадающие списки — свои, а не нативные (kernel/dropdown.js): наблюдатель
  // подхватывает и те, что появляются мимо scope.setHTML.
  installSelectWatcher();
  // Архив спрашивает, живо ли учреждение (возврат объекта после каскада), но
  // не импортирует дерево: иначе получился бы цикл, ведь учреждения зовут
  // архив сами. Проверку связываем здесь, в одной точке сборки.
  setInstitutionProbe((name) => allNodes().some((n) => n.name === name));
  // Возврат учреждения из архива (каскад, §4.4) — тот же приём: дерево само
  // зовёт архив при удалении, обратный импорт замкнул бы цикл.
  setInstitutionRestorer((entry, today) => restoreInstitutionEntry(entry, today));
  // Возврат объекта оценки, чьё учреждение ещё в архиве, поднимает ветку
  // учреждения следом (решение пользователя 04.09.2026) — тот же приём.
  setInstitutionBranchRestorer((name, today) => restoreInstitutionBranchByName(name, today));
  // Возврат справочника из архива (ТЗ §4.5) — та же причина: раздел
  // «Справочники» не знает про архив, а обратный импорт замкнул бы цикл.
  setDictRestorer((entry, today) => restoreDictEntry(entry, today));
  start((route) => { onRoute(route); });
}

export { OC_TYPES, parse };
