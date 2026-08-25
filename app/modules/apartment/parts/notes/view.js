import { esc } from '../../../../kernel/dom.js';
import { NOTE_DEFAULT } from './store.js';
import { noteCounts, totalPendingNotes } from './model.js';
import { cardMeta } from '../../oi/registry.js';

export function noteRowHTML(scope, n) {
  return `<div class="note-row ${n.done ? 'done' : ''}">
    <input type="checkbox" data-note-check="${scope}|${n.id}" ${n.done ? 'checked' : ''} title="${n.done ? 'Снять отметку — вернуть в работу' : 'Отметить выполненной'}">
    <input class="note-input" data-note-edit="${scope}|${n.id}" value="${esc(n.text)}" placeholder="${NOTE_DEFAULT}" title="Введите текст; если оставить пустым — «${NOTE_DEFAULT}»">
    <span class="note-del" data-note-del="${scope}|${n.id}" title="Удалить">×</span>
  </div>`;
}

export function notesGroupAcc(rec, ui, scope, label, notes, opts = {}) {
  const list = notes || [];
  const { p, d } = noteCounts(rec, scope);
  const open = opts.open !== undefined ? opts.open : ui.accOpen['grp|' + scope] === true;
  const doneOpen = !!ui.doneOpen[scope];

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

// Метка группы для ящика заметок берётся из метаданных карточки ОИ:
// добавление вида ОИ не требует правок здесь.
function oiLabel(oi) {
  return cardMeta(oi).listLabel(oi);
}

export function drawerNotesHTML(rec, ui) {
  const groups = [
    { scope: 'oc', label: 'ОЦ', notes: rec.notes || [] },
    ...rec.oi.map((o) => ({ scope: o.id, label: oiLabel(o), notes: o.notes || [] })),
  ];

  return `<div class="drawer-head">Заметки по объекту</div>`
    + groups.map((g) => `<div class="nb-group">${notesGroupAcc(rec, ui, g.scope, g.label, g.notes)}</div>`).join('');
}

export function drawerCount(rec) {
  return totalPendingNotes(rec);
}
