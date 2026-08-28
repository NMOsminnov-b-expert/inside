// Полный текст обрезанного значения — в окошке при наведении (Л1.4).
//
// Требование общее: ЛЮБОЕ поле или ячейка, которым не хватило ширины, при
// наведении показывают содержимое целиком. Поэтому механизм один на весь
// проект и вешается один раз при запуске, а не расставляется по местам:
// расставлять пришлось бы по сотням ячеек, и новые всё равно забывались бы.
//
// Что считается обрезанным — решает сам браузер: scrollWidth больше clientWidth.
// Так окошко не появляется там, где текст и так виден целиком.
//
// Окошко на position:fixed и в <body>: значения живут внутри прокручиваемых
// панелей и таблиц, и обычный absolute обрезался бы их границами (на этом уже
// спотыкались заметки).

// Белого списка селекторов здесь намеренно НЕТ. Он был и оказался ловушкой:
// ячейки реестра — это <div class="reg-td">, а не <td>, и подсказка на них не
// появлялась. Вместо перечисления ищем ближайший обрезанный элемент от того,
// на что навели, поднимаясь на пару уровней вверх.
const UP = 2;

let tip = null;
let shownFor = null;

function box() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'ov-tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  return tip;
}

// Текст значения. У полей ввода это value, у остального — видимый текст.
function textOf(el) {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value;
  return (el.innerText || el.textContent || '').trim();
}

function isClipped(el) {
  // Поле ввода прокручивается по горизонтали, ячейка — обрезается многоточием;
  // в обоих случаях признак один. Но у элемента с видимым переполнением
  // scrollWidth тоже больше — там ничего не скрыто, и подсказка не нужна.
  if (el.scrollWidth <= el.clientWidth + 1) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;

  const ov = getComputedStyle(el).overflowX;
  return ov === 'hidden' || ov === 'clip' || ov === 'auto' || ov === 'scroll';
}

// Ограничения кандидата. Без них подсказка цепляет крупный контейнер — у него
// тоже scrollWidth больше clientWidth, — и показывает разом весь текст карточки.
// Это уже случилось: при наведении вылезал список всех полей и кнопок экрана.
const MAX_H = 64;       // значение занимает строку-две, а не полкарточки
const MAX_LEN = 300;    // длиннее — это уже не «значение в поле»
const MAX_KIDS = 4;     // больше вложенных элементов — это контейнер

function isValueLike(el) {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
  if (el.clientHeight > MAX_H) return false;
  if (el.children.length > MAX_KIDS) return false;
  return textOf(el).length <= MAX_LEN;
}

// Ближайший обрезанный элемент: сам наведённый или его ближайший родитель.
// Выше не поднимаемся — иначе подсказку давали бы панели и карточки целиком.
function clippedFrom(target) {
  let el = target;
  for (let i = 0; el && el !== document.body && i < UP; i++, el = el.parentElement) {
    if (el.nodeType !== 1) continue;
    if (!isValueLike(el)) return null;      // дошли до контейнера — дальше не ищем
    if (isClipped(el) && textOf(el)) return el;
  }
  return null;
}

function hide() {
  if (!tip || tip.hidden) return;
  tip.hidden = true;
  if (shownFor && shownFor.dataset.ovTitle != null) {
    // Возвращаем родную подсказку, снятую на время показа своей.
    shownFor.setAttribute('title', shownFor.dataset.ovTitle);
    delete shownFor.dataset.ovTitle;
  }
  shownFor = null;
}

function show(el) {
  const text = textOf(el);
  if (!text) return;

  const t = box();
  t.textContent = text;
  t.hidden = false;

  // Родную подсказку браузера убираем, пока показываем свою: две сразу —
  // мельтешение.
  if (el.hasAttribute('title')) {
    el.dataset.ovTitle = el.getAttribute('title');
    el.removeAttribute('title');
  }
  shownFor = el;

  const r = el.getBoundingClientRect();
  const w = t.offsetWidth;
  const h = t.offsetHeight;

  // Под элементом, а если снизу не помещается — над ним.
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  const below = r.bottom + 6;
  const top = below + h <= window.innerHeight - 8 ? below : Math.max(8, r.top - h - 6);

  t.style.left = left + 'px';
  t.style.top = top + 'px';
}

export function installOverflowTip() {
  if (document.body.dataset.ovTipBound) return;
  document.body.dataset.ovTipBound = '1';

  document.addEventListener('mouseover', (e) => {
    const el = e.target.nodeType === 1 ? clippedFrom(e.target) : null;
    if (el === shownFor) return;

    hide();
    if (!el) return;
    // Пока значение правят, окошко мешает.
    if (document.activeElement === el) return;
    show(el);
  }, true);

  document.addEventListener('mouseout', (e) => {
    if (shownFor && !shownFor.contains(e.relatedTarget)) hide();
  }, true);

  // Прокрутка и уход с поля двигают элемент — окошко осталось бы висеть.
  document.addEventListener('scroll', hide, true);
  document.addEventListener('focusin', hide, true);
  window.addEventListener('resize', hide);
}
