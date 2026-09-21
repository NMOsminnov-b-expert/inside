import { esc } from './dom.js';
import { flagBadgesHTML } from './flagBadges.js';
import { statusFlowHTML } from './status/flow.view.js';

// Шапка карточки объекта оценки — одна на все типы ОЦ.
//
// Г-образный блок (макет пользователя 21.09.2026, канва «Шапка ОЦ: Г-образный
// блок»): сверху сводка записи с действиями, снизу слева вкладки, а свободный
// угол справа от них занимает шкала статусов (kernel/status/flow.view.js).
// Раньше это были три блока друг под другом, и до содержимого карточки уходило
// полэкрана. Статус отдельной плашкой среди действий больше не показывается:
// его несёт шкала — и в развёрнутом, и в свёрнутом виде.
//
// Сделана в ядре по решению пользователя 21.09.2026 («шапку тоже распространи,
// без неё режимы ломаются»): режим раскрытия просмотрщика сжимает именно эту
// шапку и уводит её вправо, и типам ОЦ со старой шапкой раскрытие было некуда
// применить. До этого шапка жила в модуле «гражданское здание».
//
// data-oc-head: шапка закреплена при прокрутке (kernel/stickyHead.js); шкала
// при этом сжимается в одну строку.
//
// Разное у типов ОЦ передаётся параметрами:
//   meta    — поля сводки, [{ label, value, wide }]; подпись «Назначение по ТП»
//             у участка своя («Целевое назначение»), значения считает модуль;
//   flags   — признаки записи (kernel/flagBadges.js), у каждого типа свои;
//   menu    — готовая разметка меню «+ Добавить ОИ»: состав видов ОИ у типов
//             разный; у типа без объектов имущества (ТС) меню нет;
//   actions — своя разметка действий вместо «Редактировать» и «Удалить»:
//             карточка ТС правится прямо на месте и сохраняется кнопкой;
//   tabs    — вкладки [{ key, label }]; «Логи» есть не у всех ролей.

const hm = (f) => `<div class="hm ${f.wide ? 'hm-wide' : ''}"><span class="lbl">${esc(f.label)}</span>
  <b title="${esc(f.value)}">${esc(f.value)}</b></div>`;

export function ocHeadHTML(ctx, { meta = [], flags = [], menu = '', actions = null, tabs = [] } = {}) {
  const rec = ctx.rec;

  const tab = (t) => `<button class="tab ${ctx.tab === t.key ? 'active' : ''}" role="tab"
    aria-selected="${ctx.tab === t.key}" data-tab="${esc(t.key)}">${esc(t.label)}</button>`;

  return `<div class="oc-head" data-oc-head>
    <div class="oc-head-bg" aria-hidden="true">
      <span class="oc-bg-top"></span><span class="oc-bg-tabs"></span><span class="oc-bg-corner"></span>
    </div>

    <div class="oc-head-top card-pad">
      <div class="head-meta">
        <span class="pill pill-cat">${esc(rec.category)}</span>
        ${meta.map(hm).join('')}
        ${flagBadgesHTML(flags)}

        <span class="head-actions">
          ${menu ? `<div class="dd" id="ddAddOi">
            <button class="btn btn-primary" data-dd-toggle>+ Добавить ОИ ▾</button>
            <div class="dd-menu">${menu}</div>
          </div>` : ''}

          ${actions !== null ? actions : `<button class="btn btn-ghost" id="btnEditOc">Редактировать</button>
          <button class="btn btn-danger" id="btnDelOc">Удалить</button>`}
        </span>
      </div>
    </div>

    <div class="oc-head-tabs" role="tablist" aria-label="Разделы объекта оценки">
      ${tabs.map(tab).join('')}
    </div>
    <div class="oc-head-status">${statusFlowHTML(rec, ctx.ui)}</div>
  </div>`;
}

// Вкладки карточки ОЦ одинаковы у всех типов: общие данные, фото и логи —
// последние только тем, кому они доступны.
export const ocTabs = (canAudit) => [
  { key: 'general', label: 'Общие данные' },
  { key: 'photo', label: 'Фото' },
  ...(canAudit ? [{ key: 'audit', label: 'Логи' }] : []),
];
