import { OC, DOCS, appState } from '../../core/state.js';
import { render } from '../../core/renderer.js';
import { $ } from '../../core/dom.js';
import { toast } from '../../core/utils.js';
import { addOi } from '../oi/oiController.js';
import { openDocViewer, VS } from '../viewer/viewerState.js';

export function bindOc() {
  // Табы карточки ОЦ.
  document.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => {
    appState.tab = b.dataset.tab;
    if (appState.tab === 'docs') {
      appState.viewer = { mode: 'doc' };
      if (!appState.viewerDoc && DOCS.length) appState.viewerDoc = { scope: 'oc', id: DOCS[0].id };
    } else if (appState.tab === 'photo') {
      if (appState.viewer && appState.viewer.mode !== 'photo') appState.viewer = null;
    } else {
      appState.viewer = null;
    }
    render();
  });

  document.querySelectorAll('[data-add-oi]').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); addOi(b.dataset.addOi); };
  });

  const be = $('#btnEditOc');
  if (be) be.onclick = () => {
    appState.view = 'ocform';
    appState.viewer = { mode: 'doc' };
    appState.viewerDoc = null;
    render();
  };
  const bd = $('#btnDelOc');
  if (bd) bd.onclick = () => toast('Удаление ОЦ — с подтверждением и проверкой связей', 'warn');

  // Стороны и ответственные.
  document.querySelectorAll('[data-resp]').forEach((s) => s.onchange = () => {
    OC.resp[s.dataset.resp] = s.value;
    toast('Ответственный обновлён', 'ok');
  });
  document.querySelectorAll('[data-owner-rm]').forEach((x) => x.onclick = (e) => {
    e.stopPropagation();
    OC.owners.splice(+x.dataset.ownerRm, 1);
    render();
  });
  document.querySelectorAll('[data-user-rm]').forEach((x) => x.onclick = (e) => {
    e.stopPropagation();
    OC.users.splice(+x.dataset.userRm, 1);
    render();
  });
  document.querySelectorAll('[data-add-party]').forEach((b) => b.onclick = () => {
    const who = b.dataset.addParty === 'owner' ? 'Собственник' : 'Пользователь';
    const v = prompt(who + ': ФИО/организация');
    if (v) {
      (b.dataset.addParty === 'owner' ? OC.owners : OC.users).push(v);
      render();
      toast(who + ' добавлен', 'ok');
    }
  });

  // Документы ОЦ.
  document.querySelectorAll('[data-attach]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const t = b.dataset.attach;
    const name = prompt('Наименование документа (' + t + ')');
    if (name) {
      DOCS.push({ id: 'd' + Date.now(), type: t, name, date: '07.08.2026', pages: null });
      render();
      toast('Документ прикреплён: ' + t, 'ok');
    }
  });
  document.querySelectorAll('[data-doc-del]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const id = b.dataset.docDel;
    const i = DOCS.findIndex((d) => d.id === id);
    if (i >= 0) DOCS.splice(i, 1);
    VS.openTabs.oc = (VS.openTabs.oc || []).filter((x) => x !== id);
    if (appState.viewerDoc && appState.viewerDoc.id === id) {
      appState.viewerDoc = VS.openTabs.oc.length
        ? { scope: 'oc', id: VS.openTabs.oc[VS.openTabs.oc.length - 1] }
        : null;
      if (!appState.viewerDoc) appState.viewer = null;
    }
    render();
    toast('Документ откреплён');
  });
  document.querySelectorAll('[data-open-doc]').forEach((tr) => tr.onclick = (e) => {
    if (e.target.closest('[data-doc-del]')) return;
    openDocViewer('oc', tr.dataset.openDoc);
  });

  // Форма редактирования ОЦ.
  const fc = $('#fCat');
  if (fc) fc.onchange = () => { OC.category = fc.value; render(); };
  const f2 = $('#fMovType');
  if (f2) f2.onchange = () => { OC.movType = f2.value; render(); };
  const so = $('#btnSaveOc');
  if (so) so.onclick = () => {
    OC.type = $('#fType').value;
    OC.purposeTP = $('#fPurpose').value;
    OC.status = $('#fStatus').value;
    OC.eni = $('#fEni').value;
    OC.institution = $('#fInst').value;
    OC.podved = $('#fPodved').value;
    OC.address = $('#fAddr').value;
    OC.gps = $('#fGps').value;
    if (OC.category === 'Движимое') {
      OC.movType = $('#fMovType') ? $('#fMovType').value : 'ТС';
      OC.movComplex = !!$('#fMovComplex')?.checked;
      OC.movName = $('#fMovName')?.value || '';
    } else {
      OC.complex = !!$('#fComplex')?.checked;
    }
    appState.view = 'oc';
    render();
    toast('ОЦ сохранён', 'ok');
  };
}