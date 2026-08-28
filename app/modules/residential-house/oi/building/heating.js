import { esc } from '../../../../kernel/dom.js';
import { HEATING } from '../../data/dictionaries.js';

function optionRow(h, checked) {
  return `<label class="ms-opt"><input type="checkbox" data-heat-opt="${esc(h)}" ${checked ? 'checked' : ''}>${esc(h)}</label>`;
}

// Список перегруппирован на «Выбрано» / «Не выбрано» — иначе при большом
// количестве вариантов приходится долго искать, что уже отмечено.
function dropBodyHTML(heating) {
  const selected = HEATING.filter((h) => heating.includes(h));
  const rest = HEATING.filter((h) => !heating.includes(h));

  return `<div class="dd-group">Выбрано${selected.length ? ` (${selected.length})` : ''}</div>
${selected.length ? selected.map((h) => optionRow(h, true)).join('') : '<div class="muted" style="padding:4px 9px">Ничего не выбрано</div>'}
<div class="dd-group">Не выбрано</div>
${rest.length ? rest.map((h) => optionRow(h, false)).join('') : '<div class="muted" style="padding:4px 9px">Выбрано всё</div>'}`;
}

// Сводка в закрытом виде — одна строка с обрезкой (раньше теги переносились
// и раздували поле по высоте); полный список — в title и в открытом списке.
function summaryHTML(heating) {
  return heating.length
    ? `<span class="ms-summary" title="${esc(heating.join(', '))}">${esc(heating.join(', '))}</span><span class="ms-count">${heating.length}</span>`
    : '<span class="muted">не выбрано</span>';
}

export function heatingMS(ctx, oi) {
  const heating = Array.isArray(oi.heating) ? oi.heating : [];
  const showOther = heating.includes('Прочее (ручной ввод)');

  return `<div class="field" data-heat-field><label>Отопление (мультивыбор)</label>
    <div class="ms">
      <div class="ms-control" data-ms-control data-ms-toggle title="Открыть список">
        ${summaryHTML(heating)}
        <span class="chev">▾</span>
      </div>
      <div class="ms-drop" ${ctx.ui.heatOpen ? '' : 'hidden'}>
        ${dropBodyHTML(heating)}
      </div>
    </div>
    <div data-heat-other-wrap>${showOther ? `<input class="input" data-heat-other placeholder="Укажите отопление вручную" value="${esc(oi.heatingOther || '')}" style="margin-top:5px">` : ''}</div>
  </div>`;
}

// Точечная перерисовка после выбора: сводка, список (перегруппировка) и
// поле ручного ввода — без полного render(), чтобы список не закрывался.
export function updateHeatingUI(ctx, oi) {
  // Искать по первому [data-ms-control] на странице нельзя: с тех пор как поля
  // конструктивного состава тоже стали мультивыбором, первым оказывается
  // «Фундамент», и перерисовка уходила в чужое поле — отопление не обновлялось
  // вовсе, а состав затирался чужой разметкой.
  const box = ctx.scope.$('[data-heat-field]');
  if (!box) return;

  const mc = box.querySelector('[data-ms-control]');
  const drop = box.querySelector('.ms-drop');
  if (!mc && !drop) return;

  const heating = Array.isArray(oi.heating) ? oi.heating : [];

  if (mc) mc.innerHTML = `${summaryHTML(heating)}<span class="chev">▾</span>`;
  if (drop) drop.innerHTML = dropBodyHTML(heating);

  const wrap = box.querySelector('[data-heat-other-wrap]');
  if (wrap) {
    const showOther = heating.includes('Прочее (ручной ввод)');
    wrap.innerHTML = showOther
      ? `<input class="input" data-heat-other placeholder="Укажите отопление вручную" value="${esc(oi.heatingOther || '')}" style="margin-top:5px">`
      : '';
  }

  // Список и поле ручного ввода перерисованы — вешаем слушатели на новые узлы.
  bindHeatOpts(ctx, oi);
}

// Слушатели вешаются ПРЯМО на флажки, а не делегированием на скоуп: контроллер
// карточки перепривязывается на каждой отрисовке, а делегированный слушатель
// живёт на скоупе и переживает замену разметки — они накапливались, и один
// щелчок обрабатывался столько раз, сколько было отрисовок (при чётном числе
// выбор не срабатывал вовсе). Прямые слушатели умирают вместе со своими
// элементами; после перерисовки списка их вешает сама updateHeatingUI.
function bindHeatOpts(ctx, oi) {
  const box = ctx.scope.$('[data-heat-field]');
  if (!box) return;

  box.querySelectorAll('[data-heat-opt]').forEach((cb) => {
    cb.onchange = () => {
      const h = cb.dataset.heatOpt;
      oi.heating = Array.isArray(oi.heating) ? oi.heating : [];
      const i = oi.heating.indexOf(h);
      if (i >= 0) oi.heating.splice(i, 1); else oi.heating.push(h);
      updateHeatingUI(ctx, oi);
    };
  });

  const other = box.querySelector('[data-heat-other]');
  if (other) other.onchange = () => { oi.heatingOther = other.value; };
}

export function bindHeating(ctx, oi) {
  if (!oi) return;
  bindHeatOpts(ctx, oi);
}
