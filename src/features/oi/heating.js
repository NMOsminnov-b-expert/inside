import { HEATING } from '../../core/dictionaries.js';
import { appState } from '../../core/state.js';
import { esc } from '../../core/utils.js';

export function heatingMS(oi) {
  return `<div class="field"><label>Отопление (мультивыбор)</label>
    <div class="ms">
      <div class="ms-control" data-ms-control data-ms-toggle title="Открыть список">
        ${oi.heating.length ? oi.heating.map((h) => `<span class="ms-tag">${esc(h)}&nbsp;<span data-heat-rm="${esc(h)}" title="Убрать">×</span></span>`).join('') + '<span class="ms-add">+ выбрать</span>' : '<span class="muted">не выбрано</span><span class="ms-add">+ выбрать</span>'}
      </div>
      <div class="ms-drop" ${appState.heatOpen ? '' : 'hidden'}>
        ${HEATING.map((h) => `<label class="ms-opt"><input type="checkbox" data-heat-opt="${esc(h)}" ${oi.heating.includes(h) ? 'checked' : ''}>${esc(h)}</label>`).join('')}
      </div>
    </div>
    ${oi.heating.includes('Прочее (ручной ввод)') ? `<input class="input" data-heat-other placeholder="Укажите отопление вручную" value="${esc(oi.heatingOther)}" style="margin-top:5px">` : ''}
  </div>`;
}

export function updateHeatingUI(oi) {
  const mc = document.querySelector('[data-ms-control]');
  if (!mc) return;
  mc.innerHTML = oi.heating.length
    ? oi.heating.map((h) => `<span class="ms-tag">${esc(h)}<span data-heat-rm="${esc(h)}">×</span></span>`).join('') + '<span class="ms-add">+ выбрать</span>'
    : '<span class="muted">не выбрано</span><span class="ms-add">+ выбрать</span>';
}