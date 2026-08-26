import { nextDocId } from '../data/store.js';
import { openDocViewer, VS } from '../parts/viewer/state.js';

export function bindOcForm(ctx) {
  const s = ctx.scope;
  const rec = ctx.rec;

  const fp = s.$('#fPurpose');
  if (fp) fp.onchange = () => { rec.purposeTP = fp.value; ctx.updatePlate(); };

  const complex = s.$('#fComplex');
  if (complex) complex.onchange = () => { rec.complex = complex.checked; };

  const save = s.$('#btnSaveOc');
  if (save) save.onclick = () => {
    rec.purposeTP = s.$('#fPurpose').value;
    rec.status = s.$('#fStatus').value;
    rec.eni = s.$('#fEni').value;
    rec.institution = s.$('#fInst').value;
    rec.podved = s.$('#fPodved').value;
    rec.address = s.$('#fAddr').value;
    rec.city = rec.address.includes('Ош') ? 'Ош' : 'Бишкек';
    rec.gps = s.$('#fGps').value;
    rec.complex = !!(s.$('#fComplex') && s.$('#fComplex').checked);
    rec.updatedAt = ctx.today;

    ctx.navigate({ rest: [] });
    ctx.toast('ОЦ сохранён', 'ok');
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

  s.$$('[data-attach]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const t = b.dataset.attach;
    const name = await ctx.host.prompt({ title: 'Прикрепить документ', label: 'Наименование документа (' + t + ')', placeholder: t });
    if (!name) return;
    rec.docs = rec.docs || [];
    rec.docs.push({ id: nextDocId(rec), type: t, name, date: ctx.today, pages: null });
    ctx.render();
    ctx.toast('Документ прикреплён: ' + t, 'ok');
  });

  s.$$('[data-doc-del]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const id = b.dataset.docDel;
    const i = (rec.docs || []).findIndex((d) => d.id === id);
    if (i >= 0) rec.docs.splice(i, 1);
    VS.openTabs.oc = (VS.openTabs.oc || []).filter((x) => x !== id);
    if (ctx.ui.viewerDoc && ctx.ui.viewerDoc.id === id) {
      ctx.ui.viewerDoc = VS.openTabs.oc.length
        ? { scope: 'oc', id: VS.openTabs.oc[VS.openTabs.oc.length - 1] }
        : null;
      // Просмотрщик остаётся видимым — покажет приглашение открыть документ.
    }
    ctx.render();
    ctx.toast('Документ откреплён');
  });

  s.$$('[data-open-doc]').forEach((tr) => tr.onclick = (e) => {
    if (e.target.closest('[data-doc-del]')) return;
    openDocViewer(ctx, 'oc', tr.dataset.openDoc);
  });
}
