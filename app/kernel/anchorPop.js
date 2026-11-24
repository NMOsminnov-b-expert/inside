// Всплывающее окно у места действия (правило «без окон, перекрывающих экран; попапы у места действия — можно»).
//
// Окно ставится под кнопкой, а если снизу не помещается — над ней; не выходит за край экрана (правило «подсказки
// не выходят за границы страницы»). Закрывается Escape, щелчком мимо и повторным открытием другого окна; фокус —
// на первое поле, после закрытия — обратно на кнопку. Одновременно открыто одно окно.
//
// openAnchorPop(anchor, { label, width, className, draggable, draw(el), onOpen(el) }) → { el, close, redraw }
//   draw(el)  — разметка окна (вызывается при открытии и при redraw);
//   onOpen(el) — навесить обработчики один раз;
//   avoid — селектор области, которую окно при открытии по возможности не закрывает;
//   draggable — окно переносится за заголовок (.apop-h) и не закрывается щелчком мимо: с ним работают, глядя на
//     страницу (пользователь 24.11.2026 об окне досрочного направления: «Форма не должна документы перекрывать...
//     Вообще ее лучше перетаскиваемой сделать»). Закрытие — Escape, «Отмена» или кнопка [data-apop-close]; куда
//     перенесли — запоминается до перезагрузки, по className окна.

let cur = null;
const moved = new Map();

const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
function putAt(el, left, top) {
  el.style.left = `${clamp(left, 8, window.innerWidth - el.offsetWidth - 8)}px`;
  el.style.top = `${clamp(top, 8, window.innerHeight - Math.min(el.offsetHeight, 120) - 8)}px`;
}

// avoid — селектор области, которую окно по возможности не закрывает (просмотрщик документов слева у карточки):
// окно сдвигается правее неё, если там помещается.
function place(el, anchor, width, avoid = '') {
  const r = anchor.getBoundingClientRect();
  const w = Math.min(width, window.innerWidth - 16);
  el.style.width = `${w}px`;
  const h = el.offsetHeight;
  let left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  const z = avoid ? [...document.querySelectorAll(avoid)].map((x) => x.getBoundingClientRect()).find((b) => b.width && b.left < left + w && b.right > left) : null;
  if (z && z.right + 8 + w <= window.innerWidth - 8) left = z.right + 8;
  const below = r.bottom + 6 + h <= window.innerHeight - 8;
  el.style.left = `${left}px`;
  el.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - 6 - h)}px`;
}

export function closeAnchorPop() {
  if (cur) cur.close();
}

export function openAnchorPop(anchor, { label = '', width = 420, className = '', draggable = false, avoid = '', draw, onOpen } = {}) {
  closeAnchorPop();
  const el = document.createElement('div');
  el.className = `apop anim-in ${draggable ? 'apop-drag' : ''} ${className}`.replace(/\s+/g, ' ').trim();
  el.setAttribute('role', 'dialog');
  if (label) el.setAttribute('aria-label', label);
  draw(el);
  document.body.appendChild(el);
  const key = className || 'apop';
  const at = () => { if (draggable && moved.has(key)) { const p = moved.get(key); el.style.width = `${Math.min(width, window.innerWidth - 16)}px`; putAt(el, p.left, p.top); } else place(el, anchor, width, avoid); };
  at();
  const first = el.querySelector('input:not([type=hidden]), textarea, select, button');
  if (first) first.focus();

  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const onDown = (e) => { if (!draggable && !el.contains(e.target) && !anchor.contains(e.target)) close(); };
  const onResize = () => at();
  // Перенос за заголовок; кнопки в заголовке (закрыть) не тянут.
  el.addEventListener('pointerdown', (e) => {
    if (!draggable || e.button !== 0 || !e.target.closest('.apop-h') || e.target.closest('button')) return;
    e.preventDefault();
    // От заданного места, а не от рамки: пока идёт анимация появления (масштаб), рамка смещена.
    const dx = e.clientX - parseFloat(el.style.left);
    const dy = e.clientY - parseFloat(el.style.top);
    el.classList.add('is-dragging');
    const move = (ev) => { putAt(el, ev.clientX - dx, ev.clientY - dy); };
    const up = () => {
      el.classList.remove('is-dragging');
      moved.set(key, { left: parseFloat(el.style.left), top: parseFloat(el.style.top) });
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-apop-close]')) close(); });
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
  // После переноса окно при перерисовке остаётся там, куда его поставили.
  const redraw = () => { draw(el); if (draggable && moved.has(key)) putAt(el, parseFloat(el.style.left), parseFloat(el.style.top)); else place(el, anchor, width, avoid); };
  cur = { el, close, redraw };
  if (onOpen) onOpen(el, cur);
  return cur;
}
