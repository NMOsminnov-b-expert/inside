import { Idiomorph } from '../vendor/idiomorph/idiomorph.esm.js';

// Сверка дерева вместо замены (решение пользователя 26.10.2026 «Решай
// проблемы перерисовки»; вопрос графа pererisovka-ekrana-pri-izmenenii,
// правило sverka-dereva-vmesto-zameny). scope.setHTML прежде заменял
// содержимое экрана целиком: каждое «+ Добавить строку» в литере пересобирало
// ~1800 узлов, поле теряло фокус и каретку, внутренние блоки — прокрутку.
// Теперь существующее дерево приводится к новой разметке (idiomorph,
// app/vendor/idiomorph): совпавшие узлы правятся на месте и остаются теми же.
//
// Код экранов написан в расчёте на свежие узлы после каждой отрисовки, поэтому
// перед сверкой узлам возвращается «свежесть»: снимаются обработчики, которые
// экран навесил на вложенные узлы (addEventListener и свойства on…),
// отключаются наблюдатели за ними, свои выпадающие списки разворачиваются
// обратно в select (их поставит заново enhanceSelects). Привязка после
// отрисовки навешивает всё заново — как раньше на новые узлы. Корень экрана не
// сверяется и не чистится: обработчики scope.on и метки на корне живут, пока
// жив экран.
//
// Узел с картой (свойство _map, kernel/cadastreForm.ctrl.js, панель осмотров)
// сохраняет содержимое: у него сверяются только атрибуты — карта и её
// WebGL-контекст переживают перерисовку.
//
// Выключатель — localStorage «inside.morph» = «off»: прежняя замена целиком.

// --- учёт обработчиков и наблюдателей на элементах ---------------------------

const listeners = new WeakMap();   // Element → [[type, fn, capture]]
const watched = new WeakMap();     // Element → Set<observer>
const targets = new WeakMap();     // MutationObserver → Set<Element>

const captureOf = (o) => (typeof o === 'boolean' ? o : !!(o && o.capture));

let installed = false;
function install() {
  if (installed) return;
  installed = true;
  const ET = EventTarget.prototype;
  const add = ET.addEventListener;
  const remove = ET.removeEventListener;
  ET.addEventListener = function (type, fn, opts) {
    if (fn && this instanceof Element) {
      let list = listeners.get(this);
      if (!list) listeners.set(this, (list = []));
      list.push([type, fn, captureOf(opts)]);
    }
    return add.call(this, type, fn, opts);
  };
  ET.removeEventListener = function (type, fn, opts) {
    const list = this instanceof Element && listeners.get(this);
    if (list) {
      const c = captureOf(opts);
      const i = list.findIndex(([t, f, cc]) => t === type && f === fn && cc === c);
      if (i >= 0) list.splice(i, 1);
    }
    return remove.call(this, type, fn, opts);
  };
  for (const Obs of [window.ResizeObserver, window.IntersectionObserver, window.MutationObserver]) {
    if (!Obs) continue;
    const observe = Obs.prototype.observe;
    Obs.prototype.observe = function (target, opts) {
      if (target instanceof Element) {
        let set = watched.get(target);
        if (!set) watched.set(target, (set = new Set()));
        set.add(this);
        if (this instanceof MutationObserver) {
          let t = targets.get(this);
          if (!t) targets.set(this, (t = new Set()));
          t.add(target);
        }
      }
      return observe.call(this, target, opts);
    };
  }
}

// Свойства on…, которые экраны ставят элементам (поиск по app, 26.10.2026).
const ON_PROPS = ['onclick', 'onchange', 'oninput', 'onkeydown', 'onkeyup', 'onload', 'onerror', 'onpointerdown',
  'onpointerup', 'onpointermove', 'onmousedown', 'onmouseup', 'onmousemove', 'onblur', 'onfocus', 'oncontextmenu',
  'onwheel', 'ondblclick', 'onmouseenter', 'onmouseleave', 'onsubmit', 'onscroll', 'ondragstart', 'ondragover',
  'ondragend', 'ondrop', 'ondragenter', 'ondragleave', 'ontoggle', 'onpaste'];

const keeps = (el) => !!el._map;

// Вернуть вложенным узлам «свежесть» перед сверкой.
function freshen(root) {
  const keep = [];
  for (const el of root.querySelectorAll('*')) {
    if (keep.some((k) => k.contains(el))) continue;
    if (keeps(el)) { keep.push(el); continue; }
    const list = listeners.get(el);
    if (list && list.length) {
      for (const [type, fn, capture] of list.splice(0)) el.removeEventListener(type, fn, capture);
    }
    for (const p of ON_PROPS) if (el[p]) el[p] = null;
    const set = watched.get(el);
    if (set) {
      for (const obs of set) {
        if (obs instanceof MutationObserver) {
          // Наблюдатель за корнем или документом (msDrop, выпадающие списки) не
          // трогаем; только тот, что смотрел лишь на вложенные узлы.
          const t = targets.get(obs);
          if (t && [...t].every((x) => x !== root && root.contains(x))) obs.disconnect();
        } else {
          obs.unobserve(el);
        }
      }
      watched.delete(el);
    }
  }
}

function syncAttributes(oldEl, newEl) {
  for (const a of [...oldEl.attributes]) if (!newEl.hasAttribute(a.name)) oldEl.removeAttribute(a.name);
  for (const a of newEl.attributes) if (oldEl.getAttribute(a.name) !== a.value) oldEl.setAttribute(a.name, a.value);
}

export function morphEnabled() {
  try { return localStorage.getItem('inside.morph') !== 'off'; } catch (e) { return true; }
}

// Привести содержимое root к html. Первую отрисовку (пустой корень) и
// выключенную сверку — прежней заменой.
export function morphInto(root, html, prepare) {
  if (!root.firstChild || !morphEnabled()) {
    root.innerHTML = html;
    return;
  }
  install();
  if (prepare) prepare(root);
  freshen(root);
  Idiomorph.morph(root, html, {
    morphStyle: 'innerHTML',
    callbacks: {
      beforeNodeMorphed(oldNode, newNode) {
        if (oldNode.nodeType === 1 && keeps(oldNode)) {
          if (newNode.nodeType === 1) syncAttributes(oldNode, newNode);
          return false;
        }
        return true;
      },
    },
  });
}

// Учёт ставится при загрузке ядра, до первой отрисовки: обработчики,
// навешенные до него, сверка снять не смогла бы.
install();
