import { bindNumField } from '../../kernel/numField.js';
import { setFieldError } from '../../kernel/fieldError.js';
import {
  normVin, vinError, normPlate, vehicleExtra, addVehicleExtra, dropVehicleExtra,
} from './records.js';
import { bindVehicleViewer } from './viewer.js';

// Контроллер карточки ТС как объекта оценки.
//
// Правило то же, что в карточках объектов имущества: пока человек печатает,
// экран целиком не перерисовывается. Отрисовка заново — только там, где
// меняется состав карточки: тип ТС и строки дополнительных параметров.
export function bindVehicle(ctx) {
  const s = ctx.scope;
  const v = ctx.rec.vehicle;

  const plain = (attr, set) => {
    const el = s.$(`[data-vehicle-${attr}]`);
    if (el) el.oninput = () => set(el);
  };

  plain('brand', (el) => { v.brand = el.value; });
  plain('model', (el) => { v.model = el.value; });
  plain('color', (el) => { v.color = el.value; });
  plain('country', (el) => { v.country = el.value; });
  plain('year', (el) => { v.year = el.value; });
  plain('notes', (el) => { v.notes = el.value; });

  // Госномер приводится к верхнему регистру по ходу набора; курсор не прыгает —
  // длина строки не меняется.
  const plate = s.$('[data-vehicle-plate]');
  if (plate) {
    plate.oninput = () => {
      const at = plate.selectionStart;
      plate.value = plate.value.toUpperCase();
      plate.setSelectionRange(at, at);
      v.plate = normPlate(plate.value);
    };
  }

  // VIN: лишние знаки отбрасываются сразу, а недобранная длина — не ошибка
  // набора, а подсказка, сколько осталось; поэтому по уходу фокуса.
  const vin = s.$('[data-vehicle-vin]');
  if (vin) {
    vin.oninput = () => {
      const at = vin.selectionStart;
      const before = vin.value.length;
      vin.value = normVin(vin.value);
      const shift = before - vin.value.length;
      vin.setSelectionRange(at - shift, at - shift);
      v.vin = vin.value;
      setFieldError(vin, '');
    };
    vin.onblur = () => setFieldError(vin, vinError(vin.value));
  }

  // --- Тип ТС: от него зависят характеристики и состав осмотра --------------
  const type = s.$('[data-vehicle-type]');
  if (type) type.onchange = () => { v.type = type.value; ctx.render(); };

  // --- Поля типа ------------------------------------------------------------
  const params = (v.params = v.params || {});
  const write = (key, value) => {
    if (value) params[key] = value;
    else delete params[key];
  };

  s.$$('[data-vehicle-f]').forEach((el) => {
    const key = el.dataset.vehicleF;
    if (el.dataset.num) {
      bindNumField(el, (val) => write(key, val), el.dataset.num);
      return;
    }
    const set = () => write(key, el.value);
    if (el.tagName === 'SELECT' || el.type === 'date') el.onchange = set;
    else el.oninput = set;
  });

  s.$$('[data-vehicle-f-unit]').forEach((el) => {
    el.onchange = () => write(el.dataset.vehicleFUnit + '@unit', el.value);
  });

  // --- Дополнительные параметры ----------------------------------------------
  s.$$('[data-vehicle-xlabel]').forEach((inp) => inp.oninput = () => {
    const row = vehicleExtra(ctx.rec).find((f) => f.id === inp.dataset.vehicleXlabel);
    if (row) row.label = inp.value;
  });

  s.$$('[data-vehicle-xvalue]').forEach((inp) => inp.oninput = () => {
    const row = vehicleExtra(ctx.rec).find((f) => f.id === inp.dataset.vehicleXvalue);
    if (row) row.value = inp.value;
  });

  s.$$('[data-vehicle-xdel]').forEach((b) => b.onclick = () => {
    dropVehicleExtra(ctx.rec, b.dataset.vehicleXdel);
    ctx.render();
  });

  const xadd = s.$('[data-vehicle-xadd]');
  if (xadd) xadd.onclick = () => {
    const row = addVehicleExtra(ctx.rec);
    ctx.render();
    const inp = s.$(`[data-vehicle-xlabel="${row.id}"]`);
    if (inp) inp.focus();
  };

  bindVehicleViewer(ctx);

  const save = s.$('[data-vehicle-save]');
  if (save) {
    save.onclick = () => {
      ctx.rec.updatedAt = new Date().toISOString().slice(0, 10);
      ctx.toast('ОЦ транспортного средства сохранён', 'ok');
    };
  }

  s.$$('[data-vehicle-back]').forEach((button) => button.onclick = () => ctx.host.toMenu());
}
