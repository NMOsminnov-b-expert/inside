// Списки документов внутри записи ОЦ.
// scope: 'oc' | 'mech-new' | <oi.id>
export function ensureDocPages(d) {
  if (!d.pages) d.pages = Array.from({ length: 3 }, (_, i) => ({ kind: i === 0 ? 'title' : 'skel' }));
}

export function docListFor(ctx, scope) {
  if (scope === 'oc') { ctx.rec.docs = ctx.rec.docs || []; return ctx.rec.docs; }
  if (scope === 'mech-new') return ctx.ui.mechDocs || [];
  const oi = ctx.rec.oi.find((o) => o.id === scope);
  if (!oi) return [];
  oi.docs = oi.docs || [];
  return oi.docs;
}

export function scopeLabel(sc) {
  return sc === 'oc' ? 'ОЦ' : (sc === 'mech-new' ? 'Новый' : 'ОИ');
}
