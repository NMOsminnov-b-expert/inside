import { esc } from '../../kernel/dom.js';
import { emptyFilter, rolePerms, isFilterEmpty } from './state.js';
import { countAll } from './query.js';
import { finishedObjects, liveObjectsOf } from '../../kernel/inspections.js';

// Срезы — именованные фильтры: пользователь видит не размер базы, а свою
// работу. Две группы одной строкой над таблицей (канва главной 01.10.2026,
// практика reestr-vkladki-vidy-filtry: срез — это вид таблицы, а не
// отдельная карточка): «мои задачи» по роли и «внимание» — что требует
// разбора. У каждой вкладки свои: у движимого нет техпаспорта и ML-импорта
// (пользователь: «По категориям свои»).
//
// short — подпись в строке, label — полное название (подсказка и чип фильтра).
export function sliceDefs(tab) {
  const all = [
    // «Мои осмотры» — только действующие назначения регионала (решение пользователя 06.11.2026
    // «Только назначения»): то же число, что в задачах осмотрщика и в приложении «Осмотр».
    { key: 'my-insp', group: 'my', short: 'Мне осмотреть', label: 'Мне осмотреть', hint: 'назначено мне на осмотр',
      patch: { keys: liveObjectsOf } },
    { key: 'my-appr', group: 'my', short: 'Мне оценить', label: 'Мне оценить', hint: 'я оценщик · осмотрено',
      patch: { mine: 'appr', status: ['Осмотрен'] } },
    { key: 'my-cod', group: 'my', short: 'Мне удостоверить', label: 'Мне удостоверить', hint: 'я оператор ЦОД · в заполнении',
      patch: { mine: 'cod', status: ['В заполнении'] } },
    // Осмотр закончен, «Осмотрен» не поставлен — ЦОД проверяет результаты
    // (вкладка «Результаты осмотра») и ставит статус (ответ пользователя
    // 30.10.2026 «Вкладка в карточке + срез»).
    { key: 'my-cod-insp', group: 'my', short: 'Осмотр закончен', label: 'Осмотр закончен — проверить', hint: 'я оператор ЦОД · осмотр закончен, «Осмотрен» не поставлен',
      patch: { mine: 'cod', status: ['Удостоверен по документам', 'Направлен на осмотр'], keys: finishedObjects } },
    { key: 'my-all', group: 'my', short: 'Все мои', label: 'Все мои объекты', hint: 'я в любой роли',
      patch: { mine: 'any' } },
    { key: 'notes', group: 'att', short: 'Заметки', label: 'С невыполненными заметками', hint: 'есть незакрытые замечания', dot: 'amber',
      patch: { flags: ['pendingNotes'] } },
    { key: 'defects', group: 'att', short: 'ТП ≠ фото', label: 'Расхождение ТП и фото', hint: 'площадь по техпаспорту расходится с фото — нужна допроверка', dot: 'red', estate: true,
      patch: { flags: ['defects'] } },
    { key: 'ml', group: 'att', short: 'ML', label: 'ML без проверки', hint: 'импорт ML не сверен с документами', dot: 'amber', estate: true,
      patch: { flags: ['mlUnverified'] } },
    { key: 'stale', group: 'att', short: '30+ дн.', label: 'Без движения 30+ дней', hint: 'не менялись больше 30 дней', dot: 'grey',
      patch: { staleDays: 30 } },
  ];
  return all.filter((d) => !(d.estate && tab === 'movable'));
}

export function filterForSlice(def, person) {
  const f = emptyFilter();
  const p = def.patch;

  if (p.mine) f.mine = { role: p.mine, person };
  if (p.status) f.status = p.status.slice();
  if (p.flags) f.flags = p.flags.slice();
  if (p.staleDays) f.staleDays = p.staleDays;
  if (p.keys) f.keys = p.keys(person);

  return f;
}

// Счётчики срезов не зависят от текущего фильтра, поэтому кэшируются и
// пересчитываются при смене данных, вкладки, роли или человека.
let cache = null;
let cacheKey = '';

export function sliceCounts(state, version) {
  const key = [state.person, state.role, state.tab, version].join('|');
  if (cache && cacheKey === key) return cache;

  cache = { all: countAll({ ...emptyFilter(), kind: state.tab }) };
  sliceDefs(state.tab).forEach((d) => { cache[d.key] = countAll({ ...filterForSlice(d, state.person), kind: state.tab }); });
  cacheKey = key;

  return cache;
}

export function invalidateSliceCounts() {
  cache = null;
}

// Срез «Осмотр закончен» зависит от назначений, а не от записей: их смена
// версию данных реестра не двигает — счётчики сбрасываем по событию осмотров
// (kernel/inspections.js, changed()).
window.addEventListener('inside:inspections', invalidateSliceCounts);

export function slicesHTML(state, version) {
  const counts = sliceCounts(state, version);
  // Срезы «мне…» — только уместные для роли: остальные роли эту работу не
  // выполняют, и им незачем предлагать её.
  const allowed = rolePerms(state.role).slices;
  const defs = sliceDefs(state.tab).filter((d) => d.group !== 'my' || allowed.includes(d.key));
  const allOn = !state.sliceKey && isFilterEmpty(state.filter);

  const my = defs.filter((d) => d.group === 'my').map((d) => `<button class="reg-view ${state.sliceKey === d.key ? 'on' : ''} ${counts[d.key] ? '' : 'zero'}"
      data-slice="${esc(d.key)}" title="${esc(d.label)}: ${esc(d.hint)}" aria-pressed="${state.sliceKey === d.key}">
      ${esc(d.short)} <em>${counts[d.key].toLocaleString('ru')}</em></button>`).join('');

  const att = defs.filter((d) => d.group === 'att').map((d) => `<button class="reg-att ${state.sliceKey === d.key ? 'on' : ''} ${counts[d.key] ? '' : 'zero'}"
      data-slice="${esc(d.key)}" title="${esc(d.label)}: ${esc(d.hint)}" aria-pressed="${state.sliceKey === d.key}">
      <i class="dot-${d.dot}" aria-hidden="true"></i>${esc(d.short)} <b>${counts[d.key].toLocaleString('ru')}</b></button>`).join('');

  return `<div class="reg-views" role="group" aria-label="Мои задачи">
      <button class="reg-view ${allOn ? 'on' : ''}" data-view-all aria-pressed="${allOn}" title="Все объекты вкладки, без фильтров">Все <em>${counts.all.toLocaleString('ru')}</em></button>
      ${my}
    </div>
    <div class="reg-views" role="group" aria-label="Требуют внимания">
      <span class="reg-views-sep" aria-hidden="true"></span><span class="reg-views-label">Внимание</span>${att}
    </div>`;
}

export function sliceLabel(tab, key) {
  const d = sliceDefs(tab).find((x) => x.key === key);
  return d ? d.label : '';
}
