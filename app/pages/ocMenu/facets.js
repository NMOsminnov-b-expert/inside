import { esc } from '../../kernel/dom.js';
import { sortedTypes } from '../../kernel/registry.js';
import { FLAG_LABELS } from './state.js';

// Фасеты со счётчиками: сужение выборки вместо прокрутки.
// Счётчик каждого фасета считается без учёта самого этого фасета,
// иначе после первого выбора остальные варианты пропадают.
const SECTIONS = [
  { key: 'typeId', label: 'Тип ОЦ', limit: 8 },
  { key: 'status', label: 'Статус', limit: 8 },
  { key: 'institution', label: 'Учреждение', limit: 6, searchable: true },
  { key: 'city', label: 'Город / район', limit: 6, searchable: true },
  { key: 'insp', label: 'Осмотрщик', limit: 6, searchable: true },
];

const open = { typeId: true, status: true, institution: true, city: true, insp: false };
const expanded = {};
const search = {};

export function toggleSection(key) { open[key] = !open[key]; }
export function toggleExpanded(key) { expanded[key] = !expanded[key]; }
export function setSearch(key, value) { search[key] = value; }
export function sectionSearch(key) { return search[key] || ''; }

function typeLabel(id) {
  const t = sortedTypes().find((x) => x.manifest.id === id);
  return t ? t.manifest.label : id;
}

function optionRows(key, counts, selected) {
  const q = (search[key] || '').toLowerCase();

  let entries = Object.keys(counts)
    .map((v) => ({ value: v, label: key === 'typeId' ? typeLabel(v) : v, n: counts[v] }))
    .filter((e) => e.n > 0 || selected.includes(e.value))
    .filter((e) => !q || e.label.toLowerCase().includes(q));

  entries.sort((a, b) => (b.n - a.n) || a.label.localeCompare(b.label, 'ru'));

  // Выбранные всегда наверху и всегда видны.
  entries.sort((a, b) => (selected.includes(b.value) ? 1 : 0) - (selected.includes(a.value) ? 1 : 0));

  const section = SECTIONS.find((s) => s.key === key);
  const limit = expanded[key] ? entries.length : section.limit;
  const shown = entries.slice(0, limit);
  const rest = entries.length - shown.length;

  return `${shown.map((e) => `<label class="reg-facet-opt ${selected.includes(e.value) ? 'on' : ''}">
      <input type="checkbox" data-facet="${esc(key)}" value="${esc(e.value)}" ${selected.includes(e.value) ? 'checked' : ''}>
      <span class="reg-facet-l" title="${esc(e.label)}">${esc(e.label)}</span>
      <span class="reg-facet-n">${e.n}</span>
    </label>`).join('')}
    ${rest > 0 ? `<button class="reg-facet-more" data-facet-more="${esc(key)}">Показать ещё ${rest}</button>` : ''}
    ${expanded[key] && entries.length > section.limit ? `<button class="reg-facet-more" data-facet-more="${esc(key)}">Свернуть</button>` : ''}`;
}

export function facetsHTML(state, facets) {
  const f = state.filter;

  const sections = SECTIONS.map((s) => `<div class="reg-facet ${open[s.key] ? 'open' : ''}">
    <button class="reg-facet-h" data-facet-toggle="${esc(s.key)}">
      <span class="chev">▾</span>${esc(s.label)}
      ${f[s.key].length ? `<span class="pill-mini pill-pend">${f[s.key].length}</span>` : ''}
    </button>
    <div class="reg-facet-body">
      ${s.searchable ? `<input class="input reg-facet-search" data-facet-search="${esc(s.key)}"
        value="${esc(search[s.key] || '')}" placeholder="фильтр списка…">` : ''}
      ${optionRows(s.key, facets[s.key] || {}, f[s.key])}
    </div>
  </div>`).join('');

  const flagRows = Object.keys(FLAG_LABELS).map((flag) => `<label class="reg-facet-opt ${f.flags.includes(flag) ? 'on' : ''}">
      <input type="checkbox" data-facet="flags" value="${esc(flag)}" ${f.flags.includes(flag) ? 'checked' : ''}>
      <span class="reg-facet-l">${esc(FLAG_LABELS[flag])}</span>
      <span class="reg-facet-n">${facets.flags[flag] || 0}</span>
    </label>`).join('');

  return `<div class="reg-facets-head">
      <b>Фильтры</b>
      <button class="btn btn-ghost btn-sm" data-reset-filters>Сбросить</button>
    </div>
    ${sections}
    <div class="reg-facet open">
      <button class="reg-facet-h" data-facet-toggle="flags"><span class="chev">▾</span>Признаки
        ${f.flags.length ? `<span class="pill-mini pill-pend">${f.flags.length}</span>` : ''}</button>
      <div class="reg-facet-body">${flagRows}</div>
    </div>
    <div class="reg-facet open">
      <button class="reg-facet-h" data-facet-toggle="dates"><span class="chev">▾</span>Давность</button>
      <div class="reg-facet-body">
        <label class="reg-facet-opt ${f.staleDays ? 'on' : ''}">
          <input type="checkbox" data-stale ${f.staleDays ? 'checked' : ''}>
          <span class="reg-facet-l">без движения 30+ дней</span>
        </label>
      </div>
    </div>`;
}
