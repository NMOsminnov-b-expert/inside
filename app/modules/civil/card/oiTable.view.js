import { esc } from '../../../kernel/dom.js';
import {
  orderedColumns, columnVarsStyle, colGroupHTML, headAttrs, colLabelHTML, resizeGripHTML,
} from '../../../kernel/columns.js';
import { fmtEni, fmtNum, num } from '../../../kernel/fmt.js';
import { cardMeta } from '../oi/registry.js';
import { photoCell, photoPopHTML, photoAccordions } from '../parts/photos/blocks.js';
import { addOiMenuHTML } from './addOiMenu.js';
import { structMS } from '../parts/struct/ms.js';
import { STRUCT } from '../data/dictionaries.js';
import { opt } from '../data/opts.js';

// Перечень ОИ — дерево из ДВУХ уровней: земельный участок сверху, литеры внутри
// него (вложенность аккордеонов). Третьего уровня нет: параметры литеры
// смотрятся в самой карточке ОИ, а не раскрытием строки.
//
// Литеры без привязки к участку живут в группе «Без участка» — участок в записи
// не обязателен (квартира в многоквартирном доме), а после удаления участка его
// литеры не пропадают, а теряют привязку и уезжают туда же.
//
// Литеру можно перетащить курсором в другой узел — перенос подтверждается
// модалкой (см. card/ocCard.ctrl.js).

// Столбцы перечня ОИ. Механика та же, что в реестре (kernel/columns.js):
// ширины живут в CSS-переменных на контейнере дерева, перегородка меняет ширины
// двух соседних ячеек, порядок меняется перетаскиванием заголовка. Столбец
// кнопок закреплён — он служебный и в перестановке не участвует.
export const OI_COLUMNS = [
  // ЕНИ — сразу за литерой (Л4.8): это основной идентификатор объекта, искать
  // его в шестом столбце неудобно. Первым не ставим: за литеру строку тянут
  // между участками, она должна остаться визуальным началом строки.
  // Порядок здесь — только значение по умолчанию, столбцы переставляются мышью.
  { key: 'letter', label: 'Литера', width: 76, minWidth: 60 },
  // Минимумы подобраны под то, что в столбце стоит: код ЕНИ не должен
  // рассыпаться на четыре строки, а наименование, наоборот, спокойно
  // переносится. Резиновому столбцу без своего минимума ядро даёт 190 px — и
  // при открытом просмотрщике он забирал место у площадей, которые
  // превращались в «18… м²».
  { key: 'eni', label: 'Код ЕНИ', width: 150, minWidth: 96 },
  { key: 'name', label: 'Наименование', width: 0, minWidth: 100 },
  // Столбец показывает oi.catClass — то же поле, что в карточке литеры
  // подписано «Назначение по тех паспорту», и то же слово стоит в шапке ОЦ.
  // Называлось «Категория», хотя «Категория ОИ» — другое поле (oi.oiCategory,
  // сгруппированный справочник классов), и в перечень оно не выводится вовсе
  // (расхождение № 1, docs/tz/52-reestr-polej-kartochki-oc.md).
  { key: 'category', label: 'Назначение по ТП', width: 140 },
  { key: 'status', label: 'Статус', width: 104 },
  // Названия совпадают с карточкой литеры: там площади 09.09.2026 названы по
  // техпаспорту — по внешним замерам и по внутреннему обмеру. В перечне они
  // назывались «Общая площадь», и одно и то же поле читалось по-разному.
  // Площади сжимаются последними: число, обрезанное многоточием («1840,… м²»),
  // бесполезно, а текст статуса или назначения читается и по подсказке.
  { key: 'area', label: 'По внешним замерам', width: 118, minWidth: 86 },
  { key: 'areaBuild', label: 'По внутр. обмеру', width: 118, minWidth: 86 },
  // Минимум — по кнопке с превью внутри (52 px и поля ячейки): уже неё столбец
  // сжиматься не должен, иначе кнопка налезает на соседний столбец.
  { key: 'photos', label: 'Фото', width: 74, minWidth: 72 },
  { key: 'act', label: '', width: 52, fixed: true },
];

export const OI_COLUMNS_DEFAULT = OI_COLUMNS.filter((c) => !c.fixed).map((c) => c.key);

// Столбец кнопок закреплён и в подгонке ширин не участвует (kernel/columns.js,
// fitWidths считает только подвижные), поэтому его ширину надо вычитать из
// доступного места. Без этого сумма ширин выходила за таблицу ровно на его
// ширину: браузер ужимал столбцы, «Фото» становилось уже кнопки внутри неё, и
// кнопка налезала на соседний столбец, а сама колонка кнопок уходила за край.
export const OI_FIXED_W = OI_COLUMNS.filter((c) => c.fixed)
  .reduce((sum, c) => sum + (c.width || 0), 0);

const cols = (ctx) => orderedColumns(OI_COLUMNS, ctx.ui.oiCols || OI_COLUMNS_DEFAULT);

// Ширины объявляются переменными на контейнере дерева — их читают таблицы всех
// узлов сразу, поэтому столбцы во всех участках всегда одной ширины.
export const oiColsVarsStyle = (ctx) => columnVarsStyle(cols(ctx), ctx.ui.oiColWidths);

function headHTML(ctx) {
  const list = cols(ctx);

  return `<thead><tr>${list.map((c, i) => `<th ${headAttrs(c)}
    title="${esc(c.label)}${c.fixed ? '' : ' — перетащите, чтобы переставить'}">
    ${c.label ? colLabelHTML(c) : ''}${resizeGripHTML(c, i === list.length - 1)}
  </th>`).join('')}</tr></thead>`;
}

function cellHTML(ctx, oi, key) {
  const meta = cardMeta(oi);

  switch (key) {
    case 'letter': return `<span class="drag-grip" title="Перетащить">⠿</span>${esc(oi.letter || '—')}`;
    case 'name': return `<span class="ell" title="${esc(oi.name)}">${esc(oi.name)}</span>`;
    case 'category': return `<span class="ell" title="${esc(meta.tableCategory(oi))}">${esc(meta.tableCategory(oi))}</span>`;
    case 'status': return `<span class="ell" title="${esc(oi.status || '')}">${esc(oi.status || '—')}</span>`;
    case 'area': return `<span class="ell" title="${esc(meta.tableArea(oi))}">${esc(meta.tableArea(oi))}</span>`;
    case 'areaBuild': {
      const v = meta.tableAreaBuild ? meta.tableAreaBuild(oi) : '—';
      return `<span class="ell" title="${esc(v)}">${esc(v)}</span>`;
    }
    case 'eni': return `<span class="mono ell" title="${esc(fmtEni(oi.eni))}">${esc(fmtEni(oi.eni))}</span>`;
    case 'photos': return photoCell(oi);
    case 'act': return `<div class="row-actions">
      <button class="btn btn-danger btn-sm" data-del-oi="${oi.id}" title="Удалить литеру">×</button>
    </div>`;
    default: return '';
  }
}

function letterRow(ctx, oi) {
  return `<tr class="rowlink oi-letter" draggable="true"
      data-open-oi="${oi.id}" data-drag-oi="${oi.id}"
      title="Клик — карточка ОИ; перетащите, чтобы перенести к другому участку">
    ${cols(ctx).map((c) => `<td>${cellHTML(ctx, oi, c.key)}</td>`).join('')}
  </tr>`;
}

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

// Подытог раздела: сколько объектов и сколько по каждой площади. Складывается
// колонка — итог стоит под ней, а не подписью сбоку (требование пользователя
// 09.09.2026). Считается по значениям, а не по показанному тексту: в тексте
// уже разряды и «м²».
function totalRow(ctx, list) {
  const sums = list.reduce((acc, oi) => {
    const v = cardMeta(oi).areaValues ? cardMeta(oi).areaValues(oi) : { area: 0, build: 0 };
    return { area: acc.area + v.area, build: acc.build + v.build };
  }, { area: 0, build: 0 });

  const cell = (key) => {
    if (key === 'area') return `<span class="oi-total-v">${fmtNum(sums.area)} м²</span>`;
    if (key === 'areaBuild') return `<span class="oi-total-v">${fmtNum(sums.build)} м²</span>`;
    return '';
  };

  const list2 = cols(ctx);
  const firstText = list2.findIndex((c) => c.key !== 'letter');

  return `<tr class="oi-total">${list2.map((c, i) => `<td>${
    i === firstText ? `Итого: ${list.length}` : cell(c.key)}</td>`).join('')}</tr>`;
}

function emptyRow(ctx, text) {
  return `<tr><td colspan="${cols(ctx).length}" class="muted" style="padding:8px 10px">${esc(text)}</td></tr>`;
}

// Узел дерева: земельный участок либо служебная группа «Без участка».
// dropId — куда переносить литеру, брошенную на этот узел ('' = снять привязку).
// Объекты на участке разделены: литеры отдельно, движимое отдельно — это
// разные сущности, и смешивать их в одной таблице неудобно (решение
// пользователя 2026-08-28).
// Шапка столбцов рисуется ОДИН раз, у первого раздела: столбцы у разделов
// одни и те же, и повторять их у движимого — лишний шум.
// Названия колонок стоят ОДИН раз и ВЫШЕ заголовков разделов: заголовок
// «Здания и сооружения…» относится к строкам под ним, а шапка столбцов — ко
// всей таблице сразу, и подчинять её разделу нелогично. Ширины у всех таблиц
// общие (переменные на контейнере), поэтому колонки совпадают.
function colsRowHTML(ctx) {
  return `<table class="tbl oi-tree-tbl oi-cols-row">${colGroupHTML(cols(ctx), ctx.ui.oiColWidths)}${headHTML(ctx)}</table>`;
}

// total — показывать ли подытог по площадям. У движимого его нет: площади там
// не бывает, и строка «Итого: 0 м²» только сбивала бы.
function sub(ctx, { label, list, emptyText, kind, withHead, total }) {
  return `<div class="oi-sub" data-oi-sub="${kind}">
    ${label ? `<div class="oi-sub-h">${label}</div>` : ''}
    <table class="tbl oi-tree-tbl">${colGroupHTML(cols(ctx), ctx.ui.oiColWidths)}${withHead ? headHTML(ctx) : ''}
      <tbody>${list.length ? list.map((oi) => letterRow(ctx, oi)).join('') : emptyRow(ctx, emptyText)}</tbody>
      ${total && list.length ? `<tfoot>${totalRow(ctx, list)}</tfoot>` : ''}
    </table>
  </div>`;
}

function treeNode(ctx, { key, dropId, head, meta, letters, open, summary }) {
  // Движимое имущество — один раздел на механизмы и транспорт: в перечне их
  // смотрят вместе, а чем именно является строка, видно в столбце категории.
  const aux = letters.filter((o) => o.card === 'aux');
  const movable = letters.filter((o) => o.card === 'mech' || o.card === 'vehicle');
  const real = letters.filter((o) => !aux.includes(o) && !movable.includes(o));

  return `<div class="acc oi-node ${open ? 'open' : ''}" data-oi-drop="${esc(dropId)}">
    <div class="acc-head oi-node-head" data-acc-toggle="${esc(key)}">
      <span class="chev">▾</span>
      ${head}
      <span class="oi-node-count">
        <span class="oi-node-cnt real" title="Литеры">${real.length}</span>
        <span class="oi-node-cnt aux" title="Вспомогательные постройки">${aux.length}</span>
        <span class="oi-node-cnt mov" title="Движимое имущество">${movable.length}</span>
      </span>
      ${meta}
    </div>
    <div class="acc-body" style="padding:0">
      ${summary || ''}
      ${colsRowHTML(ctx)}
      ${sub(ctx, {
    label: summary ? 'Основные здания и сооружения на земельном участке' : 'Основные здания и сооружения',
    list: real,
    emptyText: 'Литер нет. Перетащите литеру сюда или добавьте через «+ Добавить ОИ».',
    kind: 'real',
    total: true,
  })}
      ${movable.length
    ? sub(ctx, { label: 'Движимое имущество', list: movable, emptyText: '', kind: 'movable' })
    : ''}
      ${auxBlockHTML(ctx, aux)}
    </div>
  </div>`;
}

// В шапке узла — только имя участка и его ЕНИ (решение пользователя
// 2026-08-28). Всё остальное — назначение, площадь, ограничения, коммуникации —
// в сводке под шапкой: в одну строку они не влезают и читаются плохо.
function landHead(land, num) {
  return `<span class="oi-node-num" title="Участок №${num}">${num}</span>
    <b>${esc(land.name || 'Земельный участок')}</b>
    <span class="mono oi-node-eni" title="${esc(land.eni)}">${esc(fmtEni(land.eni))}</span>`;
}

// Есть ли ограничения или сервитуты. В данных это строка «Нет» либо описание.
function landLimits(land) {
  const v = String(land.encumbrance || '').trim();
  if (!v || v.toLowerCase() === 'нет') return 'нет';
  return land.encumbranceArea ? `${v} · ${land.encumbranceArea} м²` : v;
}

const UTIL_LABELS = {
  electricity: 'электричество',
  water: 'вода',
  sewerage: 'канализация',
  heating: 'отопление',
};

function landUtils(land) {
  const on = Object.keys(UTIL_LABELS).filter((k) => (land.utilities || {})[k]);
  return on.length ? on.map((k) => UTIL_LABELS[k]).join(', ') : 'не отмечены';
}

// Сводка по участку: то, что нужно видеть, не открывая его карточку. Таблицей —
// как перечень литер под ней: это такой же объект, и разный вид сбивал с толку.
// Ширины долями: сводка стоит над перечнем литер и должна сжиматься вместе с
// ним, а не выталкивать блок. Полное значение — в подсказке при наведении.
const LAND_SUM_COLS = [
  { label: 'Код ЕНИ', width: '19%', cls: 'mono', get: (l) => esc(fmtEni(l.eni)), plain: (l) => fmtEni(l.eni) },
  { label: 'Площадь', width: '13%', get: (l) => cardMeta(l).tableArea(l), plain: (l) => cardMeta(l).tableArea(l) },
  { label: 'Назначение (ПУД)', width: '20%', get: (l) => esc(l.purpose || '—'), plain: (l) => l.purpose || '' },
  { label: 'Тип ЗУ', width: '16%', get: (l) => esc(l.landType || '—'), plain: (l) => l.landType || '' },
  { label: 'Ограничения и сервитуты', width: '16%', get: (l) => esc(landLimits(l)), plain: (l) => landLimits(l) },
  { label: 'Коммуникации', width: '16%', get: (l) => esc(landUtils(l)), plain: (l) => landUtils(l) },
];

function landSummary(ctx, land) {
  return `<div class="oi-land-sum">
    <table class="tbl oi-land-tbl">
      <thead><tr>
        ${LAND_SUM_COLS.map((c) => `<th style="width:${c.width}">${c.label}</th>`).join('')}
      </tr></thead>
      <tbody><tr>
        ${LAND_SUM_COLS.map((c) => `<td class="ell ${c.cls || ''}" title="${c.plain ? c.plain(land) : ''}">${c.get(land)}</td>`).join('')}
      </tr></tbody>
    </table>
  </div>`;
}

function landMeta(ctx, land) {
  // Переход в карточку — рядом с удалением: это действия над самим узлом.
  // В сводке ему места не хватало, из-за него схлопывалась колонка данных.
  return `<span class="oi-node-actions">
      <button class="btn btn-primary btn-sm oi-land-open" data-open-oi="${esc(land.id)}"
        title="Открыть карточку земельного участка">Карточка участка →</button>
      <button class="btn btn-danger btn-sm" data-del-oi="${land.id}" title="Удалить участок — литеры останутся, но потеряют привязку">×</button>
    </span>`;
}

export function tableOI(ctx) {
  const rec = ctx.rec;
  const lands = rec.oi.filter((o) => o.card === 'land');
  const letters = rec.oi.filter((o) => o.card !== 'land');

  const byLand = new Map(lands.map((l) => [l.id, []]));
  const orphans = [];
  letters.forEach((oi) => {
    if (oi.landId && byLand.has(oi.landId)) byLand.get(oi.landId).push(oi);
    else orphans.push(oi);
  });

  // Всплывающее окно со фото — одно на перечень, для литеры, по которой кликнули.
  const popOi = ctx.ui.photoPop ? rec.oi.find((o) => o.id === ctx.ui.photoPop) : null;

  const nodes = lands.map((land, i) => treeNode(ctx, {
    key: 'oiland|' + land.id,
    dropId: land.id,
    head: landHead(land, i + 1),
    meta: landMeta(ctx, land),
    summary: landSummary(ctx, land),
    letters: byLand.get(land.id),
    // По умолчанию узлы раскрыты: скрывать содержимое объекта при заходе в
    // карточку смысла нет, а вот свернуть лишний участок — полезно.
    open: ctx.ui.accOpen['oiland|' + land.id] !== false,
  }));

  // Группа «Без участка» показывается, только если в ней что-то есть или
  // участков нет вовсе — иначе это пустой лишний узел.
  if (orphans.length || !lands.length) {
    // Разделитель — настоящий элемент, а не тень или псевдоэлемент узла: узел
    // обрезает содержимое по своим скруглениям, и линия либо пропадала, либо
    // наслаивалась на его шапку.
    if (lands.length) nodes.push('<div class="oi-sep" aria-hidden="true"></div>');

    nodes.push(treeNode(ctx, {
      key: 'oiland|none',
      dropId: '',
      head: `<b>Без участка</b><span class="muted">литеры без привязки к земельному участку</span>`,
      meta: '',
      letters: orphans,
      open: ctx.ui.accOpen['oiland|none'] !== false,
    }));
  }

  return `<div class="card t-blue" style="margin-top:12px">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">02</span>
      <h3>Перечень ОИ</h3>
      <span class="hint">участок → литеры; клик по литере — карточка; литеру можно перетащить в другой участок</span>

      <div class="dd" style="margin-left:auto">
        <button class="btn btn-primary btn-sm" data-dd-toggle>+ Добавить ОИ ▾</button>
        <div class="dd-menu">${addOiMenuHTML(ctx.rec)}</div>
      </div>

      <span class="chev" style="margin-left:8px">▾</span>
    </div>

    <div class="card-body-wrap"><div class="oi-tree" data-oi-cols-box style="${oiColsVarsStyle(ctx)}">${nodes.join('')}</div>
      ${popOi ? photoPopHTML(popOi, ctx.ui) : ''}
    </div>
  </div>`;
}
