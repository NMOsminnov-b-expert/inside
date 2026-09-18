import { esc } from '../../kernel/dom.js';
import { fieldHTML } from '../../kernel/fieldSpec.js';
import { VEHICLE_TYPES, vehicleFieldsFor } from './data/vehicleFields.js';
import { vehicleExtra, VIN_LENGTH } from './records.js';
import { vehicleViewerHTML } from './viewer.js';

// Карточка транспортного средства как объекта оценки.
//
// Блоки идут по этапам работы — тот же порядок, что у карточки ТС в составе
// другого объекта оценки (civil/oi/vehicle): сперва опознавательные сведения из
// документов, затем паспортные характеристики выбранного типа, затем осмотр, и
// только потом свободные добавления. Состав полей задан одним справочником
// (data/vehicleFields.js), чтобы одно и то же ТС описывалось одинаково, чем бы
// оно ни было заведено.

const ATTR = 'vehicle-f';
const ID = 'vh-f-';

function identityHTML(rec) {
  const v = rec.vehicle;
  return `<div class="card t-blue"><div class="card-head"><span class="card-idx">01</span>
    <h3>Транспортное средство</h3></div><div class="card-pad"><div class="grid g-4 g-roomy">
      <div class="field"><label for="vh-type">Тип ТС</label>
        <select class="select" id="vh-type" data-vehicle-type>
          <option value="">Выберите тип</option>
          ${VEHICLE_TYPES.map((t) => `<option ${t === v.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select></div>
      <div class="field"><label for="vh-make">Марка и модель</label>
        <input class="input" id="vh-make" data-vehicle-make value="${esc(v.makeModel || '')}"
          placeholder="Например: Toyota Camry"></div>
      <div class="field"><label for="vh-plate">Государственный номер</label>
        <input class="input" id="vh-plate" data-vehicle-plate value="${esc(v.plate || '')}"
          placeholder="01KG123ABC"></div>
      <div class="field"><label for="vh-vin">VIN</label>
        <input class="input" id="vh-vin" data-vehicle-vin value="${esc(v.vin || '')}"
          maxlength="${VIN_LENGTH}" aria-describedby="vh-vin-hint" autocapitalize="characters"
          spellcheck="false">
        <span class="mu-hint mu-hint-under" id="vh-vin-hint">${VIN_LENGTH} знаков латиницей и цифрами,
          без букв I, O и Q.</span></div>
      <div class="field"><label for="vh-year">Год выпуска</label>
        <input class="input mu-num" id="vh-year" data-vehicle-year value="${esc(v.year || '')}"
          inputmode="numeric" maxlength="4" placeholder="ГГГГ"></div>
      <div class="field"><label for="vh-color">Цвет</label>
        <input class="input" id="vh-color" data-vehicle-color value="${esc(v.color || '')}"></div>
      <div class="field"><label for="vh-country">Страна-изготовитель</label>
        <input class="input" id="vh-country" data-vehicle-country value="${esc(v.country || '')}"></div>
    </div></div></div>`;
}

function fieldsHTML(rec, part, idx, title, hint) {
  const fields = vehicleFieldsFor(rec.vehicle.type);
  const body = !fields
    ? '<div class="vehicle-note">Выберите тип ТС — здесь появятся поля этого типа.</div>'
    : `<div class="grid g-4 g-roomy">${
      fields[part].map((f) => fieldHTML(rec.vehicle.params, f, ATTR, ID)).join('')}</div>`;

  if (fields && !fields[part].length) return '';

  return `<div class="card t-teal"><div class="card-head"><span class="card-idx">${idx}</span>
    <h3>${esc(title)}</h3><span class="hint">${esc(hint)}</span></div>
    <div class="card-pad">${body}</div></div>`;
}

// Дополнительные параметры — «наименование и значение» строками. Кнопка
// добавления стоит всегда, даже когда строк нет (практика строкового ввода
// Adobe Commerce: добавить строку можно и после того, как удалили последнюю).
function extraHTML(rec, idx) {
  const rows = vehicleExtra(rec).map((f) => `<tr>
      <td><input class="ax-cell" data-vehicle-xlabel="${f.id}" value="${esc(f.label)}"
        placeholder="Наименование параметра" aria-label="Наименование параметра"></td>
      <td><input class="ax-cell" data-vehicle-xvalue="${f.id}" value="${esc(f.value)}"
        placeholder="Значение" aria-label="Значение параметра"></td>
      <td class="mu-c-act"><button class="ax-x mu-del" data-vehicle-xdel="${f.id}"
        title="Убрать параметр" aria-label="Убрать параметр">×</button></td>
    </tr>`).join('');

  return `<div class="card t-slate"><div class="card-head"><span class="card-idx">${idx}</span>
    <h3>Дополнительные параметры</h3>
    <span class="hint">то, чего нет среди полей этого типа ТС</span>
    <button class="btn btn-ghost btn-sm" data-vehicle-xadd style="margin-left:auto">+ Параметр</button>
    </div><div class="card-pad">
    ${rows ? `<table class="tbl mu-xtbl">
      <colgroup><col style="width:38%"><col><col style="width:40px"></colgroup>
      <thead><tr><th>Наименование параметра</th><th>Значение</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<div class="vehicle-note">Дополнительных параметров нет.</div>'}
    </div></div>`;
}

function notesHTML(rec, idx) {
  return `<div class="card t-amber"><div class="card-head"><span class="card-idx">${idx}</span>
    <h3>Особые отметки</h3></div><div class="card-pad">
    <div class="field sp-all"><label for="vh-notes">Особые отметки</label>
      <textarea class="input mu-area" id="vh-notes" data-vehicle-notes
        rows="2">${esc(rec.vehicle.notes || '')}</textarea></div>
    </div></div>`;
}

function formHTML(rec) {
  return `<div class="vehicle-form">
    <div class="vehicle-actions">
      <button class="back-btn" data-vehicle-back>← К объектам оценки</button>
      <span class="pill pill-gray">Создание ОЦ</span>
      <button class="btn btn-primary" data-vehicle-save>Сохранить</button>
    </div>
    ${identityHTML(rec)}
    ${fieldsHTML(rec, 'passport', '02', 'Характеристики', 'из документов и с шильдиков')}
    ${fieldsHTML(rec, 'inspect', '03', 'Осмотр', 'заполняется на месте')}
    ${extraHTML(rec, '04')}
    ${notesHTML(rec, '05')}
  </div>`;
}

export function viewVehicle(ctx) {
  const v = ctx.rec.vehicle;
  return `<div class="view-head">
      <span class="pill pill-gray">${esc(v.makeModel || 'Транспортное средство · новая карточка')}</span>
      <span class="muted">${esc(v.plate || 'Госномер не указан')}</span>
    </div>
    <div class="split vehicle-split">${vehicleViewerHTML(ctx)}<div class="vsplit"></div>
    <div class="grow">${formHTML(ctx.rec)}</div></div>`;
}
