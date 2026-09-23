import { bindNumField } from '../../kernel/numField.js';
import { bindAutoGrowAll } from '../../kernel/autoGrow.js';
import { bindViewer } from '../../kernel/viewer/ctrl.js';
import { bindSplitPanes } from '../../kernel/viewer/shell.js';
import { bindStatusFlow } from '../../kernel/status/flow.ctrl.js';
import { bindParties } from './parties.ctrl.js';
import { attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../kernel/fileUpload.js';
import { openPhotoInPlace } from '../../kernel/viewer/state.js';
import { photoSetOf, photoPages, addPhotoFile, pickImages } from './photos.js';
import { confirmDialog } from '../../kernel/dialog.js';
import {
  tsOf, basesOf, selfKinds, moduleKinds, addExtra, dropExtra, addModule, dropModule, categoryFromVtype,
  normVin, vinWarning, normPlate, idMissing,
} from './tsModel.js';

// Контроллер карточки ТС как объекта оценки.
//
// Правило то же, что в карточках объектов имущества: пока человек печатает,
// экран целиком не перерисовывается. Отрисовка заново — только там, где
// меняется состав карточки: вид объекта, категория и база, модули, строки
// дополнительных параметров.
export function bindVehicle(ctx) {
  const s = ctx.scope;
  const v = tsOf(ctx.rec);
  ctx.ui = ctx.ui || {};

  // «main» — сама машина, иначе id модуля на ней.
  const owner = (id) => (id === 'main' ? v : v.modules.find((m) => m.id === id));
  const valsOf = (id) => { const o = owner(id); return o ? (o.f = o.f || {}) : null; };
  const extraOf = (id) => { const o = owner(id); return o ? (o.extra = o.extra || []) : null; };
  const split = (s2) => { const at = s2.indexOf('|'); return [s2.slice(0, at), s2.slice(at + 1)]; };

  const write = (vals, key, value) => {
    if (value !== '' && value != null) vals[key] = value;
    else delete vals[key];
  };

  // --- 02 Вид объекта: смена выбора перестраивает карточку -----------------
  s.$$('[data-ts-kind]').forEach((b) => b.onclick = () => {
    if (v.kind === b.dataset.tsKind) return;
    v.kind = b.dataset.tsKind;
    ctx.render();
  });

  // Каскад: смена родителя сбрасывает дочерний выбор; единственный вариант
  // подставляется сам (практика каскадных списков).
  const cascade = (sel, set) => { const el = s.$(sel); if (el) el.onchange = () => { set(el.value); ctx.render(); }; };
  const setCategory = (val) => {
    if (v.category === val) return;
    v.category = val;
    const bases = basesOf(val).filter((b) => b.name !== 'Прочее');
    v.base = bases.length === 1 ? bases[0].name : '';
  };
  // Категория, выбранная руками, может не совпасть с записью «Тип ТС» —
  // уведомление, а не запрет: решает пользователь.
  const warnMismatch = (text = v.f.vtype) => {
    const vtype = String(text || '').trim();
    const guess = categoryFromVtype(vtype);
    if (guess && v.category && guess !== v.category) {
      ctx.toast(`Категория «${v.category}» не совпадает с записью «Тип ТС»: «${vtype}»`, 'warn');
    }
  };
  // Выбранная руками категория — выбор человека: подбор по «Типу ТС» его больше
  // не трогает.
  cascade('[data-ts-cat]', (val) => { setCategory(val); v.categoryAuto = false; warnMismatch(); });

  // Категория по записи «Тип ТС»: подбирается, когда её ещё не выбирали или
  // она была подобрана сама; по уходу из поля — пока человек печатает,
  // карточка не перерисовывается.
  const vt = s.$('[data-tsf="main|vtype"]');
  if (vt && s.$('[data-ts-cat]')) {
    vt.addEventListener('change', () => {
      const guess = categoryFromVtype(vt.value);
      if (!guess || guess === v.category) return;
      if (v.category && !v.categoryAuto) { warnMismatch(vt.value); return; }
      setCategory(guess);
      v.categoryAuto = true;
      ctx.render();
    });
  }
  cascade('[data-ts-base]', (val) => { v.base = val; });
  cascade('[data-ts-sgroup]', (val) => {
    v.selfGroup = val;
    const kinds = selfKinds(val);
    v.selfKind = kinds.length === 1 ? kinds[0].name : '';
  });
  cascade('[data-ts-skind]', (val) => { v.selfKind = val; });
  cascade('[data-ts-mgroup]', (val) => {
    v.modGroup = val;
    const kinds = moduleKinds(val);
    v.modKind = kinds.length === 1 ? kinds[0].name : '';
  });
  cascade('[data-ts-mkind]', (val) => { v.modKind = val; });

  // --- поля машины и модулей ------------------------------------------------
  // Поля, от которых зависит состав карточки (топливо, вид прицепной
  // машины), при смене перерисовывают её; остальные пишутся молча.
  const RERENDER = new Set(['fuel', 'vidMashiny']);

  s.$$('[data-tsf]').forEach((el) => {
    const [who, key] = split(el.dataset.tsf);
    const vals = valsOf(who);
    if (!vals) return;

    if (el.dataset.num) {
      bindNumField(el, (val) => write(vals, key, val), el.dataset.num);
      return;
    }

    if (key === 'vin') {
      // VIN: верхний регистр без пробелов по ходу набора; несоответствие
      // стандарту — предупреждение по уходу фокуса, а не запрет.
      const warn = s.$(`[data-ts-warn="${who}|vin"]`);
      el.oninput = () => {
        const at = el.selectionStart;
        const before = el.value.length;
        el.value = normVin(el.value);
        const shift = before - el.value.length;
        el.setSelectionRange(at - shift, at - shift);
        write(vals, key, el.value);
        if (warn) warn.hidden = true;
      };
      el.onblur = () => {
        const text = vinWarning(el.value);
        if (warn) { warn.textContent = text; warn.hidden = !text; }
        checkIds();
      };
      return;
    }

    if (key === 'plate') {
      el.oninput = () => {
        const at = el.selectionStart;
        el.value = el.value.toUpperCase();
        el.setSelectionRange(at, at);
        write(vals, key, normPlate(el.value));
      };
      return;
    }

    const set = () => {
      write(vals, key, el.value);
      if (who !== 'main' && ['model', 'serialNo', 'year', 'state'].includes(key)) syncModuleRow(who);
      if (RERENDER.has(key)) ctx.render();
    };
    if (el.tagName === 'SELECT' || el.type === 'date') el.onchange = set;
    else el.oninput = set;
    if (key === 'bodyNo' || key === 'chassisNo') el.onblur = () => checkIds();
  });

  s.$$('[data-tsf-unit]').forEach((el) => {
    const [who, key] = split(el.dataset.tsfUnit);
    const vals = valsOf(who);
    if (vals) el.onchange = () => write(vals, key + '@unit', el.value);
  });

  // Ходовая — флажки, значение — список отмеченного.
  s.$$('[data-tsf-check]').forEach((el) => {
    const [who, key] = split(el.dataset.tsfCheck);
    const vals = valsOf(who);
    if (!vals) return;
    el.onchange = () => {
      const picked = new Set(Array.isArray(vals[key]) ? vals[key] : []);
      if (el.checked) picked.add(el.value); else picked.delete(el.value);
      if (picked.size) vals[key] = [...picked]; else delete vals[key];
    };
  });

  // Опознавательные номера: хотя бы один из трёх (предупреждение у группы).
  function checkIds() {
    const box = s.$('[data-ts-idwarn]');
    if (!box) return;
    const focusInGroup = ['vin', 'bodyNo', 'chassisNo']
      .some((k) => document.activeElement && document.activeElement.dataset
        && document.activeElement.dataset.tsf === `main|${k}`);
    box.hidden = focusInGroup || !idMissing(v);
  }

  // Строка модуля в таблице следует за полями формы без перерисовки.
  function syncModuleRow(id) {
    const m = owner(id);
    const row = s.$(`[data-ts-mpick="${id}"]`);
    if (!m || !row) return;
    const cells = row.querySelectorAll('td');
    const val = (k) => String(m.f[k] || '').trim() || '—';
    cells[1].textContent = val('model');
    cells[2].textContent = val('serialNo');
    cells[3].textContent = val('year');
    cells[4].textContent = val('state');
  }

  // --- 06 Модули ---------------------------------------------------------------
  const madd = s.$('[data-ts-madd]');
  if (madd) madd.onclick = async () => {
    const m = addModule(v);
    ctx.ui.tsModule = m.id;
    await ctx.render();
    const g = s.$(`[data-ts-modgroup="${m.id}"]`);
    if (g) g.focus();
  };

  s.$$('[data-ts-mpick]').forEach((row) => {
    const pick = () => { ctx.ui.tsModule = row.dataset.tsMpick; ctx.render(); };
    row.onclick = (e) => { if (!e.target.closest('[data-ts-mdel]')) pick(); };
    row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
  });

  // Удаление модуля — крестиком в строке таблицы и кнопкой в его форме.
  // Модуль со сведениями уносит их с собой — спрашиваем (как у единиц
  // механизмов в гражданском); пустой убирается сразу.
  s.$$('[data-ts-mdel]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const id = b.dataset.tsMdel;
    const m = owner(id);
    if (!m) return;
    const filled = m.kind || Object.keys(m.f || {}).length || (m.extra || []).length;
    if (filled) {
      const ok = await confirmDialog({
        title: 'Удалить модуль',
        text: `Удалить «${m.kind || 'модуль'}» с машины? Его сведения и дополнительные параметры будут удалены.`,
        okLabel: 'Удалить',
        danger: true,
      });
      if (!ok) return;
    }
    dropModule(v, id);
    if (ctx.ui.tsModule === id) ctx.ui.tsModule = '';
    ctx.render();
    ctx.toast('Модуль удалён', 'ok');
  });

  s.$$('[data-ts-modgroup]').forEach((el) => el.onchange = () => {
    const m = owner(el.dataset.tsModgroup);
    if (!m) return;
    m.group = el.value;
    const kinds = moduleKinds(el.value);
    m.kind = kinds.length === 1 ? kinds[0].name : '';
    ctx.render();
  });

  s.$$('[data-ts-modkind]').forEach((el) => el.onchange = () => {
    const m = owner(el.dataset.tsModkind);
    if (!m) return;
    m.kind = el.value;
    ctx.render();
  });

  // --- дополнительные параметры (у машины и у каждого модуля) -----------------
  const row = (attr, el) => {
    const [who, id] = split(el.dataset[attr]);
    const list = extraOf(who);
    return list ? list.find((r) => r.id === id) : null;
  };

  s.$$('[data-tsx-label]').forEach((el) => el.oninput = () => { const r = row('tsxLabel', el); if (r) r.label = el.value; });
  s.$$('[data-tsx-value]').forEach((el) => el.oninput = () => { const r = row('tsxValue', el); if (r) r.value = el.value; });

  s.$$('[data-tsx-del]').forEach((b) => b.onclick = () => {
    const [who, id] = split(b.dataset.tsxDel);
    const list = extraOf(who);
    if (list) { dropExtra(list, id); ctx.render(); }
  });

  // Новая строка — фокус сразу в её название.
  s.$$('[data-tsx-add]').forEach((b) => b.onclick = async () => {
    const who = b.dataset.tsxAdd;
    const list = extraOf(who);
    if (!list) return;
    const r = addExtra(list);
    await ctx.render();
    const el = s.$(`[data-tsx-label="${who}|${r.id}"]`);
    if (el) el.focus();
  });

  // --- Фото с осмотра -------------------------------------------------------------
  // Снимки с осмотра приносят пачкой — выбор нескольких файлов сразу; слишком
  // большие пропускаются с сообщением, остальные добавляются.
  const set = photoSetOf(ctx.rec);
  s.$$('[data-ts-photo-add]').forEach((b) => b.onclick = async () => {
    const cat = b.dataset.tsPhotoAdd;
    const files = await pickImages();
    if (!files.length) return;
    const big = files.filter(isFileTooLarge);
    for (const file of files.filter((f) => !isFileTooLarge(f))) addPhotoFile(set, cat, await attachedFileFrom(file));
    ctx.render();
    const added = files.length - big.length;
    if (added) ctx.toast(`Фото добавлено: ${added} · ${cat}`, 'ok');
    if (big.length) ctx.toast(`Пропущено ${big.length}: больше ${MAX_DOC_FILE_MB} МБ`, 'warn');
  });

  s.$$('[data-ts-photo-open]').forEach((b) => b.onclick = () => {
    const [cat, i] = split(b.dataset.tsPhotoOpen);
    const idx = photoPages(set).findIndex((p) => p.cat === cat && p.i === Number(i)) + 1;
    ctx.ui.viewerClosed = false;
    openPhotoInPlace(ctx, set.id, idx);
  });

  // Многострочные поля растут под текст, а после ручной растяжки держат размер.
  ctx.ui.growSizes = ctx.ui.growSizes || {};
  bindAutoGrowAll(s, ctx.ui.growSizes);

  // Учреждение, собственники и ответственные.
  bindParties(ctx);

  // Шкала статусов в шапке и просмотрщик — общие с остальными типами ОЦ.
  bindStatusFlow(ctx);
  bindViewer(ctx);
  bindSplitPanes(ctx);

  const save = s.$('[data-vehicle-save]');
  if (save) {
    save.onclick = () => {
      ctx.rec.updatedAt = new Date().toISOString().slice(0, 10);
      ctx.toast('ОЦ транспортного средства сохранён', 'ok');
    };
  }

  s.$$('[data-vehicle-back]').forEach((button) => button.onclick = () => ctx.host.toMenu());
}
