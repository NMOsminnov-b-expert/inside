import { docListFor } from '../docs/model.js';
import { photoPages } from '../photos/model.js';
import { DOC_TYPES } from '../../data/dictionaries.js';
import { VS, vSt, vPages, vGo, setVZoom, openDocViewer } from './state.js';
import { nextId } from '../../data/store.js';

export function bindViewer(ctx) {
  const s = ctx.scope;

  s.$$('[data-vmode]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const mode = b.dataset.vmode;
    const cur = ctx.oi;

    const pickFirstDoc = () => {
      const sc = (ctx.view === 'oi' && cur && (cur.docs || []).length) ? cur.id : 'oc';
      const list = docListFor(ctx, sc);
      if (list.length) ctx.ui.viewerDoc = { scope: sc, id: list[0].id };
    };

    if (mode === 'photo') ctx.ui.viewer = { mode: 'photo' };
    else if (mode === 'doc') { ctx.ui.viewer = { mode: 'doc' }; if (!ctx.ui.viewerDoc) pickFirstDoc(); }
    else { ctx.ui.viewer = { mode: 'compare' }; if (!ctx.ui.viewerDoc) pickFirstDoc(); }

    ctx.render();
  });

  const vp = s.$('[data-vpage]');
  if (vp) vp.onchange = () => vGo(ctx, +vp.value || 1);

  const vpr = s.$('[data-vprev]');
  if (vpr) vpr.onclick = () => { const st = vSt(ctx); if (st) vGo(ctx, st.page - 1); };

  const vn = s.$('[data-vnext]');
  if (vn) vn.onclick = () => { const st = vSt(ctx); if (st) vGo(ctx, st.page + 1); };

  const vr = s.$('[data-vrot]');
  if (vr) vr.onclick = () => {
    const st = vSt(ctx);
    if (!st) return;
    st.rot = (st.rot + 90) % 360;
    s.$$('[data-vpageinner]').forEach((p) => p.style.transform = `rotate(${st.rot}deg)`);
  };

  const zm = s.$('[data-vzoom-]');
  if (zm) zm.onclick = () => setVZoom(ctx, VS.zoom - 10);

  const zp = s.$('[data-vzoom\\+]');
  if (zp) zp.onclick = () => setVZoom(ctx, VS.zoom + 10);

  const vc = s.$('[data-vclose]');
  if (vc) vc.onclick = () => { ctx.ui.viewer = null; ctx.render(); };

  s.$$('[data-vthumb]').forEach((t) => t.onclick = (e) => {
    if (e.target.closest('[data-vdelpage]')) return;
    vGo(ctx, +t.dataset.vthumb);
  });

  s.$$('[data-vdelpage]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const vd = ctx.ui.viewerDoc;
    if (!vd) return;
    const d = docListFor(ctx, vd.scope).find((x) => x.id === vd.id);
    if (!d || d.pages.length <= 1) { ctx.toast('Нельзя удалить единственную страницу', 'warn'); return; }
    d.pages.splice(+b.dataset.vdelpage - 1, 1);
    const st = vSt(ctx);
    if (st) st.page = Math.min(st.page, d.pages.length);
    ctx.render();
  });

  const vap = s.$('[data-vaddpage]');
  if (vap) vap.onclick = () => {
    const vd = ctx.ui.viewerDoc;
    if (!vd) return;
    const d = docListFor(ctx, vd.scope).find((x) => x.id === vd.id);
    if (!d) return;
    d.pages.push({ kind: 'skel' });
    ctx.render();
    ctx.toast('Страница добавлена', 'ok');
  };

  // Вкладки документов просмотрщика.
  s.$$('[data-vtab]').forEach((b) => b.onclick = (e) => {
    if (e.target.closest('[data-vtabclose]')) return;
    const [sc, id] = b.dataset.vtab.split('|');
    ctx.ui.viewerDoc = { scope: sc, id };
    ctx.ui.viewer = { mode: 'doc' };
    ctx.render();
  });

  s.$$('[data-vtabclose]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const [sc, id] = b.dataset.vtabclose.split('|');
    VS.openTabs[sc] = (VS.openTabs[sc] || []).filter((x) => x !== id);
    if (ctx.ui.viewerDoc && ctx.ui.viewerDoc.scope === sc && ctx.ui.viewerDoc.id === id) {
      const rest = VS.openTabs[sc] || [];
      ctx.ui.viewerDoc = rest.length ? { scope: sc, id: rest[rest.length - 1] } : null;
      if (!ctx.ui.viewerDoc) ctx.ui.viewer = null;
    }
    ctx.render();
  });

  s.$$('[data-vaddtab]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const [sc, id] = b.dataset.vaddtab.split('|');
    openDocViewer(ctx, sc, id);
  });

  // Переход к категории фото.
  const vj = s.$('[data-vjump]');
  if (vj) vj.onchange = () => {
    const cat = vj.value;
    if (!cat || !ctx.oi) return;
    const idx = photoPages(ctx.oi).findIndex((p) => p.cat === cat) + 1;
    if (idx > 0) vGo(ctx, idx);
  };

  // Перенос текущего фото к другой литере.
  const mv = s.$('[data-move-photo]');
  if (mv) mv.onchange = () => {
    const targetId = mv.value;
    if (!targetId) return;
    const src = ctx.oi;
    const dst = ctx.rec.oi.find((o) => o.id === targetId);
    if (!src || !dst) return;

    const st = VS.photos[src.id];
    const pages = photoPages(src);
    const cur = pages[Math.min(st ? st.page : 1, pages.length) - 1];
    if (!cur) return;

    // Фото хранится счётчиком в категории: минус у источника, плюс у получателя.
    src.photos[cur.cat] = (src.photos[cur.cat] || 0) - 1;
    if (src.photos[cur.cat] <= 0) delete src.photos[cur.cat];
    dst.photos = dst.photos || {};
    dst.photos[cur.cat] = (dst.photos[cur.cat] || 0) + 1;

    if (st) st.page = Math.max(1, Math.min(st.page, photoPages(src).length));

    const dstPages = photoPages(dst);
    let lastIdx = dstPages.length - 1;
    dstPages.forEach((p, i) => { if (p.cat === cur.cat) lastIdx = i; });
    const dstSt = VS.photos[dst.id] || (VS.photos[dst.id] = { page: 1, rot: 0, scroll: 0 });
    dstSt.page = lastIdx + 1;

    ctx.render();
    ctx.toast(`Фото «${cur.cat}» перенесено к литере ${dst.letter}`, 'ok');
  };

  // Прикрепление документа из пустого просмотрщика.
  // Исправление дефекта макета: документ уходит в тот scope, который открыт,
  // а не всегда в документы ОЦ.
  s.$$('[data-attach-default]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const scope = (ctx.view === 'oi' && ctx.oi) ? ctx.oi.id : (ctx.view === 'mech' ? 'mech-new' : 'oc');

    const type = await ctx.host.select({ title: 'Тип документа', options: DOC_TYPES });
    if (!type) return;
    const name = await ctx.host.prompt({ title: 'Прикрепить документ', label: 'Наименование документа', placeholder: type });
    if (!name) return;

    const list = docListFor(ctx, scope);
    list.push({ id: nextId('doc'), type, name, date: ctx.today, pages: null });

    ctx.render();
    ctx.toast('Документ прикреплён: ' + type, 'ok');
  });

  const cpp = s.$('[data-cmp-ph-prev]');
  if (cpp) cpp.onclick = () => {
    const st = ctx.oi ? VS.photos[ctx.oi.id] : null;
    if (st) { st.page = Math.max(1, st.page - 1); ctx.render(); }
  };

  const cpn = s.$('[data-cmp-ph-next]');
  if (cpn) cpn.onclick = () => {
    const st = ctx.oi ? VS.photos[ctx.oi.id] : null;
    if (st) { st.page = Math.min(photoPages(ctx.oi).length, st.page + 1); ctx.render(); }
  };

  const cdp = s.$('[data-cmp-dc-prev]');
  if (cdp) cdp.onclick = () => { const st = vSt(ctx); if (st) { st.page = Math.max(1, st.page - 1); ctx.render(); } };

  const cdn = s.$('[data-cmp-dc-next]');
  if (cdn) cdn.onclick = () => { const st = vSt(ctx); if (st) { st.page = Math.min(vPages(ctx).length, st.page + 1); ctx.render(); } };

  // Синхронизация скролла ленты и зум колесом с Ctrl.
  const vstageEl = s.$('[data-vstage]');
  if (vstageEl && ctx.ui.viewer && ctx.ui.viewer.mode !== 'compare') {
    const st = vSt(ctx);
    if (st) {
      vstageEl.scrollTop = st.scroll || 0;
      const ribbonEl = s.$('[data-vribbon]');
      if (ribbonEl) ribbonEl.style.zoom = String(VS.zoom / 100);

      vstageEl.addEventListener('scroll', () => {
        st.scroll = vstageEl.scrollTop;
        const top = vstageEl.getBoundingClientRect().top;
        let cur = 1;
        if (ribbonEl) {
          ribbonEl.querySelectorAll('[data-vpageblk]').forEach((bl) => {
            if (bl.getBoundingClientRect().top - top <= 60) cur = +bl.dataset.vpageblk;
          });
        }
        if (cur !== st.page) {
          st.page = cur;
          const inp = s.$('[data-vpage]');
          if (inp) inp.value = cur;
          s.$$('[data-vthumb]').forEach((t) => t.classList.toggle('active', +t.dataset.vthumb === cur));
        }
      });

      vstageEl.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        setVZoom(ctx, VS.zoom + (e.deltaY < 0 ? 10 : -10));
      }, { passive: false });
    }
  }

  const cmpEl = s.$('[data-cmp]');
  if (cmpEl) {
    cmpEl.style.zoom = String(VS.zoom / 100);
    cmpEl.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setVZoom(ctx, VS.zoom + (e.deltaY < 0 ? 10 : -10));
    }, { passive: false });
  }
}
