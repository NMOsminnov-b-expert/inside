import { esc } from '../dom.js';
import { STATUS_MAIN, STATUS_BRANCH, isBranch, stepOf, nextOf } from './flow.js';

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

function stateOf(name, status, next) {
  if (name === status) return 'cur';
  if (next.includes(name)) return 'next';
  const at = stepOf(status);
  const i = STATUS_MAIN.indexOf(name);
  // Шаг основной линии пройден, если объект уже дальше него. Для ветки
  // пройден и её родитель: объект снят с оценки на этом шаге.
  if (i >= 0 && at >= 0 && (i < at || (i === at && isBranch(status)))) return 'done';
  return 'todo';
}

// Шаг — кнопка, только если на него можно перейти.
function node(name, state, cls) {
  const inner = `<span class="st-dot" aria-hidden="true"></span>
    <span class="st-lbl">${esc(name)}</span>
    <span class="sr-only">— ${STATE_WORD[state]}</span>`;
  const attrs = `class="${cls} st-${state}" title="${esc(name)}"`;
  if (state === 'next') {
    return `<button type="button" ${attrs} data-status-go="${esc(name)}">${inner}</button>`;
  }
  return `<span ${attrs}${state === 'cur' ? ' aria-current="step"' : ''}>${inner}</span>`;
}

function fullHTML(status, next) {
  const at = stepOf(status);
  // Доля пройденной линии: от первого шага до текущего.
  const k = at > 0 ? at / (STATUS_MAIN.length - 1) : 0;

  const steps = STATUS_MAIN.map((name) => {
    const branch = STATUS_BRANCH[name];
    return `<li class="st-item">
      ${node(name, stateOf(name, status, next), 'st-step')}
      ${branch ? `<span class="st-fork" aria-hidden="true"></span>
        ${node(branch, stateOf(branch, status, next), 'st-branch')}` : ''}
    </li>`;
  }).join('');

  return `<div class="st-full">
    <ol class="st-line" style="--st-k:${k}">${steps}</ol>
    <button type="button" class="st-toggle" data-status-toggle aria-expanded="true"
      title="Свернуть шкалу статусов" aria-label="Свернуть шкалу статусов">${CHEVRON_UP}</button>
  </div>`;
}

function miniHTML(status, next) {
  const at = stepOf(status);
  const known = at >= 0;
  const bar = STATUS_MAIN.map((_, i) => `<span class="st-seg ${known && i <= at ? 'on' : ''}"></span>`).join('');

  const go = next.map((n) => `<button type="button" class="st-go ${isBranch(n) ? 'st-go-branch' : ''}"
    data-status-go="${esc(n)}" title="Перевести в «${esc(n)}»">${esc(n)}</button>`).join('<span class="st-or">или</span>');

  return `<div class="st-mini">
    <span class="st-mini-lbl">Статус</span>
    <span class="st-pill ${isBranch(status) ? 'st-pill-branch' : ''}" aria-current="step">
      <span class="st-pill-dot" aria-hidden="true"></span>${esc(status || 'не задан')}</span>
    ${known ? `<span class="st-bar" aria-hidden="true">${bar}</span>
      <span class="st-count">${at + 1} из ${STATUS_MAIN.length}</span>` : ''}
    ${next.length ? `<span class="st-then"><span class="st-next-lbl">Далее:</span>${go}</span>`
    : !known ? '<span class="st-note">Статус не из шкалы — задайте его в форме ОЦ</span>' : ''}
    <button type="button" class="st-toggle" data-status-toggle aria-expanded="false"
      title="Развернуть шкалу статусов">${CHEVRON_DOWN}Развернуть</button>
  </div>`;
}

export function statusFlowHTML(rec, ui) {
  const status = rec.status || '';
  const next = nextOf(status);
  return `<nav class="st-flow ${ui && ui.statusCollapsed ? 'is-collapsed' : ''}" aria-labelledby="stFlowTitle"
    data-status-flow>
    <span class="sr-only" id="stFlowTitle">Статус объекта оценки</span>
    ${fullHTML(status, next)}
    ${miniHTML(status, next)}
  </nav>`;
}
