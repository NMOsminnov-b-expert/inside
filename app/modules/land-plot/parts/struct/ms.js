import { esc } from '../../../../kernel/dom.js';

// Мультивыбор материалов в конструктивном составе (Л3.х): фундамент, стены,
// перекрытия, кровля, полы, окна, двери. Каждое поле работает так же, как
// «Отопление» — в одном элементе может быть несколько материалов (кирпич и
// монолит, металл и профлист), одним значением это не описать.
//
// Разметка та же, что у отопления (.ms / .ms-control / .ms-drop), поэтому
// открытие и закрытие списка уже обеспечивает общий обработчик [data-ms-toggle]
// в контроллере карточки — здесь только содержимое и точечная перерисовка.

// В данных материал может лежать строкой (так было до мультивыбора) или
// массивом. Читаем всегда как массив, чтобы старые записи не падали.
export function structList(oi, key) {
  const v = (oi.struct || {})[key];
  if (Array.isArray(v)) return v.filter(Boolean);
  return v ? [v] : [];
}

// Список значений запоминаем при отрисовке, по ключу поля. Брать его по ключу
// из словаря нельзя: у «Внутренних стен» ключ wallsInt, а значения — STRUCT.wallsExt
// (свой список для внутренних стен не заводили). При точечной перерисовке
// STRUCT[key] давал undefined, и поле перерисовывалось с пустым списком.
const OPTS = new Map();

const isOther = (list) => list.some((v) => String(v).includes('Прочее'));

function optionRow(key, v, checked) {
  return `<label class="ms-opt"><input type="checkbox" data-struct-opt="${esc(key)}|${esc(v)}" ${checked ? 'checked' : ''}>${esc(v)}</label>`;
}

// Список делится на «Выбрано» / «Не выбрано» — как у отопления: иначе при
// длинном перечне материалов приходится искать, что уже отмечено.
function dropBodyHTML(key, opts, list) {
  const sel = opts.filter((o) => list.includes(o));
  const rest = opts.filter((o) => !list.includes(o));

  return `<div class="dd-group">Выбрано${sel.length ? ` (${sel.length})` : ''}</div>
${sel.length ? sel.map((o) => optionRow(key, o, true)).join('') : '<div class="muted" style="padding:4px 9px">Ничего не выбрано</div>'}
<div class="dd-group">Не выбрано</div>
${rest.length ? rest.map((o) => optionRow(key, o, false)).join('') : '<div class="muted" style="padding:4px 9px">Выбрано всё</div>'}`;
}

// Свёрнутый вид — одна строка с обрезкой: перенос тегов раздувал бы поле по
// высоте и ломал сетку. Полный перечень — в подсказке и в открытом списке.
function summaryHTML(list) {
  return list.length
    ? `<span class="ms-summary" title="${esc(list.join(', '))}">${esc(list.join(', '))}</span><span class="ms-count">${list.length}</span>`
    : '<span class="muted">не выбрано</span>';
}

function otherHTML(oi, key, list) {
  if (!isOther(list)) return '';
  const other = (oi.structOther || {})[key] || '';
  return `<input class="input" data-struct-other="${esc(key)}" placeholder="Укажите вручную" value="${esc(other)}" style="margin-top:5px">`;
}

export function structMS(oi, key, label, opts, req) {
  const list = structList(oi, key);
  OPTS.set(key, opts || []);

  return `<div class="field" data-struct-field="${esc(key)}">
    <label>${label}${req ? '<span class="req">*</span>' : ''}</label>
    <div class="ms">
      <div class="ms-control" data-ms-control data-ms-toggle title="Открыть список материалов">
        ${summaryHTML(list)}
        <span class="chev">▾</span>
      </div>
      <div class="ms-drop" hidden>${dropBodyHTML(key, opts, list)}</div>
    </div>
    <div data-struct-other-wrap="${esc(key)}">${otherHTML(oi, key, list)}</div>
  </div>`;
}

// Точечная перерисовка одного поля после выбора: сводка, перегруппированный
// список и поле ручного ввода. Полный render() закрыл бы список.
export function updateStructUI(scope, oi, key) {
  const box = scope.$(`[data-struct-field="${key}"]`);
  if (!box) return;
  const opts = OPTS.get(key) || [];

  const list = structList(oi, key);
  const mc = box.querySelector('[data-ms-control]');
  const drop = box.querySelector('.ms-drop');
  const wrap = box.querySelector(`[data-struct-other-wrap="${key}"]`);

  if (mc) mc.innerHTML = `${summaryHTML(list)}<span class="chev">▾</span>`;
  if (drop) drop.innerHTML = dropBodyHTML(key, opts, list);
  if (wrap) wrap.innerHTML = otherHTML(oi, key, list);

  // Список и поле ручного ввода перерисованы — слушатели на прежних элементах
  // умерли вместе с ними, вешаем на новые.
  bindOpts(scope, oi, box);
}

// Перевод старых записей на новую форму данных: материал был строкой, стал
// массивом. Делается до отрисовки — иначе перевод попал бы в лог правок как
// правка пользователя (та же причина, что у buildFloors и особенностей).
export function migrateStruct(rec) {
  if (!rec || !Array.isArray(rec.oi)) return;

  rec.oi.forEach((oi) => {
    const st = oi.struct;
    if (!st) return;
    Object.keys(st).forEach((k) => {
      if (!Array.isArray(st[k])) st[k] = st[k] ? [st[k]] : [];
    });
  });
}

// Слушатели выбора вешаются ПРЯМО на флажки, а не делегированием на скоуп.
// Причина: контроллер карточки ОИ перепривязывается на каждой отрисовке, а
// делегированный слушатель живёт на скоупе и переживает замену разметки —
// они накапливались, и один щелчок обрабатывался столько раз, сколько было
// отрисовок (при чётном числе выбор просто не срабатывал). Прямые слушатели
// умирают вместе со своими элементами, поэтому накопиться не могут; после
// точечной перерисовки списка их вешает сама updateStructUI.
function bindOpts(scope, oi, box) {
  box.querySelectorAll('[data-struct-opt]').forEach((cb) => {
    cb.onchange = () => {
      const [key, value] = cb.dataset.structOpt.split('|');
      oi.struct = oi.struct || {};
      const list = structList(oi, key);
      const i = list.indexOf(value);
      if (i >= 0) list.splice(i, 1); else list.push(value);
      oi.struct[key] = list;
      updateStructUI(scope, oi, key);
    };
  });

  const other = box.querySelector('[data-struct-other]');
  if (other) other.onchange = () => {
    oi.structOther = oi.structOther || {};
    oi.structOther[other.dataset.structOther] = other.value;
  };
}

export function bindStruct(ctx, oi) {
  if (!oi) return;
  ctx.scope.$$('[data-struct-field]').forEach((box) => bindOpts(ctx.scope, oi, box));
}
