import { openDocViewer, openPhotoInPlace } from '../parts/viewer/state.js';
import { photoPages } from '../parts/photos/model.js';

// Вкладка «Логи» карточки ОЦ (card/ocCard.ctrl.js подключает это рядом с
// остальными биндингами). Фильтр категорий — тот же .ms/.ms-drop паттерн,
// что у отопления ОИ (oi/building/ctrl.js) — открытие/закрытие,
// делегированный change, закрытие по клику вне.
export function bindAuditTab(ctx) {
  const s = ctx.scope;

  s.$$('[data-audit-cat-toggle]').forEach((c) => c.onclick = (e) => {
    e.stopPropagation();
    const drop = c.parentElement.querySelector('.ms-drop');
    if (!drop) return;
    s.$$('.ms-drop').forEach((d) => { if (d !== drop) d.hidden = true; });
    s.$$('.ms-control').forEach((mc) => { if (mc !== c) mc.classList.remove('open'); });
    drop.hidden = !drop.hidden;
    c.classList.toggle('open', !drop.hidden);
    ctx.ui.auditCatOpen = !drop.hidden;
  });

  s.on('change', '[data-audit-cat-opt]', (e, cb) => {
    const key = cb.dataset.auditCatOpt;
    const filter = ctx.ui.auditCatFilter || (ctx.ui.auditCatFilter = []);
    const i = filter.indexOf(key);
    if (i >= 0) filter.splice(i, 1); else filter.push(key);
    ctx.render();
  });

  s.onDocument('click', (e) => {
    if (!e.target.closest('.ms')) {
      s.$$('.ms-drop').forEach((d) => d.hidden = true);
      s.$$('.ms-control').forEach((mc) => mc.classList.remove('open'));
      ctx.ui.auditCatOpen = false;
    }
  });

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
}
