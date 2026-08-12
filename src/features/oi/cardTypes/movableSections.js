import { esc } from '../../../core/utils.js';
import { docsBlockInner } from '../../docs/docsTable.js';

export function renderMovableCard(oi) {
  const isV = oi.kind === 'vehicle';
  const f = oi.flags || {};
  const isMl = (oi.origin || 'manual') === 'ml';

  const title = isV
    ? 'Данные ТС'
    : oi.kind === 'mech'
      ? 'Данные механизма'
      : 'Данные офисной техники';

  return `<div class="oi-stack">
    <div class="card t-blue">
      <div class="card-head">
        <span class="card-idx">01</span>
        <h3>${title}</h3>
      </div>

      <div class="card-pad">
        <div class="inline-row" style="margin-bottom:10px">
          <label class="flag-lbl"><input type="checkbox" data-flag="entered" ${f.entered ? 'checked' : ''}> Введено</label>
          ${isMl ? `<label class="flag-lbl"><input type="checkbox" data-flag="matched" ${f.matched ? 'checked' : ''}> Сопоставлено с фото</label>` : ''}
        </div>

        ${isV ? `<div class="grid g-3">
          <div class="field"><label>Марка</label><input class="input" data-mv-make value="${esc(oi.make || '')}"></div>
          <div class="field"><label>Модель</label><input class="input" data-mv-model value="${esc(oi.model || '')}"></div>
          <div class="field"><label>Год выпуска</label><input class="input" data-mv-year value="${esc(oi.year || '')}"></div>
          <div class="field"><label>VIN</label><input class="input" data-mv-vin value="${esc(oi.vin || '')}"></div>
          <div class="field"><label>Гос. номер</label><input class="input" data-mv-plate value="${esc(oi.plate || '')}"></div>
        </div>` : `<div class="grid g-3">
          <div class="field"><label>Наименование</label><input class="input" data-mv-name value="${esc(oi.name || '')}"></div>
          <div class="field"><label>Год выпуска</label><input class="input" data-mv-year value="${esc(oi.year || '')}"></div>
          <div class="field"><label>Заводской / инв. номер</label><input class="input" data-mv-serial value="${esc(oi.serial || '')}"></div>
        </div>`}
      </div>
    </div>

    <div class="card t-slate">
      <div class="card-head">
        <span class="card-idx">02</span>
        <h3>Документы</h3>
      </div>

      <div class="card-pad">
        ${docsBlockInner(oi, oi.id)}
      </div>
    </div>
  </div>`;
}