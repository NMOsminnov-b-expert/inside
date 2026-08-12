import { esc } from '../../../core/utils.js';
import { DICT } from '../../../core/dictionaries.js';
import { docsBlockInner } from '../../docs/docsTable.js';
import { photoAccordions } from '../../photos/photoBlocks.js';

export const landCard = {
  id: 'land',
  label: 'Земельный участок',
  kind: 'land',

  render(oi) {
    return `<div class="oi-stack">
      <div class="card t-teal">
        <div class="card-head">
          <span class="card-idx">01</span>
          <h3>Земельный участок</h3>
        </div>

        <div class="card-pad">
          <div class="grid g-4">
            <div class="field">
              <label>Назначение</label>
              <input class="input" data-land-purpose value="${esc(oi.purpose || '')}">
            </div>

            <div class="field">
              <label>Общая площадь, м²</label>
              <input class="input" data-land-area value="${esc(oi.area || '')}">
            </div>

            <div class="field">
              <label>Статус</label>
              <select class="select" data-status>
                ${DICT.statusBuild.map((o) => `<option ${o === oi.status ? 'selected' : ''}>${o}</option>`).join('')}
              </select>
            </div>

            <div class="field">
              <label>ЕНИ</label>
              <input class="input" readonly value="${esc(oi.eni)}">
            </div>
          </div>
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

      <div class="card t-blue">
        <div class="card-head" data-card-toggle>
          <span class="card-idx">03</span>
          <h3>Фото по категориям</h3>
          <button class="btn btn-ghost btn-sm" data-open-pviewer style="margin-left:auto">Открыть просмотрщик</button>
          <span class="chev">▾</span>
        </div>

        <div class="card-body-wrap"><div class="card-pad">
          ${photoAccordions(oi, true)}
        </div></div>
      </div>
    </div>`;
  },

  bind() {
    // Общие поля участка уже обрабатываются контроллером ОИ.
  },

  validate(oi) {
    const errors = [];

    if (!String(oi.name || '').trim()) {
      errors.push('Не заполнено наименование земельного участка');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};