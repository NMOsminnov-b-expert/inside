import { esc } from '../../../kernel/dom.js';
import { PEOPLE } from '../data/dictionaries.js';

export function ownersUsersHTML(rec) {
  return `<div class="grid g-2">
    <div class="field"><span class="lbl">Собственники</span>
      <div class="inline-row">${rec.owners.map((o, i) => `<span class="ms-tag">${esc(o)}<span data-owner-rm="${i}" title="Убрать">×</span></span>`).join('') || '<span class="muted">не указаны</span>'}
      <button class="btn btn-ghost btn-sm" data-add-party="owner">+ Добавить</button></div></div>
    <div class="field"><span class="lbl">Пользователь</span>
      <div class="inline-row">${rec.users.map((o, i) => `<span class="ms-tag">${esc(o)}<span data-user-rm="${i}" title="Убрать">×</span></span>`).join('') || '<span class="muted">не указан</span>'}
      <button class="btn btn-ghost btn-sm" data-add-party="user">+ Добавить</button></div></div>
  </div>`;
}

export function responsiblesHTML(rec) {
  // label связан с полем через for/id: клик по подписи ставит фокус в список,
  // и программа чтения с экрана называет поле по подписи.
  const personSelect = (key, label) => `<div class="field"><label for="resp-${key}">${label}</label>
    <select class="select" id="resp-${key}" data-resp="${key}">${PEOPLE.map((p) => `<option ${p === rec.resp[key] ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>`;

  return `<div class="grid g-4">
    ${personSelect('gov', 'Ответственный от гос. учреждения')}
    ${personSelect('cod', 'Оператор ЦОД')}
    ${personSelect('appr', 'Оценщик')}
    ${personSelect('insp', 'Осмотрщик')}
  </div>`;
}
