// Всплывающее окно у места действия (правило «без окон, перекрывающих экран; попапы у места действия — можно»).
//
// Окно ставится под кнопкой, а если снизу не помещается — над ней; не выходит за край экрана (правило «подсказки
// не выходят за границы страницы»). Закрывается Escape, щелчком мимо и повторным открытием другого окна; фокус —
// на первое поле, после закрытия — обратно на кнопку. Одновременно открыто одно окно.
//
// openAnchorPop(anchor, { label, width, className, draw(el), onOpen(el) }) → { el, close, redraw }
//   draw(el)  — разметка окна (вызывается при открытии и при redraw);
//   onOpen(el) — навесить обработчики один раз.

let cur = null;

function place(el, anchor, width) {
  const r = anchor.getBoundingClientRect();
  const w = Math.min(width, window.innerWidth - 16);
  el.style.width = `${w}px`;
  const h = el.offsetHeight;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  const below = r.bottom + 6 + h <= window.innerHeight - 8;
  el.style.left = `${left}px`;
  el.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - 6 - h)}px`;
}

export function closeAnchorPop() {
  if (cur) cur.close();
}

export function openAnchorPop(anchor, { label = '', width = 420, className = '', draw, onOpen } = {}) {
  closeAnchorPop();
  const el = document.createElement('div');
  el.className = `apop anim-in ${className}`.trim();
  el.setAttribute('role', 'dialog');
  if (label) el.setAttribute('aria-label', label);
  draw(el);
  document.body.appendChild(el);
  place(el, anchor, width);
  const first = el.querySelector('input:not([type=hidden]), textarea, select, button');
  if (first) first.focus();

  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const onDown = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
  const onResize = () => place(el, anchor, width);
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => document.addEventListener('mousedown', onDown), 0);
  window.addEventListener('resize', onResize);

  function close() {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('mousedown', onDown);
    window.removeEventListener('resize', onResize);
    el.remove();
    if (cur && cur.el === el) cur = null;
    if (anchor.isConnected) anchor.focus();
  }
  const redraw = () => { draw(el); place(el, anchor, width); };
  cur = { el, close, redraw };
  if (onOpen) onOpen(el, cur);
  return cur;
}
