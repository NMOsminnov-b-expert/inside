import { OI, appState } from '../../core/state.js';
import { esc } from '../../core/utils.js';
import { DICT, CATCLASS } from '../../core/dictionaries.js';
import { requiredFlags } from './oiModel.js';
import { floorsBlock } from './floorsView.js';
import { heatingMS } from './heating.js';
import { photoAccordions } from '../photos/photoBlocks.js';
import { docsBlockInner } from '../docs/docsTable.js';
import { splitWrap, viewerHTML } from '../viewer/viewerShell.js';
import { viewOC } from '../oc/ocView.js';

function structField(key, label, opts, val, req) {
  const isOther = String(val).includes('Прочее');
  return `<div class="field"><label>${label}${req ? '<span class="req">*</span>' : ''}</label>
    <select class="select" data-struct="${key}">${opts.map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>
    ${isOther ? `<input class="input" placeholder="Укажите вручную" value="">` : ''}
  </div>`;
}

function realtyCards(oi) {
  const rq = requiredFlags(oi);
  const f = oi.flags || {};
  return `<div class="oi-stack">
  <div class="card t-blue" id="q-gen">
    <div class="card-head" data-card-toggle><span class="card-idx">01</span><h3>Общие параметры</h3>
      <span class="letter-badge">${esc(oi.letter)}</span>
      <span class="hint">${esc(oi.name)}</span><span class="chev">▾</span></div>
    <div class="card-body-wrap"><div class="card-pad">
      <div class="inline-row" style="margin-bottom:10px">
        ${appState.letterEdit ? `<input class="input" style="width:80px;text-align:center;font-weight:700" data-letter-input value="${esc(oi.letter)}"><button class="btn btn-primary btn-sm" data-letter-save>Сохранить</button><button class="btn btn-ghost btn-sm" data-letter-cancel>Отмена</button>` : `<button class="btn btn-ghost btn-sm" data-edit-letter title="Переименовать литеру">✎ Переименовать</button>`}
        <input class="input" style="max-width:240px" data-oi-name value="${esc(oi.name)}">
        <select class="select" style="max-width:150px" data-status>${DICT.statusBuild.map((o) => `<option ${o === oi.status ? 'selected' : ''}>${o}</option>`).join('')}</select>
        <input class="eni-corner" data-oi-eni value="${esc(oi.eni)}" title="ЕНИ-код">
      </div>
      <div class="inline-row" style="margin-bottom:10px">
        <label class="flag-lbl"><input type="checkbox" data-flag="entered" ${f.entered ? 'checked' : ''}> Введено</label>
        <label class="flag-lbl"><input type="checkbox" data-flag="matched" ${f.matched ? 'checked' : ''}> Сопоставлено с фото</label>
      </div>
      <div class="grid g-3">
        <div class="field"><label>Год постройки</label><input class="input" data-year value="${esc(oi.year || '')}" inputmode="numeric"></div>
        <div class="field"><label>Тип строения (ранее «Архитектура»)${rq.buildType ? '<span class="req">*</span>' : ''}</label>
          <select class="select" data-buildtype>${DICT.buildType.map((o) => `<option ${o === oi.buildType ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div class="field"><label>Категория ОИ (категория → класс)</label>
          <select class="select" data-catclass ${oi.dis ? '' : 'disabled'}>${CATCLASS.map((o) => `<option ${o === (oi.catClass || 'Гражданское') ? 'selected' : ''}>${o}</option>`).join('')}</select>
          <label class="inline-row" style="font-size:10.5px;font-weight:400"><input type="checkbox" data-dis ${oi.dis ? 'checked' : ''}> расхождение ТП и фото с осмотров</label>
          <span class="muted" style="font-size:10px">авто; допроверка — ЦОД, при отсутствии компетенций — оценщик</span></div>
      </div>
    </div></div>
  </div>
  <div class="card t-blue" id="q-areas">
    <div class="card-head" data-card-toggle><span class="card-idx">02</span><h3>Площади и этажность</h3><span class="chev">▾</span></div>
    <div class="card-body-wrap"><div class="card-pad">
      <div class="grid g-4">
        <div class="field"><label>Общая по техпаспорту, м²</label><input class="input" data-area="tp" value="${esc(oi.areas.tp)}"></div>
        <div class="field"><label>Общая по ПУД, м²</label><input class="input" data-area="pud" value="${esc(oi.areas.pud)}"></div>
        <div class="field"><label>Общая по факту, м²</label><input class="input" data-area="fact" value="${esc(oi.areas.fact)}"></div>
        <div class="field"><label>Площадь застройки, м²</label><input class="input" data-area="build" value="${esc(oi.areas.build)}"></div>
      </div>
      <div id="floors-${oi.id}" style="margin-top:10px">${floorsBlock(oi)}</div>
      <div class="grid g-2" style="margin-top:10px">
        <div class="field"><label>Высота по внешним замерам, м${rq.height ? '<span class="req">*</span>' : ''}</label><input class="input" data-height="ext" value="${esc(oi.heights.ext)}"></div>
        <div class="field"><label>Высота по внутренним замерам, м</label><input class="input" data-height="int" value="${esc(oi.heights.int)}"></div>
      </div>
    </div></div>
  </div>
  <div class="card t-teal" id="q-struct">
    <div class="card-head" data-card-toggle><span class="card-idx">03</span><h3>Конструктивный состав</h3><span class="chev">▾</span></div>
    <div class="card-body-wrap"><div class="card-pad">
      <div class="grid g-4">
        ${structField('foundation', 'Фундамент', DICT.foundation, oi.struct.foundation)}
        ${structField('wallsExt', 'Наружные стены', DICT.wallsExt, oi.struct.wallsExt, rq.walls)}
        ${structField('ceilings', 'Перекрытия', DICT.ceilings, oi.struct.ceilings)}
        ${structField('roof', 'Кровля', DICT.roof, oi.struct.roof)}
      </div>
      <div class="grid g-4" style="margin-top:8px">
        ${structField('floors', 'Полы', DICT.floors, oi.struct.floors)}
        ${structField('windows', 'Окна', DICT.windows, oi.struct.windows)}
        ${structField('doors', 'Двери', DICT.doors, oi.struct.doors)}
        ${heatingMS(oi)}
      </div>
      <div class="field" style="margin-top:8px"><label>Комментарий</label><textarea class="textarea" data-comment>${esc(oi.comment || '')}</textarea></div>
    </div></div>
  </div>
  <div class="card t-slate" id="q-docs">
    <div class="card-head" data-card-toggle><span class="card-idx">04</span><h3>Документы</h3><span class="chev">▾</span></div>
    <div class="card-body-wrap"><div class="card-pad">
      ${docsBlockInner(oi, oi.id)}
    </div></div>
  </div>
  <div class="card t-blue" id="q-photo">
    <div class="card-head" data-card-toggle><span class="card-idx">05</span><h3>Фото по категориям</h3>
      <button class="btn btn-ghost btn-sm" data-open-pviewer style="margin-left:auto">Открыть просмотрщик</button><span class="chev">▾</span></div>
    <div class="card-body-wrap"><div class="card-pad">
      ${photoAccordions(oi, true)}
    </div></div>
  </div>
  </div>`;
}

function movableCards(oi) {
  const isV = oi.kind === 'vehicle';
  const f = oi.flags || {};
  return `<div class="oi-stack">
  <div class="card t-blue"><div class="card-head"><span class="card-idx">01</span><h3>${isV ? 'Данные ТС' : oi.kind === 'mech' ? 'Данные механизма' : 'Данные офисной техники'}</h3></div>
    <div class="card-pad">
    <div class="inline-row" style="margin-bottom:10px">
      <label class="flag-lbl"><input type="checkbox" data-flag="entered" ${f.entered ? 'checked' : ''}> Введено</label>
      <label class="flag-lbl"><input type="checkbox" data-flag="matched" ${f.matched ? 'checked' : ''}> Сопоставлено с фото</label>
    </div>
    ${isV ? `<div class="grid g-3">
      <div class="field"><label>Марка</label><input class="input" data-mv-make value="${esc(oi.make)}"></div>
      <div class="field"><label>Модель</label><input class="input" data-mv-model value="${esc(oi.model)}"></div>
      <div class="field"><label>Год выпуска</label><input class="input" data-mv-year value="${esc(oi.year)}"></div>
      <div class="field"><label>VIN</label><input class="input" data-mv-vin value="${esc(oi.vin)}"></div>
      <div class="field"><label>Гос. номер</label><input class="input" data-mv-plate value="${esc(oi.plate)}"></div>
    </div>` : `<div class="grid g-3">
      <div class="field"><label>Наименование</label><input class="input" data-mv-name value="${esc(oi.name)}"></div>
      <div class="field"><label>Год выпуска</label><input class="input" data-mv-year value="${esc(oi.year || '')}"></div>
      <div class="field"><label>Заводской / инв. номер</label><input class="input" data-mv-serial value="${esc(oi.serial || '')}"></div>
    </div>`}
    </div></div>
  <div class="card t-slate"><div class="card-head"><span class="card-idx">02</span><h3>Документы</h3></div><div class="card-pad">${docsBlockInner(oi, oi.id)}</div></div>
  </div>`;
}

function landCards(oi) {
  return `<div class="oi-stack">
  <div class="card t-teal"><div class="card-head"><span class="card-idx">01</span><h3>Земельный участок (один ЕНИ)</h3></div>
  <div class="card-pad"><div class="grid g-3">
  <div class="field"><label>Назначение</label><input class="input" data-land-purpose value="${esc(oi.purpose)}"></div>
  <div class="field"><label>Общая площадь, м²</label><input class="input" data-land-area value="${esc(oi.area)}"></div>
  <div class="field"><label>ЕНИ</label><input class="input" readonly value="${esc(oi.eni)}"></div>
  </div></div></div>
  <div class="card t-slate"><div class="card-head"><span class="card-idx">02</span><h3>Документы</h3></div><div class="card-pad">${docsBlockInner(oi, oi.id)}</div></div>
  <div class="card t-blue"><div class="card-head" data-card-toggle><span class="card-idx">03</span><h3>Фото по категориям</h3>
  <button class="btn btn-ghost btn-sm" data-open-pviewer style="margin-left:auto">Открыть просмотрщик</button><span class="chev">▾</span></div>
  <div class="card-body-wrap"><div class="card-pad">
  ${photoAccordions(oi, true)}
  </div></div></div>
  </div>`;
}

export function viewOI() {
  const oi = OI.find((o) => o.id === appState.openOi);
  if (!oi) return viewOC();
  const isR = oi.kind === 'realty';
  const f = oi.flags || {};
  return `<div class="view-head">
    <button class="back-btn" data-back>← К объекту оценки</button>
    <span class="pill pill-gray">${isR ? 'Карточка ОИ (литера)' : oi.kind === 'land' ? 'Земельный участок' : oi.kind === 'vehicle' ? 'Транспортное средство' : oi.kind === 'office' ? 'Офисная техника' : 'Механизм'}</span>
    ${isR ? `<label class="flag-lbl"><input type="checkbox" data-flag="entered" ${f.entered ? 'checked' : ''}> Введено</label><label class="flag-lbl"><input type="checkbox" data-flag="matched" ${f.matched ? 'checked' : ''}> Сопоставлено с фото</label>` : ''}
    ${isR ? `<button class="btn btn-danger" data-del-oi="${oi.id}">Удалить литеру</button>` : ''}
    <button class="btn btn-ghost" data-open-ocdocs>Документы ОЦ</button>
    <button class="btn btn-primary" data-save-oi>Сохранить</button>
    <button class="btn btn-ghost" data-back>Отмена</button>
  </div>
  ${splitWrap(appState.viewer ? viewerHTML() : null, (isR ? realtyCards(oi) : oi.kind === 'land' ? landCards(oi) : movableCards(oi)))}`;
}