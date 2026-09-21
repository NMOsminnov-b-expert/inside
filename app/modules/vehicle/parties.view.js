import { esc } from '../../kernel/dom.js';
import { pickSearchHTML } from '../../kernel/pickSearch.js';
import { institutionOptions, podvedOptionsOf } from '../../kernel/institutions.js';
import { PEOPLE } from './data/dictionaries.js';

// Блок «Учреждение, собственники и ответственные» — копия блока 01 карточки
// гражданского здания (civil/card/parties.view.js), но без пользователей
// (задача пользователя 21.09.2026 — «по сути копия, но без пользователя»).
//
// Копия, а не общий файл: модули друг из друга не импортируют, а перенос блока
// в ядро затронул бы все пять модулей объектов оценки, где у него свои копии.
// Разметка и классы те же (.pt-*), чтобы блок выглядел одинаково.

// Участник — строка (как заводили раньше) или набор полей.
export function partyOf(x) {
  if (x && typeof x === 'object') {
    return { name: x.name || '', share: x.share || '', pud: x.pud || '' };
  }
  return { name: String(x || ''), share: '', pud: '' };
}

export const partiesOf = (list) => (list || []).map(partyOf);

// Подсказки для документа доли — всё, что приложено к записи.
function docHints(rec) {
  const seen = new Set();
  return (rec.docs || []).filter((d) => d && d.name && !seen.has(d.name) && seen.add(d.name))
    .map((d) => ({ value: d.name, meta: [d.type, d.date].filter(Boolean).join(' · ') }));
}

// Доля — процентом («50», «33,3»), дробью («1/2») или единицей — вся доля.
export function parseShare(v) {
  const s = String(v == null ? '' : v).replace(',', '.').replace('%', '').trim();
  if (!s) return 0;

  const frac = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(s);
  if (frac) {
    const den = parseFloat(frac[2]);
    return den ? (parseFloat(frac[1]) / den) * 100 : 0;
  }

  const n = parseFloat(s);
  if (!n) return 0;
  return n === 1 ? 100 : n;
}

export const isFracShare = (v) => String(v == null ? '' : v).includes('/');

const shareSum = (list) => partiesOf(list).reduce((a, o) => a + parseShare(o.share), 0);

const num = (n) => (Number.isInteger(n)
  ? String(n)
  : n.toFixed(2).replace(/0$/, '').replace('.', ','));

function suggestBox(items, kind = 'name') {
  const opt = (x) => {
    const o = typeof x === 'object' ? x : { value: x, meta: '' };
    return `<button type="button" class="pt-sug-o" data-pt-pick="${esc(o.value)}"
      data-pt-find="${esc((o.value + ' ' + (o.meta || '')).toLowerCase())}">
      <span class="pt-sug-t">${esc(o.value)}</span>
      ${o.meta ? `<span class="pt-sug-m">${esc(o.meta)}</span>` : ''}
    </button>`;
  };

  return `<div class="pt-sug pt-sug-${kind}" data-pt-sug="${kind}" hidden>
    ${items.map(opt).join('')}
    <div class="muted pt-sug-none" hidden style="padding:4px 9px">Ничего не найдено</div>
  </div>`;
}

function partyCard(i, p, names, docs) {
  const title = p.name || 'собственник';
  return `<div class="pt-card" data-pt-row="owner|${i}">
    <span class="pt-n" aria-hidden="true">${i + 1}</span>

    <div class="pt-name">
      <input class="input" data-pt-name="owner|${i}" value="${esc(p.name)}"
        placeholder="ФИО или организация" autocomplete="off"
        aria-label="Наименование">
      ${suggestBox(names)}
    </div>

    <div class="pt-share-in ${isFracShare(p.share) ? 'frac' : ''}" data-pt-share-box>
      <input class="input" data-pt-share="owner|${i}" value="${esc(p.share)}"
        placeholder="доля" aria-label="Доля — процентом или дробью"
        title="Процентом («50», «33,3»), дробью («1/2», «2/3») или единицей — вся доля целиком">
      <span class="pt-share-u">%</span>
    </div>

    <div class="pt-pud">
      <input class="input" data-pt-pud="owner|${i}" value="${esc(p.pud || '')}"
        placeholder="начните вводить" autocomplete="off" aria-label="Документ, по которому указана доля"
        title="Документ, по которому указана доля. Начните вводить — предложим уже прикреплённые">
      ${suggestBox(docs, 'pud')}
    </div>

    <button type="button" class="pt-rm" data-pt-rm="owner|${i}"
      title="Убрать: ${esc(title)}" aria-label="Убрать: ${esc(title)}">×</button>
  </div>`;
}

function ownersHTML(rec, names) {
  const items = partiesOf(rec.owners);
  const sum = shareSum(rec.owners);
  const bad = items.length > 0 && Math.abs(sum - 100) > 0.01;
  const docs = docHints(rec);

  return `<div class="pt-wrap"><div class="pt-sec">
    <div class="sec-h pt-sec-h">
      <span>Собственники</span>
      ${items.length ? `<span class="pt-sum ${bad ? 'warn' : ''}">Доли: ${num(sum)}%${
    bad ? ' — не 100%' : ''}</span>` : ''}
    </div>

    <div class="pt-cards">
      ${items.length ? `<div class="pt-head" aria-hidden="true">
        <span></span><span>Наименование</span><span>Доля</span><span>ПУД</span><span></span>
      </div>` : ''}
      ${items.map((p, i) => partyCard(i, p, names, docs)).join('')}
      <button type="button" class="pt-add" data-pt-add="owner">+ Собственник</button>
    </div>
  </div></div>`;
}

// Ответственные. Пустой пункт «Не назначен» — в отличие от гражданского
// здания: карточка ТС заводится с нуля, и без него список показывал бы первого
// сотрудника, хотя в записи никто не назначен.
function responsiblesHTML(rec) {
  const resp = rec.resp || {};
  const personSelect = (key, label) => `<div class="field"><label for="vh-resp-${key}">${label}</label>
    <select class="select" id="vh-resp-${key}" data-resp="${key}">
      <option value="" ${resp[key] ? '' : 'selected'}>Не назначен</option>
      ${PEOPLE.map((p) => `<option ${p === resp[key] ? 'selected' : ''}>${esc(p)}</option>`).join('')}
    </select></div>`;

  return `<div class="grid g-4">
    ${personSelect('gov', 'Ответственный от гос. учреждения')}
    ${personSelect('cod', 'Оператор ЦОД')}
    ${personSelect('appr', 'Оценщик')}
    ${personSelect('insp', 'Осмотрщик')}
  </div>`;
}

// names — известные наименования собственников (ownerNames в records.js).
export function partiesHTML(rec, idx, names) {
  return `<div class="card t-slate"><div class="card-head"><span class="card-idx">${idx}</span>
    <h3>Учреждение, собственники и ответственные</h3></div>
    <div class="card-pad">
      <div class="grid g-4 g-top">
        <div class="field"><label>Головное учреждение</label>
          ${pickSearchHTML({
    key: 'inst',
    value: rec.institution,
    options: institutionOptions(),
    placeholder: 'Выберите головное учреждение',
    search: 'Поиск по названию или коду…',
  })}</div>
        <div class="field"><label>Подвед</label>
          ${pickSearchHTML({
    key: 'podved',
    value: rec.podved,
    options: podvedOptionsOf(rec.institution),
    placeholder: rec.institution ? 'Выберите подвед' : 'Сначала выберите учреждение',
    search: 'Поиск подведа…',
  })}</div>
      </div>

      ${ownersHTML(rec, names)}

      <div class="sec-h">Ответственные (без юриста)</div>
      ${responsiblesHTML(rec)}
    </div></div>`;
}
