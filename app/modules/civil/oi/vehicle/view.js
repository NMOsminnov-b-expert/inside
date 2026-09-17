// Карточка ОИ «Транспортное средство».
//
// Устройство — как у остальных карточек модуля: блоки с номерами, слева
// просмотрщик документов и фото. Набор характеристик зависит от типа ТС
// (data/vehicleFields.js): у легкового кузов и объём двигателя, у спецтехники
// вид машины и наработка, у прицепа — оси и тормоза. Пока тип не выбран,
// характеристик нет вовсе — практика каскадных списков: дочернее поле не
// показывается, пока не выбран родитель.
import { esc } from '../../../../kernel/dom.js';
import { blockNumbers } from '../../../../kernel/blockIndex.js';
import { splitWrap, viewerHTML } from '../../parts/viewer/shell.js';
import { photoAccordions } from '../../parts/photos/blocks.js';
import { fieldHTML } from '../../parts/fields.js';
import { VEHICLE_TYPES } from '../../data/vehicleFields.js';
import { CATEGORIES, paramsOf, vehicleTitle, vehicleSubtitle, VIN_LENGTH } from './model.js';

const ATTR = 'vh-f';
const ID = 'vh-f-';

// Тип ТС, марка, госномер и VIN — то, по чему машину узнают. Всё в этом блоке
// читается с техпаспорта, поэтому и порядок тот же, в каком оно там стоит.
// Тип идёт первым: от него зависят характеристики ниже (практика каскадных
// списков — родитель стоит перед тем, что от него зависит).
function identityHTML(oi) {
  const vin = String(oi.vin || '');
  return `<div class="mu-sec">
    <div class="sec-h">Транспортное средство</div>
    <div class="grid mu-grid-general">
      <div class="field">
        <label for="vh-type">Тип ТС</label>
        <select class="select" id="vh-type" data-vh-type>
          <option value="">Выберите тип</option>
          ${VEHICLE_TYPES.map((t) => `<option ${t === oi.vtype ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="vh-category">Категория ТС</label>
        <select class="select" id="vh-category" data-vh-category>
          <option value="">Не выбрано</option>
          ${CATEGORIES.map((c) => `<option ${c === oi.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="vh-brand">Марка</label>
        <input class="input" id="vh-brand" data-vh-brand value="${esc(oi.brand || '')}" placeholder="Например: Toyota">
      </div>
      <div class="field">
        <label for="vh-model">Модель</label>
        <input class="input" id="vh-model" data-vh-model value="${esc(oi.model || '')}" placeholder="Например: Camry">
      </div>
      <div class="field">
        <label for="vh-plate">Государственный номер</label>
        <input class="input" id="vh-plate" data-vh-plate value="${esc(oi.plate || '')}" placeholder="01KG123ABC">
      </div>
      <div class="field">
        <label for="vh-vin">VIN</label>
        <span class="mu-hint" id="vh-vin-hint">${VIN_LENGTH} знаков латиницей и цифрами, без букв I, O и Q.</span>
        <input class="input vh-vin" id="vh-vin" data-vh-vin value="${esc(vin)}"
          maxlength="${VIN_LENGTH}" aria-describedby="vh-vin-hint" autocapitalize="characters" spellcheck="false">
      </div>
      <div class="field">
        <label for="vh-year">Год выпуска</label>
        <input class="input mu-num" id="vh-year" data-vh-year value="${esc(oi.year || '')}"
          inputmode="numeric" maxlength="4" placeholder="ГГГГ">
      </div>
      <div class="field">
        <label for="vh-color">Цвет</label>
        <input class="input" id="vh-color" data-vh-color value="${esc(oi.color || '')}">
      </div>
      <div class="field">
        <label for="vh-country">Страна-изготовитель</label>
        <input class="input" id="vh-country" data-vh-country value="${esc(oi.country || '')}">
      </div>
    </div>
  </div>`;
}

function paramsHTML(oi, part, title) {
  const fields = paramsOf(oi);
  if (!fields) {
    return part === 'main' ? `<div class="mu-sec">
      <div class="sec-h">Характеристики</div>
      <div class="mu-empty">Выберите тип ТС — здесь появятся характеристики этого типа.</div>
    </div>` : '';
  }
  const list = fields[part];
  if (!list.length) return '';

  return `<div class="mu-sec">
    <div class="sec-h">${esc(title)}</div>
    <div class="grid g-2 mu-params">${list.map((f) => fieldHTML(oi.params, f, ATTR, ID)).join('')}</div>
  </div>`;
}

// Особые отметки — поле карточки ТС как объекта оценки: приметы, которых нет
// среди характеристик (перекрашен, следы ремонта, надпись на борту).
// Комментарий — про саму запись: чего не хватило и в чём сомнение.
function notesHTML(oi) {
  return `<div class="mu-sec">
    <div class="sec-h">Особые отметки и комментарий</div>
    <div class="field mu-comment-field">
      <label for="vh-marks">Особые отметки</label>
      <textarea class="input mu-comment" id="vh-marks" data-vh-marks rows="2">${esc(oi.marks || '')}</textarea>
    </div>
    <div class="field mu-comment-field">
      <label for="vh-comment">Комментарий</label>
      <span class="mu-hint" id="vh-comment-hint">Не нашли подходящего поля или сомневаетесь в значении —
        опишите здесь своими словами.</span>
      <textarea class="input mu-comment" id="vh-comment" data-vh-comment rows="3"
        aria-describedby="vh-comment-hint">${esc(oi.comment || '')}</textarea>
    </div>
  </div>`;
}

function cardHTML(ctx, oi, idx) {
  const n = String(idx).padStart(2, '0');
  return `<div class="card t-teal" id="q-vehicle" data-vh-card="${esc(oi.id)}">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">${n}</span>
      <h3 class="mu-title ell">${esc(vehicleTitle(oi))}</h3>
      <span class="mu-sec-hint">${esc(vehicleSubtitle(oi))}</span>
      <span class="chev" style="margin-left:auto">▾</span>
    </div>
    <div class="card-body-wrap"><div class="card-pad">
      ${identityHTML(oi)}
      ${paramsHTML(oi, 'main', 'Характеристики')}
      ${paramsHTML(oi, 'extra', 'Дополнительные характеристики')}
      ${notesHTML(oi)}
    </div></div>
  </div>`;
}

function photosCard(ctx, oi, idx) {
  return `<div class="card t-blue" id="q-photo">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">${String(idx).padStart(2, '0')}</span><h3>Фото по категориям</h3>
      <button class="btn btn-ghost btn-sm" data-open-pviewer style="margin-left:auto">Открыть просмотрщик</button>
      <span class="chev">▾</span>
    </div>
    <div class="card-body-wrap"><div class="card-pad">${photoAccordions(ctx.ui, oi, true)}</div></div>
  </div>`;
}

export function render(ctx, oi) {
  const idx = blockNumbers();
  const body = `<div class="oi-stack mu-stack">
    ${cardHTML(ctx, oi, idx())}
    ${photosCard(ctx, oi, idx())}
  </div>`;

  return splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, body);
}
