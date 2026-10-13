// Вспомогательные постройки (гараж, навес, летняя кухня) — своя таблица под
// перечнем ОИ, правка прямо в ячейках (решение пользователя 17.09.2026, запись
// графа vspomogatelnaya-postroyka-kak-vid-oi). Одна на все типы ОЦ: нежилое
// здание берёт её отсюда, квартира, жилой дом и земельный участок — через
// дверь civil/card.js (распространение 13.10.2026: «Вспомогательные здания
// тоже распространяем»).
//
// Разметка (auxBlockHTML), поведение (bindAuxSection), ширины столбцов и
// создание постройки (newAuxOi) — вынесены сюда из card/oiTable.view.js и
// card/ocCard.ctrl.js без изменений.
import { esc } from '../../../kernel/dom.js';
import { columnVarsStyle, colGroupHTML, colLabelHTML, applyFit, colVar } from '../../../kernel/columns.js';
import { fmtNum, num } from '../../../kernel/fmt.js';
import { photoAccordions } from '../parts/photos/blocks.js';
import { structMS, bindStructBox } from '../parts/struct/ms.js';
import { STRUCT } from '../data/dictionaries.js';
import { opt } from '../data/opts.js';

// --- Вспомогательные постройки ---------------------------------------------
//
// Гараж, навес, летняя кухня. Это объект имущества, но урезанный, и своего
// экрана у него нет: всё, что о нём известно, правится прямо в ячейках
// (решение пользователя 17.09.2026).
//
// СВОЯ таблица, а не раздел общего перечня: у постройки нет ни кода ЕНИ, ни
// назначения по техпаспорту, ни статуса — в общих колонках у неё стояли
// прочерки, а сами колонки не давали таблице поместиться по ширине. Здесь
// колонки ровно те, что заполняют, и заданы долями, поэтому таблица всегда
// равна месту, которое ей отведено, и не прокручивается вбок.
//
// Правка прямо в ячейке — принятое решение для узкой таблицы с небольшим
// числом полей (PatternFly «Inline edit», Pencil & Paper «Enterprise data
// tables»): контекст соседних построек остаётся на экране, лишнего перехода
// нет.
//
// Конструктив — только фундамент, стены и кровля. Остальное у вспомогательной
// постройки не описывают.
const AUX_STRUCT_ROWS = [
  { key: 'foundation', label: 'Фундамент' },
  { key: 'wallsExt', label: 'Стены' },
  { key: 'roof', label: 'Кровля' },
];

// Столбцы — те же, что у перечня ОИ: ширины в пикселях, подгонка под ширину
// таблицы (kernel/columns.js, fitWidths) и перегородки, за которые ширину
// тянут. Раньше ширины стояли долями: таблица помещалась, но перегородки были
// нарисованы и не двигались — оформление обещало то, чего нет.
//
// Номера строк убраны: постройки различают по литере, а счёт и так виден в
// итоговой строке.
export const AUX_COLUMNS = [
  // В ячейке литеры — ручка переноса, шеврон раскрытия и сама буква.
  { key: 'letter', label: 'Лит.', width: 76, minWidth: 68 },
  // Резиновый столбец забирает остаток места. Минимум ему нужен свой: у
  // резинового по умолчанию он равен 190 px, и при узком окне таблица из-за
  // этого оказывалась шире отведённого ей места.
  { key: 'name', label: 'Наименование', width: 0, minWidth: 70 },
  { key: 'year', label: 'Год', width: 60, minWidth: 44 },
  { key: 'foundation', label: 'Фундамент', width: 120, minWidth: 66 },
  { key: 'wallsExt', label: 'Стены', width: 120, minWidth: 66 },
  { key: 'roof', label: 'Кровля', width: 120, minWidth: 66 },
  { key: 'area', label: 'Площадь, м²', width: 96, minWidth: 66 },
  { key: 'act', label: '', width: 44, fixed: true },
];

// Столбец кнопок в подгонке не участвует (он fixed), поэтому его ширину надо
// вычесть из доступного места: иначе сумма получается на его ширину больше,
// и таблица вылезает за свой блок.
export const AUX_FIXED_W = AUX_COLUMNS.filter((c) => c.fixed)
  .reduce((sum, c) => sum + (c.width || 0), 0);

const AUX_FULL = { year: 'Год постройки', letter: 'Литера', area: 'Площадь по наружным замерам' };

const auxAreaSum = (list) => list.reduce((sum, oi) => sum + num((oi.areas || {}).tp), 0);
const auxHasArea = (list) => list.some((oi) => String((oi.areas || {}).tp || '').trim());

// Раскрыта одна постройка за раз: раскрытие показывает её фото, и две ленты
// подряд разносят таблицу по высоте.
const auxRowOpen = (ctx, oi) => ctx.ui.auxOpen === oi.id;

function auxFieldCell(oi, key) {
  const a = oi.areas || {};

  switch (key) {
    case 'letter':
      return `<input class="ax-cell ax-letter" data-aux-letter="${oi.id}" value="${esc(oi.letter || '')}"
        aria-label="Литера">`;
    case 'name':
      return `<input class="ax-cell" data-aux-name="${oi.id}" value="${esc(oi.name || '')}"
        placeholder="Гараж, навес, летняя кухня" aria-label="Наименование">`;
    case 'year':
      return `<input class="ax-cell ax-area" data-aux-year="${oi.id}" value="${esc(oi.year || '')}"
        inputmode="numeric" aria-label="Год постройки">`;
    case 'area':
      return `<input class="ax-cell ax-area" data-aux-area="${oi.id}" value="${esc(a.tp || '')}"
        inputmode="decimal" aria-label="Площадь по наружным замерам">`;
    // Кнопка удаления видна всегда: спрятанная до наведения, она находится
    // вслепую, и удаление становится случайным (требование пользователя
    // 17.09.2026).
    case 'act':
      return `<button class="ax-x aux-del" data-del-oi="${oi.id}" title="Удалить постройку">×</button>`;
    default: {
      const row = AUX_STRUCT_ROWS.find((r) => r.key === key);
      return row
        ? structMS(oi, row.key, row.label, opt('building', 'struct.' + row.key, STRUCT[row.key]), false, true)
        : '';
    }
  }
}

// Фото и всё, что у постройки появится сверх строки, живёт в раскрытии самой
// строки, а не общим списком под таблицей: снимки относятся к конкретной
// литере, и их место — при ней (требование пользователя 17.09.2026).
function auxDetailHTML(ctx, oi) {
  return `<tr class="aux-detail-row" data-aux-detail="${oi.id}">
    <td colspan="${AUX_COLUMNS.length}">
      <div class="aux-detail">
        <div class="aux-detail-h">Фото${oi.letter ? ' · лит ' + esc(oi.letter) : ''}</div>
        ${photoAccordions(ctx.ui, oi, true)}
      </div>
    </td>
  </tr>`;
}

function auxTableRow(ctx, oi) {
  const open = auxRowOpen(ctx, oi);

  // Перенос к другому участку — тем же механизмом, что у литер (data-drag-oi),
  // но только за ручку: строка целиком перетаскиваемой не делается, иначе
  // попытка выделить текст в ячейке начинала бы перенос. Ручка включает
  // перетаскивание строки на время нажатия (см. контроллер).
  const cell = (c) => `<td class="aux-c-${c.key}">${
    c.key === 'letter'
      ? `<span class="drag-grip aux-drag" data-aux-drag="${oi.id}"
          title="Перетащите, чтобы перенести к другому участку">⠿</span><span class="aux-chev" aria-hidden="true">▾</span>${
        auxFieldCell(oi, c.key)}`
      : auxFieldCell(oi, c.key)}</td>`;

  return `<tr class="aux-row ${open ? 'open' : ''}" data-aux-row="${oi.id}" data-drag-oi="${oi.id}"
      aria-expanded="${open}" title="Клик по строке — фото постройки">
    ${AUX_COLUMNS.map(cell).join('')}
  </tr>${open ? auxDetailHTML(ctx, oi) : ''}`;
}

// Итог по площади стоит ПОД своей колонкой. Пока ни одной площади не введено,
// вместо «0,00 м²» — прочерк: ноль читается как «замерили и получилось ноль».
export function auxTotalRowHTML(list) {
  return `<tr class="oi-total">${AUX_COLUMNS.map((c) => {
    if (c.key === 'name') return `<td>Итого: ${list.length}</td>`;
    if (c.key === 'area') {
      return `<td class="aux-c-area"><span class="oi-total-v">${
        auxHasArea(list) ? fmtNum(auxAreaSum(list)) + ' м²' : '—'}</span></td>`;
    }
    return '<td></td>';
  }).join('')}</tr>`;
}

export const auxColsVarsStyle = (ctx) => columnVarsStyle(AUX_COLUMNS, ctx.ui.auxColWidths);

export function auxBlockHTML(ctx, list) {
  if (!list.length) return '';

  const last = AUX_COLUMNS.length - 1;

  return `<div class="oi-sub oi-aux-block" data-oi-sub="aux">
    <div class="oi-sub-h">Вспомогательные постройки</div>
    <div class="aux-cols" data-aux-cols-box style="${auxColsVarsStyle(ctx)}">
      <table class="tbl aux-tbl">
        ${colGroupHTML(AUX_COLUMNS, ctx.ui.auxColWidths)}
        <thead><tr>${AUX_COLUMNS.map((c, i) => `<th data-col="${c.key}" class="aux-c-${c.key}"
  title="${esc(AUX_FULL[c.key] || c.label)}">${c.label ? colLabelHTML({ label: esc(c.label) }) : ''}${
  c.fixed || i === last ? '' : `<span class="col-grip" data-aux-grip="${c.key}"
      title="Потянуть — изменить ширину"></span>`}</th>`).join('')}</tr></thead>
        <tbody>${list.map((oi) => auxTableRow(ctx, oi)).join('')}</tbody>
        <tfoot>${auxTotalRowHTML(list)}</tfoot>
      </table>
    </div>
  </div>`;
}


// Перегородки столбцов таблицы вспомогательных построек.
//
// Своя, а не bindColumnResize из ядра: та берёт ВСЕ перегородки скоупа и
// привязывает их к одному контейнеру, поэтому на одном экране с перечнем ОИ
// перегородки двух таблиц управляли бы чужими ширинами. Здесь перегородки
// помечены своим признаком (data-aux-grip) и двигают только соседние столбцы
// этой таблицы.
//
// Ширины хранятся в ui, поэтому переживают перерисовку; сумма не меняется —
// сколько один столбец прибавил, столько соседний отдал, и таблица не
// вылезает за отведённое место.
const AUX_MIN_W = 46;

function bindAuxColumns(ctx, s) {
  const box = s.$('[data-aux-cols-box]');
  if (!box) return;

  // Подгонка под ширину места: сумма ширин столбцов всегда равна ширине
  // таблицы, поэтому последний столбец не оказывается за краем, а свободного
  // поля справа не остаётся.
  //
  // Во время перетаскивания перегородки подгонка молчит. Иначе она срабатывает
  // по наблюдателю размеров прямо посреди перетаскивания и возвращает столбцы
  // к сохранённой раскладке — перегородка тянется, а ширина откатывается
  // назад (найдено проверкой в браузере: при синтетических событиях всё
  // проходило в один тик и дефект не проявлялся).
  let dragging = false;
  const fit = () => { if (!dragging) applyFit(box, AUX_COLUMNS, ctx.ui.auxColWidths, AUX_FIXED_W); };
  fit();

  // Ширина меняется не только с окном: просмотрщик документов забирает половину
  // экрана, и таблица становится уже без всякой перерисовки.
  if (typeof ResizeObserver === 'function') {
    if (ctx.ui.auxColsObserver) ctx.ui.auxColsObserver.disconnect();
    const ro = new ResizeObserver(() => fit());
    ro.observe(box);
    ctx.ui.auxColsObserver = ro;
  }

  const byKey = new Map(AUX_COLUMNS.map((c) => [c.key, c]));

  box.querySelectorAll('[data-aux-grip]').forEach((grip) => {
    grip.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const th = grip.closest('[data-col]');
      const next = th && th.nextElementSibling;
      if (!th || !next || !next.dataset.col) return;

      const keyL = th.dataset.col;
      const keyR = next.dataset.col;
      const wL = Math.round(th.getBoundingClientRect().width);
      const wR = Math.round(next.getBoundingClientRect().width);
      const minL = Math.min((byKey.get(keyL) || {}).minWidth || AUX_MIN_W, wL);
      const minR = Math.min((byKey.get(keyR) || {}).minWidth || AUX_MIN_W, wR);

      const x0 = e.clientX;
      let d = 0;

      dragging = true;
      box.classList.add('col-resizing');
      grip.classList.add('active');

      const move = (ev) => {
        d = Math.max(minL - wL, Math.min(wR - minR, Math.round(ev.clientX - x0)));
        // Имя переменной берём у ядра: разметка столбцов рисуется его же
        // функцией, и своё имя тут просто не подхватилось бы.
        box.style.setProperty(colVar(keyL), (wL + d) + 'px');
        box.style.setProperty(colVar(keyR), (wR - d) + 'px');
      };

      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        box.classList.remove('col-resizing');
        grip.classList.remove('active');
        if (!d) { dragging = false; return; }

        // Сохраняем всю раскладку целиком: записав только две изменённые
        // ширины, получили бы смесь с умолчаниями, сумма которой не сходится
        // с шириной таблицы.
        const patch = {};
        th.parentElement.querySelectorAll('[data-col]').forEach((cell) => {
          patch[cell.dataset.col] = Math.round(cell.getBoundingClientRect().width);
        });
        ctx.ui.auxColWidths = { ...(ctx.ui.auxColWidths || {}), ...patch };
        dragging = false;
      };

      // Слушаем документ, а не саму перегородку: курсор во время перетаскивания
      // уходит с неё, и события до неё не доходят. Снимаются слушатели в up.
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    };
  });
}


export function bindAuxSection(ctx, s) {
  const rec = ctx.rec;
  // Постройки правятся прямо в ячейках своей таблицы. Набранное попадает в
  // данные сразу (input), перерисовки нет: она заменила бы поле, в котором
  // стоит курсор. Пересчитывается только итог по площади — единственное, что
  // зависит от набранного и показано в другом месте.
  const auxListOf = (oi) => rec.oi.filter((o) => o.card === 'aux'
    && (o.landId || '') === (oi.landId || ''));

  const refreshAuxTotal = (oi) => {
    const row = s.$(`tr[data-aux-row="${oi.id}"]`);
    const tfoot = row && row.closest('table') ? row.closest('table').querySelector('tfoot') : null;
    if (tfoot) tfoot.innerHTML = auxTotalRowHTML(auxListOf(oi));
  };

  [['aux-name', (oi, v) => { oi.name = v; }],
    ['aux-letter', (oi, v) => { oi.letter = v; }],
    ['aux-year', (oi, v) => { oi.year = v; }],
    ['aux-area', (oi, v) => { oi.areas.tp = v; }],
  ].forEach(([attr, set]) => {
    s.$$(`[data-${attr}]`).forEach((inp) => {
      inp.oninput = () => {
        const oi = rec.oi.find((o) => o.id === inp.getAttribute(`data-${attr}`));
        if (!oi) return;
        oi.areas = oi.areas || {};
        set(oi, inp.value);
        if (attr === 'aux-area') refreshAuxTotal(oi);
      };
    });
  });

  // Клик по строке раскрывает фото постройки. Поля, списки и кнопки из этого
  // исключены: по ним щёлкают, чтобы править, а не чтобы раскрыть.
  s.$$('tr[data-aux-row]').forEach((tr) => tr.onclick = (e) => {
    if (e.target.closest('input, button, .ms, select, textarea, .aux-drag')) return;
    const id = tr.dataset.auxRow;
    ctx.ui.auxOpen = ctx.ui.auxOpen === id ? null : id;
    ctx.render();
  });

  // Ручка переноса постройки: строка становится перетаскиваемой только пока
  // нажата ручка, и снова обычной, когда кнопку отпустили или перенос
  // закончился. Сам перенос обрабатывает общий механизм дерева ([data-drag-oi]).
  s.$$('[data-aux-drag]').forEach((grip) => {
    const row = grip.closest('tr');
    grip.onpointerdown = () => { row.draggable = true; };
    grip.onpointerup = () => { row.draggable = false; };
    row.addEventListener('dragend', () => { row.draggable = false; });
  });

  const auxList = rec.oi.filter((o) => o.card === 'aux');
  if (auxList.length) {
    auxList.forEach((oi) => {
      const row = s.$(`tr[data-aux-row="${oi.id}"]`);
      if (row) row.querySelectorAll('[data-struct-field]').forEach((box) => bindStructBox(ctx, oi, box));
    });

    s.$$('.aux-tbl [data-ms-toggle]').forEach((c) => c.onclick = (e) => {
      e.stopPropagation();
      const drop = c.parentElement.querySelector('.ms-drop');
      s.$$('.ms-drop').forEach((d) => { if (d !== drop) d.hidden = true; });
      s.$$('.ms-control').forEach((mc) => { if (mc !== c) mc.classList.remove('open'); });
      drop.hidden = !drop.hidden;
      c.classList.toggle('open', !drop.hidden);
    });

    // Закрытие списков кликом вне них. Вешается ОДИН раз на скоуп: контроллер
    // перепривязывается на каждой отрисовке, а документные слушатели снимаются
    // только при уходе с экрана — иначе они копились бы всю сессию.
    if (!s.root.dataset.auxMsOutsideBound) {
      s.root.dataset.auxMsOutsideBound = '1';
      s.onDocument('click', (e) => {
        if (!e.target.closest('.ms')) {
          s.$$('.ms-control').forEach((mc) => mc.classList.remove('open'));
          s.$$('.ms-drop').forEach((d) => { d.hidden = true; });
        }
      });
    }

    bindAuxColumns(ctx, s);
  }

}

// Вспомогательная постройка: набор полей урезан до того, что о ней
// действительно заполняют (решение пользователя 17.09.2026) — название,
// литера, две площади, три элемента конструктива и фото. Ни развёртки, ни
// износа, ни прав, ни адреса: своего экрана у неё нет, и всё лишнее в
// раскрытой строке перечня только мешало бы.
//
// Литера берётся из общего счётчика записи: постройка стоит на участке
// наравне с литерами, и вторая «Б» в перечне сбивала бы с толку.
export function newAuxOi({ nextId, letter }) {
  return {
    id: nextId('oi'),
    card: 'aux',
    letter,
    name: '',
    // Вспомогательное — это и есть её отличие от основных объектов
    // имущества, и поле «Основное/Вспомогательное» у оценки уже есть.
    status: 'Вспомогательное',
    origin: 'manual',
    residential: false,
    // Кода ЕНИ у вспомогательной постройки нет: он присваивается
    // Кадастром объекту, а постройка учитывается в составе участка.
    eni: '',
    areas: { tp: '', build: '' },
    struct: { foundation: [], wallsExt: [], roof: [] },
    structOther: {},
    flags: { entered: false, matched: false },
    docs: [],
    photos: {},
    notes: [],
  };
}
