import { buildApartmentFloors, recalcFloors } from './floors.model.js';
import { updateFloorsUI } from './floors.view.js';
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

  s.$$('[data-height]').forEach((i) => i.onchange = () => {
    oi.heights = oi.heights || {};
    oi.heights[i.dataset.height] = i.value;
  });

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

  s.$$('[data-floor-hint]').forEach((i) => i.onchange = () => { oi.floorList[+i.dataset.floorHint].hInt = i.value; });

  // --- Общие параметры ----------------------------------------------------
  const cm = s.$('[data-comment]');
  if (cm) cm.onchange = () => { oi.comment = cm.value; };

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

  // --- Поля квартиры ------------------------------------------------------
  const apt = () => (oi.apartment = oi.apartment || {});

  const bindApt = (selector, key) => {
    const el = s.$(selector);
    if (el) el.onchange = () => { apt()[key] = el.value; };
  };

  bindApt('[data-apt-floor]', 'floor');
  bindApt('[data-apt-building-floors]', 'buildingFloors');
  bindApt('[data-apt-rooms]', 'rooms');
  bindApt('[data-apt-series]', 'series');
  bindApt('[data-apt-loggia-count]', 'loggiaCount');
  bindApt('[data-apt-balcony-count]', 'balconyCount');
  bindApt('[data-apt-loggia-area]', 'loggiaBuildArea');
  bindApt('[data-apt-balcony-area]', 'balconyBuildArea');

  // Этажность квартиры управляет наличием поэтажной развёртки.
  const aptStoreys = s.$('[data-apt-storeys]');
  if (aptStoreys) aptStoreys.onchange = () => {
    const val = Math.max(1, Math.min(30, parseInt(aptStoreys.value, 10) || 1));
    aptStoreys.value = val;
    apt().storeys = String(val);
    oi.floors = val;
    buildApartmentFloors(oi);
    ctx.render();
    ctx.updatePlate();
  };

  // Положение на этаже: select + условный ручной ввод.
  const locSel = s.$('[data-apt-location]');
  if (locSel) locSel.onchange = () => {
    const a = apt();
    a.location = locSel.value;
    const other = s.$('[data-apt-location-other]');
    if (other) {
      other.style.display = a.location === 'Прочее' ? '' : 'none';
      if (a.location !== 'Прочее') { other.value = ''; a.locationOther = ''; }
    }
  };

  const locOther = s.$('[data-apt-location-other]');
  if (locOther) locOther.onchange = () => { apt().locationOther = locOther.value; };

  // Права на строение: select + условный ручной ввод.
  const rightsSel = s.$('[data-apt-rights]');
  if (rightsSel) rightsSel.onchange = () => {
    const a = apt();
    a.rights = rightsSel.value;
    const other = s.$('[data-apt-rights-other]');
    if (other) {
      other.style.display = a.rights === 'Иное' ? '' : 'none';
      if (a.rights !== 'Иное') { other.value = ''; a.rightsOther = ''; }
    }
  };

  const rightsOther = s.$('[data-apt-rights-other]');
  if (rightsOther) rightsOther.onchange = () => { apt().rightsOther = rightsOther.value; };

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

  // --- Планировки -----------------------------------------------------------
  const ap = s.$('[data-add-plan]');
  if (ap) ap.onclick = () => {
    (oi.plans = oi.plans || []).push({ id: nextId('pl'), name: 'Новая планировка', date: ctx.today });
    ctx.render();
    ctx.toast('Планировка добавлена', 'ok');
  };

  s.$$('[data-plan-del]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const i = (oi.plans || []).findIndex((pl) => pl.id === b.dataset.planDel);
    if (i >= 0) oi.plans.splice(i, 1);
    ctx.render();
    ctx.toast('Планировка удалена');
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
