import { esc } from '../dom.js';
import { OC_FLOW, isBranch, stepOf, nextOf } from './flow.js';

// Шкала статусов объекта оценки — в свободном углу Г-образной шапки, справа от
// вкладок (макет пользователя 21.09.2026, канва «Шапка ОЦ: Г-образный блок»).
//
// Практики (граф: practice:status-stepper-v-shapke):
//  * текущий шаг помечен aria-current="step" — ровно один;
//  * нажать можно только доступный переход (кнопка), остальные шаги — не
//    элементы управления и в фокус не попадают;
//  * подписи до двух строк, полное название во всплывающей подсказке;
//  * свёрнутая шкала — одна строка, где всё равно виден текущий статус,
//    счётчик «N из 9» и следующий шаг. В неё же шкала сжимается сама, когда
//    карточку прокрутили: шапка закреплена, и высокая шапка съедала бы экран
//    (NN/g, «Sticky headers»: закреплённое — только сжатым).
//
// Обе формы рисуются сразу, а какую показать — решают стили: так сжатие при
// прокрутке не требует перерисовки карточки.

const CHEVRON_UP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
const CHEVRON_DOWN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

// Состояние шага словами — для программ чтения с экрана: цвет и обводку они
// не видят.
const STATE_WORD = { done: 'пройден', cur: 'текущий', next: 'можно перейти', todo: 'впереди' };

function stateOf(name, status, next, flow) {
  if (name === status) return 'cur';
  if (next.includes(name)) return 'next';
  const at = stepOf(status, flow);
  const i = flow.main.indexOf(name);
  // Шаг основной линии пройден, если объект уже дальше него. Для ветки
  // пройден и её родитель: объект снят с оценки на этом шаге.
  if (i >= 0 && at >= 0 && (i < at || (i === at && isBranch(status, flow)))) return 'done';
  return 'todo';
}

// Шаг — кнопка, только если на него можно перейти.
function node(name, state, cls, go) {
  const inner = `<span class="st-dot" aria-hidden="true"></span>
    <span class="st-lbl">${esc(name)}</span>
    <span class="sr-only">— ${STATE_WORD[state]}</span>`;
  const attrs = `class="${cls} st-${state}" title="${esc(name)}"`;
  if (state === 'next') {
    return `<button type="button" ${attrs} data-${go}="${esc(name)}">${inner}</button>`;
  }
  return `<span ${attrs}${state === 'cur' ? ' aria-current="step"' : ''}>${inner}</span>`;
}

function fullHTML(status, next, o) {
  const { flow, go } = o;
  const at = stepOf(status, flow);
  // Доля пройденной линии: от первого шага до текущего.
  const k = at > 0 ? at / (flow.main.length - 1) : 0;

  const steps = flow.main.map((name) => {
    const branch = flow.branch[name];
    return `<li class="st-item">
      ${node(name, stateOf(name, status, next, flow), 'st-step', go)}
      ${branch ? `<span class="st-fork" aria-hidden="true"></span>
        ${node(branch, stateOf(branch, status, next, flow), 'st-branch', go)}` : ''}
    </li>`;
  }).join('');

  return `<div class="st-full">
    <ol class="st-line" style="--st-k:${k};--st-n:${flow.main.length}">${steps}</ol>
    <button type="button" class="st-toggle" data-${o.toggle} aria-expanded="true"
      title="Свернуть шкалу статусов" aria-label="Свернуть шкалу статусов">${CHEVRON_UP}</button>
  </div>`;
}

function miniHTML(status, next, o) {
  const { flow, go } = o;
  const at = stepOf(status, flow);
  const known = at >= 0;
  const bar = flow.main.map((_, i) => `<span class="st-seg ${known && i <= at ? 'on' : ''}"></span>`).join('');

  const btns = next.map((n) => `<button type="button" class="st-go ${isBranch(n, flow) ? 'st-go-branch' : ''}"
    data-${go}="${esc(n)}" title="Перевести в «${esc(n)}»">${esc(n)}</button>`).join('<span class="st-or">или</span>');

  return `<div class="st-mini">
    <span class="st-mini-lbl">Статус</span>
    <span class="st-pill ${isBranch(status, flow) ? 'st-pill-branch' : ''}" aria-current="step">
      <span class="st-pill-dot" aria-hidden="true"></span>${esc(status || 'не задан')}</span>
    ${known ? `<span class="st-bar" aria-hidden="true">${bar}</span>
      <span class="st-count">${at + 1} из ${flow.main.length}</span>` : ''}
    ${next.length ? `<span class="st-then"><span class="st-next-lbl">Далее:</span>${btns}</span>`
    : !known ? '<span class="st-note">Статус не из шкалы — задайте его в форме ОЦ</span>' : ''}
    <button type="button" class="st-toggle" data-${o.toggle} aria-expanded="false"
      title="Развернуть шкалу статусов">${CHEVRON_DOWN}Развернуть</button>
  </div>`;
}

// Шкала любого перечня шагов. o: flow — шаги и ветки; title — чей статус (для
// программ чтения с экрана); key — приставка атрибутов, чтобы две шкалы на
// одном экране не перехватывали нажатия друг друга; collapsed — свёрнута ли.
export function flowHTML(status, o) {
  const opts = {
    flow: o.flow, go: `${o.key}-go`, toggle: `${o.key}-toggle`,
  };
  const next = nextOf(status, o.flow);
  const tid = `${o.key}FlowTitle`;
  return `<nav class="st-flow ${o.collapsed ? 'is-collapsed' : ''}" aria-labelledby="${tid}"
    data-${o.key}-flow>
    <span class="sr-only" id="${tid}">${esc(o.title)}</span>
    ${fullHTML(status, next, opts)}
    ${miniHTML(status, next, opts)}
  </nav>`;
}

export function statusFlowHTML(rec, ui) {
  return flowHTML(rec.status || '', {
    flow: OC_FLOW, key: 'status', title: 'Статус объекта оценки', collapsed: ui && ui.statusCollapsed,
  });
}
