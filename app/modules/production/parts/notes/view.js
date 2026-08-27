import { esc } from '../../../../kernel/dom.js';
import { NOTE_DEFAULT, NOTE_TEMPLATES } from './store.js';
import { noteCounts, totalPendingNotes } from './model.js';
import { cardMeta } from '../../oi/registry.js';

export function noteRowHTML(scope, n) {
  // Текст остаётся одной строкой, а целиком показывается в окошке при наведении
  // (решение пользователя 2026-08-27: «пускай весь текст показывается в окошке,
  // что бы и интерфейс не перегружать и читать было удобно»). Разворачивание
  // самой строки пробовалось и отклонено — оно раздувало список.
  // Окошко не мешает правке: в фокусе оно скрыто.
  return `<div class="note-row ${n.done ? 'done' : ''}">
    <input type="checkbox" data-note-check="${scope}|${n.id}" ${n.done ? 'checked' : ''} title="${n.done ? 'Снять отметку — вернуть в работу' : 'Отметить выполненной'}">
    <span class="note-body">
      <textarea class="note-input" rows="1" data-note-edit="${scope}|${n.id}"
        placeholder="${NOTE_DEFAULT}" title="${esc(n.text)}">${esc(n.text)}</textarea>
      ${(n.author || n.date) ? `<span class="note-meta">
        <span class="note-author" title="Кто поставил заметку">${esc(n.author || '')}</span>
        <span class="note-date" title="Когда поставлена">${esc(n.date || '')}</span>
      </span>` : ''}
    </span>
    <span class="note-del" data-note-del="${scope}|${n.id}" title="Удалить">×</span>
    ${n.text ? `<span class="note-pop">${esc(n.text)}</span>` : ''}
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
      <span class="note-add-wrap">
        <button class="btn btn-ghost btn-sm note-add-btn" data-note-add="${scope}" title="Добавить заметку">+</button>
        <span class="dd note-tpl-dd">
          <button class="btn btn-ghost btn-sm" data-note-tpl-toggle="${scope}" title="Заметка по шаблону">▾</button>
          <span class="dd-menu note-tpl-menu">
            <span class="dd-group">По шаблону</span>
            ${NOTE_TEMPLATES.map((t) => `<button data-note-tpl="${scope}" data-note-tpl-text="${esc(t)}">${esc(t)}</button>`).join('')}
          </span>
        </span>
      </span>
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
