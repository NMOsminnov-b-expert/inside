// Контроллер карточки ОИ «Транспортное средство».
//
// Правило то же, что в остальных карточках: пока человек печатает, карточка
// целиком не перерисовывается — полная отрисовка заменила бы поле вместе с
// курсором. Перерисовка только на смену типа ТС: от него зависит весь набор
// характеристик.
import { bindNumField } from '../../../../kernel/numField.js';
import { bindAutoGrowAll } from '../../../../kernel/autoGrow.js';
import { setFieldError } from '../../../../kernel/fieldError.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../parts/docs/model.js';
import { addPhotoFile, photoPages } from '../../parts/photos/model.js';
import { openPhotoInPlace } from '../../parts/viewer/state.js';
import {
  normVin, vinError, normPlate, syncVehicleName, vehicleParams,
  vehicleExtra, addVehicleExtra, dropVehicleExtra,
} from './model.js';

export function bind(ctx, oi) {
  const s = ctx.scope;

  // Подпись ОИ собирается из марки, модели и госномера — она же стоит в
  // перечне ОЦ и в плашке, поэтому обновляется по ходу набора.
  const retitle = () => {
    syncVehicleName(oi);
    const title = s.$('.mu-title');
    if (title) title.textContent = (oi.makeModel || '').trim() || 'Транспортное средство';
  };

  const plain = (attr, set) => {
    const el = s.$(`[data-vh-${attr}]`);
    if (el) el.oninput = () => set(el);
  };

  plain('make', (el) => { oi.makeModel = el.value; retitle(); });
  plain('color', (el) => { oi.color = el.value; });
  plain('country', (el) => { oi.country = el.value; });
  plain('year', (el) => { oi.year = el.value; });
  plain('marks', (el) => { oi.marks = el.value; });

  // Госномер приводится к верхнему регистру по ходу набора; курсор при этом не
  // прыгает — длина строки не меняется.
  const plate = s.$('[data-vh-plate]');
  if (plate) {
    plate.oninput = () => {
      const at = plate.selectionStart;
      plate.value = plate.value.toUpperCase();
      plate.setSelectionRange(at, at);
      oi.plate = normPlate(plate.value);
      retitle();
    };
  }

  // VIN: лишние знаки отбрасываются сразу (букв I, O, Q в коде не бывает), а
  // недобранная длина — не ошибка набора, а подсказка, сколько осталось.
  const vin = s.$('[data-vh-vin]');
  if (vin) {
    vin.oninput = () => {
      const at = vin.selectionStart;
      const before = vin.value.length;
      vin.value = normVin(vin.value);
      vin.setSelectionRange(at - (before - vin.value.length), at - (before - vin.value.length));
      oi.vin = vin.value;
      setFieldError(vin, '');
    };
    vin.onblur = () => setFieldError(vin, vinError(vin.value));
  }

  // --- Тип ТС: от него зависит набор характеристик --------------------------
  const type = s.$('[data-vh-type]');
  if (type) {
    type.onchange = () => {
      oi.vtype = type.value;
      ctx.render();
    };
  }

  // --- Характеристики по типу ------------------------------------------------
  const params = vehicleParams(oi);
  const write = (key, value) => {
    if (value) params[key] = value;
    else delete params[key];
  };

  s.$$('[data-vh-f]').forEach((el) => {
    const key = el.dataset.vhF;
    if (el.dataset.num) {
      bindNumField(el, (v) => write(key, v), el.dataset.num);
      return;
    }
    const set = () => write(key, el.value);
    if (el.tagName === 'SELECT' || el.type === 'date') el.onchange = set;
    else el.oninput = set;
  });

  s.$$('[data-vh-f-unit]').forEach((el) => {
    el.onchange = () => write(el.dataset.vhFUnit + '@unit', el.value);
  });

  // --- Дополнительные параметры -------------------------------------------------
  // Правится по ходу набора, как остальные поля; строка добавляется и убирается
  // с перерисовкой — состав карточки меняется.
  s.$$('[data-vh-xlabel]').forEach((inp) => inp.oninput = () => {
    const row = vehicleExtra(oi).find((f) => f.id === inp.dataset.vhXlabel);
    if (row) row.label = inp.value;
  });

  s.$$('[data-vh-xvalue]').forEach((inp) => inp.oninput = () => {
    const row = vehicleExtra(oi).find((f) => f.id === inp.dataset.vhXvalue);
    if (row) row.value = inp.value;
  });

  s.$$('[data-vh-xdel]').forEach((b) => b.onclick = () => {
    dropVehicleExtra(oi, b.dataset.vhXdel);
    ctx.render();
  });

  const xadd = s.$('[data-vh-xadd]');
  if (xadd) xadd.onclick = async () => {
    const row = addVehicleExtra(oi);
    // Отрисовка асинхронная, поэтому фокус ставим после неё: иначе он уходит
    // в поле, которого на экране уже нет.
    await ctx.render();
    const inp = s.$(`[data-vh-xlabel="${row.id}"]`);
    if (inp) inp.focus();
  };

  // --- Особые отметки и комментарий -------------------------------------------
  // Поля растут под текст, а если человек потянул поле за уголок — держат его
  // размер (kernel/autoGrow.js).
  const marks = s.$('[data-vh-marks]');
  if (marks) marks.oninput = () => { oi.marks = marks.value; };

  const comment = s.$('[data-vh-comment]');
  if (comment) comment.oninput = () => { oi.comment = comment.value; };

  ctx.ui.growSizes = ctx.ui.growSizes || {};
  bindAutoGrowAll(s, ctx.ui.growSizes);

  // --- Фото --------------------------------------------------------------------
  s.$$('[data-add-photo]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const cat = b.dataset.addPhoto;
    const file = await pickFile('image/*');
    if (!file) return;
    if (isFileTooLarge(file)) { ctx.toast(`Файл слишком большой (максимум ${MAX_DOC_FILE_MB} МБ)`, 'warn'); return; }

    addPhotoFile(oi, cat, await attachedFileFrom(file));
    ctx.ui.accOpen['ph|' + oi.id + '|' + cat] = true;
    ctx.render();
    ctx.toast('Фото загружено: ' + file.name, 'ok');
  });

  s.$$('[data-open-photo]').forEach((p) => p.onclick = (e) => {
    e.stopPropagation();
    const [, rest] = p.dataset.openPhoto.split('|');
    const [cat, i] = rest.split(':');
    const idx = photoPages(oi).findIndex((x) => x.cat === cat && x.i === +i) + 1;
    openPhotoInPlace(ctx, oi.id, idx);
  });

  s.$$('[data-open-pviewer]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    ctx.ui.viewer = { mode: 'photo' };
    ctx.render();
  });
}
