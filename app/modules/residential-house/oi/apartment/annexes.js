// Пристройки строения — таблицей, как в техпаспорте.
//
// Требование пользователя 09.09.2026: «вбивать таблицей — литеры ж, ж1, ж2,
// выбирать, что это (лоджия, балкон, веранда, терраса или иное), новое
// добавляем плюсиком, материалы как и надо — фундамент, стены, кровля, и
// площадь». Образец — страница техпаспорта «Характеристика строений и
// сооружений»: там каждая пристройка идёт своей строкой со своей литерой.
//
// Что было: три отдельных списка — «Лоджии», «Балконы», «Террасы», у каждого
// только название и площадь. Веранду записать было некуда, литеру — тоже, а
// материалы пристройки нигде не хранились, хотя в техпаспорте они есть.
//
// Площадь здесь — по внешним замерам, как и у самой литеры на этой странице.
// Данные квартиры лежат в oi.apartment, а не в самом объекте имущества:
// карточка квартиры одна на проект и вкладывается в ОИ любого типа. Поэтому
// список пристроек берётся через holder().
import { esc } from '../../../../kernel/dom.js';
import { num, fmtNum } from '../../../../kernel/fmt.js';
import { numText, bindNumField } from '../../../../kernel/numField.js';
import { msDropBodyHTML, bindMsSearch } from '../../../../kernel/multiSelect.js';
import { STRUCT, ANNEX_KINDS } from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';

// Материалы берём из тех же перечней, что и конструктив самой литеры: пристройка
// строится из того же, и второй справочник на те же значения только разошёлся бы
// с первым.
const holder = (oi) => (oi && oi.apartment ? oi.apartment : oi);

const MAT_COLS = [
  { key: 'foundation', label: 'Фундамент', opts: 'foundation' },
  { key: 'walls', label: 'Стены', opts: 'wallsExt' },
  { key: 'roof', label: 'Кровля', opts: 'roof' },
];

export const annexesOf = (oi) => {
  const h = holder(oi);
  return h && Array.isArray(h.annexList) ? h.annexList : [];
};

// Площадей у пристройки две — по внешним замерам и по внутреннему обмеру:
// в техпаспорте есть обе (уточнение пользователя 10.09.2026).
export const ANNEX_AREAS = [
  { key: 'area', label: 'По внешним замерам, м²' },
  { key: 'areaIn', label: 'По внутр. обмеру, м²' },
];

export const annexAreaSum = (oi, key = 'area') =>
  annexesOf(oi).reduce((s, a) => s + num(a[key]), 0);

let seq = 0;
const nextAnnexId = () => `ax-${Date.now().toString(36)}-${++seq}`;

export function addAnnex(oi) {
  const h = holder(oi);
  if (!Array.isArray(h.annexList)) h.annexList = [];
  h.annexList.push({
    id: nextAnnexId(), letter: '', kind: ANNEX_KINDS[0], note: '',
    foundation: [], walls: [], roof: [], area: '', areaIn: '',
  });
}

export function removeAnnex(oi, id) {
  holder(oi).annexList = annexesOf(oi).filter((a) => a.id !== id);
}

// Перевод старых записей: были три списка «лоджии / балконы / террасы» с
// названием и площадью у каждого элемента. Название кладём в уточнение —
// потерять его нельзя, а отдельной колонки под него нет.
//
// Вызывать ДО отрисовки, иначе перевод попадёт в лог правок как правка
// пользователя.
export function migrateAnnexList(oi) {
  const h = holder(oi);
  if (!h) return;

  // Материал стал списком значений — старые строки приводим к массиву. Идёт
  // и для уже переведённых записей: таблица появилась раньше мультивыбора.
  if (Array.isArray(h.annexList)) {
    h.annexList.forEach((a) => {
      ['foundation', 'walls', 'roof'].forEach((k) => {
        if (!Array.isArray(a[k])) a[k] = a[k] ? [a[k]] : [];
      });
      // Вторая площадь появилась позже первой — у прежних строк её нет.
      if (a.areaIn === undefined) a.areaIn = '';
    });
    return;
  }

  const out = [];
  [['loggias', 'Лоджия'], ['balconies', 'Балкон'], ['terraces', 'Терраса']].forEach(([key, kind]) => {
    const list = Array.isArray(h[key]) ? h[key] : [];
    list.forEach((it) => {
      const label = (it.label || '').trim();
      // Название, если оно было, становится видом «Иное» с этим текстом:
      // отдельной колонки под название нет, а выбросить введённое человеком
      // нельзя. Без названия — обычный вид из списка.
      const named = label && label.toLowerCase() !== kind.toLowerCase();
      out.push({
        id: nextAnnexId(),
        letter: '',
        kind: named ? 'Иное' : kind,
        note: named ? label : '',
        foundation: [], walls: [], roof: [],
        area: it.area || '', areaIn: '',
      });
    });
  });

  h.annexList = out;
}

// --- разметка --------------------------------------------------------------
//
// Оформление взято у раздела «Справочники» (pages/dicts): поле в ячейке без
// рамки — она появляется под курсором и становится настоящей при работе, —
// столбцы разделены линиями, новая строка добавляется плюсиком прямо в
// таблице. Замечание пользователя 09.09.2026: с рамкой у каждой ячейки это
// читалось как форма, а не как таблица.
//
// Классы объявлены свои (ax-*), а не взяты из dicts.css: те правила висят на
// body[data-page="dicts"], а карточка — экран модуля.

// Материал пристройки — список значений, а не одно: пристройка бывает из
// нескольких сразу (кирпич и профлист), одним значением это не описать. Форма
// данных та же, что у конструктива литеры (parts/struct/ms.js).
export function annexMats(a, key) {
  const v = a[key];
  if (Array.isArray(v)) return v.filter(Boolean);
  return v ? [v] : [];
}

const matOptions = (col) => opt('apartment', 'struct.' + col.opts, STRUCT[col.opts]) || [];

// Сводка в свёрнутом виде — одной строкой с обрезкой, как в блоке 05: перенос
// раздул бы строку таблицы по высоте. Разделитель « / », а не запятая: в
// названиях материалов запятая встречается сама по себе.
function matSummary(list) {
  const text = list.join(' / ');
  return list.length
    ? `<span class="ms-summary" title="${esc(text)}">${esc(text)}</span><span class="ms-count">${list.length}</span>`
    : '<span class="muted">—</span>';
}

function matDropBody(a, col) {
  return msDropBodyHTML({
    options: matOptions(col),
    selected: annexMats(a, col.key),
    optAttr: 'ax-opt',
    value: (v) => `${col.key}|${a.id}|${v}`,
  });
}

function matCell(a, col) {
  const list = annexMats(a, col.key);

  return `<td><div class="ms ax-ms" data-ax-ms="${col.key}|${a.id}">
<div class="ms-control" data-ms-control data-ms-toggle title="Открыть список материалов">
${matSummary(list)}
<span class="chev">▾</span>
</div>
<div class="ms-drop" hidden>${matDropBody(a, col)}</div>
</div></td>`;
}

// Вид: обычно список, а при «Иное» — поле ввода прямо в той же ячейке.
// Отдельной колонки под текст нет (решение пользователя 09.09.2026): ради
// редкого случая она занимала место в каждой строке.
function kindCell(a) {
  const kinds = opt('apartment', 'annexKind', ANNEX_KINDS) || ANNEX_KINDS;

  if (a.kind === 'Иное') {
    return `<td><div class="ax-other">
<input class="ax-cell" data-ax="note|${a.id}" value="${esc(a.note || '')}"
  placeholder="что это" title="Вид пристройки своими словами"
  ${(a.note || '').trim() ? '' : 'data-ax-need'}>
<button type="button" class="ax-back" data-ax-back="${a.id}"
  title="Вернуться к списку видов" aria-label="Вернуться к списку видов">↩</button>
</div></td>`;
  }

  // Список свой, а не браузерный <select>: системный выпадающий список рисуется
  // ОС — синяя подсветка, чужие отступы, — и в таблице он выбивался из всего
  // остального (замечание пользователя 09.09.2026). Разметка та же, что у
  // материалов, только выбор одиночный.
  return `<td><div class="ms ax-ms ax-ms-one" data-ax-kind="${a.id}">
<div class="ms-control" data-ms-control data-ms-toggle title="Выбрать вид пристройки">
<span class="ms-summary">${esc(a.kind || '—')}</span>
<span class="chev">▾</span>
</div>
<div class="ms-drop" hidden>
${kinds.map((k) => `<button type="button" class="ms-opt ms-one${k === a.kind ? ' on' : ''}"
  data-ax-kind-pick="${a.id}|${esc(k)}">${esc(k)}</button>`).join('')}
</div>
</div></td>`;
}

// Подсказка в поле литеры — от литеры самого строения, строчной буквой и с
// номером: в техпаспорте пристройки литеры «Ж» подписаны «ж», «ж1», «ж2»
// (требование пользователя 09.09.2026). Это именно подсказка — значение
// подставляет человек.
//
// Литера строения бывает составной («Г, Г1», «А1»), поэтому берём из неё первую
// заглавную букву: она и есть литера, остальное — номера и перечисление.
export function annexLetterHint(oi, i) {
  // Литера у самого объекта имущества, а не у вложенных данных квартиры.
  const src = String((oi && oi.letter) || '');
  // Сначала заглавная — она и есть литера в составной записи. Если литеру
  // завели строчными, берём первую букву как есть: подсказка «а» при литере
  // «б2» сбивала бы с толку. Букв нет вовсе — показываем «а» как образец.
  const m = /[А-ЯЁA-Z]/.exec(src) || /[А-Яа-яЁёA-Za-z]/.exec(src);
  const base = (m ? m[0] : 'а').toLowerCase();
  // Первая пристройка идёт без номера, дальше — с номером: так они и
  // пронумерованы в техпаспорте.
  return i === 0 ? base : base + i;
}

function annexRow(a, i, oi) {
  const hint = annexLetterHint(oi, i);

  return `<tr>
<td class="ax-n">${i + 1}</td>
<td><input class="ax-cell ax-letter" data-ax="letter|${a.id}" value="${esc(a.letter || '')}"
  placeholder="${esc(hint)}" title="Литера пристройки — как в техпаспорте: ${esc(annexLetterHint(oi, 0))}, ${esc(annexLetterHint(oi, 1))}, ${esc(annexLetterHint(oi, 2))}"></td>
${kindCell(a)}
${MAT_COLS.map((c) => matCell(a, c)).join('')}
${ANNEX_AREAS.map((c) => `<td><input class="ax-cell ax-area" data-ax="${c.key}|${a.id}" value="${esc(numText(a[c.key]))}"></td>`).join('')}
<td class="ax-act"><button class="ax-x" data-ax-del="${a.id}" title="Убрать пристройку">×</button></td>
</tr>`;
}

export function annexesHTML(ctx, oi) {
  const list = annexesOf(oi);

  // Строка добавления — часть таблицы, как в справочниках: кнопка над таблицей
  // отрывалась от того, куда добавляет.
  const addRow = `<tr class="ax-add-row" data-ax-add>
<td class="ax-n"><span class="ax-plus">+</span></td>
<td colspan="${MAT_COLS.length + ANNEX_AREAS.length + 3}">Добавить пристройку</td>
</tr>`;

  // Итог — строкой таблицы, а не подписью сбоку: складывается колонка площади,
  // и стоять он должен под ней.
  const foot = list.length ? `<tfoot><tr>
<td class="ax-n"></td>
<td colspan="${MAT_COLS.length + 2}">Итого пристроек: ${list.length}</td>
${ANNEX_AREAS.map((c) => `<td class="ax-area-cell" data-ax-sum="${c.key}">${fmtNum(annexAreaSum(oi, c.key))} м²</td>`).join('')}
<td></td>
</tr></tfoot>` : '';

  return `<div class="ax-scroll"><table class="ax-tbl">
<thead><tr>
<th class="ax-n"></th><th>Литера</th><th>Вид</th>
${MAT_COLS.map((c) => `<th>${c.label}</th>`).join('')}
${ANNEX_AREAS.map((c) => `<th class="ax-area-cell">${c.label}</th>`).join('')}<th class="ax-act"></th>
</tr></thead>
<tbody>${list.map((a, i) => annexRow(a, i, oi)).join('')}${addRow}</tbody>
${foot}
</table></div>`;
}

// --- обработчики -----------------------------------------------------------

// Правка идёт по месту, без перерисовки всей карточки: перерисовка сбивала бы
// курсор в поле. Перерисовываем только когда строк стало больше или меньше.
export function bindAnnexes(ctx, oi) {
  const s = ctx.scope;

  const redraw = () => {
    const box = s.$('#q-annexes .card-pad');
    if (!box) { ctx.render(); return; }
    box.innerHTML = annexesHTML(ctx, oi);
    bindAnnexes(ctx, oi);
  };

  const showSum = () => {
    ANNEX_AREAS.forEach((c) => {
      const el = s.$(`[data-ax-sum="${c.key}"]`);
      if (el) el.textContent = `${fmtNum(annexAreaSum(oi, c.key))} м²`;
    });
  };

  const find = (id) => annexesOf(oi).find((a) => a.id === id);

  // Вся строка кликабельна, а не только плюсик: попасть в неё проще, а
  // ведёт она к одному и тому же.
  const add = s.$('[data-ax-add]');
  if (add) add.onclick = () => { addAnnex(oi); redraw(); };

  s.$$('[data-ax-del]').forEach((b) => b.onclick = () => {
    removeAnnex(oi, b.dataset.axDel);
    redraw();
  });

  // Из «Иного» обратно в список: без этой кнопки выбранный по ошибке «Иное»
  // было не отменить — списка в ячейке уже нет.
  s.$$('[data-ax-back]').forEach((b) => b.onclick = () => {
    const a = find(b.dataset.axBack);
    if (!a) return;
    a.kind = ANNEX_KINDS[0];
    a.note = '';
    redraw();
  });

  // Материалы: выбор нескольких, поиск по списку и точечная перерисовка
  // ячейки. Полная перерисовка закрыла бы список, а слушатели вешаем прямо на
  // флажки — делегированные копились бы при каждой отрисовке карточки
  // (та же причина, что в parts/struct/ms.js).
  const bindMats = () => {
    s.$$('[data-ax-ms]').forEach((box) => {
      bindMsSearch(box.querySelector('.ms-drop'));

      // Открытие списка вешаем здесь, а не полагаемся на общий обработчик
      // карточки: он привязывается один раз, а строки таблицы появляются и
      // перерисовываются после этого — у новых ячеек список не открывался.
      const ctrl = box.querySelector('[data-ms-toggle]');
      if (ctrl) ctrl.onclick = (e) => {
        e.stopPropagation();
        const drop = box.querySelector('.ms-drop');
        s.$$('.ms-drop').forEach((d) => { if (d !== drop) d.hidden = true; });
        s.$$('.ms-control').forEach((mc) => { if (mc !== ctrl) mc.classList.remove('open'); });
        drop.hidden = !drop.hidden;
        ctrl.classList.toggle('open', !drop.hidden);
      };

      box.querySelectorAll('[data-ax-opt]').forEach((cb) => {
        cb.onchange = () => {
          const [key, id, value] = cb.dataset.axOpt.split('|');
          const a = find(id);
          if (!a) return;

          const list = annexMats(a, key);
          const i = list.indexOf(value);
          if (i >= 0) list.splice(i, 1); else list.push(value);
          a[key] = list;

          repaintMat(box, a, key);
        };
      });
    });
  };

  const repaintMat = (box, a, key) => {
    const col = MAT_COLS.find((c) => c.key === key);
    if (!col) return;

    const mc = box.querySelector('[data-ms-control]');
    const drop = box.querySelector('.ms-drop');
    if (mc) mc.innerHTML = `${matSummary(annexMats(a, key))}<span class="chev">▾</span>`;
    if (drop) drop.innerHTML = matDropBody(a, col);
    bindMats();
  };

  bindMats();

  // Вид пристройки: выбор одиночный — щёлкнул, список закрылся.
  s.$$('[data-ax-kind]').forEach((box) => {
    const ctrl = box.querySelector('[data-ms-toggle]');
    if (ctrl) ctrl.onclick = (e) => {
      e.stopPropagation();
      const drop = box.querySelector('.ms-drop');
      s.$$('.ms-drop').forEach((d) => { if (d !== drop) d.hidden = true; });
      s.$$('.ms-control').forEach((mc) => { if (mc !== ctrl) mc.classList.remove('open'); });
      drop.hidden = !drop.hidden;
      ctrl.classList.toggle('open', !drop.hidden);
    };

    box.querySelectorAll('[data-ax-kind-pick]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const [id, value] = b.dataset.axKindPick.split('|');
        const a = find(id);
        if (!a) return;
        a.kind = value;
        // Строка перерисовывается целиком: у «Иного» ячейка вида превращается
        // в поле ввода, а у остальных — обратно в список.
        redraw();
      };
    });
  });

  s.$$('[data-ax]').forEach((el) => {
    const [key, id] = el.dataset.ax.split('|');

    // Площади — числовые поля: на экране разряды, в запись машинное значение
    // (kernel/numField.js).
    if (ANNEX_AREAS.some((c) => c.key === key)) {
      bindNumField(el, (v) => {
        const a = find(id);
        if (!a) return;
        a[key] = v;
        showSum();
      });
      return;
    }

    el.onchange = () => {
      const a = find(id);
      if (!a) return;
      a[key] = el.value;
      // Вид переключили на «Иное» или с него — меняется подпись поля уточнения,
      // поэтому строку перерисовываем целиком.
      if (key === 'kind') redraw();
    };
  });
}
