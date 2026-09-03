import { msDropBodyHTML, bindMsSearch } from '../../../../kernel/multiSelect.js';
import { esc } from '../../../../kernel/dom.js';
import { ENGINEERING } from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';

// Инженерное оснащение участка — мультивыбор (Л6-земля.1). Раньше это были
// четыре жёстких флажка (электричество, водопровод, канализация, центральное
// отопление): ни ёмкости для воды, ни газоснабжения в них не помещалось, а
// добавлять по флажку на каждый случай — тупик. Состав списка задан
// пользователем 2026-08-28.
//
// Разметка и поведение те же, что у «Отопления» (.ms/.ms-drop): открытие и
// закрытие обеспечивает общий обработчик [data-ms-toggle] в контроллере
// карточки, здесь только содержимое и точечная перерисовка.

// В данных оснащение раньше лежало объектом oi.utilities = {electricity: true}.
// Читаем всегда массивом, чтобы старые записи не падали; перевод — migrateUtilities.
export function utilityList(oi) {
  const v = oi && oi.utilities;
  return Array.isArray(v) ? v.filter(Boolean) : [];
}

// Старый объект → массив. Вызывать ДО отрисовки, чтобы перевод не попал в лог
// правок как правка пользователя (тот же приём, что у migrateStruct).
const LEGACY = {
  electricity: 'Электроснабжение',
  water: 'Водоснабжение',
  sewerage: 'Канализация',
  heating: 'Отопление',
};

export function migrateUtilities(oi) {
  if (!oi || Array.isArray(oi.utilities)) return;
  const old = oi.utilities || {};
  oi.utilities = Object.keys(LEGACY).filter((k) => old[k]).map((k) => LEGACY[k]);
}

// Тело списка — общее для всех мультивыборов проекта (kernel/multiSelect.js).
function dropBodyHTML(list) {
  return msDropBodyHTML({ options: opt('land', 'utilities', ENGINEERING), selected: list, optAttr: 'util-opt' });
}

// Разделитель « / », как у материалов: в названиях встречается запятая.
function summaryHTML(list) {
  const text = list.join(' / ');
  return list.length
    ? `<span class="ms-summary" title="${esc(text)}">${esc(text)}</span><span class="ms-count">${list.length}</span>`
    : '<span class="muted">не выбрано</span>';
}

export function utilitiesMS(ctx, oi) {
  const list = utilityList(oi);

  return `<div class="field" data-util-field><label>Инженерное оснащение (мультивыбор)</label>
    <div class="ms">
      <div class="ms-control" data-ms-control data-ms-toggle="util" title="Открыть список">
        ${summaryHTML(list)}
        <span class="chev">▾</span>
      </div>
      <div class="ms-drop" ${ctx.ui.msOpen === 'util' ? '' : 'hidden'}>
        ${dropBodyHTML(list)}
      </div>
    </div>
  </div>`;
}

// Точечная перерисовка после выбора — без полного render(), иначе список
// закрывался бы на каждом щелчке.
export function updateUtilitiesUI(ctx, oi) {
  const box = ctx.scope.$('[data-util-field]');
  if (!box) return;

  const list = utilityList(oi);
  const mc = box.querySelector('[data-ms-control]');
  const drop = box.querySelector('.ms-drop');

  if (mc) mc.innerHTML = `${summaryHTML(list)}<span class="chev">▾</span>`;
  if (drop) drop.innerHTML = dropBodyHTML(list);

  bindUtilOpts(ctx, oi);
}

// Слушатели прямые, а не делегированные на скоуп: карточка перепривязывается на
// каждой отрисовке, и делегированные накапливались бы (этим уже отличились
// заметки, конструктивный состав и отопление).
function bindUtilOpts(ctx, oi) {
  const box = ctx.scope.$('[data-util-field]');
  if (!box) return;

  bindMsSearch(box.querySelector('.ms-drop'));

  box.querySelectorAll('[data-util-opt]').forEach((cb) => {
    cb.onchange = () => {
      const v = cb.dataset.utilOpt;
      const list = utilityList(oi);
      const i = list.indexOf(v);
      if (i >= 0) list.splice(i, 1); else list.push(v);
      oi.utilities = list;
      updateUtilitiesUI(ctx, oi);
    };
  });
}

export function bindUtilities(ctx, oi) {
  if (!oi) return;
  bindUtilOpts(ctx, oi);
}
