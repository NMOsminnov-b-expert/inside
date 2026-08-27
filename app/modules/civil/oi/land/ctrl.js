import { parseEni } from '../../../../kernel/fmt.js';
import { photoPages, addPhotoFile } from '../../parts/photos/model.js';
import { openDocViewer, openPhotoInPlace, VS } from '../../parts/viewer/state.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../parts/docs/model.js';
import { nextId } from '../../data/store.js';

export function bind(ctx, oi) {
  const s = ctx.scope;

  const lp = s.$('[data-land-purpose]');
  if (lp) lp.onchange = () => { oi.purpose = lp.value; };

  const la = s.$('[data-land-area]');
  if (la) la.onchange = () => { oi.area = la.value; ctx.updatePlate(); };

  const ap = s.$('[data-area-pud]');
  if (ap) ap.onchange = () => { oi.areaPud = ap.value; };

  const ab = s.$('[data-area-built]');
  if (ab) ab.onchange = () => { oi.areaBuilt = ab.value; };

  const en = s.$('[data-oi-eni]');
  // Из поля приходит маска — в данные кладём цифры (kernel/fmt.js).
  if (en) en.onchange = () => { oi.eni = parseEni(en.value) || oi.eni; };

  const rg = s.$('[data-rights]');
  if (rg) rg.onchange = () => { oi.rights = rg.value; };

  const sh = s.$('[data-shape]');
  if (sh) sh.onchange = () => { oi.shape = sh.value; };

  const es = s.$('[data-easements]');
  if (es) es.onchange = () => { oi.easements = es.checked; ctx.render(); };

  const ea = s.$('[data-easements-area]');
  if (ea) ea.onchange = () => { oi.easementsArea = ea.value; };

  s.$$('[data-status]').forEach((sel) => sel.onchange = () => { oi.status = sel.value; ctx.updatePlate(); });

  s.$$('[data-flag]').forEach((c) => c.onchange = () => {
    oi.flags = oi.flags || {};
    oi.flags[c.dataset.flag] = c.checked;
    ctx.render();
  });

  // Фото в аккордеоне перечня и мини-превью в строках. Теперь это РЕАЛЬНАЯ
  // загрузка файла (как у документов), а не просто инкремент счётчика: файл
  // кладётся в oi.photoFiles, счётчик увеличивает addPhotoFile.
  s.$$('[data-add-photo]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const oi = ctx.rec.oi.find((o) => o.id === b.dataset.photoOi);
    if (!oi) return;
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

  // --- Документы ----------------------------------------------------------
  s.$$('[data-open-movdoc]').forEach((tr) => tr.onclick = () => {
    const [scope, id] = tr.dataset.openMovdoc.split('|');
    openDocViewer(ctx, scope, id);
  });

  const am = s.$('[data-add-movdoc]');
  if (am) am.onclick = async () => {
    const file = await pickFile();
    if (!file) return;
    if (isFileTooLarge(file)) { ctx.toast(`Файл слишком большой (максимум ${MAX_DOC_FILE_MB} МБ)`, 'warn'); return; }
    oi.docs = oi.docs || [];
    const doc = { id: nextId('md'), type: 'Гос. акт на землю', name: file.name, date: ctx.today, file: await attachedFileFrom(file) };
    oi.docs.push(doc);
    openDocViewer(ctx, oi.id, doc.id);
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
