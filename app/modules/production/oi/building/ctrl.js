import { buildFloors, recalcFloors } from './floors.model.js';
import { updateFloorsUI, rerenderFloors } from './floors.view.js';
import { updateHeatingUI } from './heating.js';
import { photoPages } from '../../parts/photos/model.js';
import { openDocViewer, openPhotoInPlace, VS } from '../../parts/viewer/state.js';
import { nextId } from '../../data/store.js';

export function bind(ctx, oi) {
  const s = ctx.scope;

  // --- Площади и этажность -------------------------------------------------
  s.$$('[data-area]').forEach((i) => i.onchange = () => {
    oi.areas[i.dataset.area] = i.value;
    recalcFloors(oi);
    updateFloorsUI(ctx, oi);
    ctx.updatePlate();
  });

  s.$$('[data-height]').forEach((i) => i.onchange = () => { oi.heights[i.dataset.height] = i.value; });

  const fn = s.$('[data-floors-n]');
  if (fn) fn.onchange = () => {
    oi.floors = Math.max(1, parseInt(fn.value, 10) || 1);
    buildFloors(oi);
    rerenderFloors(ctx, oi);
    ctx.updatePlate();
  };

  const rd = s.$('[data-redistribute]');
  if (rd) rd.onclick = (e) => {
    e.stopPropagation();
    recalcFloors(oi);
    updateFloorsUI(ctx, oi);
    ctx.toast('Отмеченные этажи выровнены по остатку', 'ok');
  };

  s.$$('[data-floor-on]').forEach((c) => c.onchange = () => {
    oi.floorList[+c.dataset.floorOn].on = c.checked;
    recalcFloors(oi);
    updateFloorsUI(ctx, oi);
  });

  s.$$('[data-floor-area]').forEach((i) => i.onchange = () => {
    oi.floorList[+i.dataset.floorArea].area = i.value;
    recalcFloors(oi);
    updateFloorsUI(ctx, oi);
  });

  s.$$('[data-floor-hext]').forEach((i) => i.onchange = () => { oi.floorList[+i.dataset.floorHext].hExt = i.value; });
  s.$$('[data-floor-hint]').forEach((i) => i.onchange = () => { oi.floorList[+i.dataset.floorHint].hInt = i.value; });

  // --- Общие параметры ----------------------------------------------------
  const bt = s.$('[data-buildtype]');
  if (bt) bt.onchange = () => { oi.buildType = bt.value; ctx.updatePlate(); };

  const yr = s.$('[data-year]');
  if (yr) yr.onchange = () => { oi.year = yr.value; };

  const cm = s.$('[data-comment]');
  if (cm) cm.onchange = () => { oi.comment = cm.value; };

  const oic = s.$('[data-oi-category]');
  if (oic) oic.onchange = () => { oi.oiCategory = oic.value; };

  // --- Площади и стоимость аренды (строки заводит пользователь) -----------
  oi.rentAreas = oi.rentAreas || [];

  s.$$('[data-rent-label]').forEach((i) => i.onchange = () => {
    const row = oi.rentAreas.find((r) => r.id === i.dataset.rentLabel);
    if (row) row.label = i.value;
  });

  s.$$('[data-rent-cell]').forEach((i) => i.onchange = () => {
    const [col, id] = i.dataset.rentCell.split('|');
    const row = oi.rentAreas.find((r) => r.id === id);
    if (row) row[col] = i.value;
  });

  const ra = s.$('[data-rent-add]');
  if (ra) ra.onclick = (e) => {
    e.stopPropagation();
    oi.rentAreas.push({ id: nextId('ra'), label: '', total: '', useful: '', rentable: '', rentValue: '' });
    ctx.render();
  };

  s.$$('[data-rent-del]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const i = oi.rentAreas.findIndex((r) => r.id === b.dataset.rentDel);
    if (i >= 0) oi.rentAreas.splice(i, 1);
    ctx.render();
  });

  const dis = s.$('[data-dis]');
  if (dis) dis.onchange = () => { oi.dis = dis.checked; };

  const cc = s.$('[data-catclass]');
  if (cc) cc.onchange = () => { oi.catClass = cc.value; ctx.render(); };

  const rc = s.$('[data-rescat]');
  if (rc) rc.onchange = () => { oi.resCat = rc.value; };

  s.$$('[data-status]').forEach((sel) => sel.onchange = () => { oi.status = sel.value; ctx.updatePlate(); });

  const nm = s.$('[data-oi-name]');
  if (nm) nm.onchange = () => { oi.name = nm.value; ctx.updatePlate(); };

  const en = s.$('[data-oi-eni]');
  if (en) en.onchange = () => { oi.eni = en.value.trim() || oi.eni; };

  s.$$('[data-flag]').forEach((c) => c.onchange = () => {
    oi.flags = oi.flags || {};
    oi.flags[c.dataset.flag] = c.checked;
    ctx.render();
  });

  // --- Конструктивный состав ----------------------------------------------
  s.$$('[data-struct]').forEach((sel) => sel.onchange = () => {
    oi.struct[sel.dataset.struct] = sel.value;
    // Ручной ввод появляется и исчезает вместе с выбором «Прочее».
    ctx.render();
  });

  // Ручной ввод «Прочее» теперь сохраняется (в макете значение терялось).
  s.$$('[data-struct-other]').forEach((inp) => inp.onchange = () => {
    oi.structOther = oi.structOther || {};
    oi.structOther[inp.dataset.structOther] = inp.value;
  });

  // --- Износ конструктивных элементов --------------------------------------
  s.$$('[data-wear]').forEach((sel) => sel.onchange = () => {
    oi.wear = oi.wear || {};
    oi.wear[sel.dataset.wear] = sel.value;
  });

  // --- Доп параметры (производственное строение) ---------------------------
  const phe = s.$('[data-prod-height]');
  if (phe) phe.onchange = () => { oi.prodHeight = phe.value; };

  const pfr = s.$('[data-prod-frame]');
  if (pfr) pfr.onchange = () => { oi.prodFrame = pfr.value; };

  const pfl = s.$('[data-prod-floors]');
  if (pfl) pfl.onchange = () => { oi.prodFloors = pfl.value; };

  const pcr = s.$('[data-prod-crane]');
  if (pcr) pcr.onchange = () => { oi.craneBeam = pcr.value; };

  const tmo = s.$('[data-temp-mode]');
  if (tmo) tmo.onchange = () => { oi.tempMode = tmo.value; };

  const sst = s.$('[data-struct-strength]');
  if (sst) sst.onchange = () => { oi.structStrength = sst.value; };

  // --- Отопление ----------------------------------------------------------
  s.$$('[data-ms-toggle]').forEach((c) => c.onclick = (e) => {
    e.stopPropagation();
    const drop = c.parentElement.querySelector('.ms-drop');
    s.$$('.ms-drop').forEach((d) => { if (d !== drop) d.hidden = true; });
    drop.hidden = !drop.hidden;
    ctx.ui.heatOpen = !drop.hidden;
  });

  s.$$('[data-heat-opt]').forEach((cb) => cb.onchange = () => {
    const h = cb.dataset.heatOpt;
    oi.heating = Array.isArray(oi.heating) ? oi.heating : [];
    const i = oi.heating.indexOf(h);
    if (i >= 0) oi.heating.splice(i, 1); else oi.heating.push(h);
    updateHeatingUI(ctx, oi);
  });

  s.on('click', '[data-heat-rm]', (e, x) => {
    e.stopPropagation();
    const h = x.dataset.heatRm;
    const i = (oi.heating || []).indexOf(h);
    if (i >= 0) oi.heating.splice(i, 1);
    updateHeatingUI(ctx, oi);
  });

  const ho = s.$('[data-heat-other]');
  if (ho) ho.onchange = () => { oi.heatingOther = ho.value; };

  // Закрытие списка отопления по клику вне него — снимается при уходе с экрана.
  s.onDocument('click', (e) => {
    if (!e.target.closest('.ms')) {
      s.$$('.ms-drop').forEach((d) => d.hidden = true);
      ctx.ui.heatOpen = false;
    }
  });

  // --- Фото ---------------------------------------------------------------
  s.$$('[data-add-photo]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const cat = b.dataset.addPhoto;
    oi.photos = oi.photos || {};
    oi.photos[cat] = (oi.photos[cat] || 0) + 1;
    ctx.ui.accOpen['ph|' + oi.id + '|' + cat] = true;
    ctx.render();
    ctx.toast('Фото загружено', 'ok');
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

  // --- Документы ----------------------------------------------------------
  s.$$('[data-open-movdoc]').forEach((tr) => tr.onclick = () => {
    const [scope, id] = tr.dataset.openMovdoc.split('|');
    openDocViewer(ctx, scope, id);
  });

  const am = s.$('[data-add-movdoc]');
  if (am) am.onclick = () => {
    (oi.docs = oi.docs || []).push({ id: nextId('md'), type: 'ПУД', name: 'Новый документ', date: ctx.today });
    ctx.render();
    ctx.toast('Документ добавлен', 'ok');
  };

  s.$$('[data-open-ocdocs]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const tabs = VS.openTabs['oc'] || [];
    const docs = ctx.rec.docs || [];
    openDocViewer(ctx, 'oc', tabs.length ? tabs[tabs.length - 1] : (docs[0] ? docs[0].id : null));
  });

  // --- Литера -------------------------------------------------------------
  const elBtn = s.$('[data-edit-letter]');
  if (elBtn) elBtn.onclick = () => {
    ctx.ui.letterEdit = true;
    ctx.render();
    const i = ctx.scope.$('[data-letter-input]');
    if (i) { i.focus(); i.select(); }
  };

  const ls = s.$('[data-letter-save]');
  if (ls) ls.onclick = () => {
    const inp = s.$('[data-letter-input]');
    const v = (inp ? inp.value : '').trim();
    if (!v || v === oi.letter) { ctx.ui.letterEdit = false; ctx.render(); return; }
    const taken = ctx.rec.oi.some((o) => o !== oi && o.card !== 'land' && o.letter === v);
    if (taken) { ctx.toast('Литера занята', 'warn'); return; }
    oi.letter = v;
    ctx.ui.letterEdit = false;
    ctx.render();
    ctx.toast('Литера переименована', 'ok');
  };

  const lc = s.$('[data-letter-cancel]');
  if (lc) lc.onclick = () => { ctx.ui.letterEdit = false; ctx.render(); };

  // --- Удаление и сохранение ---------------------------------------------
  s.$$('[data-del-oi]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    await ctx.deleteOi(b.dataset.delOi);
  });

  const sv = s.$('[data-save-oi]');
  if (sv) sv.onclick = () => {
    ctx.ui.letterEdit = false;
    ctx.resetViewer();
    ctx.navigate({ rest: [] });
    ctx.toast('ОИ сохранён', 'ok');
  };
}
