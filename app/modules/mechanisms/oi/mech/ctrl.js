import { bindMechList, mechListLabel } from '../../parts/mechConstructor.js';

// bind(ctx, oi) — контракт вида ОИ (см. app/README.md). oi.mechanisms — тот
// же список, что и rec.mechanisms на карточке ОЦ этого модуля (см. view.js).
export function bind(ctx, oi) {
  oi.mechanisms = (oi.mechanisms && oi.mechanisms.length) ? oi.mechanisms : [];
  // oi.name — синхронная копия для чужого кода production/civil, который
  // читает её у любого ОИ напрямую (сайдбар просмотрщика, лог действий,
  // некоторые тосты — см. комментарий в oi/mech/model.js). Только
  // присваивание, БЕЗ ctx.render(): bind() и так вызывается ПОСЛЕ рендера,
  // повторный вызов render() отсюда же дал бы бесконечную рекурсию
  // (render → bind → render → …).
  oi.name = mechListLabel(oi.mechanisms);

  // Фото механизма открывается общим просмотрщиком записи-владельца
  // (production/civil, parts/viewer/*, тот же, что и у документов) — не
  // отдельным лайтбоксом (задача пользователя 07.09.2026: «возьми
  // просмотрщик с других карточек»). ctx здесь — ctx вызывающего модуля
  // (production или civil), у него уже есть свой ctx.ui.viewer/render —
  // этот файл ничего своего не импортирует, только использует контракт.
  bindMechList(ctx.scope, oi.mechanisms, () => {
    oi.name = mechListLabel(oi.mechanisms);
    ctx.render();
  }, (mech, idx) => {
    ctx.ui.viewer = { mode: 'photo' };
    ctx.ui.viewerPhotoTarget = mech;
    ctx.ui.viewerPhotoJumpIdx = idx;
    ctx.ui.viewerClosed = false;
    ctx.render();
  });
}
