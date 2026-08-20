import { esc } from '../../kernel/dom.js';
import { locateAll } from './query.js';

// Локатор: строка, которая распознаёт формат ввода и ведёт прямо в карточку.
// Для тех, кто знает, что ищет, список вообще не нужен.
export function locatorHTML(state) {
  return `<div class="reg-locator">
    <span class="reg-locator-ico">🔍</span>
    <input class="input reg-locator-input" data-locator
      value="${esc(state.filter.q)}"
      placeholder="ЕНИ, адрес, учреждение, «лит А» — Enter открывает единственное совпадение"
      autocomplete="off">
    <button class="reg-locator-clear ${state.filter.q ? '' : 'hidden'}" data-locator-clear title="Очистить">×</button>
    <div class="reg-locator-drop" data-locator-drop hidden></div>
  </div>`;
}

function hint(query) {
  if (/^\d{4,}$/.test(query)) return 'похоже на код ЕНИ';
  if (/^лит(ера)?\s*[а-яa-z]$/i.test(query)) return 'поиск по литере внутри объектов';
  return 'поиск по адресу и учреждению';
}

const GROUPS = [
  { key: 'eni', label: 'По коду ЕНИ' },
  { key: 'address', label: 'По адресу' },
  { key: 'institution', label: 'По учреждению' },
  { key: 'letter', label: 'По литере' },
];

export function locatorDropHTML(query, total) {
  const res = locateAll(query);
  const found = GROUPS.reduce((n, g) => n + res[g.key].length, 0);

  if (!found) {
    return `<div class="reg-drop-empty">Ничего не найдено — ${esc(hint(query))}</div>`;
  }

  const groups = GROUPS.filter((g) => res[g.key].length).map((g) => `
    <div class="reg-drop-group">${esc(g.label)} <span class="tag-mini">${res[g.key].length}</span></div>
    ${res[g.key].map((s) => `<button class="reg-drop-item" data-goto="${esc(s.typeId)}|${esc(s.id)}">
      <span class="reg-drop-ico">${esc(s.typeIcon)}</span>
      <span class="reg-drop-main">
        <b>${esc(s.title)}</b>
        <span>${esc(s.typeLabel)} · ${esc(s.institution || '—')}</span>
      </span>
      <span class="reg-drop-eni">${esc(s.eni)}</span>
      <span class="pill pill-status"><span class="dot"></span>${esc(s.status)}</span>
    </button>`).join('')}
  `).join('');

  return `${groups}
    <button class="reg-drop-all" data-locator-all>Показать все результаты в реестре${total ? ` (${total})` : ''}</button>`;
}

export function locatorSingle(query) {
  const res = locateAll(query);
  const all = [...res.eni, ...res.address, ...res.institution, ...res.letter];
  return all.length === 1 ? all[0] : null;
}
