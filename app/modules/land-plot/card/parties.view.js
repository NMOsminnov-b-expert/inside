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

// Участник может быть строкой (как заводили раньше) или набором полей.
// Обе формы читаются одинаково — записи из данных переписывать незачем.
//
// pud — правоустанавливающий документ, по которому указана доля: у разных
// собственников одной записи доли нередко идут по разным документам, и без
// ссылки на документ долю не проверить (требование пользователя 09.09.2026).
export function partyOf(x) {
  if (x && typeof x === 'object') {
    return { name: x.name || '', share: x.share || '', pud: x.pud || '' };
  }
  return { name: String(x || ''), share: '', pud: '' };
}

// Подсказки для поля документа — всё, что уже приложено к записи и к её
// объектам имущества.
//
// Список НЕ сужаем по виду документа: долю указывают и по правоустанавливающему
// документу, и по правоудостоверяющему (уточнение пользователя 09.09.2026), а в
// макете вид проставляют не всегда. Отфильтруй мы по виду — нужный документ
// просто не всплыл бы, и человек решил бы, что подсказок нет вовсе.
//
// Возвращаем пары «название + пояснение»: у документов названия похожи, и без
// вида с датой из списка не выбрать. Пояснение участвует и в поиске — набрал
// «акт», нашёл и по виду.
export function docHints(rec) {
  const out = [];
  const seen = new Set();

  const add = (d, where) => {
    if (!d || !d.name || seen.has(d.name)) return;
    seen.add(d.name);
    out.push({ value: d.name, meta: [d.type, d.date, where].filter(Boolean).join(' · ') });
  };

  (rec && rec.docs ? rec.docs : []).forEach((d) => add(d, ''));
  (rec && rec.oi ? rec.oi : []).forEach((oi) => {
    (oi.docs || []).forEach((d) => add(d, oi.letter ? `литера ${oi.letter}` : oi.name));
  });

  return out;
}

export const partiesOf = (list) => (list || []).map(partyOf);

// Имя для поиска и выгрузки: и старая строка, и новая пара дают строку.
export const partyName = (x) => partyOf(x).name;

// Доля бывает записана и процентом, и дробью: «50», «50,5», «1/2», «2/3».
// Дробью её пишут в правоустанавливающих документах, и переводить в проценты
// руками — лишняя работа и лишняя ошибка (требование пользователя 09.09.2026).
//
// Дробь — часть от целого, поэтому в процентах это её значение, умноженное на
// сто: 1/2 → 50. Целое и десятичное по-прежнему читаются как проценты, иначе
// уже введённые «50» стали бы означать пятьдесят долей.
export function parseShare(v) {
  const s = String(v == null ? '' : v).replace(',', '.').replace('%', '').trim();
  if (!s) return 0;

  const frac = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(s);
  if (frac) {
    const den = parseFloat(frac[2]);
    return den ? (parseFloat(frac[1]) / den) * 100 : 0;
  }

  // Единица — это целая доля, весь объект, а не один процент (уточнение
  // пользователя 10.09.2026). Так её и пишут в документах: «доля 1»,
  // «доля 1/2». Остальные числа остаются процентами: «50» — половина, иначе
  // уже введённые проценты сменили бы смысл.
  const n = parseFloat(s);
  if (!n) return 0;
  return n === 1 ? 100 : n;
}

// Записана ли доля дробью — от этого зависит, показывать ли знак процента:
// «1/2 %» читалось бы как полпроцента.
export const isFracShare = (v) => String(v == null ? '' : v).includes('/');

// Сумма долей — рядом с блоками, а не в отчёте: участников вводят по одному, и
// «не хватает 25%» надо видеть при вводе, а не после сохранения.
export function shareSum(list) {
  return partiesOf(list).reduce((a, o) => a + parseShare(o.share), 0);
}

// Дробная сумма долей печаталась как «0.50%»: точка вместо запятой и хвостовой
// ноль. Разделитель в макете везде запятая, а «33,3» человек и вводил — значит
// столько и показываем.
const num = (n) => (Number.isInteger(n)
  ? String(n)
  : n.toFixed(2).replace(/0$/, '').replace('.', ','));

// Подсказка — либо строка, либо пара «значение + пояснение». Пояснение видно
// в списке и участвует в поиске (data-pt-find).
function suggestBox(items, kind = 'name') {
  // Пустой список тоже рисуем: поле остаётся обычным, просто подсказывать пока
  // нечего — документы к записи могли ещё не приложить.
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

// Блок в одну строку: номер, наименование, доля, удаление. Отдельная шапка с
// номером и крестиком забирала строку целиком и раздувала блок вдвое
// (замечание пользователя 09.09.2026 — «нумерацию и удаление компактнее»).
function partyCard(kind, i, p, names, title, docs) {
  return `<div class="pt-card" data-pt-row="${kind}|${i}">
    <span class="pt-n" aria-hidden="true">${i + 1}</span>

    <div class="pt-name">
      <input class="input" data-pt-name="${kind}|${i}" value="${esc(p.name)}"
        placeholder="ФИО или организация" autocomplete="off"
        aria-label="Наименование">
      ${suggestBox(names)}
    </div>

    <div class="pt-share-in ${isFracShare(p.share) ? 'frac' : ''}" data-pt-share-box>
      <input class="input" data-pt-share="${kind}|${i}" value="${esc(p.share)}"
        placeholder="доля" aria-label="Доля — процентом или дробью"
        title="Процентом («50», «33,3»), дробью («1/2», «2/3») или единицей — вся доля целиком">
      <span class="pt-share-u">%</span>
    </div>

    <div class="pt-pud">
      <input class="input" data-pt-pud="${kind}|${i}" value="${esc(p.pud || '')}"
        placeholder="начните вводить" autocomplete="off" aria-label="Документ, по которому указана доля"
        title="Документ, по которому указана доля. Начните вводить — предложим уже прикреплённые">
      ${suggestBox(docs, 'pud')}
    </div>

    <button type="button" class="pt-rm" data-pt-rm="${kind}|${i}"
      title="Убрать: ${esc(title)}" aria-label="Убрать: ${esc(title)}">×</button>
  </div>`;
}

function partySection(kind, list, names, docs, { title, addLabel, empty }) {
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
      ${items.length ? `<div class="pt-head" aria-hidden="true">
        <span></span><span>Наименование</span><span>Доля</span><span>ПУД</span><span></span>
      </div>` : ''}
      ${items.map((p, i) => partyCard(kind, i, p, names, p.name || empty, docs)).join('')}
      <button type="button" class="pt-add" data-pt-add="${kind}">+ ${esc(addLabel)}</button>
    </div>
  </div>`;
}

// names — известные наименования: подсказки собираются из уже заведённых
// собственников и пользователей всех записей (см. partyNames в records.js).
export function ownersUsersHTML(rec, names = PEOPLE) {
  const docs = docHints(rec);
  return `<div class="pt-wrap">
    ${partySection('owner', rec.owners, names, docs, {
    title: 'Собственники', addLabel: 'Собственник', empty: 'собственник',
  })}
    ${partySection('user', rec.users, names, docs, {
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
