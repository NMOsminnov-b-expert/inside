import { photoPages } from '../../parts/photos/model.js';
import { openDocViewer, openPhotoInPlace, VS } from '../../parts/viewer/state.js';
import { nextId } from '../../data/store.js';
import { DOC_TYPES, LAND_PLAN_DOC_TYPES } from '../../data/dictionaries.js';

export function bind(ctx, oi) {
  const s = ctx.scope;

  const valueBindings = {
    '[data-land-purpose]': 'purpose',
    '[data-land-eni]': 'eni',
    '[data-land-rights]': 'rights',
    '[data-land-use]': 'useCategory',
    '[data-land-irrigation]': 'irrigation',
    '[data-land-soil]': 'soil',
    '[data-land-bonitet]': 'bonitet',
    '[data-land-stoniness]': 'stoniness',
    '[data-land-gas]': 'gasification',
    '[data-land-central-heating]': 'centralHeating',
    '[data-land-water]': 'centralWater',
    '[data-land-autonomous-heating]': 'autonomousHeating',
    '[data-land-form]': 'form',
    '[data-land-location]': 'location',
    '[data-land-road]': 'roadLocation',
    '[data-land-corner]': 'corner',
    '[data-land-buildings]': 'buildings',
    '[data-land-building-type]': 'buildingType',
    '[data-land-building-area]': 'buildingArea',
    '[data-land-location-features]': 'locationFeatures',
    '[data-land-encumbrance-area]': 'encumbranceArea',
  };
  Object.entries(valueBindings).forEach(([selector, key]) => {
    const input = s.$(selector);
    if (input) input.onchange = () => { oi[key] = input.value; };
  });

  const type = s.$('[data-land-type]');
  if (type) type.onchange = () => { oi.landType = type.value; ctx.render(); };

  s.$$('[data-land-area]').forEach((input) => input.onchange = () => {
    oi.areas = oi.areas || {};
    oi.areas[input.dataset.landArea] = input.value;
    ctx.updatePlate();
  });

  s.$$('[data-land-utility]').forEach((input) => input.onchange = () => {
    oi.utilities = oi.utilities || {};
    oi.utilities[input.dataset.landUtility] = input.checked;
  });

  const encumbrance = s.$('[data-land-encumbrance]');
  if (encumbrance) encumbrance.onchange = () => { oi.encumbrance = encumbrance.value; ctx.render(); };

  const buildings = s.$('[data-land-buildings]');
  if (buildings) buildings.onchange = () => { oi.buildings = buildings.value; ctx.render(); };

  const requiredMessage = (input, message) => {
    input.setCustomValidity(input.value.trim() ? '' : message);
    return input.value.trim();
  };

  const nm = s.$('[data-oi-name]');
  if (nm) nm.onchange = () => { oi.name = nm.value; ctx.updatePlate(); };

  s.$$('[data-del-oi]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    await ctx.deleteOi(b.dataset.delOi);
  });

  s.$$('[data-status]').forEach((sel) => sel.onchange = () => { oi.status = sel.value; ctx.updatePlate(); });

  s.$$('[data-flag]').forEach((c) => c.onchange = () => {
    oi.flags = oi.flags || {};
    oi.flags[c.dataset.flag] = c.checked;
    ctx.render();
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
  if (am) am.onclick = async () => {
    const type = await ctx.host.select({ title: 'Тип документа', options: [...DOC_TYPES, ...LAND_PLAN_DOC_TYPES] });
    if (!type) return;
    const name = await ctx.host.prompt({ title: 'Прикрепить документ', label: 'Наименование документа (' + type + ')', placeholder: type });
    if (!name) return;
    (oi.docs = oi.docs || []).push({ id: nextId('ld'), type, name, date: ctx.today, pages: null });
    ctx.render();
    ctx.toast('Документ прикреплён: ' + type, 'ok');
  };

  s.$$('[data-open-ocdocs]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const tabs = VS.openTabs['oc'] || [];
    const docs = ctx.rec.docs || [];
    openDocViewer(ctx, 'oc', tabs.length ? tabs[tabs.length - 1] : (docs[0] ? docs[0].id : null));
  });

  const sv = s.$('[data-save-oi]');
  if (sv) sv.onclick = () => {
    const encArea = s.$('[data-land-encumbrance-area]');
    const buildingType = s.$('[data-land-building-type]');
    const buildingArea = s.$('[data-land-building-area]');
    if (oi.encumbrance === 'Есть' && encArea && !requiredMessage(encArea, 'Укажите площадь сервитутов и обременений')) return encArea.reportValidity();
    if (oi.buildings === 'Есть' && buildingType && !requiredMessage(buildingType, 'Укажите тип построек')) return buildingType.reportValidity();
    if (oi.buildings === 'Есть' && buildingArea && !requiredMessage(buildingArea, 'Укажите площадь построек')) return buildingArea.reportValidity();
    ctx.resetViewer();
    ctx.navigate({ rest: [] });
    ctx.toast('ОИ сохранён', 'ok');
  };
}
