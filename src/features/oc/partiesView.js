import { OC } from '../../core/state.js';
import { PEOPLE } from '../../core/dictionaries.js';
import { esc } from '../../core/utils.js';

export function ownersUsersHTML() {
  return `<div class="grid g-2">
    <div class="field"><label>Собственники</label>
      <div class="inline-row">${OC.owners.map((o, i) => `<span class="ms-tag">${esc(o)}<span data-owner-rm="${i}" title="Убрать">×</span></span>`).join('') || '<span class="muted">не указаны</span>'}
      <button class="btn btn-ghost btn-sm" data-add-party="owner">+ Добавить</button></div></div>
    <div class="field"><label>Пользователь</label>
      <div class="inline-row">${OC.users.map((o, i) => `<span class="ms-tag">${esc(o)}<span data-user-rm="${i}" title="Убрать">×</span></span>`).join('') || '<span class="muted">не указан</span>'}
      <button class="btn btn-ghost btn-sm" data-add-party="user">+ Добавить</button></div></div>
  </div>`;
}

export function responsiblesHTML() {
  const personSelect = (key, label) => `<div class="field"><label>${label}</label>
    <select class="select" data-resp="${key}">${PEOPLE.map((p) => `<option ${p === OC.resp[key] ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>`;
  return `<div class="grid g-4">
    ${personSelect('gov', 'Ответственный от гос. учреждения')}
    ${personSelect('cod', 'Оператор ЦОД')}
    ${personSelect('appr', 'Оценщик')}
    ${personSelect('insp', 'Осмотрщик')}
  </div>`;
}