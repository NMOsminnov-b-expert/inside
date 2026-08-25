import { esc } from '../../kernel/dom.js';
import { locateAll } from './query.js';

// Локатор: строка, которая распознаёт формат ввода и ведёт прямо в карточку.
// Результат виден сразу в таблице реестра — отдельного списка совпадений
// над ней больше нет (он перекрывал таблицу и дублировал её).
export function locatorHTML(state) {
  return `<div class="reg-locator">
    <span class="reg-locator-ico">🔍</span>
    <input class="input reg-locator-input" data-locator
      value="${esc(state.filter.q)}"
      placeholder="ЕНИ, адрес, учреждение, «лит А» — Enter открывает единственное совпадение, если оно одно"
      autocomplete="off">
    <button class="reg-locator-clear ${state.filter.q ? '' : 'hidden'}" data-locator-clear title="Очистить">×</button>
  </div>`;
}

export function locatorSingle(query) {
  const res = locateAll(query);
  const all = [...res.eni, ...res.address, ...res.institution, ...res.letter];
  return all.length === 1 ? all[0] : null;
}
