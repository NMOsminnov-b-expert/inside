import { appState } from '../../core/state.js';
import { toast } from '../../core/utils.js';
import { syncDrawer } from './notesView.js';
import { addNoteToScope, removeNoteFromScope, findNote } from './notesModel.js';
import { NOTE_DEFAULT } from './notesStore.js';
import { updateCtxPlate } from '../../ui/ctxPlate.js';

export function refreshNotesRegion() {
  syncDrawer();
  updateCtxPlate();
}

function handleAddNote(scope) {
  const n = addNoteToScope(scope);
  if (!n) return;
  appState.accOpen['grp|' + scope] = true;
  refreshNotesRegion();
  const inp = document.querySelector(`[data-note-edit="${scope}|${n.id}"]`);
  if (inp) inp.focus();
}

function handleRemoveNote(scope, id) {
  removeNoteFromScope(scope, id);
  refreshNotesRegion();
  toast('Заметка удалена');
}

function toggleDoneList(btn) {
  const scope = btn.dataset.doneToggle;
  appState.doneOpen = appState.doneOpen || {};
  appState.doneOpen[scope] = !appState.doneOpen[scope];
  const list = btn.nextElementSibling;
  if (list && list.classList.contains('done-list')) list.hidden = !appState.doneOpen[scope];
  btn.classList.toggle('open', !!appState.doneOpen[scope]);
}

// Делегированные слушатели блока заметок (регистрируются один раз).
export function initNotesGlobalListeners() {
  document.addEventListener('click', (e) => {
    const addB = e.target.closest('[data-note-add]');
    if (addB) { e.stopImmediatePropagation(); handleAddNote(addB.dataset.noteAdd); return; }
    const delB = e.target.closest('[data-note-del]');
    if (delB) { e.stopImmediatePropagation(); const [s, id] = delB.dataset.noteDel.split('|'); handleRemoveNote(s, id); return; }
    const dt = e.target.closest('[data-done-toggle]');
    if (dt) { e.stopImmediatePropagation(); toggleDoneList(dt); return; }
  });

  document.addEventListener('change', (e) => {
    const chk = e.target.closest('[data-note-check]');
    if (chk) {
      const [s, id] = chk.dataset.noteCheck.split('|');
      const n = findNote(s, id);
      if (n) {
        n.done = chk.checked;
        refreshNotesRegion();
        toast(chk.checked ? 'Заметка выполнена — доступна в «Выполненные», отметку можно снять' : 'Заметка возвращена в работу', 'ok');
      }
      return;
    }
    const ne = e.target.closest('[data-note-edit]');
    if (ne) {
      const [s, id] = ne.dataset.noteEdit.split('|');
      const n = findNote(s, id);
      if (n) {
        const t = ne.value.trim();
        n.text = t || NOTE_DEFAULT;
        if (!t) ne.value = n.text;
      }
      return;
    }
  });

  document.addEventListener('keydown', (e) => {
    const ne = e.target.closest('[data-note-edit]');
    if (ne && e.key === 'Enter') { e.preventDefault(); ne.blur(); }
  });
}