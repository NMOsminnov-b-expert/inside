// Благоустройство участка — два мультивыбора в блоке 03 (просьба пользователя
// 2026-09-02). Одним списком делать нельзя: ограждение с асфальтом и плодовые
// деревья — разные по природе вещи, и оценщик ищет их в разных местах. Деление
// на группы задано пользователем — «то, что относится к постройкам, в одну
// сторону, остальное в другую»; сам состав групп — в data/dictionaries.js,
// чтобы правился без захода в разметку.
//
// Разметка и поведение те же, что у инженерного оснащения (.ms/.ms-drop):
// открытие и закрытие обеспечивает общий обработчик [data-ms-toggle] в
// контроллере карточки, здесь только содержимое и точечная перерисовка.
import { msDropBodyHTML, bindMsSearch } from '../../../../kernel/multiSelect.js';
import { esc } from '../../../../kernel/dom.js';
import { IMPROVEMENT_GROUPS } from '../../data/dictionaries.js';

// Хранение — объект по ключу группы: oi.improvements = {structures: [...],
// greenery: [...]}. Не два отдельных поля, чтобы третья группа (пользователь
// допускал 2–3) добавлялась одной строкой словаря и ничего больше.
export function improvementList(oi, key) {
  const v = oi && oi.improvements && oi.improvements[key];
  return Array.isArray(v) ? v.filter(Boolean) : [];
}

function dropBodyHTML(group, list) {
  return msDropBodyHTML({
    options: group.options,
    selected: list,
    optAttr: 'imp-opt',
    value: (v) => `${group.key}|${v}`,
  });
}

// Разделитель « / », как у материалов и оснащения: в названиях встречается запятая.
function summaryHTML(list) {
  const text = list.join(' / ');
  return list.length
    ? `<span class="ms-summary" title="${esc(text)}">${esc(text)}</span><span class="ms-count">${list.length}</span>`
    : '<span class="muted">не выбрано</span>';
}

function groupHTML(ctx, oi, group) {
  const list = improvementList(oi, group.key);

  return `<div class="field" data-imp-field="${esc(group.key)}">
    <label>${esc(group.label)} (мультивыбор)</label>
    <div class="ms">
      <div class="ms-control" data-ms-control data-ms-toggle="imp-${esc(group.key)}" title="Открыть список">
        ${summaryHTML(list)}
        <span class="chev">▾</span>
      </div>
      <div class="ms-drop" ${ctx.ui.msOpen === 'imp-' + group.key ? '' : 'hidden'}>
        ${dropBodyHTML(group, list)}
      </div>
    </div>
  </div>`;
}

export function improvementsMS(ctx, oi) {
  return IMPROVEMENT_GROUPS.map((g) => groupHTML(ctx, oi, g)).join('');
}

// Точечная перерисовка после выбора — без полного render(), иначе список
// закрывался бы на каждом щелчке.
export function updateImprovementsUI(ctx, oi, key) {
  const group = IMPROVEMENT_GROUPS.find((g) => g.key === key);
  const box = ctx.scope.$(`[data-imp-field="${key}"]`);
  if (!group || !box) return;

  const list = improvementList(oi, key);
  const mc = box.querySelector('[data-ms-control]');
  const drop = box.querySelector('.ms-drop');

  if (mc) mc.innerHTML = `${summaryHTML(list)}<span class="chev">▾</span>`;
  if (drop) drop.innerHTML = dropBodyHTML(group, list);

  bindImpOpts(ctx, oi);
}

// Слушатели прямые, а не делегированные на скоуп: карточка перепривязывается на
// каждой отрисовке, и делегированные накапливались бы (этим уже отличились
// заметки, конструктивный состав и отопление).
function bindImpOpts(ctx, oi) {
  IMPROVEMENT_GROUPS.forEach((group) => {
    const box = ctx.scope.$(`[data-imp-field="${group.key}"]`);
    if (!box) return;

    bindMsSearch(box.querySelector('.ms-drop'));

    box.querySelectorAll('[data-imp-opt]').forEach((cb) => {
      cb.onchange = () => {
        const [key, value] = cb.dataset.impOpt.split('|');
        const list = improvementList(oi, key);
        const i = list.indexOf(value);
        if (i >= 0) list.splice(i, 1); else list.push(value);
        oi.improvements = oi.improvements || {};
        oi.improvements[key] = list;
        updateImprovementsUI(ctx, oi, key);
      };
    });
  });
}

export function bindImprovements(ctx, oi) {
  if (!oi) return;
  bindImpOpts(ctx, oi);
}
