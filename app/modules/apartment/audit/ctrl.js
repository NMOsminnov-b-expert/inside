import { openDocViewer, openPhotoInPlace } from '../parts/viewer/state.js';
import { photoPages } from '../parts/photos/model.js';

// Вкладка «Логи» карточки ОЦ (card/ocCard.ctrl.js подключает это рядом с
// остальными биндингами). Панель фильтров — 4 мультивыбора (тот же
// .ms/.ms-drop паттерн, что у отопления ОИ, oi/building/heating.js) +
// диапазон дат + текстовый поиск. Каждый .ms-control несёт
// data-audit-ms-toggle="<имя флага в ctx.ui>" — один обработчик открытия/
// закрытия на все 4 мультивыбора, без дублирования кода.
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

  // Переход к фото из развёрнутой записи лога — сразу в карточку нужной
  // литеры, на нужную категорию (openPhotoInPlace сам определяет, нужен ли
  // переход по маршруту или литера уже открыта).
  s.on('click', '[data-audit-goto-photo]', (e, btn) => {
    const [oiId, cat] = btn.dataset.auditGotoPhoto.split('|');
    const oi = (ctx.rec.oi || []).find((o) => o.id === oiId);
    if (!oi) return;
    const idx = photoPages(oi).findIndex((p) => p.cat === cat) + 1;
    openPhotoInPlace(ctx, oiId, idx > 0 ? idx : undefined);
  });

  // Переход к разделу «Фото без литеры» — фото удалённой литеры без
  // конкретного маршрута (см. parts/photos/explorer.js), просто открываем
  // вкладку «Фото» ОЦ.
  s.on('click', '[data-audit-goto-orphan]', () => {
    ctx.ui.viewer = { mode: 'photo' };
    ctx.navigate({ rest: [], query: { tab: 'photo' } });
  });
}
