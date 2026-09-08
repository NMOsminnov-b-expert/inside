import { bindMechFields } from '../../parts/mechConstructor.js';

// bind(ctx, oi) — контракт вида ОИ (см. app/README.md). oi сам является тем
// {name, fields}, которого ждёт bindMechFields — см. комментарий в view.js.
export function bind(ctx, oi) {
  bindMechFields(ctx.scope, oi, () => ctx.render());
}
