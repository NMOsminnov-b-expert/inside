import { docListFor, photoPages } from './deps.js';

// Состояние просмотрщика этого модуля: зум, страница, открытые вкладки.
// cmpZoom — зум режима «Сравнение», СВОЙ на каждую колонку: сравнивают обычно
// мелкую деталь на фото с крупным планом в документе, общий зум для этого не
// годится (см. parts/viewer/compare.js).
//
// fit — чем 100% масштаба считать (задача пользователя 21.09.2026: у
// просмотрщика мало полезной площади). «width» — лист во всю ширину области,
// «page» — лист целиком по высоте. У документа по умолчанию «по ширине»: его
// читают, и строка должна быть крупной; у фото — «целиком»: снимок смотрят весь
// (практики просмотрщиков: режимы Fit Width / Fit Page, лайтбоксы фото).
export const VS = {
  zoom: 100, cmpZoom: { photo: 100, doc: 100 }, docs: {}, photos: {}, openTabs: {},
  fit: { doc: 'width', photo: 'page' },
};

// Ключ режима вписывания: у фото свой, у документа и «Сравнения» — общий.
export const fitKey = (ctx) => (ctx.ui.viewer && ctx.ui.viewer.mode === 'photo' ? 'photo' : 'doc');

// Размер листа при 100% считается от ФАКТИЧЕСКОЙ области ленты и отдаётся
// переменными --fit-w/--fit-h: область меняется от окна, перегородки, скрытия
// миниатюр и полноэкранного режима, и число, сохранённое однажды, устаревало
// бы (практика: fit-режимы пересчитываются от измеренной области). Масштаб
// поверх этого — CSS zoom ленты, поэтому переменные даются в неувеличенных px.
export function applyFit(ctx) {
  const stage = ctx.scope.$('[data-vstage]');
  const ribbon = ctx.scope.$('[data-vribbon]');
  if (!stage || !ribbon) return;
  // Окно стиля — окна самой ленты: она бывает и в отдельном окне (popout.js).
  const cs = stage.ownerDocument.defaultView.getComputedStyle(stage);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  ribbon.style.setProperty('--fit-w', Math.max(200, stage.clientWidth - padX) + 'px');
  ribbon.style.setProperty('--fit-h', Math.max(200, stage.clientHeight - padY) + 'px');
  ribbon.classList.toggle('fit-page', VS.fit[fitKey(ctx)] === 'page');
  ribbon.classList.toggle('fit-width', VS.fit[fitKey(ctx)] !== 'page');
}

// Порядок вкладок — общий на объект оценки и его литеры: вкладки стоят одной
// строкой, и человек переставляет их перетаскиванием (требование пользователя
// 21.09.2026). Ключ вкладки — «область|документ».
VS.tabOrder = [];

export const tabKey = (scope, id) => `${scope}|${id}`;

export function openTabOnly(scope, id) {
  VS.openTabs[scope] = VS.openTabs[scope] || [];
  if (!VS.openTabs[scope].includes(id)) VS.openTabs[scope].push(id);
  if (!VS.tabOrder.includes(tabKey(scope, id))) VS.tabOrder.push(tabKey(scope, id));
}

// Области документов, видимые из текущего экрана: в карточке литеры — её
// документы и документы объекта оценки, в карточке объекта — только его.
export function scopesOf(ctx) {
  // На страницах «Документы» и «Учреждения» вкладки — файлы одного документа, и
  // область у них своя: иначе они смешались бы с вкладками карточки ОЦ, которые
  // живут в этом же VS (kernel/viewer/pageViewer.js).
  if (ctx.view === 'page') return ['page'];
  if (ctx.view === 'oi' && ctx.oi) return [ctx.oi.id, 'oc'];
  return ['oc'];
}

// Открытые вкладки видимых областей — в порядке, заданном человеком.
export function orderedTabs(scopes) {
  const all = [];
  scopes.forEach((sc) => (VS.openTabs[sc] || []).forEach((id) => all.push({ sc, id })));
  const pos = (x) => {
    const i = VS.tabOrder.indexOf(tabKey(x.sc, x.id));
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return all.sort((a, b) => pos(a) - pos(b));
}

// Свежесть открытия документов: какой документ смотрели последним. Нужна
// сравнению — при входе в него рядом с текущим документом встаёт тот, что
// открывали перед ним (пожелание пользователей из переписки, 25.09.2026:
// «открываются 2 документа, целевой и последний, который был открыт»).
VS.recent = [];

export function touchRecent(scope, id) {
  const k = tabKey(scope, id);
  VS.recent = VS.recent.filter((x) => x !== k);
  VS.recent.push(k);
}

// Документ для сравнения с текущим: из открытых вкладок — открытый последним,
// кроме самого текущего. Нет второй вкладки — сравнивать не с чем, слева фото.
export function pickCompareMate(ctx) {
  const vd = ctx.ui.viewerDoc;
  const list = orderedTabs(scopesOf(ctx))
    .filter((x) => !(vd && x.sc === vd.scope && x.id === vd.id))
    .reverse();
  if (!list.length) return null;
  const pos = (x) => VS.recent.indexOf(tabKey(x.sc, x.id));
  const best = list.reduce((a, b) => (pos(b) > pos(a) ? b : a));
  return { scope: best.sc, id: best.id };
}

// Левая колонка сравнения: документ (ctx.ui.cmpLeft) или фото (null).
export function cmpLeftDoc(ctx) {
  const l = ctx.ui.cmpLeft;
  return l ? docListFor(ctx, l.scope).find((x) => x.id === l.id) || null : null;
}

export function openDocViewer(ctx, scope, id) {
  if (!id) return;
  openTabOnly(scope, id);
  ctx.ui.viewerDoc = { scope, id };
  ctx.ui.viewer = { mode: (ctx.ui.viewer && ctx.ui.viewer.mode === 'compare') ? 'compare' : 'doc' };
  ctx.render();
}

export function openPhotoInPlace(ctx, oiId, idx) {
  VS.photos[oiId] = VS.photos[oiId] || { page: 1, rot: 0, scroll: 0 };
  if (idx) VS.photos[oiId].page = idx;
  ctx.ui.viewer = { mode: 'photo' };

  // Фото открывается ЗДЕСЬ ЖЕ: в карточке литеры — её просмотрщиком, в перечне
  // объекта оценки — просмотрщиком объекта (решение пользователя 05.09.2026).
  // Раньше клик по снимку в перечне уводил на страницу литеры и терял место, где
  // человек работал; какие фото показывать, просмотрщик берёт из viewerPhotoOi.
  if (ctx.view === 'oi' && ctx.oi && ctx.oi.id === oiId) {
    ctx.ui.viewerPhotoOi = null;
    ctx.render();
    return;
  }
  ctx.ui.viewerPhotoOi = oiId;
  ctx.ui.viewerClosed = false;
  ctx.render();
}

export function vSt(ctx) {
  const v = ctx.ui.viewer;
  if (!v) return null;

  if (v.mode === 'doc' || v.mode === 'compare') {
    const vd = ctx.ui.viewerDoc;
    const d = vd ? docListFor(ctx, vd.scope).find((x) => x.id === vd.id) : null;
    return d ? (VS.docs[d.id] || (VS.docs[d.id] = { page: 1, rot: 0, scroll: 0 })) : null;
  }

  const oiId = ctx.oi ? ctx.oi.id : null;
  if (!oiId) return null;
  return VS.photos[oiId] || (VS.photos[oiId] = { page: 1, rot: 0, scroll: 0 });
}

export function vPages(ctx) {
  const v = ctx.ui.viewer;
  if (!v) return [];

  if (v.mode === 'doc' || v.mode === 'compare') {
    const vd = ctx.ui.viewerDoc;
    const d = vd ? docListFor(ctx, vd.scope).find((x) => x.id === vd.id) : null;
    return d ? d.pages : [];
  }

  return photoPages(ctx.oi);
}

export function vGo(ctx, n) {
  const st = vSt(ctx);
  if (!st) return;

  const pages = vPages(ctx);
  st.page = Math.min(pages.length, Math.max(1, n));

  const blk = ctx.scope.$(`[data-vpageblk="${st.page}"]`);
  const vs = ctx.scope.$('[data-vstage]');

  if (blk && vs) {
    const r = blk.getBoundingClientRect();
    const s = vs.getBoundingClientRect();
    vs.scrollTo({ top: vs.scrollTop + (r.top - s.top) - 10, behavior: 'smooth' });
  } else {
    ctx.render();
  }
}

// Ступени масштаба — как у Acrobat: на крупном масштабе шаг больше. Ровный шаг
// в 10% на 300–500% казался топтанием на месте (замечание пользователя
// 25.09.2026: «увеличение слишком медленное на высоких процентах»). Кнопки
// «−/+» и клавиши идут по ступеням, колесо с Ctrl — на десятую долю текущего.
export const ZOOM_STEPS = [40, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];

export function stepZoom(z, dir) {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 0.5) || ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return ZOOM_STEPS.slice().reverse().find((s) => s < z - 0.5) || ZOOM_STEPS[0];
}

export const wheelZoom = (z, up) => Math.round(z * (up ? 1.1 : 1 / 1.1));

export function setVZoom(ctx, z) {
  VS.zoom = Math.min(500, Math.max(40, z));
  const r = ctx.scope.$('[data-vribbon]');
  if (r) r.style.zoom = String(VS.zoom / 100);
  const c = ctx.scope.$('[data-cmp]');
  if (c) c.style.zoom = String(VS.zoom / 100);
  const l = ctx.scope.$('[data-zoomlabel]');
  if (l) l.textContent = VS.zoom + '%';
}

// Смена масштаба не должна перелистывать документ. Лента увеличивается целиком
// (CSS zoom на ней), а scrollTop области прокрутки остаётся прежним — то же
// число пикселей после увеличения приходится уже на другой лист, и «+»/«−»
// уводили на соседнюю страницу. Поэтому перед сменой запоминаем, какой лист
// сейчас вверху и насколько он прокручен, а после — возвращаемся ровно туда же.
//
// blkAttr — атрибут блока-страницы: у обычной ленты data-vpageblk, у колонок
// сравнения свои (data-cmp-phblk / data-cmp-dcblk).
export function keepPageOnZoom(stage, blkAttr, apply) {
  if (!stage) { apply(); return; }

  const top = stage.getBoundingClientRect().top;
  const blocks = Array.from(stage.querySelectorAll(`[${blkAttr}]`));

  // Верхний видимый лист — тот же, что считает текущим обработчик прокрутки.
  let anchor = blocks[0] || null;
  blocks.forEach((b) => { if (b.getBoundingClientRect().top - top <= 60) anchor = b; });

  // Доля листа, уже ушедшая вверх: возвращаемся не к началу страницы, а туда
  // же, где читали.
  let frac = 0;
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    frac = r.height ? Math.min(1, Math.max(0, (top - r.top) / r.height)) : 0;
  }

  // Отдельно запоминаем «долистали до конца»: у последней страницы верх может
  // вообще не дойти до порога 60px (лента физически не может поднять её выше),
  // и текущей она считается именно по признаку конца. После увеличения контент
  // становится выше, признак пропадает — и «4/4» превращалось в «3/4», то есть
  // масштаб перебрасывал на предыдущий лист.
  const atBottom = stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2;

  apply();

  if (atBottom) { stage.scrollTop = stage.scrollHeight; return; }

  if (!anchor) return;
  const r2 = anchor.getBoundingClientRect();
  stage.scrollTop += (r2.top - stage.getBoundingClientRect().top) + frac * r2.height;
}
