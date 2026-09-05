import { msDropBodyHTML, bindMsSearch } from '../../kernel/multiSelect.js';
import { bindVehicleViewer } from './viewer.js';

export function bindVehicle(ctx) {
  const s = ctx.scope;
  const rec = ctx.rec;
  s.$$('[data-vehicle-field]').forEach((el) => {
    el.onchange = () => {
      rec.vehicle[el.dataset.vehicleField] = el.value;
      if (el.dataset.vehicleField === 'type' || el.dataset.vehicleField === 'body') ctx.render();
    };
    if (el.tagName === 'TEXTAREA' || el.type === 'text' || el.type === 'number') el.oninput = () => { rec.vehicle[el.dataset.vehicleField] = el.value; };
  });
  s.$$('[data-vehicle-ms]').forEach((box) => {
    bindVehicleMulti(ctx, box, rec.vehicle[box.dataset.vehicleMs] || []);
  });
  bindVehicleViewer(ctx);
  const save = s.$('[data-vehicle-save]');
  if (save) save.onclick = () => { rec.updatedAt = new Date().toISOString().slice(0, 10); ctx.toast('ОЦ транспортного средства сохранён', 'ok'); };
  s.$$('[data-vehicle-back]').forEach((button) => button.onclick = () => ctx.host.toMenu());
}

function bindVehicleMulti(ctx, box, selected) {
  const key = box.dataset.vehicleMs;
  const drop = box.querySelector('.ms-drop');
  const control = box.querySelector('[data-ms-toggle]');
  const options = Array.from(drop.querySelectorAll('[data-ms-row]')).map((row) => row.dataset.msRow);
  if (control) control.onclick = (e) => { e.stopPropagation(); drop.hidden = !drop.hidden; };
  drop.onclick = (e) => e.stopPropagation();
  bindMsSearch(drop);
  box.querySelectorAll(`[data-vehicle-${key}]`).forEach((input) => input.onchange = () => {
    const values = ctx.rec.vehicle[key] || [];
    const value = input.dataset[`vehicle${key[0].toUpperCase()}${key.slice(1)}`];
    ctx.rec.vehicle[key] = input.checked ? [...values, value] : values.filter((item) => item !== value);
    const current = ctx.rec.vehicle[key];
    const summary = box.querySelector('.ms-summary');
    if (summary) { summary.textContent = current.length ? current.join(', ') : 'Не выбрано'; summary.title = summary.textContent; }
    drop.innerHTML = msDropBodyHTML({ options, selected: current, optAttr: `vehicle-${key}` });
    drop.hidden = false;
    bindVehicleMulti(ctx, box, current);
  });
}
