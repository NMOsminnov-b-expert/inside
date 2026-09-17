import { esc } from '../../../kernel/dom.js';
import {
  orderedColumns, columnVarsStyle, colGroupHTML, headAttrs, colLabelHTML, resizeGripHTML,
} from '../../../kernel/columns.js';
import { fmtEni, fmtNum } from '../../../kernel/fmt.js';
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
  //
  // minWidth — граница, ниже которой столбец не сжимается. Без неё подгонка
  // (kernel/columns.js, fitWidths) ужимала столбцы до 46 px, когда рядом
  // открыт просмотрщик документов: «1 840,00 м²» превращалось в «184… м²», а
  // подписи — в «НАЗНА…». Теперь вместо сжатия перечень прокручивается внутри
  // своей обёртки — принятое решение для широкой таблицы в узком месте.
  { key: 'letter', label: 'Литера', width: 76, minWidth: 60 },
  { key: 'eni', label: 'Код ЕНИ', width: 150, minWidth: 120 },
  { key: 'name', label: 'Наименование', width: 0 },
  // Столбец показывает oi.catClass — то же поле, что в карточке литеры
  // подписано «Назначение по тех паспорту», и то же слово стоит в шапке ОЦ.
  // Называлось «Категория», хотя «Категория ОИ» — другое поле (oi.oiCategory,
  // сгруппированный справочник классов), и в перечень оно не выводится вовсе
  // (расхождение № 1, docs/tz/52-reestr-polej-kartochki-oc.md).
  { key: 'category', label: 'Назначение по ТП', width: 140, minWidth: 110 },
    // 128, а не 104: «Вспомогательное» — самое длинное значение статуса, и при
  // прежней ширине оно обрезалось в «Вспомогате…» у каждой постройки.
  { key: 'status', label: 'Статус', width: 128, minWidth: 96 },
  // Названия совпадают с карточкой литеры: там площади 09.09.2026 названы по
  // техпаспорту — по внешним замерам и по внутреннему обмеру. В перечне они
  // назывались «Общая площадь», и одно и то же поле читалось по-разному.
  { key: 'area', label: 'По внешним замерам', width: 118, minWidth: 96 },
  { key: 'areaBuild', label: 'По внутр. обмеру', width: 118, minWidth: 96 },
  { key: 'photos', label: 'Фото', width: 74, minWidth: 60 },
  { key: 'act', label: '', width: 52, fixed: true },
];

export const OI_COLUMNS_DEFAULT = OI_COLUMNS.filter((c) => !c.fixed).map((c) => c.key);

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
// Гараж, навес, летняя кухня. Это объект имущества, но урезанный: своего экрана
// у него нет, и всё, что о нём известно, правится прямо здесь — строка
// раскрывается вниз (решение пользователя 17.09.2026).
//
// Почему раскрытием, а не отдельной карточкой и не правкой в самой строке:
// полей семь, и три из них — выбор нескольких материалов, в ячейку такой не
// помещается; уводить же на отдельный экран ради семи полей — лишний переход.
// Раскрывающаяся панель под строкой — обычное решение для этого случая
// (MUI X «Master-detail row panels», PatternFly «Inline edit»): контекст
// соседних строк остаётся на экране.
//
// Конструктив — только три элемента: фундамент, стены, кровля. Остальное у
// вспомогательной постройки не описывают.
const AUX_STRUCT_ROWS = [
  { key: 'foundation', label: 'Фундамент' },
  { key: 'wallsExt', label: 'Стены' },
  { key: 'roof', label: 'Кровля' },
];

// Панель открыта одна за раз: две раскрытые строки разносят перечень по высоте
// так, что соседние постройки уже не видны, — а ради них панель и внизу строки.
const auxOpen = (ctx, oi) => ctx.ui.auxOpen === oi.id;

function auxPanelHTML(ctx, oi) {
  const a = oi.areas || {};

  return `<div class="oi-aux-panel">
    <div class="grid g-4">
      <div class="field"><label>Наименование</label>
        <input class="input" data-aux-name="${oi.id}" value="${esc(oi.name || '')}"
          placeholder="Гараж, навес, летняя кухня"></div>
      <div class="field"><label>Литера</label>
        <input class="input" data-aux-letter="${oi.id}" value="${esc(oi.letter || '')}"></div>
      <div class="field"><label>По внешним замерам, м²</label>
        <input class="input" data-aux-area="${oi.id}" value="${esc(a.tp || '')}" inputmode="decimal"></div>
      <div class="field"><label>По внутр. обмеру, м²</label>
        <input class="input" data-aux-build="${oi.id}" value="${esc(a.build || '')}" inputmode="decimal"></div>
    </div>

    <div class="oi-aux-sub">Конструктив</div>
    <div class="grid g-3">
      ${AUX_STRUCT_ROWS.map((r) => structMS(oi, r.key, r.label,
    opt('building', 'struct.' + r.key, STRUCT[r.key]), false, false)).join('')}
    </div>

    <div class="oi-aux-sub">Фото</div>
    <div class="oi-aux-photos">${photoAccordions(ctx.ui, oi, true)}</div>
  </div>`;
}

// Ячейки строки — те же, что у литеры, кроме первой: вместо «взяться и
// перетащить» там шеврон, потому что клик по строке раскрывает её, а не
// открывает экран. Перетащить постройку в другой участок по-прежнему можно —
// за ту же ячейку.
function auxCellHTML(ctx, oi, key) {
  if (key === 'letter') {
    return `<span class="chev aux-chev">▾</span><span class="drag-grip" title="Перетащить">⠿</span>${esc(oi.letter || '—')}`;
  }
  return cellHTML(ctx, oi, key);
}

// Ячейки строки отдельной функцией: пока постройку правят в панели, строка над
// ней обновляется ими же — точечно, без отрисовки перечня. Полная отрисовка
// заменила бы и саму панель вместе с полем, в котором стоит курсор.
export function auxRowCellsHTML(ctx, oi) {
  return cols(ctx).map((c) => `<td data-aux-cell="${c.key}">${auxCellHTML(ctx, oi, c.key)}</td>`).join('');
}

// Подытог того же раздела — из той же функции, что рисует его при отрисовке:
// иначе точечное обновление считало бы сумму по своим правилам.
export function auxTotalHTML(ctx, list) {
  return totalRow(ctx, list);
}

function auxRow(ctx, oi) {
  const open = auxOpen(ctx, oi);

  return `<tr class="rowlink oi-aux ${open ? 'open' : ''}" draggable="true"
      data-aux-toggle="${oi.id}" data-drag-oi="${oi.id}" aria-expanded="${open}"
      title="Клик — развернуть постройку; перетащите, чтобы перенести к другому участку">
    ${auxRowCellsHTML(ctx, oi)}
  </tr>${open ? `<tr class="oi-aux-panel-row"><td colspan="${cols(ctx).length}">${auxPanelHTML(ctx, oi)}</td></tr>` : ''}`;
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
//
// row — чем рисуется строка раздела: у литер это строка-ссылка на карточку, у
// вспомогательных построек — строка, раскрывающаяся вниз.
function sub(ctx, { label, list, emptyText, kind, withHead, total, row }) {
  const rowHTML = row || letterRow;

  return `<div class="oi-sub" data-oi-sub="${kind}">
    ${label ? `<div class="oi-sub-h">${label}</div>` : ''}
    <table class="tbl oi-tree-tbl">${colGroupHTML(cols(ctx), ctx.ui.oiColWidths)}${withHead ? headHTML(ctx) : ''}
      <tbody>${list.length ? list.map((oi) => rowHTML(ctx, oi)).join('') : emptyRow(ctx, emptyText)}</tbody>
      ${total && list.length ? `<tfoot>${totalRow(ctx, list)}</tfoot>` : ''}
    </table>
  </div>`;
}

function treeNode(ctx, { key, dropId, head, meta, letters, open, summary }) {
  const real = letters.filter((o) => o.card !== 'movable' && o.card !== 'aux');
  const aux = letters.filter((o) => o.card === 'aux');
  const movable = letters.filter((o) => o.card === 'movable');

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
    label: summary ? 'Здания и сооружения на земельном участке' : 'Здания и сооружения',
    list: real,
    emptyText: 'Литер нет. Перетащите литеру сюда или добавьте через «+ Добавить ОИ».',
    kind: 'real',
    total: true,
  })}
      ${sub(ctx, {
    label: 'Вспомогательные постройки',
    list: aux,
    emptyText: 'Не добавлено. Гараж, навес, летняя кухня добавляются через «+ Добавить ОИ».',
    kind: 'aux',
    total: true,
    row: auxRow,
  })}
      ${movable.length
    ? sub(ctx, { label: 'Движимое имущество', list: movable, emptyText: '', kind: 'movable' })
    : ''}
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
        <div class="dd-menu">${addOiMenuHTML()}</div>
      </div>

      <span class="chev" style="margin-left:8px">▾</span>
    </div>

    <div class="card-body-wrap"><div class="oi-tree" data-oi-cols-box style="${oiColsVarsStyle(ctx)}">${nodes.join('')}</div>
      ${popOi ? photoPopHTML(popOi, ctx.ui) : ''}
    </div>
  </div>`;
}
