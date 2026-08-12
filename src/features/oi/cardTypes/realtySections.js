import { appState, OC } from '../../../core/state.js';
import { esc } from '../../../core/utils.js';
import { DICT, CATCLASS, RES_BUILD_CAT } from '../../../core/dictionaries.js';
import { oiFieldRules } from '../oiModel.js';
import { floorsBlock } from '../floorsView.js';
import { heatingMS } from '../heating.js';
import { photoAccordions } from '../../photos/photoBlocks.js';
import { docsBlockInner } from '../../docs/docsTable.js';

export function structField(key, label, opts, val, req) {
  const isOther = String(val || '').includes('Прочее');
  return `<div class="field"><label>${label}${req ? '<span class="req">*</span>' : ''}</label>
<select class="select" data-struct="${key}">${opts.map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>
${isOther ? `<input class="input" placeholder="Укажите вручную" value="">` : ''}
</div>`;
}

export function letterControl(oi) {
  if (appState.letterEdit) {
    return `<div style="display:flex; gap:4px; align-items:center;">
      <input class="input" style="width:80px; text-align:center; font-weight:700;"
        data-letter-input value="${esc(oi.letter)}"
        data-letter-id="${oi.id}">
      <button class="btn btn-primary btn-sm" data-letter-save data-letter-id="${oi.id}">Сохранить</button>
      <button class="btn btn-ghost btn-sm" data-letter-cancel data-letter-id="${oi.id}">Отмена</button>
    </div>`;
  }
  return `<span class="letter-clickable" data-edit-letter data-letter-id="${oi.id}"
    title="Кликните, чтобы редактировать">${esc(oi.letter)}</span>`;
}

export function renderRealtyGeneralCard(oi, options = {}) {
  const rq = oiFieldRules(oi);
  const f = oi.flags || {};
  const isMl = (oi.origin || 'manual') === 'ml';
  const showResCat = options.showResCat !== undefined
    ? options.showResCat
    : rq.showResCat && OC.type === 'Жилое здание (дом)';
  const title = options.generalTitle || 'Общие параметры';

  return `<div class="card t-blue" id="q-gen">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">01</span>
      <h3>${title}</h3>
      <span class="hint">${esc(oi.name)}</span>
      <span class="chev">▾</span>
    </div>
    <div class="card-body-wrap"><div class="card-pad">
      <div class="inline-row" style="margin-bottom:10px; display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
        <div class="field" style="flex:0 0 auto;">
          <label>Литера</label>
          ${letterControl(oi)}
        </div>
        <div class="field" style="flex:1 1 180px;">
          <label>Наименование</label>
          <input class="input" style="width:100%;" data-oi-name value="${esc(oi.name)}">
        </div>
        <div class="field" style="flex:0 0 150px;">
          <label>Статус</label>
          <select class="select" style="width:100%;" data-status>
            ${DICT.statusBuild.map((o) => `<option ${o === oi.status ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="flex:0 0 160px;">
          <label>ЕНИ код</label>
          <input class="eni-corner" style="width:100%;" data-oi-eni value="${esc(oi.eni)}" title="ЕНИ-код">
        </div>
      </div>
      <div class="inline-row" style="margin-bottom:10px">
        <label class="flag-lbl"><input type="checkbox" data-flag="entered" ${f.entered ? 'checked' : ''}> Введено</label>
        ${isMl ? `<label class="flag-lbl"><input type="checkbox" data-flag="matched" ${f.matched ? 'checked' : ''}> Сопоставлено с фото</label>` : ''}
      </div>
      <div class="grid g-3">
        <div class="field">
          <label>Год постройки</label>
          <input class="input" data-year value="${esc(oi.year || '')}" inputmode="numeric">
        </div>
        <div class="field">
          <label>Тип строения${rq.buildTypeRequired ? '<span class="req">*</span>' : ''}</label>
          <select class="select" data-buildtype>
            ${DICT.buildType.map((o) => `<option ${o === oi.buildType ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
        ${showResCat ? `<div class="field">
          <label>Категория жилого строения</label>
          <select class="select" data-rescat>
            ${RES_BUILD_CAT.map((o) => `<option ${o === (oi.resCat || RES_BUILD_CAT[0]) ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>` : ''}
        ${rq.showCatClass ? `<div class="field">
          <label>Категория ОИ</label>
          <select class="select" data-catclass>
            ${CATCLASS.map((o) => `<option ${o === (oi.catClass || 'Гражданское здание') ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
          <label class="inline-row" style="font-size:10.5px;font-weight:400">
            <input type="checkbox" data-dis ${oi.dis ? 'checked' : ''}> расхождение ТП и фото с осмотров
          </label>
          <span class="muted" style="font-size:10px">авто; допроверка — ЦОД, при отсутствии компетенций — оценщик</span>
        </div>` : ''}
      </div>
    </div></div>
  </div>`;
}

export function renderRealtyAreasCard(oi, options = {}) {
  const rq = oiFieldRules(oi);
  const areas = oi.areas || {};
  const heights = oi.heights || {};
  const showFloors = options.showFloors !== false;
  const showHeights = options.showHeights !== false;

  return `<div class="card t-blue" id="q-areas">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">02</span>
      <h3>Площади и этажность</h3>
      <span class="chev">▾</span>
    </div>
    <div class="card-body-wrap"><div class="card-pad">
      <div class="grid g-4">
        <div class="field">
          <label>Общая по техпаспорту, м²</label>
          <input class="input" data-area="tp" value="${esc(areas.tp || '')}">
        </div>
        <div class="field">
          <label>Общая по ПУД, м²</label>
          <input class="input" data-area="pud" value="${esc(areas.pud || '')}">
        </div>
        <div class="field">
          <label>Общая по факту, м²</label>
          <input class="input" data-area="fact" value="${esc(areas.fact || '')}">
        </div>
        <div class="field">
          <label>Площадь застройки, м²</label>
          <input class="input" data-area="build" value="${esc(areas.build || '')}">
        </div>
      </div>
      ${showFloors ? `<div id="floors-${oi.id}" style="margin-top:10px">${floorsBlock(oi)}</div>` : ''}
      ${showHeights ? `<div class="grid g-2" style="margin-top:10px">
        <div class="field">
          <label>Высота по внешним замерам, м${rq.heightRequired ? '<span class="req">*</span>' : ''}</label>
          <input class="input" data-height="ext" value="${esc(heights.ext || '')}">
        </div>
        <div class="field">
          <label>Высота по внутренним замерам, м</label>
          <input class="input" data-height="int" value="${esc(heights.int || '')}">
        </div>
      </div>` : ''}
    </div></div>
  </div>`;
}

export function renderRealtyStructCard(oi) {
  const rq = oiFieldRules(oi);
  const struct = oi.struct || {};
  const heatingSource = {
    ...oi,
    heating: Array.isArray(oi.heating) ? oi.heating : [],
    heatingOther: oi.heatingOther || '',
  };

  return `<div class="card t-teal" id="q-struct">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">03</span>
      <h3>Конструктивный состав</h3>
      <span class="chev">▾</span>
    </div>
    <div class="card-body-wrap"><div class="card-pad">
      <div class="grid g-4">
        ${structField('foundation', 'Фундамент', DICT.foundation, struct.foundation)}
        ${structField('wallsExt', 'Наружные стены', DICT.wallsExt, struct.wallsExt, rq.wallsRequired)}
        ${structField('ceilings', 'Перекрытия', DICT.ceilings, struct.ceilings)}
        ${structField('roof', 'Кровля', DICT.roof, struct.roof)}
      </div>
      <div class="grid g-4" style="margin-top:8px">
        ${structField('floors', 'Полы', DICT.floors, struct.floors)}
        ${structField('windows', 'Окна', DICT.windows, struct.windows)}
        ${structField('doors', 'Двери', DICT.doors, struct.doors)}
        ${heatingMS(heatingSource)}
      </div>
      <div class="field" style="margin-top:8px">
        <label>Комментарий</label>
        <textarea class="textarea" data-comment>${esc(oi.comment || '')}</textarea>
      </div>
    </div></div>
  </div>`;
}

export function renderOiDocsCard(oi) {
  return `<div class="card t-slate" id="q-docs">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">04</span>
      <h3>Документы</h3>
      <span class="chev">▾</span>
    </div>
    <div class="card-body-wrap"><div class="card-pad">
      ${docsBlockInner(oi, oi.id)}
    </div></div>
  </div>`;
}

export function renderOiPhotosCard(oi) {
  return `<div class="card t-blue" id="q-photo">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">05</span>
      <h3>Фото по категориям</h3>
      <button class="btn btn-ghost btn-sm" data-open-pviewer style="margin-left:auto">Открыть просмотрщик</button>
      <span class="chev">▾</span>
    </div>
    <div class="card-body-wrap"><div class="card-pad">
      ${photoAccordions(oi, true)}
    </div></div>
  </div>`;
}

export function renderRealtyBase(oi, options = {}) {
  return `<div class="oi-stack">
    ${renderRealtyGeneralCard(oi, options)}
    ${options.showAreas !== false ? renderRealtyAreasCard(oi, options) : ''}
    ${options.showStruct !== false ? renderRealtyStructCard(oi) : ''}
    ${renderOiDocsCard(oi)}
    ${renderOiPhotosCard(oi)}
  </div>`;
}