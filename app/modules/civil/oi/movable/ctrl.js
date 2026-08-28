import { bindDocsColumns } from '../../parts/docs/table.js';
import { openDocViewer, VS } from '../../parts/viewer/state.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../../parts/docs/model.js';
import { nextId } from '../../data/store.js';

export function bind(ctx, oi) {
  bindDocsColumns(ctx.scope);
  const s = ctx.scope;

  const mn = s.$('[data-mv-name]');
  if (mn) mn.onchange = () => { oi.name = mn.value; ctx.updatePlate(); };

  const vy = s.$('[data-mv-year]');
  if (vy) vy.onchange = () => { oi.year = vy.value; };

  const sr = s.$('[data-mv-serial]');
  if (sr) sr.onchange = () => { oi.serial = sr.value; };

  s.$$('[data-flag]').forEach((c) => c.onchange = () => {
    oi.flags = oi.flags || {};
    oi.flags[c.dataset.flag] = c.checked;
    ctx.render();
  });

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
    const doc = { id: nextId('md'), type: 'ПУД', name: file.name, date: ctx.today, file: await attachedFileFrom(file) };
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

  s.$$('[data-del-oi]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    await ctx.deleteOi(b.dataset.delOi);
  });

  const sv = s.$('[data-save-oi]');
  if (sv) sv.onclick = () => {
    ctx.resetViewer();
    ctx.navigate({ rest: [] });
    ctx.toast('ОИ сохранён', 'ok');
  };
}
