// Контроллер карточки ОИ «Транспортное средство».
//
// Правило то же, что в остальных карточках: пока человек печатает, карточка
// целиком не перерисовывается — полная отрисовка заменила бы поле вместе с
// курсором. Перерисовка только на смену типа ТС: от него зависит весь набор
// характеристик.
import { bindNumField } from '../../../../kernel/numField.js';
import { bindMsSearch } from '../../../../kernel/multiSelect.js';
import { setFieldError } from '../../../../kernel/fieldError.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../parts/docs/model.js';
import { addPhotoFile, photoPages } from '../../parts/photos/model.js';
import { openPhotoInPlace } from '../../parts/viewer/state.js';
import { normVin, vinError, normPlate, syncVehicleName, vehicleParams } from './model.js';

export function bind(ctx, oi) {
  const s = ctx.scope;

  // Подпись ОИ собирается из марки, модели и госномера — она же стоит в
  // перечне ОЦ и в плашке, поэтому обновляется по ходу набора.
  const retitle = () => {
    syncVehicleName(oi);
    const title = s.$('.mu-title');
    if (title) title.textContent = oi.brand || oi.model ? [oi.brand, oi.model].filter(Boolean).join(' ')
      : 'Транспортное средство';
  };

  const plain = (attr, set) => {
    const el = s.$(`[data-vh-${attr}]`);
    if (el) el.oninput = () => set(el);
  };

  plain('brand', (el) => { oi.brand = el.value; retitle(); });
  plain('model', (el) => { oi.model = el.value; retitle(); });
  plain('color', (el) => { oi.color = el.value; });
  plain('country', (el) => { oi.country = el.value; });
  plain('year', (el) => { oi.year = el.value; });
  plain('marks', (el) => { oi.marks = el.value; });

  const category = s.$('[data-vh-category]');
  if (category) category.onchange = () => { oi.category = category.value; };

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
    if (el.tagName === 'SELECT' || el.type === 'date') {
      // Тип кузова прицепа со значением «Иное» открывает поле для своего
      // значения — состав карточки меняется, поэтому отрисовываем заново.
      el.onchange = key === 'body' ? () => { set(); ctx.render(); } : set;
    } else el.oninput = set;
  });

  // Мультивыбор (тип топлива с завода): список общий для проекта, открывается
  // и закрывается как остальные мультивыборы модуля.
  s.$$('[data-vh-f-ms]').forEach((box) => {
    const key = box.dataset.vhFMs;
    const drop = box.querySelector('.ms-drop');
    const control = box.querySelector('[data-ms-toggle]');
    bindMsSearch(drop);

    if (control) control.onclick = (e) => {
      e.stopPropagation();
      drop.hidden = !drop.hidden;
      control.classList.toggle('open', !drop.hidden);
    };

    box.querySelectorAll('[data-vh-f-opt]').forEach((cb) => {
      cb.onchange = () => {
        const picked = Array.isArray(params[key]) ? params[key] : [];
        const value = cb.dataset.vhFOpt;
        const at = picked.indexOf(value);
        if (at >= 0) picked.splice(at, 1); else picked.push(value);
        params[key] = picked;
        if (!picked.length) delete params[key];

        const text = picked.join(', ');
        const summary = box.querySelector('.ms-summary');
        if (summary) {
          summary.textContent = text || 'не выбрано';
          summary.title = text;
          summary.classList.toggle('muted', !picked.length);
        }
        const count = box.querySelector('.ms-count');
        if (count) {
          count.textContent = String(picked.length);
          count.hidden = !picked.length;
        }
      };
    });
  });

  // Закрытие списков по клику вне них — один раз на область, иначе слушатели
  // копились бы с каждой отрисовкой.
  if (!s.root.dataset.vhMsBound) {
    s.root.dataset.vhMsBound = '1';
    s.onDocument('click', (e) => {
      if (e.target.closest('.ms')) return;
      s.$$('.ms-control').forEach((mc) => mc.classList.remove('open'));
      s.$$('.ms-drop').forEach((d) => { d.hidden = true; });
    });
  }

  s.$$('[data-vh-f-unit]').forEach((el) => {
    el.onchange = () => write(el.dataset.vhFUnit + '@unit', el.value);
  });

  // --- Комментарий ------------------------------------------------------------
  // Поле растёт по тексту: прокрутка внутри маленького окошка прячет
  // написанное, а комментарий как раз и читают целиком.
  const comment = s.$('[data-vh-comment]');
  if (comment) {
    const grow = () => {
      comment.style.height = 'auto';
      comment.style.height = comment.scrollHeight + 2 + 'px';
    };
    comment.oninput = () => { oi.comment = comment.value; grow(); };
    grow();
  }

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
