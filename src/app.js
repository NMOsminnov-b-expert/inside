import { $ } from './core/dom.js';
import { appState } from './core/state.js';
import { registerRenderer } from './core/renderer.js';
import { crumbsHTML } from './ui/breadcrumbs.js';
import { ctxPlate } from './ui/ctxPlate.js';
import { bindDropdownToggles } from './ui/dropdowns.js';
import { bindSplitPanes } from './ui/splitPane.js';
import { syncDrawer } from './features/notes/notesView.js';
import { viewOC } from './features/oc/ocView.js';
import { bindOc } from './features/oc/ocController.js';
import { viewOCForm } from './features/oc/ocFormView.js';
import { viewOI } from './features/oi/oiCardView.js';
import { bindOi } from './features/oi/oiController.js';
import { viewMech } from './features/mech/mechView.js';
import { bindMech } from './features/mech/mechController.js';
import { bindViewer } from './features/viewer/viewerController.js';
import { bindPhotoExplorer } from './features/photos/photoExplorer.js';

export function render() {
  const c = $('#content');

  let body = '';

  if (appState.view === 'oc') body = viewOC();
  else if (appState.view === 'oi') body = viewOI();
  else if (appState.view === 'ocform') body = viewOCForm();
  else body = viewMech();

  $('#crumbs').innerHTML = crumbsHTML();

  const plate = ctxPlate();

  c.innerHTML = `<div id="ctxPlateWrap" style="${plate ? '' : 'display:none'}">${plate || ''}</div>` + body;

  syncDrawer();
  bindAll();
}

function bindSidebar() {
  const sidebar = document.getElementById('appSidebar');
  const toggle = document.querySelector('[data-sidebar-toggle]');

  if (!sidebar || !toggle) {
    return;
  }

  sidebar.classList.toggle('collapsed', !!appState.sidebarCollapsed);

  toggle.textContent = appState.sidebarCollapsed ? '▶' : '◀';
  toggle.title = appState.sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню';

  toggle.onclick = () => {
    appState.sidebarCollapsed = !appState.sidebarCollapsed;

    sidebar.classList.toggle('collapsed', appState.sidebarCollapsed);

    toggle.textContent = appState.sidebarCollapsed ? '▶' : '◀';
    toggle.title = appState.sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню';
  };
}

function bindShell() {
  bindSidebar();

  document.querySelectorAll('[data-crumb]').forEach((s) => s.onclick = () => {
    appState.view = 'oc';
    appState.viewer = null;
    appState.tab = 'general';
    render();
  });

  document.querySelectorAll('[data-back]').forEach((b) => b.onclick = () => {
    appState.view = 'oc';
    appState.viewer = null;
    appState.heatOpen = false;
    appState.letterEdit = false;
    render();
  });

  const nt = document.querySelector('[data-notes-toggle]');

  if (nt) {
    nt.onclick = () => {
      appState.notesOpen = !appState.notesOpen;

      const dr = $('#notesDrawer');

      if (dr) {
        dr.classList.toggle('open', appState.notesOpen);
      }
    };
  }
}

function bindAll() {
  bindShell();
  bindDropdownToggles();
  bindOc();
  bindOi();
  bindMech();
  bindViewer();
  bindSplitPanes();
  bindPhotoExplorer();
}

registerRenderer(render);