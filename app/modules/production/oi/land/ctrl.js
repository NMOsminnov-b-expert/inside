import { bindDocsColumns } from '../../parts/docs/table.js';
import { photoPages } from '../../parts/photos/model.js';
import { openDocViewer, openPhotoInPlace, VS } from '../../parts/viewer/state.js';
import { nextId } from '../../data/store.js';

export function bind(ctx, oi) {
  bindDocsColumns(ctx.scope);
  const s = ctx.scope;

  const lp = s.$('[data-land-purpose]');
  if (lp) lp.onchange = () => { oi.purpose = lp.value; };

  const la = s.$('[data-land-area]');
  if (la) la.onchange = () => { oi.area = la.value; ctx.updatePlate(); };

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
