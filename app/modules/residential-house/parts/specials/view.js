import { esc } from '../../../../kernel/dom.js';
import { SPECIAL_PLACEHOLDER } from './store.js';
import { specialsOf } from './model.js';

// Блок «Особенности» в карточке ОИ. По образцу бокового окна заметок, но
// нумерация записей вместо чекбоксов: 01, 02, 03… — и дата записи (Л3.6).
export function specialsBlockHTML(oi) {
  const list = specialsOf(oi);

  const rows = list.map((s, i) => `<div class="sp-row">
    <span class="sp-num">${String(i + 1).padStart(2, '0')}</span>
    <input class="sp-input" data-special-edit="${esc(s.id)}" value="${esc(s.text)}"
      placeholder="${SPECIAL_PLACEHOLDER}">
    <span class="sp-date" title="Дата записи">${esc(s.date || '—')}</span>
    <span class="sp-del" data-special-del="${esc(s.id)}" title="Удалить">×</span>
  </div>`).join('');

  return `<div class="sp-block">
    <div class="sec-h">Особенности
      <span class="pill-mini ${list.length ? 'pill-pend' : ''}">${list.length}</span>
      <button class="btn btn-ghost btn-sm" data-special-add style="margin-left:auto">+ Особенность</button>
    </div>
    <div class="sp-list">${rows || '<div class="sp-empty">Особенностей не отмечено.</div>'}</div>
  </div>`;
}
