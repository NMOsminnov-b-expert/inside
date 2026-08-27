import { esc } from '../../../kernel/dom.js';
import {
  orderedColumns, columnVarsStyle, colGroupHTML, headAttrs, colLabelHTML, resizeGripHTML,
} from '../../../kernel/columns.js';
import { fmtEni } from '../../../kernel/fmt.js';
import { cardMeta } from '../oi/registry.js';
import { photoCell, photoPopHTML } from '../parts/photos/blocks.js';
import { addOiMenuHTML } from './addOiMenu.js';

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
  { key: 'letter', label: 'Литера', width: 76, minWidth: 60 },
  { key: 'name', label: 'Наименование', width: 0 },
  { key: 'category', label: 'Категория', width: 140 },
  { key: 'status', label: 'Статус', width: 104 },
  { key: 'area', label: 'Общая площадь', width: 104 },
  { key: 'eni', label: 'Код ЕНИ', width: 150 },
  { key: 'photos', label: 'Фото', width: 74 },
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
    case 'status': return esc(oi.status || '—');
    case 'area': return meta.tableArea(oi);
    case 'eni': return `<span class="mono" title="${esc(oi.eni)}">${esc(fmtEni(oi.eni))}</span>`;
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

function emptyRow(ctx, text) {
  return `<tr><td colspan="${cols(ctx).length}" class="muted" style="padding:8px 10px">${esc(text)}</td></tr>`;
}

// Узел дерева: земельный участок либо служебная группа «Без участка».
// dropId — куда переносить литеру, брошенную на этот узел ('' = снять привязку).
function treeNode(ctx, { key, dropId, head, meta, letters, open }) {
  return `<div class="acc oi-node ${open ? 'open' : ''}" data-oi-drop="${esc(dropId)}">
    <div class="acc-head oi-node-head" data-acc-toggle="${esc(key)}">
      <span class="chev">▾</span>
      ${head}
      <span class="oi-node-count">${letters.length ? `литер: ${letters.length}` : 'литер нет'}</span>
      ${meta}
    </div>
    <div class="acc-body" style="padding:0">
      <table class="tbl oi-tree-tbl">${colGroupHTML(cols(ctx), ctx.ui.oiColWidths)}${headHTML(ctx)}
        <tbody>
          ${letters.length
            ? letters.map((oi) => letterRow(ctx, oi)).join('')
            : emptyRow(ctx, 'Литер нет. Перетащите литеру сюда или добавьте через «+ Добавить ОИ».')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function landHead(land) {
  return `<b>${esc(land.name || 'Земельный участок')}</b>
    <span class="mono oi-node-eni" title="${esc(land.eni)}">${esc(fmtEni(land.eni))}</span>
    <span class="muted">${esc(land.purpose || '—')}</span>`;
}

function landMeta(ctx, land) {
  const meta = cardMeta(land);
  return `<span class="oi-node-area">${meta.tableArea(land)}</span>
    <span class="oi-node-actions">
      <button class="btn btn-ghost btn-sm" data-open-oi="${land.id}" title="Открыть карточку участка">Открыть</button>
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

  const nodes = lands.map((land) => treeNode(ctx, {
    key: 'oiland|' + land.id,
    dropId: land.id,
    head: landHead(land),
    meta: landMeta(ctx, land),
    letters: byLand.get(land.id),
    // По умолчанию узлы раскрыты: скрывать содержимое объекта при заходе в
    // карточку смысла нет, а вот свернуть лишний участок — полезно.
    open: ctx.ui.accOpen['oiland|' + land.id] !== false,
  }));

  // Группа «Без участка» показывается, только если в ней что-то есть или
  // участков нет вовсе — иначе это пустой лишний узел.
  if (orphans.length || !lands.length) {
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
      ${popOi ? photoPopHTML(popOi) : ''}
    </div>
  </div>`;
}
