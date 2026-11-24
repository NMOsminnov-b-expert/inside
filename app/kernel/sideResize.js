// Ширина боковой панели — тянуть за внутренний край (правило графа bokovye-paneli-rasshiryayutsya-i-szhimayutsya,
// пользователь 24.11.2026: «Все они должны уметь расширяться и сжиматься»).
//
// sideResize(panel, { key, edge, min, max, apply, label, host, cls }) — ставит на край панели ручку (шаблон W3C «Window
// Splitter»: role="separator", ширина в aria-valuenow):
//   edge  — 'right' (панель слева, ручка на её правом краю) или 'left' (панель справа);
//   apply(px) — задать ширину; px = 0 — исходная (из стилей);
//   host — куда поставить ручку, если не в саму панель (панель не должна становиться точкой отсчёта для своих
//     вложенных слоёв), cls — класс ручки для её места в host;
//   мышью — тянуть, двойной щелчок — исходная ширина; клавиатурой — ←/→ по 16 px (Shift — 64), Home/End.
// Вызывать после каждой отрисовки панели: ручка ставится заново, заданная ширина применяется из памяти.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: ширины — личная настройка, здесь в памяти браузера; на сервере — в настройках учётной
// записи (тогда переезжают с человеком на другой компьютер) или так же локально — развилка.
const PREFIX = 'inside.w.';

export function savedWidth(key) {
  try { return +localStorage.getItem(PREFIX + key) || 0; } catch { return 0; }
}
function save(key, px) {
  try { if (px) localStorage.setItem(PREFIX + key, String(Math.round(px))); else localStorage.removeItem(PREFIX + key); } catch { /* без памяти — до перезагрузки */ }
}

export function sideResize(panel, { key, edge = 'right', min = 200, max = 900, apply, label = 'Ширина панели', host = null, cls = '' }) {
  if (!panel || !key || !apply) return;
  const clamp = (v) => Math.round(Math.max(min, Math.min(max, v)));
  const saved = savedWidth(key);
  if (saved) apply(clamp(saved));
  const box = host || panel;
  if (!host) panel.classList.add('side-resizable');
  let grip = box.querySelector(`:scope > .side-grip[data-key="${key}"]`);
  if (!grip) {
    grip = document.createElement('div');
    grip.className = `side-grip side-grip-${edge} ${cls}`.trim();
    grip.dataset.key = key;
    grip.setAttribute('role', 'separator');
    grip.setAttribute('tabindex', '0');
    grip.setAttribute('aria-orientation', 'vertical');
    grip.setAttribute('aria-label', label);
    grip.title = 'Тянуть — ширина, двойной щелчок — как было';
    box.appendChild(grip);
  }
  const width = () => Math.round(panel.getBoundingClientRect().width);
  const sync = () => { grip.setAttribute('aria-valuemin', String(min)); grip.setAttribute('aria-valuemax', String(max)); grip.setAttribute('aria-valuenow', String(width())); };
  sync();
  const set = (px, keep = true) => { apply(px ? clamp(px) : 0); if (keep) save(key, px ? clamp(px) : 0); sync(); };
  grip.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width();
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add('col-resizing');
    let last = w0;
    const move = (ev) => { last = clamp(w0 + (edge === 'right' ? ev.clientX - x0 : x0 - ev.clientX)); apply(last); };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      document.body.classList.remove('col-resizing');
      set(last);
      window.dispatchEvent(new Event('resize'));   // карты и таблицы пересчитывают размер
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  };
  grip.ondblclick = () => { set(0); window.dispatchEvent(new Event('resize')); };
  grip.onkeydown = (e) => {
    const step = e.shiftKey ? 64 : 16;
    const grow = edge === 'right' ? 1 : -1;
    let px = null;
    if (e.key === 'ArrowRight') px = width() + step * grow;
    else if (e.key === 'ArrowLeft') px = width() - step * grow;
    else if (e.key === 'Home') px = min;
    else if (e.key === 'End') px = max;
    if (px === null) return;
    e.preventDefault();
    set(px);
    window.dispatchEvent(new Event('resize'));
  };
}
