// Карточка ОИ «Транспортное средство».
//
// Блоки идут по этапам работы, а не по алфавиту полей (практика группировки
// полей по смыслу, Microsoft Learn «Fields and field groups», UX Planet
// «Designing more efficient forms»): сперва то, что переписывают с документов,
// затем то, что определяют на осмотре, и только потом свободные добавления.
//
//   01  Транспортное средство      — опознавательные сведения из документов;
//   02  Характеристики             — паспортные поля выбранного типа ТС;
//   03  Осмотр                     — состояния узлов и комплектность;
//   04  Дополнительные параметры   — таблица «наименование — значение»;
//   05  Особые отметки и комментарий;
//   06  Фото по категориям.
//
// Набор полей блоков 02 и 03 зависит от типа ТС (vehicle/data/vehicleFields.js).
// Пока тип не выбран, полей нет вовсе — практика каскадных списков: дочернее
// поле не показывается, пока не выбран родитель.
import { esc } from '../../../../kernel/dom.js';
import { blockNumbers } from '../../../../kernel/blockIndex.js';
import { fieldHTML } from '../../../../kernel/fieldSpec.js';
import { VEHICLE_TYPES } from '../../../vehicle/data/vehicleFields.js';
import { splitWrap, viewerHTML } from '../../parts/viewer/shell.js';
import { photoAccordions } from '../../parts/photos/blocks.js';
import { paramsOf, vehicleExtra, vehicleTitle, vehicleSubtitle, VIN_LENGTH } from './model.js';

const ATTR = 'vh-f';
const ID = 'vh-f-';

// Тип ТС, марка, госномер и VIN — то, по чему машину узнают. Тип идёт первым:
// от него зависят характеристики и состав осмотра (практика каскадных списков —
// родитель стоит перед тем, что от него зависит).
function identityHTML(oi) {
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
        <label for="vh-make">Марка и модель</label>
        <input class="input" id="vh-make" data-vh-make value="${esc(oi.makeModel || '')}"
          placeholder="Например: Toyota Camry">
      </div>
      <div class="field">
        <label for="vh-plate">Государственный номер</label>
        <input class="input" id="vh-plate" data-vh-plate value="${esc(oi.plate || '')}" placeholder="01KG123ABC">
      </div>
      <div class="field">
        <label for="vh-vin">VIN</label>
        <input class="input vh-vin" id="vh-vin" data-vh-vin value="${esc(oi.vin || '')}"
          maxlength="${VIN_LENGTH}" aria-describedby="vh-vin-hint" autocapitalize="characters" spellcheck="false">
        <span class="mu-hint mu-hint-under" id="vh-vin-hint">${VIN_LENGTH} знаков латиницей и цифрами,
          без букв I, O и Q.</span>
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

// Блоки 02 и 03: паспортные поля и осмотр. Пустой набор не рисуется вовсе —
// заголовок над пустотой ничего не сообщает.
function fieldsHTML(oi, part, title, hint) {
  const fields = paramsOf(oi);
  if (!fields) {
    return part === 'passport' ? `<div class="mu-sec">
      <div class="sec-h">${esc(title)}</div>
      <div class="mu-empty">Выберите тип ТС — здесь появятся поля этого типа.</div>
    </div>` : '';
  }

  const list = fields[part];
  if (!list.length) return '';

  return `<div class="mu-sec" data-vh-sec="${part}">
    <div class="sec-h">${esc(title)}${hint ? `<span class="mu-sec-hint">${esc(hint)}</span>` : ''}</div>
    <div class="grid g-2 mu-params">${list.map((f) => fieldHTML(oi.params, f, ATTR, ID)).join('')}</div>
  </div>`;
}

// Дополнительные параметры — «наименование и значение» строками. Кнопка
// добавления стоит всегда, даже когда строк нет (практика строкового ввода
// Adobe Commerce: добавить строку можно и после того, как удалили последнюю).
function extraHTML(oi) {
  const rows = vehicleExtra(oi).map((f) => `<tr>
      <td><input class="ax-cell" data-vh-xlabel="${f.id}" value="${esc(f.label)}"
        placeholder="Наименование параметра" aria-label="Наименование параметра"></td>
      <td><input class="ax-cell" data-vh-xvalue="${f.id}" value="${esc(f.value)}"
        placeholder="Значение" aria-label="Значение параметра"></td>
      <td class="mu-c-act"><button class="ax-x mu-del" data-vh-xdel="${f.id}"
        title="Убрать параметр" aria-label="Убрать параметр">×</button></td>
    </tr>`).join('');

  return `<div class="mu-sec">
    <div class="sec-h">Дополнительные параметры
      <span class="mu-sec-hint">то, чего нет среди полей этого типа ТС</span>
      <button class="btn btn-ghost btn-sm" data-vh-xadd>+ Параметр</button>
    </div>
    ${rows ? `<table class="tbl mu-xtbl">
      <colgroup><col style="width:38%"><col><col style="width:40px"></colgroup>
      <thead><tr><th>Наименование параметра</th><th>Значение</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<div class="mu-empty">Дополнительных параметров нет.</div>'}
  </div>`;
}

// Особые отметки — приметы самой машины (перекрашен, следы ремонта, надпись на
// борту). Комментарий — про запись: чего не хватило и в чём сомнение.
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
  return `<div class="card t-teal" id="q-vehicle" data-vh-card="${esc(oi.id)}">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">${String(idx).padStart(2, '0')}</span>
      <h3 class="mu-title ell">${esc(vehicleTitle(oi))}</h3>
      <span class="mu-sec-hint">${esc(vehicleSubtitle(oi))}</span>
      <span class="chev" style="margin-left:auto">▾</span>
    </div>
    <div class="card-body-wrap"><div class="card-pad">
      ${identityHTML(oi)}
      ${fieldsHTML(oi, 'passport', 'Характеристики', 'из документов и с шильдиков')}
      ${fieldsHTML(oi, 'inspect', 'Осмотр', 'заполняется на месте')}
      ${extraHTML(oi)}
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
