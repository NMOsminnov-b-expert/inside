import { esc } from '../../../../kernel/dom.js';
import { numText } from '../../../../kernel/numField.js';
import { fmtNum, num, plural } from '../../../../kernel/fmt.js';
import { MANSARD_TYPE } from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';
import { floorsSum, floorsSumByCat, AREA_FIELDS, AUTO_AREA_FIELDS, FLOOR_CATS, isAutoFilled } from './floors.model.js';

// Развёрткой управляет человек, а не формула (решение пользователя 2026-08-28):
// строку любой категории можно добавить и удалить, имя строки правится прямо в
// таблице — этажи бывают и «−1», и «Цоколь 2», и «Мансарда над пристроем».
// Конструктивный тип мансарды — у каждой мансардной строки: мансарда и
// полумансарда встречаются в одном здании (Л5.3).
//
// ОДНА таблица на всю развёртку (требование пользователя 14.09.2026). Раньше
// каждое размещение было своим блоком со своей таблицей и своей шапкой: доли
// колонок считались отдельно, и у мансардного раздела — где колонок на одну
// больше — они разъезжались, так что «Высота внутр.» в трёх разделах стояла на
// трёх разных местах. Теперь шапка одна, ширины общие, а размещения — группы
// строк внутри таблицы (<tbody>), как это делают в таблицах с подытогами:
// строка-заголовок группы, её строки, строка подытога, а внизу общий итог.
//
// Числа выровнены по правому краю и набраны цифрами одной ширины
// (font-variant-numeric: tabular-nums, см. kernel/cards.css): так разряды
// стоят друг под другом и суммы сравниваются взглядом, без чтения каждой
// цифры. Это же правило действует для подытогов и итога.

// Колонка, по которой считаются все суммы развёртки: та, что делится между
// отмеченными этажами. Ключ берём из описания колонок — поменяется правило,
// и сводка с припиской поедут за ним сами.
const SUM_KEY = (AUTO_AREA_FIELDS[0] || AREA_FIELDS[0]).key;

// Подвижные столбцы развёртки: две площади и две высоты. Порядок человек меняет
// перетаскиванием шапки и он запоминается (требование пользователя 11.09.2026):
// кто-то сверяет по обмеру, кто-то по внешним замерам, и первой должна стоять
// та колонка, по которой работают.
//
// Служебные столбцы — ручка переноса, замок, название строки, тип мансарды и
// удаление — закреплены: они про саму строку, а не про данные.
//
// Подписи высот сокращены с точкой («внешн.», «внутр.»): полностью они
// называются «Высота по внешним замерам» и «Высота по внутренним замерам» —
// так подписаны и поля под таблицей, полное название стоит в подсказке.
const MOVABLE_COLS = [
  ...AREA_FIELDS.map((a) => ({
    key: a.key, kind: 'area', field: a,
    // Подпись колонки короче подписи поля: «Площадь по внутреннему обмеру, м²»
    // в колонку не влезает и переносится на три строки. Полное название —
    // в подсказке заголовка.
    label: a.label.replace('внутреннему обмеру', 'внутр. обмеру')
      .replace('внешним замерам', 'внешн. замерам'),
  })),
  {
    key: 'hExt', label: 'Высота внешн., м', kind: 'height', attr: 'data-floor-hext',
    full: 'высота по внешним замерам',
  },
  {
    key: 'hInt', label: 'Высота внутр., м', kind: 'height', attr: 'data-floor-hint',
    full: 'высота по внутренним замерам',
  },
];

const DEFAULT_COL_ORDER = MOVABLE_COLS.map((c) => c.key);

// Порядок из настроек, очищенный от неизвестного и дополненный недостающим:
// набор колонок мог измениться с тех пор, как человек его двигал.
function colOrder(ctx) {
  const saved = (ctx.ui && ctx.ui.floorCols) || [];
  const known = saved.filter((k) => DEFAULT_COL_ORDER.includes(k));
  return known.concat(DEFAULT_COL_ORDER.filter((k) => !known.includes(k)));
}

// Порядок столбцов наружу: контроллер перекладывает его при перетаскивании.
export function floorColOrder(ctx) {
  return colOrder(ctx);
}

export const FLOOR_COL_KEYS = DEFAULT_COL_ORDER;

function colsOf(ctx) {
  const byKey = new Map(MOVABLE_COLS.map((c) => [c.key, c]));
  return colOrder(ctx).map((k) => byKey.get(k)).filter(Boolean);
}

// Строки размещения вместе с их номерами в общем списке: номер — это ключ, по
// которому контроллер находит строку, и он не должен зависеть от группировки.
function rowsOf(oi, cat) {
  return (oi.floorList || []).map((f, i) => ({ f, i })).filter(({ f }) => f.cat === cat);
}

const catSum = (oi, cat, key) => rowsOf(oi, cat).reduce((s, { f }) => s + num(f[key]), 0);

// В пустом размещении подытог — прочерк, а не «0,00»: ноль читается как
// измеренная величина («подвал есть, площадь нулевая»), прочерк — как «строк
// нет».
const catTotalText = (oi, cat, key) => (rowsOf(oi, cat).length
  ? fmtNum(catSum(oi, cat, key)) : '—');

// Сумма показывается только у площадей: складывать высоты этажей незачем —
// такая величина ничего не значит, а в колонке итога выглядела бы как
// настоящая (частая ошибка таблиц с итогами).
const isSummable = (c) => c.kind === 'area';

function mansardTypeCell(f, i) {
  return `<td><select class="select" data-floor-mansard="${i}" aria-label="Тип мансарды">
${opt('building', 'mansardType', MANSARD_TYPE).map((o) => `<option ${o === (f.mansardType || opt('building', 'mansardType', MANSARD_TYPE)[0]) ? 'selected' : ''}>${o}</option>`).join('')}
</select></td>`;
}

export function floorsCountField(oi) {
  // Приписка прямо под полем (Л2.8): сколько получилось надземных этажей и
  // какая у них площадь. Слово согласовано с числом — «1 этаж», «2 этажа».
  return `<div class="field"><label>Количество этажей</label>
<input class="input" data-floors-n value="${oi.floors}" inputmode="numeric"
  title="Чистые надземные этажи. Подвалы, цоколи и мансарды добавляются в самой развёртке">
<span class="muted floors-note" data-floors-note>${floorsNote(oi)}</span></div>`;
}

// Текст приписки: «2 этажа · 96,40 м²». Отдельной функцией, потому что его же
// обновляет updateFloorsUI после правки площадей.
export function floorsNote(oi) {
  const n = (oi.floorList || []).filter((f) => f.cat === 'over').length;
  const area = floorsSumByCat(oi, 'over', SUM_KEY);
  if (!n) return 'чистых надземных этажей нет';
  return `${n} ${plural(n, 'этаж', 'этажа', 'этажей')} · ${fmtNum(area)} м²`;
}

// Итог — по тем же колонкам, что распределяются: сумма по внутреннему обмеру
// убрана (решение пользователя 09.09.2026). Она повторяется от этажа к этажу,
// ни с чем не сходилась и только краснела. Сама колонка в таблице осталась и
// заполняется руками.
const SUM_FIELDS = AUTO_AREA_FIELDS;

// Состояние сверки по одной колонке: сколько набралось по этажам, сколько
// должно быть и на сколько расходится. Знак diff: плюс — набрали больше итога,
// минус — не хватает.
function sumState(oi, a) {
  const total = num((oi.areas || {})[a.total]);
  const sum = floorsSum(oi, a.key);
  const diff = Math.round((sum - total) * 100) / 100;
  return { total, sum, diff, ok: Math.abs(diff) < 0.01 };
}

// Расхождение словами, а не знаком «+/−»: «не хватает 12,30» сразу говорит,
// куда двигать, а «−12,30» ещё нужно истолковать.
function diffText(diff) {
  if (Math.abs(diff) < 0.01) return 'сходится';
  return (diff < 0 ? 'не хватает ' : 'лишние ') + fmtNum(Math.abs(diff)) + ' м²';
}

// Панель сверки: величина, расхождение и кнопка, которая его устраняет, — в
// одной строке. Кнопка стояла отдельно, и связь между «не сходится» и «чем это
// исправить» приходилось додумывать.
function sumsPanel(oi) {
  const canLevel = (oi.floorList || []).some((f) => f.on);

  const items = SUM_FIELDS.map((a) => {
    const st = sumState(oi, a);
    return `<span class="fs-l">Σ ${a.title}</span>
<span class="fs-v" data-floor-sum="${a.key}">${fmtNum(st.sum)} из ${fmtNum(st.total)} м²</span>
<span class="fs-d ${st.ok ? 'ok' : 'warn'}" data-floor-diff="${a.key}">${diffText(st.diff)}</span>`;
  }).join('');

  // Кнопка заметна, только когда есть что исправлять: при сошедшихся площадях
  // она тихая, иначе тянет внимание на себя без повода.
  const bad = SUM_FIELDS.some((a) => !sumState(oi, a).ok);

  return `<div class="floors-sums" data-floors-sums>
${items}
<button class="btn btn-sm fs-btn ${bad ? 'acc' : ''}" data-redistribute ${canLevel ? '' : 'disabled'}
  title="${canLevel ? 'Разложить оставшуюся площадь между отмеченными этажами поровну'
    : 'Нет отмеченных этажей — распределять не между чем'}">Выровнять отмеченные</button>
</div>`;
}

// Подсказка называет ту колонку, которая на самом деле делится: у литеры это
// площадь по внешним замерам, у квартиры — по внутреннему обмеру. Текст
// собирается из описания колонок (AREA_FIELDS), иначе одна из карточек
// рассказывала бы про чужую площадь.
function floorsTip() {
  const auto = AREA_FIELDS.filter((a) => a.auto).map((a) => a.title);
  const hand = AREA_FIELDS.filter((a) => !a.auto).map((a) => a.title);
  // Второе предложение начинается с названия колонки, поэтому первую букву
  // поднимаем: «площадь по внешним замерам не делится» после точки читалось
  // как обрывок.
  const up = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const handText = hand.length
    ? ` ${up(hand.join(' и '))} не делится — её вводят руками у каждой строки.`
    : '';
  return `<b>Отмеченные этажи</b> делят между собой оставшуюся ${auto.join(' и ')} поровну. `
    + `Снимите отметку, чтобы вписать её вручную.${handText}`;
}

// --- таблица ---------------------------------------------------------------

function headCell(c) {
  const hint = c.kind === 'area'
    ? `Итог по колонке: ${c.field.title}. `
    : `${c.full[0].toUpperCase()}${c.full.slice(1)}. `;
  return `<th data-col="${c.key}" draggable="true" class="fl-num-h" scope="col"
    title="${hint}Перетащите заголовок, чтобы переставить столбец">${c.label}</th>`;
}

function bodyCell(oi, c, f, i) {
  if (c.kind !== 'area') {
    return `<td><input class="input fl-num" ${c.attr}="${i}" value="${esc(numText(f[c.key]))}"
      inputmode="decimal" aria-label="${c.full}, строка «${esc(f.name)}»"></td>`;
  }

  // У единственного надземного этажа площадь по внешним замерам равна
  // площади здания и заполняется сама (правило — floors.model.js).
  const filled = isAutoFilled(oi, f, c.key);
  const locked = filled || (f.on && c.field.auto);
  const title = filled
    ? 'Этаж один — площадь берётся из карточки, из поля «Площадь по внешним замерам»'
    : (f.on && c.field.auto
      ? 'Считается автоматически — снимите отметку, чтобы задать вручную'
      : (c.field.auto ? '' : `Вводится вручную: ${c.field.title} по этажам не распределяется`));

  return `<td><input class="input fl-num" data-floor-area="${c.key}|${i}"
    value="${esc(numText(f[c.key]))}" ${locked ? 'readonly' : ''} title="${title}"
    aria-label="${c.field.title}, строка «${esc(f.name)}»"></td>`;
}

// Группа строк одного размещения: заголовок, строки, подытог. Каждая группа —
// свой <tbody>: он же и место, куда бросают перенесённую строку.
function catGroup(ctx, oi, cat, cols, leftCols, hasMansard) {
  const rows = rowsOf(oi, cat.key);
  const onCount = rows.filter(({ f }) => f.on).length;
  const ckey = `fl|${oi.id}|${cat.key}`;
  // По умолчанию раскрыты чистые надземные: с них начинают, остальные
  // размещения есть не у каждого объекта.
  const open = ctx.ui.accOpen[ckey] === true
    || (ctx.ui.accOpen[ckey] === undefined && cat.key === 'over');
  const wide = cols.length + 1;

  // Подытог стоит в самой строке размещения, в своих колонках: отдельной
  // строкой «Итого · подземные» он удваивал число строк, и таблица читалась
  // как список итогов с редкими данными между ними.
  const head = `<tr class="fl-grp ${open ? 'open' : ''}" data-floor-group="${cat.key}"
  data-floor-group-toggle="${ckey}">
<td class="fl-grip-cell"><span class="chev" aria-hidden="true">▾</span></td>
<td class="fl-lock-cell">${rows.length ? `<input type="checkbox" data-cat-all="${cat.key}"
  ${onCount === rows.length ? 'checked' : ''}
  title="Отметить всё размещение — площадь распределится между его этажами"
  aria-label="Отметить все строки: ${esc(cat.label)}">` : ''}</td>
<td class="fl-grp-name" colspan="${leftCols - 2}">${esc(cat.label)}
  <span class="fl-grp-n" title="строк в размещении">${rows.length}</span></td>
${cols.map((c) => (isSummable(c)
    ? `<td class="fl-num fl-grp-sum" data-cat-sum="${cat.key}|${c.key}"
        title="Итог размещения «${esc(cat.label)}»: ${c.field.title}">${catTotalText(oi, cat.key, c.key)}</td>`
    : '<td></td>')).join('')}
<td class="fl-grp-act"><button class="btn btn-ghost btn-sm" data-add-floor="${cat.key}"
  title="Добавить строку: ${esc(cat.add.toLowerCase())}" aria-label="Добавить: ${esc(cat.add)}">+</button></td>
</tr>`;

  const body = rows.length
    ? rows.map(({ f, i }) => `<tr data-floor-row="${i}" data-floor-of="${cat.key}"
  data-floor-in="${cat.key}" ${open ? '' : 'hidden'}>
<td class="fl-grip-cell"><span class="fl-grip" draggable="true" data-floor-grip="${i}"
  title="Перенести «${esc(f.name)}» в другое размещение — потяните в нужную группу" aria-hidden="true">⠿</span></td>
<td class="fl-lock-cell"><label class="fl-lock" title="${f.on ? 'Заперто: площадь считает распределение. Откройте, чтобы вписать вручную' : 'Открыто: площадь вписывают вручную. Заприте, чтобы её считало распределение'}">
<input type="checkbox" data-floor-on="${i}" ${f.on ? 'checked' : ''} aria-label="Считать площадь автоматически">
<span class="lk" aria-hidden="true"></span></label></td>
<td><input class="input" data-floor-name="${i}" value="${esc(f.name)}"
  title="Название строки — можно править: этаж «−1», «Цоколь 2» и т. п." aria-label="Название строки"></td>
${hasMansard ? (cat.key === 'mansard' ? mansardTypeCell(f, i) : '<td></td>') : ''}
${cols.map((c) => bodyCell(oi, c, f, i)).join('')}
<td class="al-act"><button class="btn btn-danger btn-sm" data-del-floor="${i}" title="Убрать строку">×</button></td>
</tr>`).join('')
    : `<tr class="fl-empty" data-floor-in="${cat.key}" ${open ? '' : 'hidden'}>
<td colspan="${leftCols + wide}">Строк нет. Добавьте кнопкой «+ ${esc(cat.add)}».</td></tr>`;

  return `<tbody class="fl-g" data-floor-drop="${cat.key}">${head}${body}</tbody>`;
}

export function floorsBlock(ctx, oi) {
  const cols = colsOf(ctx);
  // Колонка «Тип мансарды» нужна, только когда мансардные строки есть: пустой
  // столбец во всю таблицу отнимал бы место у площадей ради одной строки.
  const hasMansard = (oi.floorList || []).some((f) => f.cat === 'mansard');
  // Служебные колонки слева: ручка переноса, замок, название (и тип мансарды,
  // когда он показан). От их числа зависят объединения в строках итогов.
  const leftCols = 3 + (hasMansard ? 1 : 0);

  // Колонки — долями от свободного места: так таблица целиком помещается в
  // карточку и при открытом просмотрщике, без горизонтальной прокрутки.
  // Чтобы на широком экране поля не разъезжались «шириной с ладонь», ширину
  // ограничивает само поле (.fl-num в kernel/cards.css), а не колонка: числа
  // остаются рядом друг с другом, прижатые к правому краю.
  const rest = (frac) => `width:calc((100% - 98px) * ${frac})`;
  const w = hasMansard
    ? { name: 0.22, type: 0.16, cell: 0.155 }
    : { name: 0.28, cell: 0.18 };

  const groups = FLOOR_CATS
    .map((cat) => catGroup(ctx, oi, cat, cols, leftCols, hasMansard)).join('');

  const total = `<tfoot><tr class="fl-total">
<td colspan="${leftCols}">Итого по развёртке</td>
${cols.map((c) => (isSummable(c)
    ? `<td class="fl-num" data-floor-total="${c.key}"
        title="Сумма по всем размещениям: ${c.field.title}">${fmtNum(floorsSum(oi, c.key))}</td>`
    : '<td></td>')).join('')}
<td></td></tr></tfoot>`;

  return `${sumsPanel(oi)}
<div class="floors-tip">${floorsTip()}</div>
<div class="fl-wrap">
<table class="tbl al-tbl fl-tbl">
<colgroup><col style="width:26px"><col style="width:36px"><col style="${rest(w.name)}">
${hasMansard ? `<col style="${rest(w.type)}">` : ''}
${cols.map(() => `<col style="${rest(w.cell)}">`).join('')}
<col style="width:36px"></colgroup>
<thead><tr>
<th class="fl-c fl-c-grip" title="Потяните строку за эту ручку, чтобы перенести её в другое размещение"></th>
<th class="fl-c" title="Закрытый замок — площадь считает распределение, открытый — её вписывают вручную">Авто</th>
<th scope="col">Этаж</th>
${hasMansard ? '<th scope="col">Тип мансарды</th>' : ''}
${cols.map(headCell).join('')}
<th class="fl-c"></th>
</tr></thead>
${groups}
${total}
</table>
</div>
<div class="muted" style="font-size:10.5px;margin-top:5px">Название строки правится: этажи бывают «−1», подвалов и цоколей — несколько. Любую строку можно убрать крестиком.</div>`;
}

export function updateFloorsUI(ctx, oi) {
  const s = ctx.scope;

  oi.floorList.forEach((f, i) => {
    AREA_FIELDS.forEach((a) => {
      const el = s.$(`[data-floor-area="${a.key}|${i}"]`);
      if (!el) return;
      // Поле в фокусе не трогаем: человек его правит, и подмена значения под
      // курсором сбила бы ввод. Остальные показываем с разрядами.
      if (document.activeElement !== el) el.value = numText(f[a.key]);
      // Правило одного этажа действует и при обновлении без перерисовки: иначе
      // поле оставалось запертым только до первой правки общей площади.
      el.readOnly = isAutoFilled(oi, f, a.key) || (f.on && a.auto);
    });

    const on = s.$(`[data-floor-on="${i}"]`);
    if (on) on.checked = f.on;
    const he = s.$(`[data-floor-hext="${i}"]`);
    if (he && document.activeElement !== he) he.value = numText(f.hExt);
    const hi = s.$(`[data-floor-hint="${i}"]`);
    if (hi && document.activeElement !== hi) hi.value = numText(f.hInt);
  });

  FLOOR_CATS.forEach((cat) => {
    const rows = oi.floorList.filter((f) => f.cat === cat.key);

    // Подытоги по размещению — по каждой колонке площадей.
    AREA_FIELDS.forEach((a) => {
      const cell = s.$(`[data-cat-sum="${cat.key}|${a.key}"]`);
      if (cell) cell.textContent = catTotalText(oi, cat.key, a.key);
    });

    const n = s.$(`[data-floor-group="${cat.key}"] .fl-grp-n`);
    if (n) n.textContent = String(rows.length);

    const allCb = s.$(`[data-cat-all="${cat.key}"]`);
    if (allCb && rows.length) {
      const onCount = rows.filter((f) => f.on).length;
      allCb.checked = onCount === rows.length;
      allCb.indeterminate = onCount > 0 && onCount < rows.length;
    }
  });

  // Общий итог по развёртке.
  AREA_FIELDS.forEach((a) => {
    const cell = s.$(`[data-floor-total="${a.key}"]`);
    if (cell) cell.textContent = fmtNum(floorsSum(oi, a.key));
  });

  const note = s.$('[data-floors-note]');
  if (note) note.textContent = floorsNote(oi);

  let anyBad = false;
  SUM_FIELDS.forEach((a) => {
    const st = sumState(oi, a);
    if (!st.ok) anyBad = true;

    const sum = s.$(`[data-floor-sum="${a.key}"]`);
    if (sum) sum.textContent = `${fmtNum(st.sum)} из ${fmtNum(st.total)} м²`;

    const d = s.$(`[data-floor-diff="${a.key}"]`);
    if (d) {
      d.textContent = diffText(st.diff);
      d.className = 'fs-d ' + (st.ok ? 'ok' : 'warn');
    }
  });

  const level = s.$('[data-redistribute]');
  if (level) {
    level.classList.toggle('acc', anyBad);
    level.disabled = !(oi.floorList || []).some((f) => f.on);
  }
}

export function rerenderFloors(ctx, oi) {
  const w = ctx.scope.$('#floors-' + oi.id);
  if (w) w.outerHTML = `<div id="floors-${oi.id}" style="margin-top:10px">${floorsBlock(ctx, oi)}</div>`;
}
