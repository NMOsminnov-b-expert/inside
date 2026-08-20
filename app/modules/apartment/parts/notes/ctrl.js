import { NOTE_DEFAULT } from './store.js';
import { addNote, removeNote, findNote } from './model.js';

// Слушатели ящика заметок. Регистрируются на скоупе ящика,
// поэтому порядок относительно других слушателей больше ничего не значит.
export function bindDrawerNotes(scope, ctx) {
  const { rec, ui, refresh, toast } = ctx;

  scope.on('click', '[data-note-add]', (e, btn) => {
    const s = btn.dataset.noteAdd;
    const n = addNote(rec, s);
    if (!n) return;
    ui.accOpen['grp|' + s] = true;
    refresh();
    const inp = scope.$(`[data-note-edit="${s}|${n.id}"]`);
    if (inp) inp.focus();
  });

  scope.on('click', '[data-note-del]', (e, btn) => {
    const [s, id] = btn.dataset.noteDel.split('|');
    removeNote(rec, s, id);
    refresh();
    toast('Заметка удалена');
  });

  scope.on('click', '[data-done-toggle]', (e, btn) => {
    const s = btn.dataset.doneToggle;
    ui.doneOpen[s] = !ui.doneOpen[s];
    const list = btn.nextElementSibling;
    if (list && list.classList.contains('done-list')) list.hidden = !ui.doneOpen[s];
    btn.classList.toggle('open', !!ui.doneOpen[s]);
  });

  scope.on('click', '[data-acc-toggle]', (e, head) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    const acc = head.closest('.acc');
    if (!acc) return;
    acc.classList.toggle('open');
    ui.accOpen[head.dataset.accToggle] = acc.classList.contains('open');
  });

  scope.on('change', '[data-note-check]', (e, chk) => {
    const [s, id] = chk.dataset.noteCheck.split('|');
    const n = findNote(rec, s, id);
    if (!n) return;
    n.done = chk.checked;
    refresh();
    toast(chk.checked
      ? 'Заметка выполнена — доступна в «Выполненные», отметку можно снять'
      : 'Заметка возвращена в работу', 'ok');
  });

  scope.on('change', '[data-note-edit]', (e, ne) => {
    const [s, id] = ne.dataset.noteEdit.split('|');
    const n = findNote(rec, s, id);
    if (!n) return;
    const t = ne.value.trim();
    n.text = t || NOTE_DEFAULT;
    if (!t) ne.value = n.text;
  });

  scope.on('keydown', '[data-note-edit]', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });
}
