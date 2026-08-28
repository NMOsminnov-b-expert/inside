import { msDropBodyHTML, bindMsSearch } from '../../../../kernel/multiSelect.js';
import { esc } from '../../../../kernel/dom.js';
import { TEMP_MODE } from '../../data/dictionaries.js';

// Температурный режим — множественный выбор (Л6.2, решение пользователя
// 28.08.2026): в одном строении бывает и морозильник, и тёплый склад, одним
// значением это не описать. Механика и разметка те же, что у отопления и
// материалов, поиск по списку — общий (kernel/multiSelect.js).

// В данных режим лежал строкой (одиночный выбор). Читаем всегда массивом,
// чтобы старые записи не падали; перевод — migrateTempMode.
export function tempList(oi) {
  const v = oi && oi.tempMode;
  if (Array.isArray(v)) return v.filter(Boolean);
  return v ? [v] : [];
}

// Строка → список. Вызывать ДО отрисовки, иначе перевод попадёт в лог правок
// как правка пользователя (тот же приём, что у migrateStruct).
export function migrateTempMode(oi) {
  if (!oi || Array.isArray(oi.tempMode)) return;
  oi.tempMode = oi.tempMode ? [oi.tempMode] : [];
}

const dropBodyHTML = (list) =>
  msDropBodyHTML({ options: TEMP_MODE, selected: list, optAttr: 'temp-opt' });

// Разделитель « / », как у материалов.
function summaryHTML(list) {
  const text = list.join(' / ');
  return list.length
    ? `<span class="ms-summary" title="${esc(text)}">${esc(text)}</span><span class="ms-count">${list.length}</span>`
    : '<span class="muted">не выбрано</span>';
}

export function tempModeMS(ctx, oi) {
  const list = tempList(oi);

  return `<div class="field" data-temp-field><label>Температурный режим (мультивыбор)</label>
    <div class="ms">
      <div class="ms-control" data-ms-control data-ms-toggle title="Открыть список">
        ${summaryHTML(list)}
        <span class="chev">▾</span>
      </div>
      <div class="ms-drop" ${ctx.ui.tempOpen ? '' : 'hidden'}>
        ${dropBodyHTML(list)}
      </div>
    </div>
  </div>`;
}

// Точечная перерисовка после выбора — без полного render(), иначе список
// закрывался бы на каждом щелчке.
export function updateTempModeUI(ctx, oi) {
  const box = ctx.scope.$('[data-temp-field]');
  if (!box) return;

  const list = tempList(oi);
  const mc = box.querySelector('[data-ms-control]');
  const drop = box.querySelector('.ms-drop');

  if (mc) mc.innerHTML = `${summaryHTML(list)}<span class="chev">▾</span>`;
  if (drop) drop.innerHTML = dropBodyHTML(list);

  bindTempOpts(ctx, oi);
}

// Слушатели прямые, а не делегированные на скоуп: карточка перепривязывается на
// каждой отрисовке, и делегированные накапливались бы.
function bindTempOpts(ctx, oi) {
  const box = ctx.scope.$('[data-temp-field]');
  if (!box) return;

  bindMsSearch(box.querySelector('.ms-drop'));

  box.querySelectorAll('[data-temp-opt]').forEach((cb) => {
    cb.onchange = () => {
      const v = cb.dataset.tempOpt;
      const list = tempList(oi);
      const i = list.indexOf(v);
      if (i >= 0) list.splice(i, 1); else list.push(v);
      oi.tempMode = list;
      updateTempModeUI(ctx, oi);
    };
  });
}

export function bindTempMode(ctx, oi) {
  if (!oi) return;
  bindTempOpts(ctx, oi);
}
