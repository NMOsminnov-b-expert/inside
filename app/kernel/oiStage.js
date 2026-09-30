// Статус объекта имущества и метка проверки после импорта.
//
// Задача пользователя 30.09.2026: «Нужны статусы литер и отдельные метки,
// проверено/не проверено после импорта». Статусы — как в рабочей системе на
// стенде: «Создано, заполнено, осмотрено (тут развилка в оценено и не подлежит
// оценке)». До этого плашка литеры показывала одну надпись, в которой
// смешивались происхождение и проверка («импортировано по ML — ожидает
// проверки», «проверено (сверено с документами — удостоверено)»).
//
// Два разных сведения — два элемента:
//   * статус — где объект в работе: шкала, как у объекта оценки и как на
//     стенде (указание пользователя 30.09.2026 «делаем как в стенде», со
//     снимками шкал литеры и ОЦ): Создано → Заполнено → Осмотрено → Оценено,
//     от «Осмотрено» вниз — ветка «Не подлежит оценке». Шкала — общая
//     (kernel/status), стоит второй строкой плашки карточки;
//   * метка импорта — только у пришедших импортом (origin = 'ml'): сверил ли
//     человек импортированное. У заведённых вручную метки нет вовсе — «не
//     импортирован» не сведение, а шум. Метка — чип в плашке.
//
// Поле — oi.stage, а не oi.status: oi.status у строения уже занято признаком
// «Основное / Вспомогательное». Метка импорта — прежнее oi.flags.matched: по
// нему работают фильтры реестра и значок ML (kernel/flagBadges.js).
//
// Ядро не знает видов ОИ: статус и метка одинаковы у литеры, участка,
// механизмов и ТС.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь статус двигают щелчком по шкале, как у ОЦ. На
// стенде он, по-видимому, меняется и действиями (заполнили — «Заполнено»,
// осмотр закрыт — «Осмотрено»), а кто и когда его поменял, пишется в журнал.
// Развилка — какие переходы ручные и кому они разрешены.
import { esc } from './dom.js';
import { flowHTML } from './status/flow.view.js';
import { bindFlow } from './status/flow.ctrl.js';

export const OI_FLOW = {
  main: ['Создано', 'Заполнено', 'Осмотрено', 'Оценено'],
  branch: { 'Осмотрено': 'Не подлежит оценке' },
};
export const OI_STAGES = [...OI_FLOW.main, ...Object.values(OI_FLOW.branch)];

// Статус, если его ещё не ставили: заполненный объект — «Заполнено», прочее —
// «Создано» (по прежнему признаку flags.entered).
export function stageOf(oi) {
  if (oi && OI_STAGES.includes(oi.stage)) return oi.stage;
  return (oi && oi.flags && oi.flags.entered) ? 'Заполнено' : 'Создано';
}

// null — объект заведён вручную, метки нет; иначе true/false — проверен ли.
export function importChecked(oi) {
  if (!oi || (oi.origin || 'manual') !== 'ml') return null;
  return !!(oi.flags && oi.flags.matched);
}

// Чипы для плашки карточки: метка импорта — кнопка, которая её переключает.
// Статус — не чип, а шкала второй строкой плашки (oiFlowHTML).
export function oiStageChips(oi) {
  const checked = importChecked(oi);
  if (checked === null) return [];
  return [`<button type="button" class="ctx-chip oi-import ${checked ? 'is-checked' : 'is-raw'}" data-oi-import
      aria-pressed="${checked}" title="${checked
    ? 'Импорт проверен — сведения сверены человеком. Щелчок — снять отметку'
    : 'Импорт не проверен — сведения пришли импортом и не сверены. Щелчок — отметить проверенным'}">
      ${checked ? 'Импорт проверен' : 'Импорт не проверен'}</button>`];
}

// Шкала статуса объекта имущества.
export function oiFlowHTML(oi, ui) {
  return `<div class="ctx-oi-flow">${flowHTML(stageOf(oi), {
    flow: OI_FLOW, key: 'oistage', title: 'Статус объекта имущества', collapsed: ui && ui.oiStageCollapsed,
  })}</div>`;
}

// Ячейка перечня ОИ: статус словом и, у импортированных, короткая метка.
export function oiStageCellHTML(oi) {
  const st = stageOf(oi);
  const checked = importChecked(oi);
  const mark = checked === null ? ''
    : `<span class="oi-import-mark ${checked ? 'is-checked' : 'is-raw'}" title="${
      checked ? 'Импорт проверен' : 'Импорт не проверен'}">${checked ? 'проверен' : 'не проверен'}</span>`;
  return `<span class="oi-stage-cell"><span class="ell" title="${esc(st)}">${esc(st)}</span>${mark}</span>`;
}

// Привязать плашку: шкалу и метку импорта. onChange — перерисовать плашку.
export function bindOiStage(ctx, box, oi, onChange) {
  if (!box || !oi) return;
  bindFlow(ctx, {
    key: 'oistage',
    flow: OI_FLOW,
    collapsed: 'oiStageCollapsed',
    get: () => stageOf(oi),
    set: (to) => { oi.stage = to; },
    after: onChange,
  });
  const imp = box.querySelector('[data-oi-import]');
  if (imp) imp.onclick = (e) => {
    e.stopPropagation();
    oi.flags = oi.flags || {};
    oi.flags.matched = !oi.flags.matched;
    onChange();
  };
}
