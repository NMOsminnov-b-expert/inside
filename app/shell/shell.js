import { $, esc } from '../kernel/dom.js';
import { createScope } from '../kernel/scope.js';
import { MENU_HREF, ARCHIVE_HREF, DOCS_HREF, DICTS_HREF, INST_HREF, INSP_HREF } from '../kernel/router.js';
import { session, seesEverything, myInstitutions, ROLES, roleLabel } from '../kernel/session.js';
import { registerPersisted } from '../kernel/persist.js';

// Каркас окна. Ничего не знает про ОЦ/ОИ: рисует только то, что ему отдали.
const state = { collapsed: false, drawer: null, drawerOpen: false, userExtra: null };
let drawerScope = null;

export function initShell() {
  bindSidebar();
  bindDrawerTab();
  bindNav();
  bindUserMenu();
}

// --- Меню пользователя ---------------------------------------------------------
// Роль и «мои учреждения» — переключатели макета (настоящей авторизации нет,
// kernel/session.js). Раньше они стояли строкой «я: … роль» в рабочей зоне
// реестра и мешали работе; роль общая для всего макета (действует и в
// карточках), поэтому её место — у имени пользователя в шапке (обход главной
// 01.10.2026, практика reestr-vkladki-vidy-filtry). Страница может добавить
// свой раздел (setUserMenuExtra) — у реестра это демо-объём.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: роль и учреждения придут из учётной записи; меню
// останется под профиль и личные настройки. Развилка — дать ли пользователю с
// несколькими ролями переключать их здесь же или входить под нужной.
function userMenuHTML() {
  const st = session.state;
  const showInst = st.role !== 'admin' && st.role !== 'any';
  const extra = state.userExtra ? state.userExtra.html() : '';
  return `<div class="um-h">Роль — только в макете</div>
    ${ROLES.map((r) => `<label class="um-item" title="${esc(r.hint)}"><input type="radio" name="um-role" value="${esc(r.key)}" ${st.role === r.key ? 'checked' : ''}>${esc(r.label[0].toUpperCase() + r.label.slice(1))}</label>`).join('')}
    ${showInst ? `<div class="um-h">Мои учреждения</div>
      <div class="um-pad"><input class="input" data-um-inst placeholder="через запятую" value="${esc((st.institutions || []).join(', '))}"
        title="Сотрудник видит в логе действий и архиве только объекты этих учреждений"></div>` : ''}
    ${extra ? `<div class="um-sep"></div>${extra}` : ''}`;
}

function renderUserMenu() {
  const box = $('[data-user-menu]');
  const role = $('[data-user-role]');
  if (role) role.textContent = '· ' + roleLabel(session.state.role);
  if (!box) return;
  box.innerHTML = userMenuHTML();
  box.querySelectorAll('input[name="um-role"]').forEach((r) => r.onchange = () => session.set({ role: r.value }));
  const inst = box.querySelector('[data-um-inst]');
  if (inst) inst.onchange = () => session.set({ institutions: inst.value.split(',').map((x) => x.trim()).filter(Boolean) });
  if (state.userExtra && state.userExtra.bind) state.userExtra.bind(box);
}

function bindUserMenu() {
  const wrap = $('#userMenu');
  const btn = $('[data-user-toggle]');
  if (!wrap || !btn) return;
  btn.onclick = (e) => {
    e.stopPropagation();
    const open = !wrap.classList.contains('open');
    document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open'));
    wrap.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (open) renderUserMenu();
  };
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && wrap.classList.contains('open')) { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
  });
  session.subscribe(() => renderUserMenu());
  renderUserMenu();
}

// Раздел страницы в меню пользователя: { html: () => string, bind: (box) => void } | null.
export function setUserMenuExtra(conf) {
  state.userExtra = conf;
  renderUserMenu();
}

function bindNav() {
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.nav === 'oc') location.hash = MENU_HREF;
      if (b.dataset.nav === 'archive') location.hash = ARCHIVE_HREF;
      if (b.dataset.nav === 'docs') location.hash = DOCS_HREF;
      if (b.dataset.nav === 'dict') location.hash = DICTS_HREF;
      if (b.dataset.nav === 'inst') location.hash = INST_HREF;
      if (b.dataset.nav === 'insp') location.hash = INSP_HREF;
    };
  });

  // Пункт «Архив» виден только тем, кому есть что в нём смотреть: администратору,
  // роли «любая» и сотруднику с закреплёнными учреждениями. Роль переключается
  // на ходу, поэтому пересчитываем при каждом изменении сессии.
  const archiveBtn = $('[data-nav="archive"]');
  if (archiveBtn) {
    const sync = () => { archiveBtn.hidden = !(seesEverything() || myInstitutions().length > 0); };
    sync();
    session.subscribe(sync);
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

  // Свёрнутое меню переживает перезагрузку: его сворачивают, чтобы освободить
  // место под таблицу, и разворачивать заново после каждого обновления
  // страницы — лишняя работа (замечание пользователя 09.09.2026).
  // Регистрируем ДО apply(): восстановление идёт сразу при регистрации.
  registerPersisted('ui.shell', {
    snapshot: () => ({ collapsed: state.collapsed }),
    restore: (saved) => {
      if (saved && typeof saved.collapsed === 'boolean') state.collapsed = saved.collapsed;
    },
  });

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
  document.title = tail ? `${tail} — E•state` : 'E•state — Объекты оценки';
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
