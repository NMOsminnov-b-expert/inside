import { esc } from '../../kernel/dom.js';
import { emptyFilter, rolePerms } from './state.js';
import { countAll } from './query.js';

// Срезы — именованные фильтры. Это замена «всего объектов N»:
// пользователь видит не размер базы, а свою работу.
export function sliceDefs() {
  return [
    { key: 'my-insp', label: 'Мне осмотреть', hint: 'я осмотрщик · удостоверено по документам',
      patch: { mine: 'insp', status: ['Удостоверен по документам'] } },
    { key: 'my-appr', label: 'Мне оценить', hint: 'я оценщик · осмотрено',
      patch: { mine: 'appr', status: ['Осмотрен'] } },
    { key: 'my-cod', label: 'Мне удостоверить', hint: 'я оператор ЦОД · в заполнении',
      patch: { mine: 'cod', status: ['В заполнении'] } },
    { key: 'my-all', label: 'Все мои объекты', hint: 'я в любой роли',
      patch: { mine: 'any' } },
    { key: 'notes', label: 'С невып. заметками', hint: 'есть незакрытые замечания',
      patch: { flags: ['pendingNotes'] } },
    { key: 'defects', label: 'Расхождение ТП/фото', hint: 'нужна допроверка',
      patch: { flags: ['defects'] } },
    { key: 'ml', label: 'ML без проверки', hint: 'импорт не сверен с документами',
      patch: { flags: ['mlUnverified'] } },
    { key: 'stale', label: 'Без движения 30+ дн.', hint: 'давно не обновлялись',
      patch: { staleDays: 30 } },
  ];
}

export function filterForSlice(def, person) {
  const f = emptyFilter();
  const p = def.patch;

  if (p.mine) f.mine = { role: p.mine, person };
  if (p.status) f.status = p.status.slice();
  if (p.flags) f.flags = p.flags.slice();
  if (p.staleDays) f.staleDays = p.staleDays;

  return f;
}

// Счётчики срезов не зависят от текущего фильтра, поэтому кэшируются
// и пересчитываются только при смене данных, роли или объёма.
let cache = null;
let cacheKey = '';

export function sliceCounts(person, version) {
  const key = person + '|' + version;
  if (cache && cacheKey === key) return cache;

  cache = {};
  sliceDefs().forEach((d) => { cache[d.key] = countAll(filterForSlice(d, person)); });
  cacheKey = key;

  return cache;
}

export function invalidateSliceCounts() {
  cache = null;
}

export function slicesHTML(state, version) {
  const counts = sliceCounts(state.person, version);
  // Показываем только срезы «мне…», уместные для текущей роли — остальные
  // роли эту работу не выполняют, и им незачем предлагать её в списке.
  const allowed = rolePerms(state.role).slices;
  const defs = sliceDefs().filter((d) => !d.key.startsWith('my-') || allowed.includes(d.key));

  return `<div class="reg-slice-row">
    ${defs.map((d) => `<button class="reg-slice ${state.sliceKey === d.key ? 'active' : ''}"
      data-slice="${esc(d.key)}" title="${esc(d.hint)}">
      ${esc(d.label)}
      <b class="${counts[d.key] ? '' : 'zero'}">${counts[d.key]}</b>
    </button>`).join('')}
  </div>`;
}
