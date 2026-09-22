// Режим раскрытия: документ слева во всю высоту окна, карточка — справа.
//
// Замечание пользователя 21.09.2026: просмотр документа — «от силы 2/3 экрана в
// высоту», а полноэкранный показ перекрывает карточку, которую надо заполнять.
// Решение пользователя: в режиме раскрытия шапка сайта и шапка ОЦ сжимаются и
// уезжают вправо, над карточкой; документ занимает левую колонку от верха до
// низа. Так устроены экраны сверки документов (Everlaw, Reveal): документ во
// всю высоту, сведения — рядом.
//
// Устройство: просмотрщик закрепляется у левого края области приложения
// (position: fixed), а полоса сайта и содержимое модуля получают отступ слева на
// его ширину (переменные --dock-left и --dock-w на корне документа, класс
// viewer-dock на body). Карточку при этом не перестраиваем — она просто уже.

// Ширина колонки документа — доля области приложения; своя у режима
// раскрытия и запоминается (ctx.ui.splitVW.dock), как и доли обычного режима.
const DEFAULT_PCT = 50;
const MIN_W = 380;      // уже — не прочесть строку техпаспорта
const MIN_REST = 520;   // карточке справа нужно хотя бы столько для полей

// Только в карточке типа ОЦ: body[data-module] ставит оболочка при монтировании
// модуля и снимает при уходе (kernel/boot.js), поэтому режим сам снимается и на
// страницах «Документы»/«Учреждения», где сдвигать нечего.
const isOn = (ctx) => !!document.body.dataset.module
  && !!(ctx.ui.viewer && ctx.ui.viewerDock && ctx.scope.$('.viewer:not(.vpop-stub)'));

export function applyDock(ctx) {
  const on = isOn(ctx);
  document.body.classList.toggle('viewer-dock', on);
  if (!on) return;

  const main = document.querySelector('.main');
  if (!main) return;
  const r = main.getBoundingClientRect();
  const pct = ((ctx.ui.splitVW || {}).dock) || DEFAULT_PCT;
  const w = Math.round(Math.max(MIN_W, Math.min(r.width - MIN_REST, (r.width * pct) / 100)));
  const root = document.documentElement.style;
  root.setProperty('--dock-left', Math.round(r.left) + 'px');
  root.setProperty('--dock-w', w + 'px');
}

// Край колонки тянется мышью — так же, как перегородка обычного режима.
export function bindDockGrip(ctx) {
  const grip = ctx.scope.$('[data-vdock-grip]');
  if (!grip) return;
  grip.onpointerdown = (e) => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const main = document.querySelector('.main');
    const r = main.getBoundingClientRect();
    // Доля запоминается дробной. С округлением до целого процента колонка
    // двигалась ступеньками примерно по 15px (1% ширины области), а обычная
    // перегородка рядом тянется плавно — разницу видно сразу.
    const move = (ev) => {
      ctx.ui.splitVW = ctx.ui.splitVW || {};
      ctx.ui.splitVW.dock = ((ev.clientX - r.left) / r.width) * 100;
      applyDock(ctx);
    };
    const up = () => {
      grip.releasePointerCapture(e.pointerId);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  };
}

// Размер области приложения меняется окном и боковым меню (оно сворачивается
// без события resize). Наблюдатель один на страницу, а функцию берёт текущую —
// тот же приём, что у закреплённой шапки (index.js, bindStickyHead): модуль
// монтируется заново, а наблюдатель от прошлого монтирования остался бы.
export function watchDockArea(ctx) {
  window.civilDockFn = () => applyDock(ctx);
  if (window.civilDockWatched || typeof ResizeObserver === 'undefined') return;
  const main = document.querySelector('.main');
  if (!main) return;
  window.civilDockWatched = true;
  new ResizeObserver(() => { if (window.civilDockFn) window.civilDockFn(); }).observe(main);
}
