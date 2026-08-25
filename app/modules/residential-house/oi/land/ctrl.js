import { photoPages } from '../../parts/photos/model.js';
import { openDocViewer, openPhotoInPlace, VS } from '../../parts/viewer/state.js';
import { nextId } from '../../data/store.js';

export function bind(ctx, oi) {
  const s = ctx.scope;

  const lp = s.$('[data-land-purpose]');
  if (lp) lp.onchange = () => { oi.purpose = lp.value; };

  s.$$('[data-land-area]').forEach((i) => i.onchange = () => {
    oi.areas = oi.areas || {};
    oi.areas[i.dataset.landArea] = i.value;
    ctx.updatePlate();
  });

  s.$$('[data-status]').forEach((sel) => sel.onchange = () => { oi.status = sel.value; ctx.updatePlate(); });

  // Права на земельный участок: select + условный ручной ввод.
  const rightsSel = s.$('[data-land-rights]');
  if (rightsSel) rightsSel.onchange = () => {
    oi.rights = rightsSel.value;
    const other = s.$('[data-land-rights-other]');
    if (other) {
      other.style.display = oi.rights === 'Иное' ? '' : 'none';
      if (oi.rights !== 'Иное') { other.value = ''; oi.rightsOther = ''; }
    }
  };

  const rightsOther = s.$('[data-land-rights-other]');
  if (rightsOther) rightsOther.onchange = () => { oi.rightsOther = rightsOther.value; };

  // Форма участка: select + условный ручной ввод.
  const formSel = s.$('[data-land-form]');
  if (formSel) formSel.onchange = () => {
    oi.form = formSel.value;
    const other = s.$('[data-land-form-other]');
    if (other) {
      other.style.display = oi.form === 'Прочее' ? '' : 'none';
      if (oi.form !== 'Прочее') { other.value = ''; oi.formOther = ''; }
    }
  };

  const formOther = s.$('[data-land-form-other]');
  if (formOther) formOther.onchange = () => { oi.formOther = formOther.value; };

  // Сервитуты/обременения: смена варианта может показать/скрыть площадь — нужен полный рендер.
  const encSel = s.$('[data-land-encumbrance]');
  if (encSel) encSel.onchange = () => { oi.encumbrance = encSel.value; ctx.render(); };

  const encOther = s.$('[data-land-encumbrance-other]');
  if (encOther) encOther.onchange = () => { oi.encumbranceOther = encOther.value; };

  const encArea = s.$('[data-land-encumbrance-area]');
  if (encArea) encArea.onchange = () => { oi.encumbranceArea = encArea.value; };

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
  if (am) am.onclick = () => {
    (oi.docs = oi.docs || []).push({ id: nextId('md'), type: 'Гос. акт на землю', name: 'Новый документ', date: ctx.today });
    ctx.render();
    ctx.toast('Документ добавлен', 'ok');
  };

  s.$$('[data-open-ocdocs]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const tabs = VS.openTabs['oc'] || [];
    const docs = ctx.rec.docs || [];
    openDocViewer(ctx, 'oc', tabs.length ? tabs[tabs.length - 1] : (docs[0] ? docs[0].id : null));
  });

  const sv = s.$('[data-save-oi]');
  if (sv) sv.onclick = () => {
    ctx.resetViewer();
    ctx.navigate({ rest: [] });
    ctx.toast('ОИ сохранён', 'ok');
  };
}
