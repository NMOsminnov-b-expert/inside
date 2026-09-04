import { archiveDoc } from '../../../../kernel/archive.js';
import { docListFor, pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from '../docs/model.js';
import { photoPages } from '../photos/model.js';
import { DOC_TYPES } from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';
import { VS, vSt, vPages, vGo, setVZoom, keepPageOnZoom, openDocViewer, openPhotoInPlace } from './state.js';
import { nextDocId } from '../../data/store.js';
import { paintPdfCanvases } from './pdf.js';
import { pushDocPageLog } from '../../audit/model.js';

// Поворот и зум — функции уровня модуля, а не замыкания внутри bindViewer: их
// зовут и кнопки панели, и горячие клавиши (которые навешиваются однократно, см.
// bindViewerHotkeys), поведение обязано быть идентичным.

// Повёрнутый на 90°/270° лист меняет габариты местами: отдаём обёртке
// поменянные размеры, а центрирование листа внутри обёртки (CSS .vpage-wrap)
// делает так, что повёрнутый лист ровно её заполняет и никуда не вылезает.
// Если он шире ленты — лента прокручивается по горизонтали, как в обычных
// просмотрщиках.
//
// Масштаб «вписать в ширину» здесь СОЗНАТЕЛЬНО не применяется: он зависел бы от
// текущего зума, а зум реализован через CSS zoom на ленте — из-за этого после
// «повернуть, затем изменить зум» лист скакал и уезжал за рамку на сотни
// пикселей. Габариты же считаются в неотмасштабированных px (offsetWidth/
// offsetHeight их и дают), поэтому от зума не зависят вовсе.
function applyRotation(ctx, st) {
  const quarter = st.rot === 90 || st.rot === 270;

  ctx.scope.$$('[data-vpageinner]').forEach((p) => {
    const wrap = p.parentElement;
    p.style.transform = `rotate(${st.rot}deg)`;
    if (!wrap) return;
    wrap.style.width = quarter ? p.offsetHeight + 'px' : '';
    wrap.style.height = quarter ? p.offsetWidth + 'px' : '';
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
  // Страница под курсором остаётся той же — см. keepPageOnZoom.
  keepPageOnZoom(ctx.scope.$('[data-vstage]'), 'data-vpageblk', () => setVZoom(ctx, value));
  // Только лента страниц: миниатюры живут вне неё и от зума не зависят.
  paintPdfCanvases(ctx, VS.zoom, ctx.scope.$('[data-vribbon]') || undefined);
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

  // Лента миниатюр сворачивается: миниатюры крупные (видно содержимое страницы),
  // но иногда нужна вся ширина под саму страницу.
  const railBtn = s.$('[data-vrail-toggle]');
  if (railBtn) railBtn.onclick = () => { ctx.ui.railCollapsed = !ctx.ui.railCollapsed; ctx.render(); };

  // Сайдбар выбора документа/фото (кнопка-гамбургер слева вверху).
  const sbToggle = s.$('[data-vsb-toggle]');
  if (sbToggle) sbToggle.onclick = (e) => {
    e.stopPropagation();
    ctx.ui.viewerSidebar = !ctx.ui.viewerSidebar;
    ctx.render();
  };

  const sbClose = s.$('[data-vsb-close]');
  if (sbClose) sbClose.onclick = () => { ctx.ui.viewerSidebar = false; ctx.render(); };

  s.$$('[data-vsb-doc]').forEach((b) => b.onclick = () => {
    const [scope, id] = b.dataset.vsbDoc.split('|');
    ctx.ui.viewerSidebar = false;
    // Документ может лежать у другой литеры — режим переключаем на документы,
    // иначе выбор из сайдбара в фоторежиме визуально ничего бы не изменил.
    ctx.ui.viewer = { mode: ctx.ui.viewer && ctx.ui.viewer.mode === 'compare' ? 'compare' : 'doc' };
    openDocViewer(ctx, scope, id);
  });

  s.$$('[data-vsb-photo]').forEach((b) => b.onclick = () => {
    const [oiId, idx] = b.dataset.vsbPhoto.split('|');
    ctx.ui.viewerSidebar = false;
    openPhotoInPlace(ctx, oiId, +idx);
  });

  // Крестик не просто прячет панель, а ЗАПОМИНАЕТ закрытие: иначе на следующем
  // же переходе ensureViewerDefault включал бы её обратно, и закрыть насовсем
  // было нельзя. Снимается только закладкой.
  const vc = s.$('[data-vclose]');
  if (vc) vc.onclick = () => {
    ctx.ui.viewer = null;
    ctx.ui.viewerClosed = true;
    ctx.render();
  };

  // Убрать документ в архив (kernel/archive.js). Не удаление: документ уходит
  // в общий архив, где его можно найти и вернуть — решение пользователя
  // 2026-09-02. Вкладка документа закрывается, файл остаётся доступным.
  const va = s.$('[data-varchive]');
  if (va) va.onclick = async () => {
    const docId = va.dataset.varchive;
    const vd = ctx.ui.viewerDoc;
    if (!vd) return;

    const ok = await ctx.host.confirm({
      title: 'Убрать документ в архив?',
      text: 'Документ исчезнет из карточки, но останется в архиве — его можно будет найти и вернуть.',
      okLabel: 'В архив',
    });
    if (!ok) return;

    const oi = vd.scope === 'oc' ? null : (ctx.rec.oi || []).find((o) => o.id === vd.scope);
    const entry = await archiveDoc({
      rec: ctx.rec, oi, docId,
      typeId: 'residential-house', typeLabel: 'Жилой дом', today: ctx.today,
    });
    if (!entry) return;

    // Вкладка архивированного документа больше не имеет смысла.
    const tabs = VS.openTabs[vd.scope] || [];
    VS.openTabs[vd.scope] = tabs.filter((x) => x !== docId);
    const rest = VS.openTabs[vd.scope];
    ctx.ui.viewerDoc = rest.length ? { scope: vd.scope, id: rest[rest.length - 1] } : null;

    ctx.render();
    ctx.toast('Документ в архиве: ' + entry.title, 'ok');
  };

  const vo = s.$('[data-vopen]');
  if (vo) vo.onclick = () => {
    ctx.ui.viewerClosed = false;
    ctx.ui.viewer = { mode: 'doc' };
    ctx.render();
  };

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
    const pageNumber = +b.dataset.vdelpage;
    d.pages.splice(pageNumber - 1, 1);
    pushDocPageLog(ctx.rec, d, 'delete', pageNumber);
    const st = vSt(ctx);
    if (st) st.page = Math.min(st.page, d.pages.length);
    ctx.render();
  });

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

    const type = await ctx.host.select({ title: 'Тип документа', options: opt('oc', 'docType', DOC_TYPES) });
    if (!type) return;
    const file = await pickFile();
    if (!file) return;
    if (isFileTooLarge(file)) { ctx.toast(`Файл слишком большой (максимум ${MAX_DOC_FILE_MB} МБ)`, 'warn'); return; }

    const list = docListFor(ctx, scope);
    const doc = { id: nextDocId(ctx.rec), type, name: file.name, date: ctx.today, file: await attachedFileFrom(file), pages: null };
    list.push(doc);

    openDocViewer(ctx, scope, doc.id);
    ctx.toast('Документ прикреплён: ' + type, 'ok');
  });

  bindCompareColumns(ctx);
  bindCompareSplit(ctx);

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

  bindThumbReorder(ctx);

  // Страницы реального PDF рисуются после того, как разметка уже в DOM.
  paintPdfCanvases(ctx, VS.zoom);
}

// --- Режим «Сравнение»: две независимые прокручиваемые колонки ---------------
//
// Обе колонки ведут себя как лента обычного просмотра: колесо листает (фото —
// тоже, отдельным требованием), Ctrl+колесо меняет зум ИМЕННО ЭТОЙ колонки.
function bindCompareColumns(ctx) {
  const s = ctx.scope;

  const setZoom = (which, value) => {
    const ribbon = s.$(`[data-cmp-ribbon="${which}"]`);
    // Как и в обычной ленте, масштаб не должен перелистывать колонку.
    const blkAttr = which === 'photo' ? 'data-cmp-phblk' : 'data-cmp-dcblk';
    keepPageOnZoom(s.$(`[data-cmp-stage="${which}"]`), blkAttr, () => {
      VS.cmpZoom[which] = Math.min(500, Math.max(40, value));
      if (ribbon) ribbon.style.zoom = String(VS.cmpZoom[which] / 100);
      const label = s.$(`[data-cmp-zoomlabel="${which}"]`);
      if (label) label.textContent = VS.cmpZoom[which] + '%';
    });
    // Только своя колонка: без ограничения области перерисовывалась и чужая,
    // причём чужим масштабом.
    if (ribbon) paintPdfCanvases(ctx, VS.cmpZoom[which], ribbon);
  };

  s.$$('[data-cmp-zoom]').forEach((b) => b.onclick = () => {
    const [which, sign] = b.dataset.cmpZoom.split('|');
    setZoom(which, VS.cmpZoom[which] + (sign === '+' ? 10 : -10));
  });

  s.$$('[data-cmp-stage]').forEach((stage) => {
    const which = stage.dataset.cmpStage;
    const blkAttr = which === 'photo' ? 'data-cmp-phblk' : 'data-cmp-dcblk';
    const numEl = s.$(which === 'photo' ? '[data-cmp-phnum]' : '[data-cmp-dcnum]');
    const st = which === 'photo'
      ? (ctx.oi ? VS.photos[ctx.oi.id] : null)
      : vSt(ctx);
    const total = which === 'photo' ? photoPages(ctx.oi).length : vPages(ctx).length;

    stage.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(which, VS.cmpZoom[which] + (e.deltaY < 0 ? 10 : -10));
    }, { passive: false });

    // Номер текущей страницы/фото — из позиции прокрутки, как в обычной ленте.
    if (!st) return;
    stage.addEventListener('scroll', () => {
      const top = stage.getBoundingClientRect().top;
      let cur = 1;
      stage.querySelectorAll(`[${blkAttr}]`).forEach((bl) => {
        if (bl.getBoundingClientRect().top - top <= 60) cur = +bl.getAttribute(blkAttr);
      });
      if (stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2) {
        const blocks = stage.querySelectorAll(`[${blkAttr}]`);
        if (blocks.length) cur = +blocks[blocks.length - 1].getAttribute(blkAttr);
      }
      if (cur !== st.page) {
        st.page = cur;
        if (numEl) numEl.textContent = `${cur}/${total}`;
      }
    });
  });
}

// --- Перетаскивание миниатюр: порядок страниц + Ctrl-множественный выбор -----

function currentDoc(ctx) {
  const vd = ctx.ui.viewerDoc;
  return vd ? docListFor(ctx, vd.scope).find((x) => x.id === vd.id) : null;
}

// Переставляет выбранные страницы перед позицией toIdx (1-based, в исходном
// массиве). Порядок самих переносимых страниц сохраняется.
function reorderPages(d, fromIdxs, toIdx) {
  const moving = fromIdxs.map((i) => d.pages[i - 1]);
  const rest = d.pages.filter((_, i) => !fromIdxs.includes(i + 1));
  const removedBefore = fromIdxs.filter((i) => i < toIdx).length;
  const insertAt = Math.max(0, (toIdx - 1) - removedBefore);
  rest.splice(insertAt, 0, ...moving);
  d.pages = rest;
}

function bindThumbReorder(ctx) {
  const s = ctx.scope;
  const sel = () => (ctx.ui.pageSel || (ctx.ui.pageSel = []));

  // Лента миниатюр во время перетаскивания сама прокручивается у краёв: без
  // этого страницу нельзя утащить дальше видимой части ленты — курсор с
  // зажатой страницей упирается в край, а список стоит на месте.
  const rail = s.$('.vrail');
  // Прокручивается внутренний список, а не сама лента — обработчик нужен
  // именно на нём, иначе scrollTop менялся бы у элемента без прокрутки.
  const scroller = rail && (rail.querySelector('.vrail-list') || rail);
  if (scroller && !scroller.dataset.dragScrollBound) {
    scroller.dataset.dragScrollBound = '1';

    const EDGE = 46;    // зона у края, в которой начинается прокрутка
    const STEP = 18;    // шаг за одно событие — плавно, но заметно

    scroller.addEventListener('dragover', (e) => {
      const r = scroller.getBoundingClientRect();
      if (e.clientY < r.top + EDGE) scroller.scrollTop -= STEP;
      else if (e.clientY > r.bottom - EDGE) scroller.scrollTop += STEP;
    });
  }

  s.$$('[data-vthumb][draggable]').forEach((el) => {
    const idx = +el.dataset.vthumb;

    // Ctrl+клик — набрать несколько страниц; обычный клик — как раньше, переход
    // (переход навешен в bindViewer, поэтому здесь только выбор и стоп-всплытие).
    el.addEventListener('click', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const arr = sel();
      const at = arr.indexOf(idx);
      if (at >= 0) arr.splice(at, 1); else arr.push(idx);
      el.classList.toggle('sel', arr.includes(idx));
    });

    el.addEventListener('dragstart', (e) => {
      // Тащим либо весь набранный выбор (если тянут одну из выбранных), либо
      // ровно ту миниатюру, за которую взялись.
      const arr = sel();
      const dragged = arr.includes(idx) ? arr.slice().sort((a, b) => a - b) : [idx];
      e.dataTransfer.setData('text/plain', dragged.join(','));
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      s.$$('[data-vthumb]').forEach((t) => t.classList.remove('drop-before', 'drop-after'));
    });

    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = el.getBoundingClientRect();
      const after = (e.clientY - r.top) > r.height / 2;
      el.classList.toggle('drop-after', after);
      el.classList.toggle('drop-before', !after);
    });

    el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));

    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('text/plain');
      const fromIdxs = raw.split(',').map(Number).filter((n) => n > 0);
      if (!fromIdxs.length) return;

      const d = currentDoc(ctx);
      if (!d) return;

      const r = el.getBoundingClientRect();
      const after = (e.clientY - r.top) > r.height / 2;
      const toIdx = after ? idx + 1 : idx;
      if (fromIdxs.length === 1 && (toIdx === fromIdxs[0] || toIdx === fromIdxs[0] + 1)) return;

      reorderPages(d, fromIdxs, toIdx);
      // Перестановка страниц — такая же правка документа, как удаление и
      // добавление, и в логе должна быть видна наравне с ними: иначе порядок
      // страниц меняется бесследно. Записываем позицию, КУДА перенесли.
      pushDocPageLog(ctx.rec, d, 'move', toIdx + 1);
      ctx.ui.pageSel = [];
      ctx.render();
      ctx.toast(fromIdxs.length > 1 ? `Порядок изменён: ${fromIdxs.length} страниц` : 'Порядок страниц изменён', 'ok');
    });
  });
}

// Граница между фото и документом внутри сравнения и сворачивание половин
// (Л3.9). Ширину левой колонки держим в переменной --cmp-photo: правая
// забирает остаток, поэтому сумма всегда равна ширине области — уехать нечему
// (та же логика, что у столбцов таблиц).
export function bindCompareSplit(ctx) {
  const s = ctx.scope;

  s.$$('[data-cmp-fold]').forEach((b) => b.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const side = b.dataset.cmpFold;
    ctx.ui.cmpHidden = ctx.ui.cmpHidden === side ? null : side;
    ctx.render();
  });

  const sp = s.$('[data-cmp-split]');
  if (!sp) return;

  sp.onpointerdown = (e) => {
    e.preventDefault();
    sp.setPointerCapture(e.pointerId);

    const cmp = sp.parentElement;
    const rect = cmp.getBoundingClientRect();
    cmp.classList.add('cmp-resizing');
    let pct = ctx.ui.cmpSplit || 50;

    const move = (ev) => {
      // Не даём половине схлопнуться совсем: по 20 % минимум с каждой стороны.
      pct = Math.min(80, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100));
      cmp.style.setProperty('--cmp-photo', pct + '%');
    };
    const up = () => {
      sp.releasePointerCapture(e.pointerId);
      sp.removeEventListener('pointermove', move);
      sp.removeEventListener('pointerup', up);
      cmp.classList.remove('cmp-resizing');
      ctx.ui.cmpSplit = Math.round(pct);
    };

    sp.addEventListener('pointermove', move);
    sp.addEventListener('pointerup', up);
  };
}
