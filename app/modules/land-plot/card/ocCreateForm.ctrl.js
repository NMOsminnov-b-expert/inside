import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../parts/docs/model.js';
import { parseEni } from '../../../kernel/fmt.js';
import { nextDocId } from '../data/store.js';
import { openDocViewer, VS } from '../parts/viewer/state.js';

// Контроллер экрана создания ОЦ. Сознательно отдельный файл от
// ocForm.ctrl.js — см. ocCreateForm.view.js.
export function bindOcCreate(ctx) {
  const s = ctx.scope;
  const rec = ctx.rec;

  const fp = s.$('#fPurpose');
  if (fp) fp.onchange = () => { rec.purposeTP = fp.value; ctx.updatePlate(); };

  const complex = s.$('#fComplex');
  if (complex) complex.onchange = () => { rec.complex = complex.checked; };

  const save = s.$('#btnCreateOc');
  if (save) save.onclick = () => {
    rec.purposeTP = s.$('#fPurpose').value;
    rec.status = s.$('#fStatus').value;
    rec.eni = parseEni(s.$('#fEni').value);
    rec.institution = s.$('#fInst').value;
    rec.podved = s.$('#fPodved').value;
    rec.address = s.$('#fAddr').value;
    rec.city = rec.address.includes('Ош') ? 'Ош' : 'Бишкек';
    rec.gps = s.$('#fGps').value;
    rec.complex = !!(s.$('#fComplex') && s.$('#fComplex').checked);
    rec.updatedAt = ctx.today;

    ctx.navigate({ rest: [] });
    ctx.toast('ОЦ создан', 'ok');
  };

  // Стороны и документы в форме — те же обработчики, что и в карточке.
  s.$$('[data-resp]').forEach((sel) => sel.onchange = () => {
    rec.resp[sel.dataset.resp] = sel.value;
    ctx.toast('Ответственный обновлён', 'ok');
  });

  s.$$('[data-owner-rm]').forEach((x) => x.onclick = (e) => {
    e.stopPropagation();
    rec.owners.splice(+x.dataset.ownerRm, 1);
    ctx.render();
  });

  s.$$('[data-user-rm]').forEach((x) => x.onclick = (e) => {
    e.stopPropagation();
    rec.users.splice(+x.dataset.userRm, 1);
    ctx.render();
  });

  s.$$('[data-add-party]').forEach((b) => b.onclick = async () => {
    const isOwner = b.dataset.addParty === 'owner';
    const who = isOwner ? 'Собственник' : 'Пользователь';
    const v = await ctx.host.prompt({ title: who, label: 'ФИО или организация', placeholder: 'Наименование' });
    if (!v) return;
    (isOwner ? rec.owners : rec.users).push(v);
    ctx.render();
    ctx.toast(who + ' добавлен', 'ok');
  });

  s.$$('[data-open-doc]').forEach((tr) => tr.onclick = (e) => {
    if (e.target.closest('[data-doc-del]')) return;
    openDocViewer(ctx, 'oc', tr.dataset.openDoc);
  });
}
