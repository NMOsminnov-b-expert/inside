/*
 * Матрица взаимодействий — запись в странице (вставляет tools/matrix/
 * interactions.py). Практика APCS «матрица взаимодействий» (запись графа
 * matrica-vzaimodeystviy-kto-na-kogo-deystvuet): каждый блок каждый кадр.
 *
 * Блоки и действия находятся сами, а не списком вручную: так матрица
 * переносится на любой экран макета без настройки, и новый блок попадает в
 * замер в тот же день, когда появился.
 *
 *   __mx.actions()      — действия экрана: всё, что нажимается, выбирается,
 *                         вводится; одинаковые по устройству (строки списка)
 *                         — не больше двух; каждому — data-mx-a="<номер>";
 *   __mx.record(мс)     — запись кадров: по каждому блоку x, y, ширина,
 *                         высота, видимая доля, узел, прокрутка; в конце —
 *                         кто из появившихся слоёв закрыт другим.
 */
(() => {
  if (window.__mx) return;

  // Блок — то, что человек видит отдельной частью экрана: области,
  // панели, списки, таблицы, всплывающие слои.
  const BLOCK = [
    'header', 'nav', 'aside', 'main', 'section', 'form', 'table', 'dialog', 'details',
    '[role=tablist]', '[role=listbox]', '[role=dialog]', '[role=menu]', '[role=tabpanel]', '[role=tooltip]',
    '[class*=pane]', '[class*=panel]', '[class*=card]', '[class*=list]', '[class*=bar]', '[class*=pop]',
    '[class*=menu]', '[class*=grid]', '[class*=tiles]', '[class*=tabs]', '[class*=foot]', '[class*=head]',
    '[class*=toast]', '[class*=hint]', '[class*=modal]', '[class*=pick]', '[class*=drop]', '.kg',
  ].join(',');
  // Классы состояния — не часть имени блока.
  const STATE = /^(on|off|hi|open|cur|active|sel|selected|is-|has-|ok|warn|err|dirty|wide|full|hidden)$/;
  const MAX_SAME = 3;

  const ids = new WeakMap();
  let nextId = 1;
  const idOf = (el) => { if (!ids.has(el)) ids.set(el, nextId++); return ids.get(el); };

  const cls = (el) => [...el.classList].filter((c) => !STATE.test(c) && !c.startsWith('mx-'));
  const nameOf = (el) => {
    const c = cls(el)[0];
    const lab = el.getAttribute('aria-label');
    return el.tagName.toLowerCase() + (c ? '.' + c : '') + (lab ? `[${lab.slice(0, 40)}]` : '');
  };
  const floating = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const p = getComputedStyle(e).position;
      if (p === 'fixed' || p === 'absolute') return true;
    }
    return false;
  };
  // Видимая доля: пересечение с окном и со всеми предками, которые режут
  // содержимое (overflow не visible).
  const visible = (el, r) => {
    if (!r.width || !r.height) return 0;
    let x0 = Math.max(r.left, 0), y0 = Math.max(r.top, 0);
    let x1 = Math.min(r.right, innerWidth), y1 = Math.min(r.bottom, innerHeight);
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const q = e.getBoundingClientRect();
      if (s.overflowX !== 'visible') { x0 = Math.max(x0, q.left); x1 = Math.min(x1, q.right); }
      if (s.overflowY !== 'visible') { y0 = Math.max(y0, q.top); y1 = Math.min(y1, q.bottom); }
    }
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) return 0;
    return Math.max(0, x1 - x0) * Math.max(0, y1 - y0) / (r.width * r.height);
  };

  const blocks = () => {
    const seen = new Map();
    const out = [];
    for (const el of document.querySelectorAll(BLOCK)) {
      if (el.closest('[data-mx-skip]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 14) continue;
      const n = nameOf(el);
      const k = seen.get(n) || 0;
      if (k >= MAX_SAME) continue;
      seen.set(n, k + 1);
      out.push({ key: k ? `${n}#${k + 1}` : n, el, r });
    }
    return out;
  };

  const snap = () => {
    const f = {};
    for (const { key, el, r } of blocks()) {
      f[key] = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height),
        Math.round(visible(el, r) * 100) / 100, idOf(el), Math.round(el.scrollTop)];
    }
    return f;
  };

  // Закрыт ли слой другим: 9 точек по его видимой части.
  // Слой, не ловящий мышь (pointer-events: none — уведомления), на время
  // проверки делается осязаемым: иначе elementFromPoint видит сквозь него, и
  // слой ложно числится закрытым.
  const covered = (el) => {
    const r = el.getBoundingClientRect();
    const x0 = Math.max(r.left, 0) + 2, x1 = Math.min(r.right, innerWidth) - 2;
    const y0 = Math.max(r.top, 0) + 2, y1 = Math.min(r.bottom, innerHeight) - 2;
    if (x1 <= x0 || y1 <= y0) return 0;
    const prev = el.style.pointerEvents;
    el.style.pointerEvents = 'auto';
    let n = 0, hit = 0;
    for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.1, 0.5, 0.9]) {
      const p = document.elementFromPoint(x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy);
      n += 1;
      if (p && !el.contains(p) && !p.contains(el)) hit += 1;
    }
    el.style.pointerEvents = prev;
    return hit / n;
  };

  const ACT = 'button, [role=tab], [role=button], [role=option], a[href], select, input:not([type=hidden]), textarea, summary, label[for]';
  const isOff = (el) => el.disabled || el.getAttribute('aria-disabled') === 'true';
  const sigOf = (el) => [el.tagName, el.getAttribute('role') || '', el.type || '',
    [...el.attributes].map((a) => a.name).filter((a) => a.startsWith('data-') && !a.startsWith('data-mx')).sort().join(' '),
    cls(el).sort().join(' ')].join('|');
  const labelOf = (el) => (el.getAttribute('aria-label') || el.title || el.placeholder
    || (el.labels && el.labels[0] ? el.labels[0].textContent : '')
    || (el.tagName === 'SELECT' ? el.name || el.id : el.textContent) || '')
    .replace(/\s+/g, ' ').trim().slice(0, 60);
  const kindOf = (el) => {
    const t = el.tagName;
    if (t === 'SELECT') return 'выбрать';
    if (t === 'TEXTAREA') return 'ввести';
    if (t === 'INPUT') {
      const ty = (el.type || 'text').toLowerCase();
      if (ty === 'checkbox' || ty === 'radio') return 'отметить';
      if (ty === 'file') return 'файл';
      if (ty === 'date') return 'дата';
      if (ty === 'number') return 'число';
      if (['button', 'submit', 'reset'].includes(ty)) return 'нажать';
      return 'ввести';
    }
    if (t === 'A') {
      const h = el.getAttribute('href') || '';
      if (/^(https?:|tel:|mailto:|whatsapp:)/i.test(h) && !h.startsWith(location.origin)) return 'наружу';
    }
    return 'нажать';
  };

  window.__mx = {
    actions() {
      const per = new Map();
      const out = [];
      // Кроме явных элементов — всё, у чего курсор «рука»: строки таблиц и
      // плитки, у которых обработчик висит на предке (делегирование).
      const cand = new Set(document.querySelectorAll(ACT));
      for (const el of document.querySelectorAll('body *')) {
        if (cand.has(el) || el.closest(ACT)) continue;
        if (getComputedStyle(el).cursor === 'pointer' && !(el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer')) cand.add(el);
      }
      // Отметка, спрятанная внутри подписи (сегменты «Android / iOS», дни
      // недели): человек нажимает подпись — её и берём.
      for (const el of [...cand]) {
        if (el.tagName !== 'INPUT' || !/^(radio|checkbox)$/.test(el.type)) continue;
        const lab = el.closest('label');
        const r = el.getBoundingClientRect();
        if (lab && (+getComputedStyle(el).opacity === 0 || r.width < 6 || r.height < 6)) { cand.delete(el); cand.add(lab); }
      }
      let i = 0;
      const all = blocks();
      for (const el of document.querySelectorAll('body *')) {
        if (!cand.has(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        const sig = sigOf(el);
        const n = per.get(sig) || 0;
        per.set(sig, n + 1);
        if (n >= 2) continue;
        i += 1;
        el.setAttribute('data-mx-a', String(i));
        const block = all.filter((b) => b.el.contains(el)).pop();
        out.push({ i, sig, label: labelOf(el), kind: kindOf(el), off: isOff(el),
          why: isOff(el) ? (el.title || el.getAttribute('aria-describedby') || '') : '',
          block: block ? block.key : '' });
      }
      return out;
    },
    // Найти действие на свежей странице: тот же номер с той же подписью и
    // устройством, иначе — первое с той же подписью и устройством.
    mark(a) {
      this.actions();
      const el = document.querySelector(`[data-mx-a="${a.i}"]`);
      const ok = (e) => e && sigOf(e) === a.sig && labelOf(e) === a.label;
      if (ok(el)) return a.i;
      const alt = [...document.querySelectorAll('[data-mx-a]')].find(ok);
      return alt ? +alt.getAttribute('data-mx-a') : 0;
    },
    record(ms) {
      const frames = [];
      let muts = 0;
      const obs = new MutationObserver((l) => { muts += l.length; });
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      const t0 = performance.now();
      const startHash = location.hash;
      const startW = document.documentElement.scrollWidth > innerWidth + 1;
      frames.push([0, snap()]);
      this.done = new Promise((resolve) => {
        const tick = () => {
          const t = performance.now() - t0;
          frames.push([Math.round(t), snap()]);
          if (t < ms) { requestAnimationFrame(tick); return; }
          obs.disconnect();
          const end = {};
          for (const { key, el } of blocks()) end[key] = { cov: covered(el), fl: floating(el) };
          const a = document.activeElement;
          resolve({
            frames, muts, end,
            hash0: startHash, hash1: location.hash,
            wide0: startW, wide1: document.documentElement.scrollWidth > innerWidth + 1,
            focus: a && a !== document.body ? nameOf(a) : 'body',
          });
        };
        requestAnimationFrame(tick);
      });
      return true;
    },
  };
})();
