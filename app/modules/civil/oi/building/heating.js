import { esc } from '../../../../kernel/dom.js';
import { HEATING } from '../../data/dictionaries.js';

export function heatingMS(ctx, oi) {
  const heating = Array.isArray(oi.heating) ? oi.heating : [];

  return `<div class="field"><label>Отопление (мультивыбор)</label>
    <div class="ms">
      <div class="ms-control" data-ms-control data-ms-toggle title="Открыть список">
        ${heating.length ? heating.map((h) => `<span class="ms-tag">${esc(h)}&nbsp;<span data-heat-rm="${esc(h)}" title="Убрать">×</span></span>`).join('') + '<span class="ms-add">+ выбрать</span>' : '<span class="muted">не выбрано</span><span class="ms-add">+ выбрать</span>'}
      </div>
      <div class="ms-drop" ${ctx.ui.heatOpen ? '' : 'hidden'}>
        ${HEATING.map((h) => `<label class="ms-opt"><input type="checkbox" data-heat-opt="${esc(h)}" ${heating.includes(h) ? 'checked' : ''}>${esc(h)}</label>`).join('')}
      </div>
    </div>
    ${heating.includes('Прочее (ручной ввод)') ? `<input class="input" data-heat-other placeholder="Укажите отопление вручную" value="${esc(oi.heatingOther || '')}" style="margin-top:5px">` : ''}
  </div>`;
}

// Перерисовка тегов после выбора — разметка та же, что при первом рендере.
export function updateHeatingUI(ctx, oi) {
  const mc = ctx.scope.$('[data-ms-control]');
  if (!mc) return;

  const heating = Array.isArray(oi.heating) ? oi.heating : [];
  mc.innerHTML = heating.length
    ? heating.map((h) => `<span class="ms-tag">${esc(h)}&nbsp;<span data-heat-rm="${esc(h)}" title="Убрать">×</span></span>`).join('') + '<span class="ms-add">+ выбрать</span>'
    : '<span class="muted">не выбрано</span><span class="ms-add">+ выбрать</span>';
}
