import { nextId, nextEni } from '../data/store.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../parts/docs/model.js';
import { openDocViewer } from '../parts/viewer/state.js';

// Строки комплекса живут в состоянии модуля, а не только в DOM
// (в макете они терялись при любом ререндере).
export function bindMech(ctx) {
  const s = ctx.scope;
  const ui = ctx.ui;

  s.$$('[data-mech-mode]').forEach((c) => c.onclick = () => {
    ui.mechMode = c.dataset.mechMode;
    ctx.render();
  });

  ['name', 'year', 'serial'].forEach((key) => {
    const el = s.$('#m' + key.charAt(0).toUpperCase() + key.slice(1));
    if (el) el.onchange = () => { ui.mechDraft[key] = el.value; };
  });

  const am = s.$('[data-add-movdoc]');
  if (am) am.onclick = async () => {
    const file = await pickFile();
    if (!file) return;
    if (isFileTooLarge(file)) { ctx.toast(`Файл слишком большой (максимум ${MAX_DOC_FILE_MB} МБ)`, 'warn'); return; }
    ui.mechDocs = ui.mechDocs || [];
    const doc = { id: nextId('md'), type: 'ПУД', name: file.name, date: ctx.today, file: await attachedFileFrom(file) };
    ui.mechDocs.push(doc);
    openDocViewer(ctx, 'mech-new', doc.id);
    ctx.toast('Документ добавлен', 'ok');
  };

  const add = s.$('[data-mech-add]');
  if (add) add.onclick = () => {
    ui.mechRows = ui.mechRows || [];
    ui.mechRows.push({ name: '', type: 'Узел', eni: '' });
    ctx.render();
  };

  s.$$('[data-mech-del]').forEach((b) => b.onclick = () => {
    ui.mechRows.splice(+b.dataset.mechDel, 1);
    ctx.render();
  });

  s.$$('[data-mech-row-name]').forEach((i) => i.onchange = () => { ui.mechRows[+i.dataset.mechRowName].name = i.value; });
  s.$$('[data-mech-row-type]').forEach((i) => i.onchange = () => { ui.mechRows[+i.dataset.mechRowType].type = i.value; });
  s.$$('[data-mech-row-eni]').forEach((i) => i.onchange = () => { ui.mechRows[+i.dataset.mechRowEni].eni = i.value; });

  const save = s.$('[data-mech-save]');
  if (save) save.onclick = () => {
    const rec = ctx.rec;
    const isMech = ctx.mechKind === 'МЕХ';
    const mono = ui.mechMode === 'mono';

    const name = mono
      ? (ui.mechDraft.name || (isMech ? 'Механизм' : 'Офисная техника'))
      : (isMech ? 'Механизм-комплекс' : 'Комплекс техники');

    const oi = {
      id: nextId('oi-m'),
      card: 'movable',
      kind: ctx.mechKind,
      name,
      eni: nextEni(rec, rec.eni),
      status: '',
      origin: 'manual',
      flags: { entered: false, matched: false },
      year: mono ? (ui.mechDraft.year || '') : '',
      serial: mono ? (ui.mechDraft.serial || '') : '',
      docs: (ui.mechDocs || []).slice(),
      notes: [],
      photos: {},
      complexItems: mono ? null : (ui.mechRows || []).slice(),
    };

    rec.oi.push(oi);

    ui.mechDocs = [];
    ui.mechRows = [];
    ui.mechDraft = { name: '', year: '', serial: '' };

    ctx.resetViewer();
    ctx.navigate({ rest: ['oi', oi.id] });
    ctx.toast(mono ? 'Объект добавлен (монолит)' : 'Комплекс добавлен, ОИ создаются внутри', 'ok');
  };
}
