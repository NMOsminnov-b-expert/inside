import { esc } from '../../kernel/dom.js';
import { locateAll } from './query.js';

// Локатор: строка, которая распознаёт формат ввода и ведёт прямо в карточку.
// Результат виден сразу в таблице реестра — отдельного списка совпадений
// над ней больше нет (он перекрывал таблицу и дублировал её).
export function locatorHTML(state) {
  return `<div class="reg-locator">
    <span class="reg-locator-ico" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg></span>
    <input class="input reg-locator-input" data-locator
      value="${esc(state.filter.q)}"
      placeholder="${state.tab === 'movable' ? 'Марка, рег. номер, VIN, название списка, учреждение' : 'ЕНИ, адрес, учреждение, «лит А»'}"
      aria-label="Поиск по вкладке" title="Enter открывает запись, если найдена одна"
      autocomplete="off">
    <button class="reg-locator-clear ${state.filter.q ? '' : 'hidden'}" data-locator-clear title="Очистить" aria-label="Очистить поиск">×</button>
    <span class="reg-kbd ${state.filter.q ? 'hidden' : ''}" aria-hidden="true">/</span>
  </div>`;
}

export function locatorSingle(query, kind) {
  const res = locateAll(query, kind);
  const all = [...res.eni, ...res.address, ...res.institution, ...res.letter];
  return all.length === 1 ? all[0] : null;
}
