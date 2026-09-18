// Многострочное поле, которое растёт под текст.
//
// Зачем: комплектация, особые отметки и комментарий — поля непредсказуемой
// длины. Поле в три строки с внутренней прокруткой прячет уже написанное, а
// прокручивать текст внутри маленького окошка, чтобы перечитать его, неудобно.
//
// Правило из практик авторастущих полей (CSS-Tricks «Auto-growing inputs &
// textareas», designdebt.club «Auto-resizing text areas», обсуждение в GitLab
// «Allow manual resize of js-autosize textareas»): автоподгонка и ручная
// растяжка спорят друг с другом, поэтому человек главнее — как только он
// потянул поле за уголок, автоподгонка отключается, и поле держит заданный им
// размер. До этого поле растёт само.
//
// Рост ограничен: бесконечно растущее поле уводит кнопки за нижний край
// экрана. Дойдя до предела, поле показывает свою прокрутку.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: выбранный человеком размер поля живёт в памяти вкладки
// (ctx.ui), как и остальные настройки экрана. На сервере это личная настройка
// пользователя — её место рядом с шириной столбцов и открытыми блоками.
const MAX = 320;

export function bindAutoGrow(el, store, opts = {}) {
  if (!el) return;
  const max = opts.max || MAX;
  const key = el.id || el.getAttribute('data-grow-key') || '';
  const sizes = store || {};

  // Размер, заданный человеком, переживает перерисовку карточки: элемент после
  // неё новый, а настройка — та же.
  const saved = key && sizes[key];
  if (saved) {
    el.style.height = saved + 'px';
    el.style.overflowY = 'auto';
    el.dataset.userSized = '1';
  }

  let ours = Math.round(el.getBoundingClientRect().height);

  const grow = () => {
    if (el.dataset.userSized) return;
    el.style.height = 'auto';
    const want = el.scrollHeight + 2;
    el.style.height = Math.min(want, max) + 'px';
    el.style.overflowY = want > max ? 'auto' : 'hidden';
    ours = Math.round(el.getBoundingClientRect().height);
  };

  el.addEventListener('input', grow);
  if (!saved) grow();

  // Наблюдатель срабатывает и на наши собственные изменения высоты, поэтому
  // ручной растяжкой считаем только то, что разошлось с последним, что мы
  // поставили сами.
  if (typeof ResizeObserver !== 'function') return;

  const ro = new ResizeObserver(() => {
    const h = Math.round(el.getBoundingClientRect().height);
    if (!h || Math.abs(h - ours) <= 1) return;
    el.dataset.userSized = '1';
    el.style.overflowY = 'auto';
    if (key) sizes[key] = h;
    ours = h;
  });
  ro.observe(el);
}

// Привязать все многострочные поля области разом.
export function bindAutoGrowAll(scope, store, sel = 'textarea.mu-area, textarea.mu-comment') {
  scope.$$(sel).forEach((el) => bindAutoGrow(el, store));
}
