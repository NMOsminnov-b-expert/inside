import { esc } from '../../../kernel/dom.js';
import { PEOPLE } from '../data/dictionaries.js';

// Собственники и пользователи — строками, а не тегами с диалогом.
//
// Требование пользователя 09.09.2026: «добавляем без модалок», «у каждого
// собственника есть своя доля, которую можно корректировать», поля —
// «Наименование (с поиском по собственникам и пользователям) и доля».
//
// Почему строки. Тег с крестиком показывает только имя: доле в нём места нет, а
// править имя нельзя вовсе — только удалить и завести заново через диалог.
// Диалог же прерывает работу ради одного поля: человек вносит собственников
// подряд, и каждый раз ждать окна незачем.
//
// Доля есть только у собственника: пользователь владением не делится.

// Строка может быть строкой (как заводили раньше) или парой имя+доля.
// Обе формы читаются одинаково — записи из данных переписывать незачем.
export function partyOf(x) {
  if (x && typeof x === 'object') return { name: x.name || '', share: x.share || '' };
  return { name: String(x || ''), share: '' };
}

export const partiesOf = (list) => (list || []).map(partyOf);

// Имя для поиска и выгрузки: и старая строка, и новая пара дают строку.
export const partyName = (x) => partyOf(x).name;

// Сумма долей — рядом с полями, а не в отчёте: собственников вводят по одному,
// и «не хватает 25%» надо видеть сразу, а не после сохранения.
export function shareSum(owners) {
  return partiesOf(owners)
    .reduce((a, o) => a + (parseFloat(String(o.share).replace(',', '.')) || 0), 0);
}

function suggestBox(names) {
  return `<div class="pt-sug" data-pt-sug hidden>
    ${names.map((n) => `<button type="button" class="pt-sug-o" data-pt-pick="${esc(n)}">${esc(n)}</button>`).join('')}
    <div class="muted pt-sug-none" hidden style="padding:4px 9px">Ничего не найдено</div>
  </div>`;
}

function nameCell(kind, i, value, names) {
  return `<div class="pt-name">
    <input class="input" data-pt-name="${kind}|${i}" value="${esc(value)}"
      placeholder="ФИО или организация" autocomplete="off">
    ${suggestBox(names)}
  </div>`;
}

function ownerRow(o, i, names) {
  return `<div class="pt-row" data-pt-row="owner|${i}">
    ${nameCell('owner', i, o.name, names)}
    <div class="pt-share">
      <input class="input" data-pt-share="${i}" value="${esc(o.share)}"
        inputmode="decimal" placeholder="доля">
      <span class="pt-share-u">%</span>
    </div>
    <button type="button" class="btn btn-danger btn-sm" data-pt-rm="owner|${i}"
      title="Убрать собственника">×</button>
  </div>`;
}

function userRow(u, i, names) {
  return `<div class="pt-row pt-row-user" data-pt-row="user|${i}">
    ${nameCell('user', i, u.name, names)}
    <button type="button" class="btn btn-danger btn-sm" data-pt-rm="user|${i}"
      title="Убрать пользователя">×</button>
  </div>`;
}

// names — известные наименования: подсказки собираются из уже заведённых
// собственников и пользователей всех записей (см. partyNames в records.js).
export function ownersUsersHTML(rec, names = PEOPLE) {
  const owners = partiesOf(rec.owners);
  const users = partiesOf(rec.users);
  const sum = shareSum(rec.owners);
  const badSum = owners.length > 0 && Math.abs(sum - 100) > 0.01;

  // g-top: колонки разной высоты (у собственников строк больше), а .grid по
  // умолчанию равняет по низу — «Пользователи» уезжали вниз.
  return `<div class="grid g-2 g-top pt-grid">
    <div class="field">
      <span class="lbl">Собственники</span>
      <div class="pt-list">
        <div class="pt-head"><span>Наименование</span><span class="pt-head-share">Доля</span></div>
        ${owners.map((o, i) => ownerRow(o, i, names)).join('')
    || '<div class="muted pt-empty">Не указаны</div>'}
        <div class="pt-foot">
          <button type="button" class="btn btn-ghost btn-sm" data-pt-add="owner">+ Собственник</button>
          ${owners.length ? `<span class="pt-sum ${badSum ? 'warn' : ''}">Сумма долей: ${
    Number.isInteger(sum) ? sum : sum.toFixed(2)}%${badSum ? ' — не 100%' : ''}</span>` : ''}
        </div>
      </div>
    </div>

    <div class="field">
      <span class="lbl">Пользователи</span>
      <div class="pt-list">
        ${users.map((u, i) => userRow(u, i, names)).join('')
    || '<div class="muted pt-empty">Не указаны</div>'}
        <div class="pt-foot">
          <button type="button" class="btn btn-ghost btn-sm" data-pt-add="user">+ Пользователь</button>
        </div>
      </div>
    </div>
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
