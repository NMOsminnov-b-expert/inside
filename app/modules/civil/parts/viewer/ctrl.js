import { docListFor, pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../docs/model.js';
import { photoPages } from '../photos/model.js';
import { DOC_TYPES } from '../../data/dictionaries.js';
import { VS, vSt, vPages, vGo, setVZoom, openDocViewer } from './state.js';
import { nextId } from '../../data/store.js';
import { paintPdfCanvases } from './pdf.js';

// Поворот и зум — функции уровня модуля, а не замыкания внутри bindViewer: их
// зовут и кнопки панели, и горячие клавиши (которые навешиваются однократно, см.
// bindViewerHotkeys), поведение обязано быть идентичным.

// При 90°/270° повёрнутый лист вылезал за рамку и обрезался — поэтому вместе с
// самим transform меняем габариты обёртки местами.
function applyRotation(ctx, st) {
  const stage = ctx.scope.$('[data-vstage]');
  const quarter = st.rot === 90 || st.rot === 270;

  ctx.scope.$$('[data-vpageinner]').forEach((p) => {
    const wrap = p.parentElement;

    if (!quarter) {
      p.style.transform = `rotate(${st.rot}deg)`;
      if (wrap) { wrap.style.width = ''; wrap.style.height = ''; }
      return;
    }

    // Повёрнутый на 90°/270° лист меняет габариты местами: его «ширина» — это
    // высота листа (609px у A4), которая шире доступного места. Без масштаба он
    // вылезал за рамку и обрезался, поэтому при нехватке ширины досаживаем
    // scale, а обёртке отдаём итоговые габариты — иначе лента центрирует лист
    // по прежней ширине и он уезжает влево.
    const avail = stage ? Math.max(120, stage.clientWidth - 32) : p.offsetHeight;
    const k = Math.min(1, avail / p.offsetHeight);
    p.style.transform = `rotate(${st.rot}deg) scale(${k})`;
    if (wrap) {
      wrap.style.width = Math.round(p.offsetHeight * k) + 'px';
      wrap.style.height = Math.round(p.offsetWidth * k) + 'px';
    }
  });
}

function rotateViewer(ctx) {
  const st = vSt(ctx);
  if (!st) return;
  st.rot = (st.rot + 90) % 360;
  applyRotation(ctx, st);
}

// После смены масштаба перерисовываем страницы PDF: CSS-зум растягивает уже
// отрисованный canvas и на больших значениях мылит его — pdf.js рисует заново
// в новом разрешении, когда масштаб переходит на другую «ступень».
function zoomViewer(ctx, value) {
  setVZoom(ctx, value);
  paintPdfCanvases(ctx, VS.zoom);
}

// Горячие клавиши просмотрщика. Работают одинаково на реальных страницах PDF и на
// макетных заглушках.
//
// ВАЖНО: навешивается РОВНО ОДИН РАЗ за монтирование модуля (из index.js рядом с
// bindCommonUI), а не из bindViewer. bindViewer зовётся на каждую перерисовку
// экрана, а scope.onDocument только ДОБАВЛЯЕТ слушатель — при вызове оттуда
// обработчики накапливались, и одно нажатие «+» меняло зум на 40% вместо 10%,
// а четыре накопленных поворота по 90° давали полный круг, то есть «поворот не
// работает». Слушатель снимается сам при размонтировании модуля (kernel/scope.js),
// поэтому клавиши не протекают на другие экраны.
export function bindViewerHotkeys(ctx) {
  ctx.scope.onDocument('keydown', (e) => {
    if (!ctx.ui.viewer) return;

    // Не мешаем набору текста и модальным диалогам: иначе «0» или «+» в поле
    // ввода дёргали бы зум, а буква — поворот (ровно то, чего просили избежать).
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"], .modal')) return;
    if (document.querySelector('.modal')) return;

    const st = vSt(ctx);
    const pageCount = vPages(ctx).length;

    // Поворот — на Ctrl+Alt+R, а не на Ctrl+R: Ctrl+R в браузере это
    // перезагрузка страницы, перехватывать её нельзя.
    if (e.ctrlKey && e.altKey && e.code === 'KeyR') { e.preventDefault(); rotateViewer(ctx); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    switch (e.key) {
      case 'ArrowRight': case 'PageDown':
        if (st) { e.preventDefault(); vGo(ctx, st.page + 1); } break;
      case 'ArrowLeft': case 'PageUp':
        if (st) { e.preventDefault(); vGo(ctx, st.page - 1); } break;
      case 'Home':
        if (st) { e.preventDefault(); vGo(ctx, 1); } break;
      case 'End':
        if (st && pageCount) { e.preventDefault(); vGo(ctx, pageCount); } break;
      case '+': case '=':
        e.preventDefault(); zoomViewer(ctx, VS.zoom + 10); break;
      case '-':
        e.preventDefault(); zoomViewer(ctx, VS.zoom - 10); break;
      case '0':
        e.preventDefault(); zoomViewer(ctx, 100); break;
      case 'Escape':
        e.preventDefault(); ctx.ui.viewer = null; ctx.render(); break;
      default: break;
    }
  });
}

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
  if (vr) vr.onclick = () => rotateViewer(ctx);

  const zm = s.$('[data-vzoom-]');
  if (zm) zm.onclick = () => zoomViewer(ctx, VS.zoom - 10);

  const zp = s.$('[data-vzoom\\+]');
  if (zp) zp.onclick = () => zoomViewer(ctx, VS.zoom + 10);

  const vc = s.$('[data-vclose]');
  if (vc) vc.onclick = () => { ctx.ui.viewer = null; ctx.render(); };

  // Габариты повёрнутого листа надо выставить и на первой отрисовке, а не только
  // по клику: состояние поворота живёт в VS и переживает перерисовку экрана.
  const rotSt = vSt(ctx);
  if (rotSt && rotSt.rot) applyRotation(ctx, rotSt);

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
      // Просмотрщик остаётся видимым, даже если закрыты все вкладки — он
      // индикатор наличия документов и покажет приглашение открыть/прикрепить.
      // Прячется только явным крестиком (data-vclose).
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
    const file = await pickFile();
    if (!file) return;
    if (isFileTooLarge(file)) { ctx.toast(`Файл слишком большой (максимум ${MAX_DOC_FILE_MB} МБ)`, 'warn'); return; }

    const list = docListFor(ctx, scope);
    const doc = { id: nextId('doc'), type, name: file.name, date: ctx.today, file: await attachedFileFrom(file), pages: null };
    list.push(doc);

    openDocViewer(ctx, scope, doc.id);
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
          // Долистали до самого низа — значит открыта последняя страница, даже
          // если её верх не дошёл до порога 60px (последнюю страницу лента
          // физически не может поднять выше). Иначе «End» показывал N-1.
          const atBottom = vstageEl.scrollTop + vstageEl.clientHeight >= vstageEl.scrollHeight - 2;
          if (atBottom) {
            const blocks = ribbonEl.querySelectorAll('[data-vpageblk]');
            if (blocks.length) cur = +blocks[blocks.length - 1].dataset.vpageblk;
          }
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
        zoomViewer(ctx, VS.zoom + (e.deltaY < 0 ? 10 : -10));
      }, { passive: false });
    }
  }

  const cmpEl = s.$('[data-cmp]');
  if (cmpEl) {
    cmpEl.style.zoom = String(VS.zoom / 100);
    cmpEl.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomViewer(ctx, VS.zoom + (e.deltaY < 0 ? 10 : -10));
    }, { passive: false });
  }

  // Страницы реального PDF рисуются после того, как разметка уже в DOM.
  paintPdfCanvases(ctx, VS.zoom);
}
