// Столбцы таблиц: состав, порядок, ширина — одним механизмом на весь проект
// (Л1.1, Л1.6; требование «во всех таблицах» — A6 в docs/tz/00-tz.md).
//
// Почему здесь, а не в реестре: таблицы есть и в реестре, и в карточках
// (перечень ОИ, документы, арендные площади). Держать в каждой свою механику
// перетаскивания — это пять расходящихся реализаций, поэтому механика одна, а
// набор столбцов у каждой таблицы свой.
//
// Механизм рассчитан на ДВА разных вида разметки, потому что в проекте есть оба:
//   * flex-таблица реестра — `.reg-thead` / `.reg-tr` из <div>;
//   * настоящая <table> с <colgroup> в карточках.
// Общее у них одно — ширина столбца берётся из CSS-переменной на контейнере
// (`--cw-<ключ>`). Отсюда два важных следствия:
//   1. При растягивании мышью не нужна перерисовка: меняется одно свойство на
//      контейнере, и ширину подхватывают все ячейки сразу. Для реестра это
//      обязательно — там строки виртуализированы и живут только видимые.
//   2. Разметка ячейки не зависит от текущей ширины, поэтому её можно
//      перерисовывать в любой момент, не заботясь о ширинах.
//
// Состояние столбцов таблица хранит у себя (у реестра — в state, у карточки — в
// ui): `order` — массив ключей в порядке показа (он же состав: чего нет в
// массиве, того нет в таблице), `widths` — { ключ: px } только для изменённых
// вручную. Ключ, которого нет в widths, берёт ширину из описания столбца.

// Описание столбца, которое ждут функции ниже:
//   key      — ключ (обязателен), он же имя CSS-переменной;
//   label    — подпись в шапке;
//   width    — ширина по умолчанию в px; 0 или не задана = «тянущийся» столбец;
//   minWidth — минимум при растягивании (по умолчанию MIN_W);
//   align    — 'right' для чисел;
//   fixed    — служебный столбец (чекбокс, кнопки): не двигается, не тянется,
//              не прячется и в меню не показывается.

const MIN_W = 46;
// Ширина по умолчанию для столбца, у которого своя не задана: он «резиновый» —
// забирает остаток ширины таблицы (см. fitWidths).
const FLEX_BASIS = 240;
const FLEX_MIN = 190;

export const colVar = (key) => '--cw-' + key;

// --- Состав и порядок ------------------------------------------------------

// Столбцы в порядке показа. Порядок задаёт order, а не порядок описаний:
// иначе перетаскивание было бы бессмысленным. Неизвестные ключи из order
// выбрасываются молча — состав столбцов мог измениться после сохранения.
//
// Закреплённые (fixed) столбцы в перестановке не участвуют и остаются на своей
// стороне таблицы: те, что в описаниях стоят до первого обычного столбца, —
// слева (флажок выбора в реестре), те, что после последнего, — справа (столбец
// кнопок в перечне ОИ). Раньше все закреплённые уезжали в начало, и кнопки
// удаления оказывались перед литерой.
export function orderedColumns(defs, order) {
  const byKey = new Map(defs.map((c) => [c.key, c]));
  const first = defs.findIndex((c) => !c.fixed);
  const last = defs.length - 1 - [...defs].reverse().findIndex((c) => !c.fixed);

  const lead = first < 0 ? defs.filter((c) => c.fixed) : defs.slice(0, first).filter((c) => c.fixed);
  const tail = first < 0 ? [] : defs.slice(last + 1).filter((c) => c.fixed);
  const moving = (order || []).map((k) => byKey.get(k)).filter((c) => c && !c.fixed);

  return [...lead, ...moving, ...tail];
}

// Ключи, которыми можно управлять (служебные столбцы не в счёт).
export const movableKeys = (defs) => defs.filter((c) => !c.fixed).map((c) => c.key);

// Привести порядок к описаниям: убрать исчезнувшие ключи, дописать новые в
// конец. Нужно, когда COLUMNS пополнили, а у пользователя остался старый order.
export function normalizeOrder(defs, order, defaults) {
  const known = new Set(movableKeys(defs));
  const kept = (order || []).filter((k) => known.has(k));
  if (!kept.length) return (defaults || movableKeys(defs)).filter((k) => known.has(k));
  return kept;
}

// Показать/скрыть столбец. Появившийся встаёт на своё место по описаниям, а не
// в конец: иначе включение случайно снятого столбца ломает привычный порядок.
export function toggleColumn(defs, order, key, on) {
  if (!on) return order.filter((k) => k !== key);
  if (order.includes(key)) return order.slice();

  const all = movableKeys(defs);
  const target = all.indexOf(key);
  const out = order.slice();
  let at = out.length;
  for (let i = 0; i < out.length; i++) {
    if (all.indexOf(out[i]) > target) { at = i; break; }
  }
  out.splice(at, 0, key);
  return out;
}

// Переставить столбец перед указанным (before = null → в конец).
export function moveColumn(order, key, before) {
  const out = order.filter((k) => k !== key);
  const at = before == null ? out.length : out.indexOf(before);
  out.splice(at < 0 ? out.length : at, 0, key);
  return out;
}

// --- Ширины ----------------------------------------------------------------

export function columnWidth(col, widths) {
  const w = widths && widths[col.key];
  return w == null ? (col.width || 0) : w;
}

// Строка style для КОНТЕЙНЕРА таблицы: объявляет `--cw-*` для всех столбцов.
// Тянущийся столбец переменной не получает — его ширину считает сам flex/table.
export function columnVarsStyle(cols, widths) {
  return cols
    .map((c) => [c, columnWidth(c, widths)])
    .filter(([, w]) => w > 0)
    .map(([c, w]) => `${colVar(c.key)}:${w}px`)
    .join(';');
}

// Строка style для ЯЧЕЙКИ flex-таблицы (шапка и строки — одинаково).
//
// Ширина точная и не сжимается (flex:0 0). Тянущихся столбцов нет вовсе — и это
// требование модели «перегородка»: пока хоть один столбец подбирает остаток,
// изменение любой ширины сдвигает все края, и перегородка под курсором едет не
// туда. Вместо растягивания раскладку подгоняет fitWidths(): сумма ширин всегда
// равна ширине таблицы, поэтому и уехать за экран нечему.
export function cellStyle(col, widths) {
  const v = `var(${colVar(col.key)}, ${columnWidth(col, widths) || FLEX_BASIS}px)`;
  return `width:${v};flex:0 0 ${v}`;
}

// Подогнать раскладку под ширину таблицы: сумма ширин должна быть равна
// доступному месту. Разницу первым делом отдаём (или забираем у) «резинового»
// столбца — того, у которого своей ширины в описании нет; если его не хватает,
// остаток расходится по остальным пропорционально, но не ниже их минимумов.
//
// Отбирать нужно не реже, чем раздавать: столбец, скрытый и снова включённый,
// приносит с собой свою ширину, и без этого сумма вылезала за таблицу.
//
// Подгонка НЕ работает после перетаскивания перегородки: иначе она подвинула бы
// резиновый столбец, а с ним и все перегородки правее — ровно то, чего при
// независимых перегородках быть не должно. Её зовут только при отрисовке и при
// смене ширины самой таблицы.
export function fitWidths(cols, widths, avail) {
  const movable = cols.filter((c) => !c.fixed);
  if (!movable.length || avail <= 0) return {};

  const w = movable.map((c) => columnWidth(c, widths) || c.width || FLEX_BASIS);
  // Минимум не может быть больше уже заданной ширины. Иначе подгонка «поднимает»
  // столбец до минимума и отбирает разницу у соседей — вручную выставленная
  // перегородкой ширина уезжала при первой же перерисовке, и подгонка
  // переставала быть повторяемой.
  const mins = movable.map((c, i) => Math.min(c.minWidth || ((c.width || 0) ? MIN_W : FLEX_MIN), w[i]));
  const rubber = movable.findIndex((c) => !(c.width || 0));

  let diff = Math.round(avail - w.reduce((a, x) => a + x, 0));

  if (rubber >= 0 && diff) {
    const take = diff > 0 ? diff : Math.max(diff, mins[rubber] - w[rubber]);
    w[rubber] += take;
    diff -= take;
  }

  // Осталось только отбирать (излишек раздан резиновому целиком) — снимаем со
  // всех остальных пропорционально их ширине, каждого не ниже его минимума.
  // Несколько проходов: у кого-то места нет, его доля переходит другим.
  for (let pass = 0; pass < 4 && diff < 0; pass++) {
    const idx = movable.map((_, i) => i).filter((i) => i !== rubber && w[i] > mins[i]);
    if (!idx.length) break;
    const total = idx.reduce((a, i) => a + w[i], 0) || 1;
    let spent = 0;
    idx.forEach((i, n) => {
      const share = n === idx.length - 1 ? diff - spent : Math.round(diff * (w[i] / total));
      const next = Math.max(mins[i], w[i] + share);
      spent += next - w[i];
      w[i] = next;
    });
    if (!spent) break;
    diff -= spent;
  }

  const out = {};
  movable.forEach((c, i) => { out[c.key] = w[i]; });
  return out;
}

// Проставить подогнанную раскладку переменными на контейнере.
//
// Результат НЕ сохраняется в состояние намеренно. В состоянии лежит исходная
// раскладка — умолчания плюс то, что человек задал перегородками, — и подгонка
// каждый раз считается от неё. Если сохранять подогнанное, следующий пересчёт
// пойдёт уже от него: при сжатии ужимаются все столбцы, а при обратном
// расширении растёт только «резиновый», и раскладка не возвращается в исходную.
export function applyFit(box, cols, widths, reserve = 0) {
  const fit = fitWidths(cols, widths, box.clientWidth - reserve);
  Object.entries(fit).forEach(([k, v]) => box.style.setProperty(colVar(k), v + 'px'));
  return fit;
}

// <colgroup> для настоящей <table> (таблицы внутри карточек). Ширины — те же
// переменные, что и у flex-таблицы реестра, поэтому перетаскивание перегородки
// работает и здесь без перерисовки. Таблице нужен table-layout:fixed, иначе
// браузер посчитает ширины по содержимому и colgroup будет проигнорирован.
export function colGroupHTML(cols, widths) {
  const cells = cols.map((c) => {
    const w = columnWidth(c, widths) || c.width || 0;
    return w > 0 ? `<col style="width:var(${colVar(c.key)}, ${w}px)">` : '<col>';
  });
  return `<colgroup>${cells.join('')}</colgroup>`;
}

// Атрибуты для ячейки ШАПКИ: по ним механика находит столбец. Ручку
// растягивания добавляет сама разметка через resizeGripHTML.
export function headAttrs(col) {
  return `data-col="${col.key}"${col.fixed ? '' : ' draggable="true"'}`;
}

// Подпись столбца в шапке. Обёртка обязательна: она сжимается и укорачивает
// текст многоточием, тогда как сама ячейка шапки прижимает содержимое к своему
// краю и без обёртки резала бы подпись как попало.
export const colLabelHTML = (col) => `<span class="col-label">${col.label}</span>`;

// Перегородка стоит МЕЖДУ двумя столбцами, поэтому её получают все, кроме
// последнего: справа от него двигать нечего. Служебные столбцы (флажок) — тоже
// без перегородки.
//
// Раньше перегородку не получал ещё и «резиновый» столбец (у него нет своей
// ширины в описании) — граница выходила «то есть, то нет»: на его правом крае
// ухватиться было не за что, а ближайшая принадлежала соседу, и двигался не тот
// столбец, которого ждали.
export const resizeGripHTML = (col, isLast) =>
  (col.fixed || isLast ? '' : `<span class="col-grip" data-col-grip="${col.key}" title="Потянуть — изменить ширину"></span>`);

// --- Механика: перетаскивание порядка и растягивание ширины ----------------

// Перегородка между двумя столбцами.
//
// Перегородка приклеена к своему месту на экране и меняет ширины ТОЛЬКО тех двух
// ячеек, между которыми стоит: левая растёт на столько, на сколько правая
// уменьшилась. Остальные перегородки не двигаются вовсе, общая ширина таблицы не
// меняется, поэтому ни уехать за экран, ни обрезаться нечему. Ход перегородки
// равен ходу мыши 1:1, пока одна из двух ячеек не упрётся в свой минимум.
// Так решил пользователь 2026-08-27: «движение одной перегородки не сдвигает
// другие визуально, остальные как бы приклеены к позиции на экране; перегородка
// меняет ширины только тех ячеек, между которыми стоит».
//
// Пока тянем, меняются только CSS-переменные на контейнере: ни перерисовки, ни
// записи в состояние. Состояние пишется один раз, когда отпустили — иначе на
// каждый пиксель шёл бы render, а у реестра это перевыборка 20 000 строк.
export function bindColumnResize(scope, opts) {
  const { rootSel, cols, onCommit } = opts;

  scope.$$('[data-col-grip]').forEach((grip) => {
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const box = scope.$(rootSel);
      const th = grip.closest('[data-col]');
      if (!box || !th) return;

      // Правый сосед — вторая половина этой перегородки.
      const next = th.nextElementSibling;
      if (!next || !next.dataset.col) return;

      const byKey = new Map(cols.map((c) => [c.key, c]));
      const keyL = th.dataset.col;
      const keyR = next.dataset.col;
      const minOf = (key, shown) => Math.min((byKey.get(key) || {}).minWidth || MIN_W, shown);

      const wL = Math.round(th.getBoundingClientRect().width);
      const wR = Math.round(next.getBoundingClientRect().width);
      const minL = minOf(keyL, wL);
      const minR = minOf(keyR, wR);

      const x0 = e.clientX;
      let d = 0;

      grip.setPointerCapture(e.pointerId);
      box.classList.add('col-resizing');
      grip.classList.add('active');

      const move = (ev) => {
        d = Math.max(minL - wL, Math.min(wR - minR, Math.round(ev.clientX - x0)));
        box.style.setProperty(colVar(keyL), (wL + d) + 'px');
        box.style.setProperty(colVar(keyR), (wR - d) + 'px');
      };
      const up = () => {
        grip.releasePointerCapture(e.pointerId);
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        box.classList.remove('col-resizing');
        grip.classList.remove('active');
        if (!d) return;

        // Сохраняем ВСЮ раскладку, а не только две изменённые ячейки. В
        // состоянии до этого лежали умолчания, а на экране — подогнанные под
        // ширину величины; записав только две, мы получили бы смесь, сумма
        // которой не сходится с шириной таблицы, и следующая подгонка тут же
        // переставила бы столбцы.
        const patch = {};
        th.parentElement.querySelectorAll('[data-col]').forEach((cell) => {
          const k = cell.dataset.col;
          patch[k] = k === keyL ? wL + d : (k === keyR ? wR - d : Math.round(cell.getBoundingClientRect().width));
        });
        onCommit(patch);
      };

      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
  });
}

// Перетаскивание порядка. Перетаскиваем ячейку шапки на другую — столбец
// встаёт перед ней. HTML5 drag-and-drop, как у литер в перечне ОИ, чтобы
// поведение в проекте было одно и то же.
export function bindColumnReorder(scope, opts) {
  const { headSel, order, onCommit } = opts;
  let dragKey = null;

  scope.$$(`${headSel} [data-col][draggable="true"]`).forEach((th) => {
    const key = th.dataset.col;

    th.addEventListener('dragstart', (e) => {
      // Тянут за ручку ширины — это не перенос столбца.
      if (e.target.closest('[data-col-grip]')) { e.preventDefault(); return; }
      dragKey = key;
      e.dataTransfer.setData('text/plain', key);
      e.dataTransfer.effectAllowed = 'move';
      th.classList.add('col-dragging');
    });

    th.addEventListener('dragend', () => {
      dragKey = null;
      th.classList.remove('col-dragging');
      scope.$$('[data-col]').forEach((x) => x.classList.remove('col-drop'));
    });

    th.addEventListener('dragover', (e) => {
      if (!dragKey || dragKey === key) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      th.classList.add('col-drop');
    });

    th.addEventListener('dragleave', () => th.classList.remove('col-drop'));

    th.addEventListener('drop', (e) => {
      // Тащат не столбец, а что-то другое (например, литеру в дереве ОИ) —
      // не вмешиваемся: иначе stopPropagation ниже съедал бы чужой бросок, и
      // литера, брошенная на шапку таблицы, никуда не попадала.
      if (!dragKey) return;

      e.preventDefault();
      e.stopPropagation();
      th.classList.remove('col-drop');

      const from = e.dataTransfer.getData('text/plain') || dragKey;
      if (!from || from === key) return;
      onCommit(moveColumn(order, from, key));
    });
  });
}

// --- Меню состава и порядка ------------------------------------------------

// Меню: только СОСТАВ столбцов и сброс (Л1.6). Порядок в меню не меняется —
// его меняют перетаскиванием шапки таблицы, это удобнее стрелок (решение
// пользователя 2026-08-27). Скрытые столбцы идут после видимых, иначе список
// прыгает при каждом переключении.
export function columnsMenuHTML(defs, order, opts = {}) {
  const title = opts.title || 'Столбцы';
  const shown = orderedColumns(defs, order).filter((c) => !c.fixed);
  const hidden = defs.filter((c) => !c.fixed && !order.includes(c.key));

  const row = (c, on) => `<label class="col-opt ${on ? '' : 'off'}">
    <input type="checkbox" data-column="${c.key}" ${on ? 'checked' : ''}>
    <span class="ell">${c.label}</span>
  </label>`;

  return `<div class="dd-group col-head">${title}
      <button class="col-reset" data-col-reset title="Вернуть состав, порядок и ширину по умолчанию">сброс</button>
    </div>
    <div class="col-list">
      ${shown.map((c) => row(c, true)).join('')}
      ${hidden.length ? '<div class="col-sep">скрытые</div>' : ''}
      ${hidden.map((c) => row(c, false)).join('')}
    </div>
    <div class="col-hint">Порядок и ширину меняют прямо в шапке таблицы: заголовок перетащить, за его правый край потянуть.</div>`;
}

// Обработчики меню. Возвращают наружу новое состояние — писать его и
// перерисовывать таблица решает сама.
export function bindColumnsMenu(scope, opts) {
  const { defs, order, onOrder, onReset } = opts;

  scope.$$('[data-column]').forEach((cb) => cb.onchange = (e) => {
    e.stopPropagation();
    onOrder(toggleColumn(defs, order, cb.dataset.column, cb.checked));
  });

  const reset = scope.$('[data-col-reset]');
  if (reset) reset.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    onReset();
  };
}

// Всё сразу — чтобы таблице не приходилось помнить три вызова.
export function bindColumns(scope, opts) {
  bindColumnResize(scope, opts);
  bindColumnReorder(scope, opts);
  bindColumnsMenu(scope, opts);
}
