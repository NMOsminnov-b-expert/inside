import { OI, appState } from '../../core/state.js';
import { render } from '../../core/renderer.js';
import { toast } from '../../core/utils.js';
import { docListFor } from '../docs/docsModel.js';
import { photoPages } from '../photos/photoModel.js';
import { currentOI } from '../oi/oiModel.js';
import { VS, vSt, vPages, vGo, setVZoom, openDocViewer } from './viewerState.js';

export function bindViewer() {
  document.querySelectorAll('[data-vmode]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const mode = b.dataset.vmode;
    const cur = currentOI();
    const pickFirstDoc = () => {
      const sc = (appState.view === 'oi' && cur && (cur.docs || []).length) ? cur.id : 'oc';
      const list = docListFor(sc);
      if (list.length) appState.viewerDoc = { scope: sc, id: list[0].id };
    };
    if (mode === 'photo') appState.viewer = { mode: 'photo' };
    else if (mode === 'doc') { appState.viewer = { mode: 'doc' }; if (!appState.viewerDoc) pickFirstDoc(); }
    else { appState.viewer = { mode: 'compare' }; if (!appState.viewerDoc) pickFirstDoc(); }
    render();
  });

  const vp = document.querySelector('[data-vpage]');
  if (vp) vp.onchange = () => vGo(+vp.value || 1);
  const vpr = document.querySelector('[data-vprev]');
  if (vpr) vpr.onclick = () => vGo(vSt().page - 1);
  const vn = document.querySelector('[data-vnext]');
  if (vn) vn.onclick = () => vGo(vSt().page + 1);
  const vr = document.querySelector('[data-vrot]');
  if (vr) vr.onclick = () => {
    const st = vSt();
    if (!st) return;
    st.rot = (st.rot + 90) % 360;
    document.querySelectorAll('[data-vpageinner]').forEach((p) => p.style.transform = `rotate(${st.rot}deg)`);
  };
  const zm = document.querySelector('[data-vzoom-]');
  if (zm) zm.onclick = () => setVZoom(VS.zoom - 10);
  const zp = document.querySelector('[data-vzoom\\+]');
  if (zp) zp.onclick = () => setVZoom(VS.zoom + 10);
  const vc = document.querySelector('[data-vclose]');
  if (vc) vc.onclick = () => { appState.viewer = null; render(); };

  document.querySelectorAll('[data-vthumb]').forEach((t) => t.onclick = (e) => {
    if (e.target.closest('[data-vdelpage]')) return;
    vGo(+t.dataset.vthumb);
  });

  document.querySelectorAll('[data-vdelpage]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const d = docListFor(appState.viewerDoc.scope).find((x) => x.id === appState.viewerDoc.id);
    if (!d || d.pages.length <= 1) { toast('Нельзя удалить единственную страницу', 'warn'); return; }
    d.pages.splice(+b.dataset.vdelpage - 1, 1);
    const st = vSt();
    if (st) st.page = Math.min(st.page, d.pages.length);
    render();
  });

  const vap = document.querySelector('[data-vaddpage]');
  if (vap) vap.onclick = () => {
    const d = docListFor(appState.viewerDoc.scope).find((x) => x.id === appState.viewerDoc.id);
    if (!d) return;
    d.pages.push({ kind: 'skel' });
    render();
    toast('Страница добавлена', 'ok');
  };

  // Вкладки документов просмотрщика.
  document.querySelectorAll('[data-vtab]').forEach((b) => b.onclick = (e) => {
    if (e.target.closest('[data-vtabclose]')) return;
    const [sc, id] = b.dataset.vtab.split('|');
    appState.viewerDoc = { scope: sc, id };
    appState.viewer = { mode: 'doc' };
    render();
  });
  document.querySelectorAll('[data-vtabclose]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const [sc, id] = b.dataset.vtabclose.split('|');
    VS.openTabs[sc] = (VS.openTabs[sc] || []).filter((x) => x !== id);
    if (appState.viewerDoc && appState.viewerDoc.scope === sc && appState.viewerDoc.id === id) {
      const rest = VS.openTabs[sc] || [];
      appState.viewerDoc = rest.length ? { scope: sc, id: rest[rest.length - 1] } : null;
      if (!appState.viewerDoc) appState.viewer = null;
    }
    render();
  });
  document.querySelectorAll('[data-vaddtab]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const [sc, id] = b.dataset.vaddtab.split('|');
    openDocViewer(sc, id);
  });

  // Переход к категории фото из тулбара.
  const vj = document.querySelector('[data-vjump]');
  // Перенос текущего фото к другой литере.
  const mv = document.querySelector('[data-move-photo]');
  if (mv) mv.onchange = () => {
    const targetId = mv.value;
    if (!targetId) return;
    const src = OI.find((o) => o.id === appState.openOi);
    const dst = OI.find((o) => o.id === targetId);
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
    // Позиция ленты источника не должна выйти за пределы.
    if (st) st.page = Math.max(1, Math.min(st.page, photoPages(src).length));
    // Подводим просмотрщик получателя к перенесённому фото.
    const dstPages = photoPages(dst);
    let lastIdx = dstPages.length - 1;
    dstPages.forEach((p, i) => { if (p.cat === cur.cat) lastIdx = i; });
    const dstSt = VS.photos[dst.id] || (VS.photos[dst.id] = { page: 1, rot: 0, scroll: 0 });
    dstSt.page = lastIdx + 1;
    render();
    toast(`Фото «${cur.cat}» перенесено к литере ${dst.letter}`, 'ok');
  };
  if (vj) vj.onchange = () => {
    const cat = vj.value;
    if (!cat) return;
    const oi = OI.find((o) => o.id === appState.openOi);
    if (!oi) return;
    const idx = photoPages(oi).findIndex((p) => p.cat === cat) + 1;
    if (idx > 0) vGo(idx);
  };

  document.querySelectorAll('[data-attach-default]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const scope = appState.viewer ? appState.viewer.scope || 'oc' : 'oc';
    const t = prompt('Тип документа: ' + ['Техпаспорт', 'ПУД', 'Гос. акт на землю', 'Акт осмотра', 'Прочее'].join(', '), 'Техпаспорт');
    if (!t) return;
    const name = prompt('Наименование документа:');
    if (!name) return;
    // Подключение модели документов здесь намеренно отложено: сохранение
    // поведения исходника (attach-default всегда пишет в документы ОЦ).
    import('../docs/docsModel.js').then(() => {});
    const { DOCS } = requireState();
    if (scope === 'oc') {
      DOCS.push({ id: 'd' + Date.now(), type: t, name, date: '07.08.2026', pages: null });
    } else {
      const oi = OI.find((o) => o.id === scope);
      if (oi) (oi.docs = oi.docs || []).push({ id: 'md' + Date.now(), type: t, name, date: '07.08.2026' });
    }
    render();
    toast('Документ прикреплён: ' + t, 'ok');
  });

  const cpp = document.querySelector('[data-cmp-ph-prev]');
  if (cpp) cpp.onclick = () => {
    const st = VS.photos[appState.openOi];
    if (st) { st.page = Math.max(1, st.page - 1); render(); }
  };
  const cpn = document.querySelector('[data-cmp-ph-next]');
  if (cpn) cpn.onclick = () => {
    const st = VS.photos[appState.openOi];
    if (st) { st.page = Math.min(photoPages(OI.find((o) => o.id === appState.openOi)).length, st.page + 1); render(); }
  };
  const cdp = document.querySelector('[data-cmp-dc-prev]');
  if (cdnGuard(cdp)) cdp.onclick = () => { const st = vSt(); if (st) { st.page = Math.max(1, st.page - 1); render(); } };
  const cdn = document.querySelector('[data-cmp-dc-next]');
  if (cdnGuard(cdn)) cdn.onclick = () => { const st = vSt(); if (st) { st.page = Math.min(vPages().length, st.page + 1); render(); } };

  // Синхронизация скролла ленты и зума колесом с Ctrl.
  const vstageEl = document.querySelector('[data-vstage]');
  if (vstageEl && appState.viewer && appState.viewer.mode !== 'compare') {
    const st = vSt();
    vstageEl.scrollTop = st.scroll || 0;
    const ribbonEl = document.querySelector('[data-vribbon]');
    if (ribbonEl) ribbonEl.style.zoom = String(VS.zoom / 100);
    vstageEl.addEventListener('scroll', () => {
      st.scroll = vstageEl.scrollTop;
      const top = vstageEl.getBoundingClientRect().top;
      let cur = 1;
      ribbonEl.querySelectorAll('[data-vpageblk]').forEach((bl) => {
        if (bl.getBoundingClientRect().top - top <= 60) cur = +bl.dataset.vpageblk;
      });
      if (cur !== st.page) {
        st.page = cur;
        const inp = document.querySelector('[data-vpage]');
        if (inp) inp.value = cur;
        document.querySelectorAll('[data-vthumb]').forEach((t) => t.classList.toggle('active', +t.dataset.vthumb === cur));
      }
    });
    vstageEl.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setVZoom(VS.zoom + (e.deltaY < 0 ? 10 : -10));
    }, { passive: false });
  }
  const cmpEl = document.querySelector('[data-cmp]');
  if (cmpEl) {
    cmpEl.style.zoom = String(VS.zoom / 100);
    cmpEl.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setVZoom(VS.zoom + (e.deltaY < 0 ? 10 : -10));
    }, { passive: false });
  }
}

function cdnGuard(el) { return !!el; }

function requireState() {
  // Локальный мост к состоянию документов без циклического импорта.
  return stateRef;
}
import { stateRef } from './viewerDocBridge.js';