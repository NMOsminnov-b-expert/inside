import { $, esc } from '../kernel/dom.js';
import { createScope } from '../kernel/scope.js';
import { MENU_HREF } from '../kernel/router.js';

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
    };
  });
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
