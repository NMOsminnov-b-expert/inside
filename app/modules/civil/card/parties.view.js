import { esc } from '../../../kernel/dom.js';
import { PEOPLE } from '../data/dictionaries.js';

// Собственники и пользователи — блоками, а не строками в общей сетке.
//
// Требования пользователя 09.09.2026: «добавляем без модалок», «разбей на
// логичные блоки, блок состоит из наименования и доли», «доля и у пользователя
// и у собственника есть», «при нажатии добавления добавляется блок».
//
// Почему блок, а не строка. В строке подписи стояли один раз над столбцами, и
// у второго участника было уже не видно, где наименование, а где доля;
// пользователи при этом жили в соседней колонке с другим набором полей, и два
// перечня читались как один сбитый. Блок держит подписи при своих полях и
// нумеруется — на него можно сослаться словами («во втором собственнике»).
//
// Доля есть у обоих: и собственник, и пользователь владеют своей частью.

// Участник может быть строкой (как заводили раньше) или парой имя+доля.
// Обе формы читаются одинаково — записи из данных переписывать незачем.
export function partyOf(x) {
  if (x && typeof x === 'object') return { name: x.name || '', share: x.share || '' };
  return { name: String(x || ''), share: '' };
}

export const partiesOf = (list) => (list || []).map(partyOf);

// Имя для поиска и выгрузки: и старая строка, и новая пара дают строку.
export const partyName = (x) => partyOf(x).name;

// Сумма долей — рядом с блоками, а не в отчёте: участников вводят по одному, и
// «не хватает 25%» надо видеть при вводе, а не после сохранения.
export function shareSum(list) {
  return partiesOf(list)
    .reduce((a, o) => a + (parseFloat(String(o.share).replace(',', '.')) || 0), 0);
}

const num = (n) => (Number.isInteger(n) ? n : n.toFixed(2));

function suggestBox(names) {
  return `<div class="pt-sug" data-pt-sug hidden>
    ${names.map((n) => `<button type="button" class="pt-sug-o" data-pt-pick="${esc(n)}">${esc(n)}</button>`).join('')}
    <div class="muted pt-sug-none" hidden style="padding:4px 9px">Ничего не найдено</div>
  </div>`;
}

// Блок участника: номер, кнопка удаления и два поля со своими подписями.
function partyCard(kind, i, p, names, title) {
  return `<div class="pt-card" data-pt-row="${kind}|${i}">
    <div class="pt-card-h">
      <span class="pt-n">${String(i + 1).padStart(2, '0')}</span>
      <button type="button" class="btn btn-danger btn-sm" data-pt-rm="${kind}|${i}"
        title="Убрать: ${esc(title)}">×</button>
    </div>

    <div class="pt-card-b">
      <div class="field pt-name">
        <label>Наименование</label>
        <input class="input" data-pt-name="${kind}|${i}" value="${esc(p.name)}"
          placeholder="ФИО или организация" autocomplete="off">
        ${suggestBox(names)}
      </div>

      <div class="field pt-share">
        <label>Доля</label>
        <div class="pt-share-in">
          <input class="input" data-pt-share="${kind}|${i}" value="${esc(p.share)}"
            inputmode="decimal" placeholder="0">
          <span class="pt-share-u">%</span>
        </div>
      </div>
    </div>
  </div>`;
}

function partySection(kind, list, names, { title, addLabel, empty }) {
  const items = partiesOf(list);
  const sum = shareSum(list);
  const bad = items.length > 0 && Math.abs(sum - 100) > 0.01;

  return `<div class="pt-sec">
    <div class="sec-h pt-sec-h">
      <span>${esc(title)}</span>
      ${items.length ? `<span class="pt-sum ${bad ? 'warn' : ''}">Доли: ${num(sum)}%${
    bad ? ' — не 100%' : ''}</span>` : ''}
    </div>

    <div class="pt-cards">
      ${items.map((p, i) => partyCard(kind, i, p, names, p.name || empty)).join('')}
      <button type="button" class="pt-add" data-pt-add="${kind}">+ ${esc(addLabel)}</button>
    </div>
  </div>`;
}

// names — известные наименования: подсказки собираются из уже заведённых
// собственников и пользователей всех записей (см. partyNames в records.js).
export function ownersUsersHTML(rec, names = PEOPLE) {
  return `<div class="pt-wrap">
    ${partySection('owner', rec.owners, names, {
    title: 'Собственники', addLabel: 'Собственник', empty: 'собственник',
  })}
    ${partySection('user', rec.users, names, {
    title: 'Пользователи', addLabel: 'Пользователь', empty: 'пользователь',
  })}
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
