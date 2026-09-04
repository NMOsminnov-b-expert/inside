import { $, esc } from '../kernel/dom.js';
import { createScope } from '../kernel/scope.js';
import { MENU_HREF, ARCHIVE_HREF, DOCS_HREF, DICTS_HREF, INST_HREF } from '../kernel/router.js';
import { session, seesEverything, myInstitutions } from '../kernel/session.js';
import { archiveCount, subscribe as onArchiveChange } from '../kernel/archive.js';

// Каркас окна. Ничего не знает про ОЦ/ОИ: рисует только то, что ему отдали.
const state = { collapsed: false, drawer: null, drawerOpen: false };
let drawerScope = null;

export function initShell() {
  bindSidebar();
  bindDrawerTab();
  bindNav();
}

function bindNav() {
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.nav === 'oc') location.hash = MENU_HREF;
      if (b.dataset.nav === 'archive') location.hash = ARCHIVE_HREF;
      if (b.dataset.nav === 'docs') location.hash = DOCS_HREF;
      if (b.dataset.nav === 'dict') location.hash = DICTS_HREF;
      if (b.dataset.nav === 'inst') location.hash = INST_HREF;
    };
  });

  // Пункт «Архив» виден только тем, кому есть что в нём смотреть: администратору,
  // роли «любая» и сотруднику с закреплёнными учреждениями. Роль переключается
  // на ходу, поэтому пересчитываем при каждом изменении сессии.
  const archiveBtn = $('[data-nav="archive"]');
  if (archiveBtn) {
    const badge = archiveBtn.querySelector('[data-archive-count]');

    // Число записей, доступных этому сотруднику (без возвращённых) — рядом с
    // пунктом «Архив» (ТЗ docs/tz/20-arhiv.md, §7.9). Пересчитывается и при
    // смене роли/учреждений (archiveCount зависит от них), и при самом
    // архивировании/возврате (archiveStore.subscribe — один источник для всех
    // мест, откуда что-то может уехать в архив).
    const sync = () => {
      archiveBtn.hidden = !(seesEverything() || myInstitutions().length > 0);
      if (!badge) return;
      const n = archiveCount();
      badge.textContent = String(n);
      badge.hidden = n === 0;
    };
    sync();
    session.subscribe(sync);
    onArchiveChange(sync);
  }
}

export function contentRoot() {
  return $('#content');
}

function bindSidebar() {
  const sidebar = $('#appSidebar');
  const toggle = $('[data-sidebar-toggle]');
  if (!sidebar || !toggle) return;

  const apply = () => {
    sidebar.classList.toggle('collapsed', state.collapsed);
    toggle.textContent = state.collapsed ? '▶' : '◀';
    toggle.title = state.collapsed ? 'Развернуть меню' : 'Свернуть меню';
  };

  apply();
  toggle.onclick = () => { state.collapsed = !state.collapsed; apply(); };
}

function bindDrawerTab() {
  const tab = $('[data-notes-toggle]');
  if (!tab) return;

  tab.onclick = () => {
    state.drawerOpen = !state.drawerOpen;
    const dr = $('#notesDrawer');
    if (dr) dr.classList.toggle('open', state.drawerOpen);
  };
}

export function setCrumbs(items = []) {
  const box = $('#crumbs');
  if (!box) return;

  box.innerHTML = items.map((it, i) => {
    const sep = i ? '<span>/</span>' : '';
    if (it.current) return `${sep}<b>${esc(it.label)}</b>`;
    return `${sep}<span data-crumb data-crumb-to="${esc(it.to || MENU_HREF)}">${esc(it.label)}</span>`;
  }).join('');

  box.querySelectorAll('[data-crumb]').forEach((s) => {
    s.onclick = () => { location.hash = s.dataset.crumbTo; };
  });

  // Заголовок вкладки браузера — из крошек: у открытых рядом вкладок иначе
  // одинаковое имя, и найти нужную можно только перебором.
  const here = items.filter((it) => it.label && it.label !== 'Главная');
  const tail = here.length ? here[here.length - 1].label : '';
  document.title = tail ? `${tail} — Inside` : 'Inside — Объекты оценки';
}

// conf = { count: () => number, html: () => string, bind: (scope) => void } | null
export function setDrawer(conf) {
  state.drawer = conf;

  const dr = $('#notesDrawer');
  if (!dr) return;

  if (!conf) {
    dr.classList.add('hidden');
    if (drawerScope) { drawerScope.destroy(); drawerScope = null; }
    return;
  }

  dr.classList.remove('hidden');
  dr.classList.toggle('open', state.drawerOpen);
  updateDrawer();
}

export function updateDrawer() {
  const conf = state.drawer;
  const box = $('#drawerNotes');
  if (!conf || !box) return;

  if (!drawerScope) drawerScope = createScope(box);
  drawerScope.setHTML(conf.html());
  if (conf.bind) conf.bind(drawerScope);

  const badge = $('#drawerCount');
  if (badge && conf.count) {
    const n = conf.count();
    badge.textContent = n;
    badge.className = 'pill-mini ' + (n ? 'pill-pend' : 'pill-done');
  }
}

// Активный пункт бокового меню (пока в макете один рабочий раздел).
export function setActiveNav(key) {
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.nav === key);
  });
}
