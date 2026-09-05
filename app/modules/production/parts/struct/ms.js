import { msDropBodyHTML, bindMsSearch } from '../../../../kernel/multiSelect.js';
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

// Тело списка — общее для всех мультивыборов проекта (kernel/multiSelect.js):
// деление на «Выбрано / Не выбрано» и поиск по значениям. Материалов в словаре
// много, и без поиска нужный ищется глазами по всему перечню.
function dropBodyHTML(key, opts, list) {
  return msDropBodyHTML({
    options: opts,
    selected: list,
    optAttr: 'struct-opt',
    value: (v) => `${key}|${v}`,
  });
}

// Свёрнутый вид — одна строка с обрезкой: перенос тегов раздувал бы поле по
// высоте и ломал сетку. Полный перечень — в подсказке и в открытом списке.
//
// Разделитель — « / », а не запятая (Л3.2): в названиях материалов запятая
// встречается сама по себе («кирпич, силикатный»), и перечисление через неё
// читается как один длинный материал.
function summaryHTML(list) {
  const text = list.join(' / ');
  return list.length
    ? `<span class="ms-summary" title="${esc(text)}">${esc(text)}</span><span class="ms-count">${list.length}</span>`
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
    if (st) {
      Object.keys(st).forEach((k) => {
        if (!Array.isArray(st[k])) st[k] = st[k] ? [st[k]] : [];
        // «Не указано» больше не значение перечня: пустой выбор показывается
        // самим полем («не выбрано»), а выбранным материалом это быть не может
        // — иначе «Не указано» отмечалось галочкой рядом с кирпичом (решение
        // пользователя 05.09.2026).
        st[k] = st[k].filter((v) => v !== 'Не указано');
      });
    }

    // Износ: пустой пункт называется «Не выбрано» — одинаково по всему макету.
    const wear = oi.wear;
    if (wear) {
      Object.keys(wear).forEach((k) => {
        if (wear[k] === 'Не указано') wear[k] = 'Не выбрано';
      });
    }
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
  // Поиск по списку — общая часть всех мультивыборов (kernel/multiSelect.js).
  bindMsSearch(box.querySelector('.ms-drop'));

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
