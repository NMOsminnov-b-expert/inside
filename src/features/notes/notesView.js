import { OC, OI, appState } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { NOTE_DEFAULT } from './notesStore.js';
import { noteCounts, totalPendingNotes } from './notesModel.js';
import { oiLabel } from '../oi/oiModel.js';

export function noteRowHTML(scope, n) {
  return `<div class="note-row ${n.done ? 'done' : ''}">
    <input type="checkbox" data-note-check="${scope}|${n.id}" ${n.done ? 'checked' : ''} title="${n.done ? 'Снять отметку — вернуть в работу' : 'Отметить выполненной'}">
    <input class="note-input" data-note-edit="${scope}|${n.id}" value="${esc(n.text)}" placeholder="${NOTE_DEFAULT}" title="Введите текст; если оставить пустым — «${NOTE_DEFAULT}»">
    <span class="note-del" data-note-del="${scope}|${n.id}" title="Удалить">×</span>
  </div>`;
}

export function notesGroupAcc(scope, label, notes, opts = {}) {
  const list = notes || [];
  const { p, d } = noteCounts(scope);
  const open = opts.open !== undefined ? opts.open : appState.accOpen['grp|' + scope] === true;
  const doneOpen = !!appState.doneOpen[scope];
  return `<div class="acc ${open ? 'open' : ''}">
    <div class="acc-head" data-acc-toggle="grp|${scope}"><span class="chev">▾</span>${label}
      <span class="pill-mini ${p ? 'pill-pend' : 'pill-done'}" data-notecount-pend="${scope}">${p} невып.</span>
      ${d ? `<span class="pill-mini pill-done" data-notecount-done="${scope}">${d} вып.</span>` : ''}
      <button class="btn btn-ghost btn-sm" data-note-add="${scope}" style="margin-left:auto">+ Заметка</button>
    </div>
    <div class="acc-body">
      <div class="notes-list">${list.filter((n) => !n.done).map((n) => noteRowHTML(scope, n)).join('') || `<div class="note-empty">${opts.emptyPending || 'Невыполненных заметок нет.'}</div>`}</div>
      ${d ? `
        <button class="done-toggle ${doneOpen ? 'open' : ''}" data-done-toggle="${scope}" title="Показать/скрыть выполненные; отметку можно снять">
          <span class="chev">▸</span> Выполненные <span class="pill-mini pill-done">${d}</span>
        </button>
        <div class="done-list" ${doneOpen ? '' : 'hidden'}>
          <div class="notes-list">${list.filter((n) => n.done).map((n) => noteRowHTML(scope, n)).join('')}</div>
        </div>` : ''}
    </div>
  </div>`;
}

export function drawerNotesHTML() {
  const groups = [
    { scope: 'oc', label: 'ОЦ', notes: OC.notes || [] },
    ...OI.map((o) => ({ scope: o.id, label: oiLabel(o), notes: o.notes || [] })),
  ];
  return `<div class="drawer-head">Заметки по объекту</div>`
    + groups.map((g) => `<div class="nb-group">${notesGroupAcc(g.scope, g.label, g.notes)}</div>`).join('');
}

export function syncDrawer() {
  const dr = document.getElementById('notesDrawer');
  if (!dr) return;
  const show = (appState.view === 'oc' && appState.tab === 'general') || appState.view === 'oi';
  if (show) {
    dr.classList.remove('hidden');
    dr.classList.toggle('open', appState.notesOpen);
    document.getElementById('drawerNotes').innerHTML = drawerNotesHTML();
    const c = document.getElementById('drawerCount');
    if (c) {
      const tp = totalPendingNotes();
      c.textContent = tp;
      c.className = 'pill-mini ' + (tp ? 'pill-pend' : 'pill-done');
    }
  } else {
    dr.classList.add('hidden');
  }
}