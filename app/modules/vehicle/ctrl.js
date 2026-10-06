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
import { bindMsSearch } from '../../kernel/multiSelect.js';
import { bindTreeSearch } from '../../kernel/treeSearch.js';
import { openModuleId, navHTML, sectionFields, savedText, bindCondColumns } from './view.js';
import { createRecord } from './records.js';
import { MS_OPTS, msSummaryHTML, msBodyHTML, ruToIso } from './tsFields.view.js';
import { setFieldError } from '../../kernel/fieldError.js';
import {
  tsOf, basesOf, selfKinds, moduleKinds, addExtra, dropExtra, addModule, dropModule, categoryCandidates,
  kindLeaves, applyKindLeaf, moduleLeaves, powerUnitFor, POWER_UNIT_BY, classified, copyVehicle, makeWithModules, whatLabel,
  normVin, vinWarning, normPlate, idMissing,
} from './tsModel.js';

// Контроллер карточки ТС как объекта оценки.
//
// Правило то же, что в карточках объектов имущества: пока человек печатает,
// экран целиком не перерисовывается. Отрисовка заново — только там, где
// меняется состав карточки: вид объекта, категория и база, модули, строки
// дополнительных параметров.
// Форма ТС (tsFormHTML): вид объекта, поля машины и модулей, фото. holder —
// запись, у которой лежит vehicle; set — держатель снимков (view.js).
export function bindTsForm(ctx, holder, set) {
  const s = ctx.scope;
  const v = tsOf(holder);
  ctx.ui = ctx.ui || {};
  bindCondColumns(s);

  // «main» — сама машина, иначе id модуля на ней.
  const owner = (id) => (id === 'main' ? v : v.modules.find((m) => m.id === id));
  const valsOf = (id) => { const o = owner(id); return o ? (o.f = o.f || {}) : null; };
  const extraOf = (id) => { const o = owner(id); return o ? (o.extra = o.extra || []) : null; };
  const split = (s2) => { const at = s2.indexOf('|'); return [s2.slice(0, at), s2.slice(at + 1)]; };

  const write = (vals, key, value) => {
    if (value !== '' && value != null) vals[key] = value;
    else delete vals[key];
    refreshNav();
  };

  // Строка разделов следует за вводом без перерисовки карточки: заменяется
  // только она сама, чуть погодя после последней правки.
  let navTimer = 0;
  function refreshNav() {
    clearTimeout(navTimer);
    navTimer = setTimeout(() => {
      const nav = s.$('.vh-nav');
      if (!nav || nav.querySelector('[data-ts-miss]:not([hidden])')) return;
      nav.outerHTML = navHTML(ctx, v, set);
      bindNav();
    }, 250);
  }

  // --- 02 Вид объекта: смена выбора перестраивает карточку -----------------
  // Пока с выбором работают, блок развёрнут (ctx.ui.tsKindOpen); щелчок по
  // заголовку (аккордеон) сворачивает его в строку и разворачивает обратно.
  const openKind = () => { ctx.ui.tsKindOpen = true; };
  s.$$('[data-ts-kind]').forEach((b) => b.onclick = () => {
    if (v.kind === b.dataset.tsKind) return;
    v.kind = b.dataset.tsKind;
    openKind();
    ctx.render();
  });
  // После сворачивания строка остаётся на виду: иначе панель оставалась
  // прокрученной вниз, и на виду была середина блока машины.
  const kHead = s.$('[data-ts-kind-toggle]');
  const toggleKind = async () => {
    const open = kHead.getAttribute('aria-expanded') === 'true';
    ctx.ui.tsKindOpen = !open;
    await ctx.render();
    const sum = s.$('[data-ts-kind-sum]');
    if (open && sum) sum.scrollIntoView({ block: 'start' });
  };
  if (kHead) {
    kHead.onclick = toggleKind;
    kHead.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleKind(); } };
  }

  // Поиск по справочнику — помощник над каскадом: выбор заполняет списки.
  bindTreeSearch(s, {
    id: 'ts-find',
    leaves: kindLeaves,
    onPick: (l) => { applyKindLeaf(v, l); openKind(); ctx.render(); },
  });

  // Каскад: смена родителя сбрасывает дочерний выбор; единственный вариант
  // подставляется сам (практика каскадных списков).
  const cascade = (sel, set) => { const el = s.$(sel); if (el) el.onchange = () => { set(el.value); openKind(); ctx.render(); }; };
  const setCategory = (val) => {
    if (v.category === val) return;
    v.category = val;
    const bases = basesOf(val).filter((b) => b.name !== 'Прочее');
    v.base = bases.length === 1 ? bases[0].name : '';
  };
  // Категорию выбирает человек (указание пользователя 30.09.2026): запись «Тип
  // ТС» лишь предлагает варианты кнопками под списком; сама категория по ней
  // больше не ставится. Выбранная категория, которой нет среди предложенных, —
  // уведомление, а не запрет.
  const warnMismatch = (text = v.f.vtype) => {
    const cands = categoryCandidates(text);
    if (cands.length && v.category && !cands.includes(v.category)) {
      ctx.toast(`Категория «${v.category}» не похожа на запись «Тип ТС»: «${String(text).trim()}»`, 'warn');
    }
  };
  cascade('[data-ts-cat]', (val) => { setCategory(val); warnMismatch(); });
  s.$$('[data-ts-sug-cat]').forEach((b) => b.onclick = () => { setCategory(b.dataset.tsSugCat); openKind(); ctx.render(); });

  // Предложения под списком категорий следуют за записью «Тип ТС» — по уходу
  // из поля: пока человек печатает, карточка не перерисовывается.
  const vt = s.$('[data-tsf="main|vtype"]');
  if (vt && s.$('[data-ts-cat]')) {
    vt.addEventListener('change', () => { openKind(); ctx.render(); });
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
  // trim и generalState открывают свои поля: комментарий к своей комплектации,
  // описание иного общего состояния.
  const RERENDER = new Set(['fuel', 'vidMashiny', 'drive', 'engineKind', 'trim', 'generalState']);

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

    // Дата «ДД.ММ.ГГГГ»: точки ставятся по ходу набора, в данные — ГГГГ-ММ-ДД;
    // неверная дата — сообщение у поля, набранное не стирается.
    if (el.hasAttribute('data-ts-date')) {
      el.oninput = () => {
        const d = el.value.replace(/\D/g, '').slice(0, 8);
        el.value = [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('.');
        if (el.classList.contains('field-bad') && ruToIso(el.value)) setFieldError(el, '');
      };
      el.onchange = () => {
        const t = el.value.trim();
        if (!t) { setFieldError(el, ''); write(vals, key, ''); return; }
        const iso = ruToIso(t);
        if (setFieldError(el, iso ? '' : 'Дата — ДД.ММ.ГГГГ')) return;
        write(vals, key, iso);
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
      if (POWER_UNIT_BY.includes(key) && powerUnitFor(el.value)) write(vals, 'power@unit', powerUnitFor(el.value));
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
  // Мультивыбор (ходовая) — как у материалов конструктива: список открывается
  // по щелчку по полю, закрывается щелчком мимо; выбор перерисовывает только
  // сводку и сам список.
  const bindMs = (ms) => {
    const bind = ms.dataset.tsfMs;
    const [who, key] = split(bind);
    const vals = valsOf(who);
    const control = ms.querySelector('[data-ms-toggle]');
    const drop = ms.querySelector('.ms-drop');
    if (!vals || !control || !drop) return;
    control.onclick = (e) => {
      e.stopPropagation();
      s.$$('.vehicle-form .ms-drop').forEach((d) => { if (d !== drop) d.hidden = true; });
      s.$$('.vehicle-form .ms-control').forEach((c) => { if (c !== control) c.classList.remove('open'); });
      drop.hidden = !drop.hidden;
      control.classList.toggle('open', !drop.hidden);
    };
    const bindOpts = () => {
      bindMsSearch(drop);
      drop.querySelectorAll('[data-tsf-opt]').forEach((cb) => cb.onchange = () => {
        const raw = cb.dataset.tsfOpt;
        const value = raw.slice(raw.lastIndexOf('|') + 1);
        const picked = Array.isArray(vals[key]) ? [...vals[key]] : [];
        if (cb.checked && !picked.includes(value)) picked.push(value);
        if (!cb.checked) picked.splice(picked.indexOf(value), 1);
        // Порядок — как в справочнике, а не как щёлкали.
        const order = MS_OPTS.get(bind) || [];
        picked.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        if (picked.length) vals[key] = picked; else delete vals[key];
        control.innerHTML = msSummaryHTML(picked);
        drop.innerHTML = msBodyHTML(bind, picked);
        bindOpts();
      });
    };
    bindOpts();
  };
  s.$$('[data-tsf-ms]').forEach(bindMs);
  // Закрытие по щелчку мимо — один раз на скоуп: контроллер перепривязывается
  // на каждой отрисовке, а слушатели документа снимаются только при уходе с
  // экрана. Свой флаг, а не общий msOutsideBound: в гражданском здании форма
  // живёт рядом с мультивыборами литер, и общий флаг оставил бы одну из
  // сторон без закрытия по щелчку мимо.
  if (!s.root.dataset.tsMsOutsideBound) {
    s.root.dataset.tsMsOutsideBound = '1';
    s.onDocument('click', (e) => {
      if (e.target.closest && e.target.closest('.ms')) return;
      s.$$('.vehicle-form .ms-control').forEach((c) => c.classList.remove('open'));
      s.$$('.vehicle-form .ms-drop').forEach((d) => { d.hidden = true; });
    });
  }

  // Опознавательные номера: хотя бы один из трёх (предупреждение у группы).
  function checkIds() {
    const box = s.$('[data-ts-idwarn]');
    if (!box) return;
    const focusInGroup = ['vin', 'bodyNo', 'chassisNo']
      .some((k) => document.activeElement && document.activeElement.dataset
        && document.activeElement.dataset.tsf === `main|${k}`);
    box.hidden = focusInGroup || !idMissing(v);
  }

  // Строка модуля следует за полями его формы без перерисовки.
  function syncModuleRow(id) {
    const m = owner(id);
    const item = s.$(`[data-ts-mitem="${id}"]`);
    if (!m || !item) return;
    item.querySelectorAll('[data-ts-mcell]').forEach((c) => {
      c.textContent = String(m.f[c.dataset.tsMcell] || '').trim() || '—';
    });
  }

  // --- 05 Модули ---------------------------------------------------------------
  // Список с раскрытием: щелчок по строке раскрывает модуль или сворачивает
  // раскрытый; раскрыт один за раз. Новый модуль раскрывается сразу.
  const madd = s.$('[data-ts-madd]');
  if (madd) madd.onclick = async () => {
    const m = addModule(v);
    ctx.ui.tsModule = m.id;
    await ctx.render();
    const q = s.$('#ts-mfind-q');
    if (q) q.focus();
  };

  s.$$('[data-ts-mpick]').forEach((b) => b.onclick = () => {
    const id = b.dataset.tsMpick;
    ctx.ui.tsModule = b.getAttribute('aria-expanded') === 'true' ? 'none' : id;
    ctx.render();
  });

  // Удаление модуля — крестиком в строке. Модуль со сведениями уносит их с
  // собой — спрашиваем (как у единиц механизмов); пустой убирается сразу.
  s.$$('[data-ts-mdel]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const id = b.dataset.tsMdel;
    const m = owner(id);
    if (!m) return;
    const filled = m.kind || Object.keys(m.f || {}).length || (m.extra || []).length;
    if (filled) {
      const ok = await confirmDialog({
        title: 'Удалить модуль',
        text: `Удалить «${m.kind || 'модуль'}» с машины? Его сведения и параметры будут удалены.`,
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

  // Поиск модуля — помощник над списками раскрытого модуля: выбор ставит
  // группу и модуль разом.
  const openMod = owner(openModuleId(ctx, v));
  if (openMod && openMod !== v) {
    bindTreeSearch(s, {
      id: 'ts-mfind',
      leaves: moduleLeaves,
      onPick: (l) => { openMod.group = l.group; openMod.kind = l.item; ctx.render(); },
    });
  }

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

  // --- строка разделов и режим осмотра -------------------------------------------
  // Щелчок по «Учёту» или «Машине» открывает список пустых полей (второй
  // щелчок, щелчок мимо или Escape закрывают); по «Модулям» и «Фото» — к блоку.
  function bindNav() {
    const closeMiss = () => {
      s.$$('[data-ts-miss]').forEach((d) => { d.hidden = true; });
      s.$$('[data-ts-nav]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    };
    s.$$('[data-ts-nav]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const key = b.dataset.tsNav;
      const pop = s.$(`[data-ts-miss="${key}"]`);
      if (!pop) {
        closeMiss();
        const block = s.$(`[data-ts-block="${key}"]`);
        if (block) block.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      const open = pop.hidden;
      closeMiss();
      pop.hidden = !open;
      b.setAttribute('aria-expanded', String(open));
    });
    s.$$('[data-ts-jump]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      closeMiss();
      const bind = b.dataset.tsJump;
      const el = s.$(`[data-tsf="${bind}"]`) || s.$(`[data-tsf-ms="${bind}"] [data-ms-toggle]`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.focus({ preventScroll: true });
      el.classList.add('vh-flash');
      setTimeout(() => el.classList.remove('vh-flash'), 1600);
    });
    // Смена режима начинает форму с начала: режим осмотра короче, и с прежней
    // прокруткой закреплённый просмотрщик выталкивало вверх из-под шапки.
    s.$$('[data-ts-mode]').forEach((b) => b.onclick = async () => {
      const on = b.dataset.tsMode === 'inspect';
      if (!!ctx.ui.tsInspect === on) return;
      ctx.ui.tsInspect = on;
      await ctx.render();
      let el = s.$('.vehicle-form');
      while (el && !(el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
      if (el) el.scrollTop = 0;
    });
  }
  bindNav();
  const closeAllMiss = () => {
    s.$$('[data-ts-miss]').forEach((d) => { d.hidden = true; });
    s.$$('[data-ts-nav]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  };
  if (!s.root.dataset.tsNavBound) {
    s.root.dataset.tsNavBound = '1';
    s.onDocument('click', (e) => { if (!(e.target.closest && e.target.closest('.vh-navi'))) closeAllMiss(); });
    s.onDocument('keydown', (e) => { if (e.key === 'Escape') closeAllMiss(); });
  }

  // Многострочные поля растут под текст, а после ручной растяжки держат размер.
  ctx.ui.growSizes = ctx.ui.growSizes || {};
  bindAutoGrowAll(s, ctx.ui.growSizes);
}

export function bindVehicle(ctx) {
  const s = ctx.scope;
  bindTsForm(ctx, ctx.rec, photoSetOf(ctx.rec));

  // Учреждение, собственники и ответственные.
  bindParties(ctx);

  // Шкала статусов в шапке и просмотрщик — общие с остальными типами ОЦ. В
  // окне смены статуса — что в карточке пусто, без запрета (развёртка
  // 30.09.2026; какие поля обязательны на каком этапе, пользователь ещё не
  // определил).
  bindStatusFlow(ctx, {
    more: () => {
      const v = tsOf(ctx.rec);
      if (!classified(v)) return null;
      const empty = ['reg', 'machine'].flatMap((k) => sectionFields(v, k).flatMap((g) => g.fields))
        .filter((f) => { const x = v.f[f.key]; return Array.isArray(x) ? !x.length : !String(x ?? '').trim(); });
      if (!empty.length) return null;
      const list = empty.slice(0, 6).map((f) => f.label);
      if (empty.length > 6) list.push(`и ещё ${empty.length - 6}`);
      return { note: `В карточке пусто полей: ${empty.length}. Перевести можно и так.`, list };
    },
  });
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

  // Стороны: «Развернуть» / «Свернуть».
  s.$$('[data-parties-toggle]').forEach((b) => b.onclick = () => { ctx.ui.partiesOpen = !ctx.ui.partiesOpen; ctx.render(); });

  // «Сохранено · 13:42» следует за хранилищем без перерисовки.
  if (!s.root.dataset.tsSavedBound) {
    s.root.dataset.tsSavedBound = '1';
    s.onDocument('inside:saved', () => { const el = s.$('[data-vehicle-saved]'); if (el) el.textContent = savedText(); });
  }

  // «Создать похожее»: новая запись ОЦ с тем же учреждением, собственниками и
  // ответственными; из машины — вид, база, характеристики и модули.
  const copy = s.$('[data-vehicle-copy]');
  if (copy) copy.onclick = async () => {
    const v = tsOf(ctx.rec);
    const ok = await ctx.host.confirm({
      title: 'Создать похожее ТС',
      // Перечни — обычным текстом: в списке окна значение в одну строку, и
      // длинный перечень обрезался многоточием.
      text: `Новый объект оценки по образцу «${makeWithModules(v) || whatLabel(v)}». Переносятся учреждение, `
        + 'собственники и ответственные, вид объекта и база, марка, год, двигатель, массы, ходовая и модули.',
      note: 'Не переносятся номера, регистрация, где стоит, наработка и состояние, заводские номера модулей, '
        + 'особые отметки и фото — у каждой машины они свои.',
      okLabel: 'Создать',
    });
    if (!ok) return;
    const rec = createRecord();
    Object.assign(rec, {
      institution: ctx.rec.institution, podved: ctx.rec.podved, institutionId: ctx.rec.institutionId,
      owners: JSON.parse(JSON.stringify(ctx.rec.owners || [])), resp: { ...(ctx.rec.resp || {}) },
      vehicle: copyVehicle(v),
    });
    ctx.toast('Создано похожее ТС — впишите номера и регистрацию', 'ok');
    ctx.host.navigate({ ocId: rec.id, rest: [] });
  };
}
