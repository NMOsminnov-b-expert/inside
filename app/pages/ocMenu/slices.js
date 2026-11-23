import { esc } from '../../kernel/dom.js';
import { emptyFilter, rolePerms } from './state.js';
import { countAll } from './query.js';
import { finishedObjects, liveObjectsOf } from '../../kernel/inspections.js';
import { scanWaitObjects } from '../../kernel/scanQueue.js';

// Срезы — именованные фильтры: пользователь видит не размер базы, а свою
// работу. Две группы одной строкой над таблицей (канва главной 01.10.2026,
// практика reestr-vkladki-vidy-filtry: срез — это вид таблицы, а не
// отдельная карточка): «мои задачи» по роли и «внимание» — что требует
// разбора. У каждой вкладки свои: у движимого нет техпаспорта и ML-импорта
// (пользователь: «По категориям свои»).
//
// short — подпись в строке, label — полное название (подсказка и чип фильтра).
//
// С 23.11.2026 срезы — окном «Срезы» из четырёх групп, как в рабочей системе (снимок пользователя; запись графа
// maket-v-format-rabochey-sistemy-…): «Моя работа», «Требуют внимания», «Не назначены ответственные»,
// «Распознавание ML».
export const SLICE_GROUPS = [
  { key: 'my', label: 'Моя работа', tone: 'blue' },
  { key: 'att', label: 'Требуют внимания', tone: 'amber' },
  { key: 'resp', label: 'Не назначены ответственные', tone: 'red' },
  { key: 'ml', label: 'Распознавание ML', tone: 'violet' },
];
export function sliceDefs(tab) {
  const all = [
    // «Мои осмотры» — только действующие назначения регионала (решение пользователя 06.11.2026
    // «Только назначения»): то же число, что в задачах осмотрщика и в приложении «Осмотр».
    { key: 'my-insp', group: 'my', short: 'Мне осмотреть', label: 'Мне осмотреть', hint: 'назначено мне на осмотр',
      patch: { keys: liveObjectsOf } },
    // Осмотрено — к оценке (решение пользователя 06.11.2026 по оценке после осмотра): осмотр
    // принят ЦОД и объект ещё не в оценке; во вкладке «Результаты осмотра» — дата приёмки,
    // расхождения с карточкой, снимки и «Вернуть на доосмотр».
    { key: 'my-appr', group: 'my', short: 'Мне оценить', label: 'Мне оценить — осмотрено', hint: 'я оценщик · осмотр принят ЦОД',
      patch: { mine: 'appr', status: ['Осмотрен', 'Удостоверен после осмотра', 'Готов к оценке'] } },
    { key: 'my-cod', group: 'my', short: 'Мне удостоверить', label: 'Мне удостоверить', hint: 'я оператор ЦОД · в заполнении',
      patch: { mine: 'cod', status: ['В заполнении'] } },
    // Осмотр закончен, «Осмотрен» не поставлен — ЦОД проверяет результаты
    // (вкладка «Результаты осмотра») и ставит статус (ответ пользователя
    // 30.10.2026 «Вкладка в карточке + срез»).
    { key: 'my-cod-insp', group: 'my', short: 'Осмотр закончен', label: 'Осмотр закончен — проверить', hint: 'я оператор ЦОД · осмотр закончен, «Осмотрен» не поставлен',
      patch: { mine: 'cod', status: ['Удостоверен по документам', 'Направлен на осмотр'], keys: finishedObjects } },
    // Сканы с осмотров и ответы кадастра ждут разбора по записям, где я — оператор ЦОД (находка
    // аудита 30.10: у ЦОД нет среза «ждут сканы»; разбор — на странице «Сканы с осмотров»).
    { key: 'my-cod-scans', group: 'my', short: 'Ждут сканы', label: 'Ждут разбора сканы', hint: 'я оператор ЦОД · сканы с осмотра или ответы кадастра ждут разбора',
      patch: { keys: scanWaitObjects } },
    { key: 'my-all', group: 'my', short: 'Все мои', label: 'Все мои объекты', hint: 'я в любой роли',
      patch: { mine: 'any' } },
    { key: 'notes', group: 'att', short: 'Заметки', label: 'С невыполненными заметками', hint: 'есть незакрытые замечания', dot: 'amber',
      patch: { flags: ['pendingNotes'] } },
    { key: 'defects', group: 'att', short: 'ТП ≠ фото', label: 'Расхождение ТП и фото', hint: 'площадь по техпаспорту расходится с фото — нужна допроверка', dot: 'red', estate: true,
      patch: { flags: ['defects'] } },
    { key: 'stale', group: 'att', short: '30+ дн.', label: 'Без движения 30+ дней', hint: 'не менялись больше 30 дней', dot: 'grey',
      patch: { staleDays: 30 } },
    { key: 'no-cod', group: 'resp', short: 'Не назначен ЦОД', label: 'Не назначен оператор ЦОД', hint: 'у записи нет оператора ЦОД',
      patch: { noResp: 'cod' } },
    { key: 'no-insp', group: 'resp', short: 'Не назначен осмотрщик', label: 'Не назначен осмотрщик', hint: 'у записи нет осмотрщика',
      patch: { noResp: 'insp' } },
    { key: 'no-appr', group: 'resp', short: 'Не назначен оценщик', label: 'Не назначен оценщик', hint: 'у записи нет оценщика',
      patch: { noResp: 'appr' } },
    { key: 'ml', group: 'ml', short: 'ML без проверки', label: 'ML без проверки', hint: 'импорт ML не сверен с документами', dot: 'amber', estate: true,
      patch: { flags: ['mlUnverified'] } },
    { key: 'ml-all', group: 'ml', short: 'Импорт ML', label: 'Импорт ML', hint: 'данные записи пришли распознаванием ML', estate: true,
      patch: { flags: ['ml'] } },
  ];
  return all.filter((d) => !(d.estate && tab !== 'estate'));
}

export function filterForSlice(def, person) {
  const f = emptyFilter();
  const p = def.patch;

  if (p.mine) f.mine = { role: p.mine, person };
  if (p.status) f.status = p.status.slice();
  if (p.flags) f.flags = p.flags.slice();
  if (p.staleDays) f.staleDays = p.staleDays;
  if (p.keys) f.keys = p.keys(person);
  if (p.noResp) f.noResp = p.noResp;

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

// Кнопка «Срезы» и окно под ней: группы карточками 2×2, в строке — срез и число. Число на кнопке — сколько срезов
// «Моя работа» не пусты (как в рабочей системе). Выбранный срез подсвечен; повторное нажатие снимает его.
export function slicesHTML(state, version) {
  const counts = sliceCounts(state, version);
  // Срезы «мне…» — только уместные для роли: остальные роли эту работу не выполняют.
  const allowed = rolePerms(state.role).slices;
  const defs = sliceDefs(state.tab).filter((d) => d.group !== 'my' || allowed.includes(d.key));
  const busy = defs.filter((d) => d.group === 'my' && counts[d.key]).length;
  const cur = defs.find((d) => d.key === state.sliceKey);
  const row = (d) => `<button type="button" class="reg-sl-row ${state.sliceKey === d.key ? 'on' : ''} ${counts[d.key] ? '' : 'zero'}"
      data-slice="${esc(d.key)}" title="${esc(d.label)}: ${esc(d.hint)}" aria-pressed="${state.sliceKey === d.key}">
      <span class="ell">${esc(d.label)}</span><b>${counts[d.key].toLocaleString('ru')}</b></button>`;
  const groups = SLICE_GROUPS.map((g) => ({ g, list: defs.filter((d) => d.group === g.key) })).filter((x) => x.list.length);
  return `<div class="dd reg-slices-dd">
    <button class="btn btn-ghost reg-slices-btn ${cur ? 'on' : ''}" data-dd-toggle aria-haspopup="true" title="${cur ? `Срез: ${esc(cur.label)}` : 'Именованные отборы: моя работа, требуют внимания, без ответственных, ML'}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4"></path></svg>
      Срезы${busy ? ` <span class="reg-slices-n">${busy}</span>` : ''} <span aria-hidden="true">▾</span></button>
    <div class="dd-menu reg-slices-menu" role="menu" aria-label="Срезы">
      ${groups.map(({ g, list }) => `<section class="reg-sl-g reg-sl-${g.tone}" aria-label="${esc(g.label)}">
        <h3>${esc(g.label)}</h3>${list.map(row).join('')}</section>`).join('')}
    </div>
  </div>`;
}

export function sliceLabel(tab, key) {
  const d = sliceDefs(tab).find((x) => x.key === key);
  return d ? d.label : '';
}
