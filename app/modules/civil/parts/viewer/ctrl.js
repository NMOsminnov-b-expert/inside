import { docListFor } from '../docs/model.js';
import { photoPages } from '../photos/model.js';
import {
  VS, vSt, vPages, vGo, setVZoom, keepPageOnZoom, openDocViewer, openPhotoInPlace, applyFit, fitKey,
} from './state.js';
import { paintPdfCanvases, getPdfPageWidthPt } from './pdf.js';
import { applyDock, bindDockGrip } from './dock.js';
import { openPopout, closePopout, focusPopout } from './popout.js';
import { attachFiles, pickFiles } from './files.js';
import {
  currentTab, archiveTab, docOf, closeTab, closeAll, stepDoc, shiftTab, downloadDoc, printDoc,
  docProperties, deletePages,
} from './docActions.js';
import { KEYMAP } from './keys.js';
import { showMenu } from './menu.js';
import { showKeysHelp } from './keysHelp.js';
import { bindTabs } from './tabs.js';
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

function rotateViewer(ctx, deg = 90) {
  const st = vSt(ctx);
  if (!st) return;
  st.rot = (st.rot + deg + 360) % 360;
  applyRotation(ctx, st);
}

// Переход с запоминанием места — для «Предыдущий вид» (Alt+←, как в Acrobat):
// скачок к первой, последней, заданной странице или по миниатюре кладёт
// прежнюю страницу в историю документа. Листание по одной её не засоряет.
function jumpTo(ctx, n) {
  const st = vSt(ctx);
  if (!st) return;
  if (n !== st.page) {
    st.hist = (st.hist || []).concat(st.page).slice(-50);
    st.fwd = [];
  }
  vGo(ctx, n);
}

function stepHistory(ctx, dir) {
  const st = vSt(ctx);
  if (!st) return;
  const from = dir < 0 ? (st.hist || []) : (st.fwd || []);
  if (!from.length) return;
  const to = from.pop();
  if (dir < 0) st.fwd = (st.fwd || []).concat(st.page);
  else st.hist = (st.hist || []).concat(st.page);
  vGo(ctx, to);
}

// Реальный размер (Ctrl+1): лист в тех же сантиметрах, что на бумаге —
// пункт PDF = 1/72 дюйма, на экране 96 точек на дюйм.
async function actualSize(ctx) {
  const t = currentTab(ctx);
  const d = t && docOf(ctx, t.sc, t.id);
  const st = vSt(ctx);
  const ribbon = ctx.scope.$('[data-vribbon]');
  if (!d || !d.file || !st || !ribbon) return;
  VS.fit[fitKey(ctx)] = 'width';
  applyFit(ctx);
  const fitW = parseFloat(ribbon.style.getPropertyValue('--fit-w')) || 0;
  let natural = 0;
  const page = d.pages[st.page - 1];
  if (page && page.kind === 'pdf') natural = (await getPdfPageWidthPt(d.file.dataUrl, page.src)) * 96 / 72;
  else {
    const img = ctx.scope.$('.vribbon .vimg');
    natural = img ? img.naturalWidth : 0;
  }
  if (!natural || !fitW) return;
  zoomViewer(ctx, Math.round((natural / fitW) * 100));
}

// Инструменты, как в Acrobat: выделение (обычный), рука, лупа.
function setTool(ctx, tool) {
  VS.tool = tool;
  const stage = ctx.scope.$('[data-vstage]');
  if (stage) {
    stage.classList.toggle('tool-hand', tool === 'hand');
    stage.classList.toggle('tool-zoom', tool === 'zoom');
  }
  const name = { select: 'выделение', hand: 'рука — двигать лист', zoom: 'лупа: щелчок — ближе, с Alt — дальше' }[tool];
  ctx.toast('Инструмент: ' + name);
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

// Режим вписывания: «по ширине» или «целиком». 100% масштаба — это и есть
// выбранный режим, поэтому масштаб сбрасывается на 100%: нажав «целиком»,
// человек ждёт увидеть лист целиком, а не целиком-умножить-на-180%.
function fitViewer(ctx, mode) {
  VS.fit[fitKey(ctx)] = mode;
  keepPageOnZoom(ctx.scope.$('[data-vstage]'), 'data-vpageblk', () => {
    setVZoom(ctx, 100);
    applyFit(ctx);
  });
  ctx.scope.$$('[data-vfit]').forEach((b) => {
    const on = b.dataset.vfit === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  paintPdfCanvases(ctx, VS.zoom, ctx.scope.$('[data-vribbon]') || undefined);
}

// Во весь экран и обратно. Перерисовкой, а не классом: панель меняет значок и
// подсказку, а лента — размер, и после перерисовки bindViewer пересчитает лист
// и перерисует страницы PDF в новом разрешении.
function toggleFull(ctx, on) {
  ctx.ui.viewerFull = on === undefined ? !ctx.ui.viewerFull : on;
  ctx.render();
}

// Режим раскрытия (parts/viewer/dock.js): документ слева во всю высоту,
// шапки и карточка — справа. Выбор запоминается: кто работает с документами,
// работает так постоянно.
function toggleDock(ctx, on) {
  ctx.ui.viewerDock = on === undefined ? !ctx.ui.viewerDock : on;
  ctx.render();
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
    // Пока просмотрщик в отдельном окне, клавиши главного окна его не
    // листают: окно ловит их само (popout.js), а здесь человек заполняет поля.
    if (ctx.ui.viewerPopout) return;
    viewerKeydown(ctx, e);
  });
  // Отпускание пробела снимает временную «руку».
  ctx.scope.onDocument('keyup', (e) => {
    if (ctx.ui.viewerPopout) return;
    if (e.code === 'Space') viewerKeydown(ctx, e);
  });
}

// Обработка клавиши — отдельно от подписки: её зовут и главное окно, и окно
// просмотра на втором мониторе.
export function viewerKeydown(ctx, e) {
  if (!ctx.ui.viewer) return;

  // Не мешаем набору текста, модальным окнам и открытому меню: иначе «0» или
  // «+» в поле ввода дёргали бы масштаб.
  const t = e.target;
  const doc = (t && t.ownerDocument) || document;
  if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"], .modal, .vmenu')) return;
  if (doc.querySelector('.modal-back, .vmenu') || document.querySelector('.modal-back')) return;

  // Пробел — временная «рука», пока его держат (как в Acrobat).
  if (e.code === 'Space' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const stage = ctx.scope.$('[data-vstage]');
    const down = e.type === 'keydown';
    VS.spaceHand = down;
    if (stage) stage.classList.toggle('tool-hand', down || VS.tool === 'hand');
    e.preventDefault();
    return;
  }
  if (e.type !== 'keydown') return;

  const k = KEYMAP.find((x) => x.match(e));
  if (!k) return;
  const mode = ctx.ui.viewer.mode;
  if (k.doc && mode !== 'doc' && mode !== 'compare') return;
  e.preventDefault();
  k.run(keyActions(ctx), e);
}

// Действия для таблицы клавиш (keys.js) и контекстных меню.
function keyActions(ctx) {
  const st = vSt(ctx);
  const cur = () => currentTab(ctx);
  const withTab = (fn) => () => { const x = cur(); if (x) fn(ctx, x.sc, x.id); };
  const popout = !!ctx.isPopout;
  return {
    attach: async () => attachFiles(ctx, await pickFiles()),
    closeTab: () => closeTab(ctx),
    closeAll: () => closeAll(ctx),
    stepDoc: (dir) => stepDoc(ctx, dir),
    shiftTab: (dir) => shiftTab(ctx, dir),
    download: withTab(downloadDoc),
    print: withTab(printDoc),
    properties: withTab(docProperties),
    deletePages: () => deletePages(ctx),
    page: (dir) => { if (st) vGo(ctx, st.page + dir); },
    jump: (n) => jumpTo(ctx, n < 0 ? vPages(ctx).length : n),
    goto: () => { const i = ctx.scope.$('[data-vpage]'); if (i) { i.focus(); i.select(); } },
    history: (dir) => stepHistory(ctx, dir),
    fit: (m) => fitViewer(ctx, m),
    actualSize: () => actualSize(ctx),
    zoom: (d) => zoomViewer(ctx, VS.zoom + d),
    zoomReset: () => zoomViewer(ctx, 100),
    rotate: (deg) => rotateViewer(ctx, deg),
    rail: () => { ctx.ui.railCollapsed = !ctx.ui.railCollapsed; ctx.render(); },
    dock: () => { if (!popout) toggleDock(ctx); },
    full: () => { if (!popout) toggleFull(ctx); },
    tool: (name) => setTool(ctx, name),
    menu: () => {
      const stage = ctx.scope.$('[data-vstage]');
      if (!stage) return;
      const r = stage.getBoundingClientRect();
      showMenu(stage.ownerDocument, r.left + r.width / 2 - 110, r.top + 40, stageMenuItems(ctx), stage);
    },
    escape: () => {
      if (popout) return;
      if (ctx.ui.viewerFull) toggleFull(ctx, false);
      else if (ctx.ui.viewerDock) toggleDock(ctx, false);
      else { ctx.ui.viewer = null; ctx.render(); }
    },
    help: () => showKeysHelp(ctx.scope.root.ownerDocument),
  };
}

// Контекстное меню листа (правая кнопка по ленте). Пункты — те же действия,
// что у клавиш, с подписью клавиши: так клавишам и учатся.
function stageMenuItems(ctx) {
  const a = keyActions(ctx);
  const isDoc = ctx.ui.viewer.mode === 'doc';
  const st = vSt(ctx);
  const t = currentTab(ctx);
  const d = t && docOf(ctx, t.sc, t.id);
  const sel = (ctx.ui.pageSel || []).length;
  const tool = VS.tool || 'select';
  const fit = VS.fit[fitKey(ctx)];
  return [
    { label: 'Предыдущая страница', keys: '←', action: () => a.page(-1) },
    { label: 'Следующая страница', keys: '→', action: () => a.page(1) },
    { label: 'Перейти к странице…', keys: 'Ctrl+G', action: a.goto },
    { sep: true },
    { label: 'Страница целиком', keys: 'Ctrl+0', checked: fit === 'page', action: () => a.fit('page') },
    { label: 'По ширине', keys: 'Ctrl+2', checked: fit === 'width', action: () => a.fit('width') },
    { label: 'Реальный размер', keys: 'Ctrl+1', disabled: !isDoc, action: a.actualSize },
    { label: 'Увеличить', keys: 'Ctrl+=', action: () => a.zoom(10) },
    { label: 'Уменьшить', keys: 'Ctrl+−', action: () => a.zoom(-10) },
    { sep: true },
    { label: 'Повернуть по часовой', keys: 'Ctrl+Shift+=', action: () => a.rotate(90) },
    { label: 'Повернуть против часовой', keys: 'Ctrl+Shift+−', action: () => a.rotate(-90) },
    { sep: true },
    { label: 'Выделение', keys: 'V', checked: tool === 'select', action: () => a.tool('select') },
    { label: 'Рука', keys: 'H', checked: tool === 'hand', action: () => a.tool('hand') },
    { label: 'Лупа', keys: 'Z', checked: tool === 'zoom', action: () => a.tool('zoom') },
    ...(isDoc && d ? [
      { sep: true },
      { label: sel > 1 ? `Убрать выбранные страницы · ${sel}…` : `Убрать страницу ${st ? st.page : ''}…`,
        keys: 'Ctrl+Shift+D', danger: true, disabled: !d.pages || d.pages.length < 2, action: a.deletePages },
      { sep: true },
      { label: 'Скачать', keys: 'Ctrl+S', disabled: !d.file, action: a.download },
      { label: 'Печать', keys: 'Ctrl+P', disabled: !d.file, action: a.print },
      { label: 'Свойства документа', keys: 'Ctrl+D', action: a.properties },
    ] : []),
    { sep: true },
    { label: 'Миниатюры', keys: 'F4', checked: ctx.ui.railCollapsed !== true, action: a.rail },
    ...(ctx.isPopout ? [] : [
      { label: 'Раскрыть во всю высоту', keys: 'F', checked: !!ctx.ui.viewerDock, action: a.dock },
      { label: 'Во весь экран', keys: 'Ctrl+L', checked: !!ctx.ui.viewerFull, action: a.full },
      { label: 'В отдельном окне', action: () => openPopout(ctx, viewerKeydown) },
    ]),
    { sep: true },
    { label: 'Горячие клавиши', keys: '?', action: a.help },
  ];
}

// Меню миниатюры: перейти, переставить в начало или конец, убрать.
function thumbMenuItems(ctx, n) {
  const t = currentTab(ctx);
  const d = t && docOf(ctx, t.sc, t.id);
  if (!d) return [];
  const sel = ctx.ui.pageSel || [];
  const many = sel.length > 1 && sel.includes(n);
  const move = (to) => {
    const idxs = many ? sel.slice().sort((x, y) => x - y) : [n];
    reorderPages(d, idxs, to === 'start' ? 1 : d.pages.length + 1);
    pushDocPageLog(ctx.rec, d, 'move', to === 'start' ? 1 : d.pages.length);
    ctx.ui.pageSel = [];
    ctx.render();
  };
  return [
    { label: `Открыть страницу ${n}`, action: () => jumpTo(ctx, n) },
    { sep: true },
    { label: 'Переместить в начало', disabled: n === 1 && !many, action: () => move('start') },
    { label: 'Переместить в конец', disabled: n === d.pages.length && !many, action: () => move('end') },
    { sep: true },
    { label: many ? `Убрать выбранные · ${sel.length}…` : `Убрать страницу ${n}…`, keys: 'Ctrl+Shift+D',
      danger: true, disabled: d.pages.length < 2,
      action: () => { if (!many) ctx.ui.pageSel = [n]; deletePages(ctx); } },
  ];
}

// Правая кнопка по ленте и по миниатюрам. По листу — сначала делаем его
// текущим: «Убрать страницу» должно относиться к тому листу, по которому
// щёлкнули, а не к тому, что сверху.
function bindContextMenus(ctx) {
  const s = ctx.scope;
  const doc = s.root.ownerDocument;
  const stage = s.$('[data-vstage]');
  if (stage) stage.oncontextmenu = (e) => {
    e.preventDefault();
    const blk = e.target.closest('[data-vpageblk]');
    const st = vSt(ctx);
    if (blk && st) {
      st.page = +blk.dataset.vpageblk;
      const inp = s.$('[data-vpage]');
      if (inp) inp.value = st.page;
    }
    showMenu(doc, e.clientX, e.clientY, stageMenuItems(ctx), stage);
  };
  s.$$('[data-vthumb]').forEach((el) => el.oncontextmenu = (e) => {
    e.preventDefault();
    showMenu(doc, e.clientX, e.clientY, thumbMenuItems(ctx, +el.dataset.vthumb), el);
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

    // Масштаб общий на ленту, а у документа и фото свои режимы вписывания:
    // увеличенный документ не должен открывать снимок увеличенным.
    VS.zoom = 100;
    if (mode === 'photo') ctx.ui.viewer = { mode: 'photo' };
    else if (mode === 'doc') { ctx.ui.viewer = { mode: 'doc' }; if (!ctx.ui.viewerDoc) pickFirstDoc(); }
    else { ctx.ui.viewer = { mode: 'compare' }; if (!ctx.ui.viewerDoc) pickFirstDoc(); }

    ctx.render();
  });

  const vp = s.$('[data-vpage]');
  if (vp) vp.onchange = () => jumpTo(ctx, +vp.value || 1);

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

  s.$$('[data-vfit]').forEach((b) => b.onclick = () => fitViewer(ctx, b.dataset.vfit));

  const vf = s.$('[data-vfull]');
  if (vf) vf.onclick = () => toggleFull(ctx);

  const vh = s.$('[data-vhelp]');
  if (vh) vh.onclick = () => showKeysHelp(s.root.ownerDocument);

  const vdk = s.$('[data-vdock]');
  if (vdk) vdk.onclick = () => toggleDock(ctx);

  // Отдельное окно (popout.js): открыть, показать, вернуть в карточку.
  const vpo = s.$('[data-vpopout]');
  if (vpo) vpo.onclick = () => openPopout(ctx, viewerKeydown);
  s.$$('[data-vpop-back]').forEach((b) => b.onclick = () => closePopout());
  const vpf = s.$('[data-vpop-focus]');
  if (vpf) vpf.onclick = () => focusPopout();

  // До подсчёта размеров листа: колонка раскрытия задаёт ширину ленты. В окне
  // просмотра раскрытия нет — оно и так целиком под документом.
  if (!ctx.isPopout) {
    applyDock(ctx);
    bindDockGrip(ctx);
  }

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
    ctx.ui.viewerFull = false;
    ctx.ui.viewerClosed = true;
    ctx.render();
  };

  // Убрать документ в архив (kernel/archive.js). Не удаление: документ уходит
  // в общий архив, где его можно найти и вернуть — решение пользователя
  // 2026-09-02.
  const va = s.$('[data-varchive]');
  if (va) va.onclick = () => { const t = currentTab(ctx); if (t) archiveTab(ctx, t.sc, t.id); };

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
    if (e.ctrlKey || e.metaKey) return;
    jumpTo(ctx, +t.dataset.vthumb);
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

  // Вкладки, «+» и прикрепление файлов — parts/viewer/tabs.js.
  bindTabs(ctx, viewerKeydown);

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

  // Прикрепление: выбор нескольких файлов сразу (files.js). Перетаскивание и
  // вставка из буфера навешены один раз на модуль (bindFileDrop в index.js).
  s.$$('[data-vattach], [data-attach-default]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    b.closest('.dd') && b.closest('.dd').classList.remove('open');
    attachFiles(ctx, await pickFiles());
  });

  bindCompareColumns(ctx);
  bindCompareSplit(ctx);

  // Синхронизация скролла ленты и зум колесом с Ctrl.
  const vstageEl = s.$('[data-vstage]');
  if (vstageEl && ctx.ui.viewer && ctx.ui.viewer.mode !== 'compare') {
    const st = vSt(ctx);
    if (st) {
      const ribbonEl = s.$('[data-vribbon]');
      if (ribbonEl) ribbonEl.style.zoom = String(VS.zoom / 100);
      // Размер листа — до восстановления прокрутки: от него зависит высота
      // ленты, и прокрутка к прежнему месту на старых размерах промахивалась бы.
      applyFit(ctx);
      vstageEl.scrollTop = st.scroll || 0;
      watchStage(ctx, vstageEl);
      bindPan(vstageEl);
      vstageEl.addEventListener('vzoomtool', (ev) => zoomViewer(ctx, VS.zoom + ev.detail));

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
  bindContextMenus(ctx);

  // Страницы реального PDF рисуются после того, как разметка уже в DOM.
  paintPdfCanvases(ctx, VS.zoom);
}

// Область ленты меняется и без перерисовки: окно, перегородка между
// просмотрщиком и карточкой, закреплённая шапка. Лист пересчитывается по факту
// размера, а страницы PDF перерисовываются в новом разрешении — с паузой, чтобы
// не рисовать на каждом пикселе перетаскивания перегородки.
function watchStage(ctx, stage) {
  // Наблюдатель — окна самой ленты: в отдельном окне (popout.js) наблюдатель
  // главного окна её размеров не видит.
  const RO = stage.ownerDocument.defaultView.ResizeObserver;
  if (!RO) return;
  let timer = 0;
  let last = '';
  const ro = new RO(() => {
    if (!stage.isConnected) { ro.disconnect(); return; }
    const size = stage.clientWidth + 'x' + stage.clientHeight;
    if (size === last) return;
    last = size;
    applyFit(ctx);
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (stage.isConnected) paintPdfCanvases(ctx, VS.zoom, ctx.scope.$('[data-vribbon]') || undefined);
    }, 180);
  });
  ro.observe(stage);
}

// Увеличенный лист или снимок двигают, ухватив мышью (практика просмотрщиков
// фото: pan при увеличении). Только когда есть куда двигать — иначе обычный
// клик по листу ничего не делает. Кнопки, поля и миниатюры не трогаем.
function bindPan(stage) {
  const canPan = () => VS.tool === 'hand' || VS.spaceHand
    || stage.scrollWidth > stage.clientWidth + 2 || VS.zoom > 100;
  stage.classList.toggle('tool-hand', VS.tool === 'hand');
  stage.classList.toggle('tool-zoom', VS.tool === 'zoom');
  const mark = () => stage.classList.toggle('can-pan', canPan());
  mark();
  stage.addEventListener('scroll', mark, { passive: true });

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button, input, select, a, [data-vthumb]')) return;
    // Лупа (Z): щелчок — ближе, с Alt — дальше.
    if (VS.tool === 'zoom' && !VS.spaceHand) {
      e.preventDefault();
      stage.dispatchEvent(new CustomEvent('vzoomtool', { detail: e.altKey ? -25 : 25 }));
      return;
    }
    if (!canPan()) return;
    const start = { x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('panning');
    const move = (ev) => {
      stage.scrollLeft = start.l - (ev.clientX - start.x);
      stage.scrollTop = start.t - (ev.clientY - start.y);
    };
    const up = () => {
      stage.classList.remove('panning');
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', up);
    };
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
  });
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
