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
import { esc } from '../../../../kernel/dom.js';
import { num, fmtNum } from '../../../../kernel/fmt.js';
import { numText, bindNumField } from '../../../../kernel/numField.js';
import { STRUCT, ANNEX_KINDS } from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';

// Материалы берём из тех же перечней, что и конструктив самой литеры: пристройка
// строится из того же, и второй справочник на те же значения только разошёлся бы
// с первым.
const MAT_COLS = [
  { key: 'foundation', label: 'Фундамент', opts: 'foundation' },
  { key: 'walls', label: 'Стены', opts: 'wallsExt' },
  { key: 'roof', label: 'Кровля', opts: 'roof' },
];

export const annexesOf = (oi) => (oi && Array.isArray(oi.annexList) ? oi.annexList : []);

export const annexAreaSum = (oi) => annexesOf(oi).reduce((s, a) => s + num(a.area), 0);

let seq = 0;
const nextAnnexId = () => `ax-${Date.now().toString(36)}-${++seq}`;

export function addAnnex(oi) {
  if (!Array.isArray(oi.annexList)) oi.annexList = [];
  oi.annexList.push({
    id: nextAnnexId(), letter: '', kind: ANNEX_KINDS[0], note: '',
    foundation: '', walls: '', roof: '', area: '',
  });
}

export function removeAnnex(oi, id) {
  oi.annexList = annexesOf(oi).filter((a) => a.id !== id);
}

// Перевод старых записей: были три списка «лоджии / балконы / террасы» с
// названием и площадью у каждого элемента. Название кладём в уточнение —
// потерять его нельзя, а отдельной колонки под него нет.
//
// Вызывать ДО отрисовки, иначе перевод попадёт в лог правок как правка
// пользователя.
export function migrateAnnexList(oi) {
  if (!oi || Array.isArray(oi.annexList)) return;

  const out = [];
  [['loggias', 'Лоджия'], ['balconies', 'Балкон'], ['terraces', 'Терраса']].forEach(([key, kind]) => {
    const list = Array.isArray(oi[key]) ? oi[key] : [];
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
        foundation: '', walls: '', roof: '',
        area: it.area || '',
      });
    });
  });

  oi.annexList = out;
}

// --- разметка --------------------------------------------------------------

function matCell(a, col) {
  const list = opt('building', 'struct.' + col.opts, STRUCT[col.opts]) || [];
  const cur = a[col.key] || '';
  const known = list.includes(cur);

  return `<td><select class="select" data-ax="${col.key}|${a.id}">
<option value="" ${cur ? '' : 'selected'}>—</option>
${cur && !known ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : ''}
${list.map((v) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('')}
</select></td>`;
}

// Вид: обычно список, а при «Иное» — поле ввода прямо в той же ячейке.
// Отдельной колонки под текст нет (решение пользователя 09.09.2026): ради
// редкого случая она занимала место в каждой строке.
function kindCell(a) {
  const kinds = opt('building', 'annexKind', ANNEX_KINDS) || ANNEX_KINDS;

  if (a.kind === 'Иное') {
    return `<td><div class="ax-other">
<input class="input" data-ax="note|${a.id}" value="${esc(a.note || '')}"
  placeholder="что это" title="Вид пристройки своими словами"
  ${(a.note || '').trim() ? '' : 'data-ax-need'}>
<button type="button" class="ax-back" data-ax-back="${a.id}"
  title="Вернуться к списку видов" aria-label="Вернуться к списку видов">↩</button>
</div></td>`;
  }

  return `<td><select class="select" data-ax="kind|${a.id}">
${kinds.map((k) => `<option ${k === a.kind ? 'selected' : ''}>${esc(k)}</option>`).join('')}
</select></td>`;
}

function annexRow(a, i) {
  return `<tr>
<td class="ax-n">${i + 1}</td>
<td><input class="input ax-letter" data-ax="letter|${a.id}" value="${esc(a.letter || '')}"
  placeholder="ж1" title="Литера пристройки — как в техпаспорте: ж, ж1, ж2"></td>
${kindCell(a)}
${MAT_COLS.map((c) => matCell(a, c)).join('')}
<td><input class="input ax-area" data-ax="area|${a.id}" value="${esc(numText(a.area))}"></td>
<td class="al-act"><button class="btn btn-danger btn-sm" data-ax-del="${a.id}" title="Убрать пристройку">×</button></td>
</tr>`;
}

export function annexesHTML(ctx, oi) {
  const list = annexesOf(oi);

  // Широкая таблица (девять колонок) прокручивается внутри своей обёртки —
  // иначе на узкой карточке вбок уезжает вся страница.
  const body = list.length
    ? `<div class="ax-scroll"><table class="tbl al-tbl ax-tbl">
<thead><tr>
<th class="ax-n"></th><th>Литера</th><th>Вид</th>
${MAT_COLS.map((c) => `<th>${c.label}</th>`).join('')}
<th>Площадь, м²</th><th class="al-act"></th>
</tr></thead>
<tbody>${list.map(annexRow).join('')}</tbody>
</table></div>`
    : '<div class="al-empty">Пристроек нет. Добавьте кнопкой «+ Пристройка».</div>';

  // Без вложенного заголовка: карточка блока уже называется «Пристройки», и
  // второй такой же заголовок внутри читался как повтор. Сворачивать блок
  // тоже есть чем — шапкой самой карточки.
  return `<div class="ax-bar">
<span class="ax-count" data-ax-sum>${list.length} · ${fmtNum(annexAreaSum(oi))} м²</span>
<button class="btn btn-ghost btn-sm" data-ax-add>+ Пристройка</button>
</div>
${body}`;
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
    const el = s.$('[data-ax-sum]');
    if (el) el.textContent = `${annexesOf(oi).length} · ${fmtNum(annexAreaSum(oi))} м²`;
  };

  const find = (id) => annexesOf(oi).find((a) => a.id === id);

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

  s.$$('[data-ax]').forEach((el) => {
    const [key, id] = el.dataset.ax.split('|');

    // Площадь — числовое поле: на экране разряды, в запись машинное значение
    // (kernel/numField.js).
    if (key === 'area') {
      bindNumField(el, (v) => {
        const a = find(id);
        if (!a) return;
        a.area = v;
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
