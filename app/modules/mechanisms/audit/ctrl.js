import { openDocViewer } from '../parts/viewer/state.js';

// Вкладка «Логи» карточки ОЦ (card/ocCard.ctrl.js подключает это рядом с
// остальными биндингами). Панель фильтров — те же 4 мультивыбора, что у
// остальных модулей (.ms/.ms-drop, см. audit/view.js), + диапазон дат +
// текстовый поиск. Каждый .ms-control несёт data-audit-ms-toggle="<имя флага
// в ctx.ui>" — один обработчик открытия/закрытия на все мультивыборы.
//
// У этого модуля нет объектов имущества и нет фото по литерам, поэтому здесь
// нет переходов «к фото» и «в фото без литеры» — только переход к документу.
export function bindAuditTab(ctx) {
  const s = ctx.scope;

  s.$$('[data-audit-ms-toggle]').forEach((c) => c.onclick = (e) => {
    e.stopPropagation();
    const drop = c.parentElement.querySelector('.ms-drop');
    if (!drop) return;
    s.$$('.ms-drop').forEach((d) => { if (d !== drop) d.hidden = true; });
    s.$$('.ms-control').forEach((mc) => { if (mc !== c) mc.classList.remove('open'); });
    drop.hidden = !drop.hidden;
    c.classList.toggle('open', !drop.hidden);
    ctx.ui[c.dataset.auditMsToggle] = !drop.hidden;
  });

  s.onDocument('click', (e) => {
    if (!e.target.closest('.ms')) {
      s.$$('.ms-drop').forEach((d) => d.hidden = true);
      s.$$('.ms-control').forEach((mc) => mc.classList.remove('open'));
      ctx.ui.auditCatOpen = false;
      ctx.ui.auditPersonOpen = false;
      ctx.ui.auditObjectOpen = false;
      ctx.ui.auditActionOpen = false;
    }
  });

  const toggleInArray = (uiKey, value) => {
    const arr = ctx.ui[uiKey] || (ctx.ui[uiKey] = []);
    const i = arr.indexOf(value);
    if (i >= 0) arr.splice(i, 1); else arr.push(value);
    ctx.render();
  };

  s.on('change', '[data-audit-cat-opt]', (e, cb) => toggleInArray('auditCatFilter', cb.dataset.auditCatOpt));
  s.on('change', '[data-audit-person-opt]', (e, cb) => toggleInArray('auditPersonFilter', cb.dataset.auditPersonOpt));
  s.on('change', '[data-audit-object-opt]', (e, cb) => toggleInArray('auditObjectFilter', cb.dataset.auditObjectOpt));
  s.on('change', '[data-audit-action-opt]', (e, cb) => toggleInArray('auditActionFilter', cb.dataset.auditActionOpt));

  const df = s.$('[data-audit-date-from]');
  if (df) df.onchange = () => { ctx.ui.auditDateFrom = df.value; ctx.render(); };

  const dt = s.$('[data-audit-date-to]');
  if (dt) dt.onchange = () => { ctx.ui.auditDateTo = dt.value; ctx.render(); };

  const search = s.$('[data-audit-search]');
  if (search) search.oninput = () => { ctx.ui.auditSearchText = search.value; ctx.render(); };

  const reset = s.$('[data-audit-filters-reset]');
  if (reset) reset.onclick = () => {
    ctx.ui.auditCatFilter = [];
    ctx.ui.auditPersonFilter = [];
    ctx.ui.auditObjectFilter = [];
    ctx.ui.auditActionFilter = [];
    ctx.ui.auditDateFrom = '';
    ctx.ui.auditDateTo = '';
    ctx.ui.auditSearchText = '';
    ctx.render();
  };

  // Переход к документу из развёрнутой записи лога — открывает его в
  // просмотрщике на вкладке «Общие данные» (на самой «Логи» просмотрщика нет).
  s.on('click', '[data-audit-goto-doc]', (e, btn) => {
    const [scope, id] = btn.dataset.auditGotoDoc.split('|');
    openDocViewer(ctx, scope, id);
    ctx.navigate({ rest: [], query: { tab: 'general' } });
  });
}
