// Сворачивание блоков карточки по заголовку ([data-card-toggle]).
//
// Прежде модули переключали класс прямо в разметке и нигде его не помнили:
// любая перерисовка экрана и перезагрузка разворачивали блок обратно, а в ОЦ
// «Механизмы» обработчика не было вовсе — стрелки не работали (код-ревью и
// сверка поведения 09.10.2026). Теперь свёрнутые блоки — в состоянии экрана
// модуля (ui.cardsClosed, сохраняется — kernel/viewState.js; решение
// пользователя 09.10.2026: «в каком виде закрываем, в таком и открывается»).
//
// Ключ блока — data-card-key заголовка или его название (h3): у одного и того
// же блока в разных записях название одно, поэтому свёрнутый блок остаётся
// свёрнутым и в соседней записи.

export function cardKey(head) {
  if (head.dataset.cardKey) return head.dataset.cardKey;
  const h = head.querySelector('h3');
  return (h || head).textContent.trim();
}

// После отрисовки — вернуть свёрнутость. Блок с data-card-default="closed"
// свёрнут, пока его не открыли руками (блок инженерных сетей ОИ на участке,
// 16.10.2026: «он скрыт (просто свернут), если литера на участке»).
export function applyCardToggles(root, ui) {
  const closed = (ui && ui.cardsClosed) || {};
  root.querySelectorAll('[data-card-toggle]').forEach((head) => {
    const card = head.closest('.card');
    const key = cardKey(head);
    const shut = key in closed ? !!closed[key] : head.dataset.cardDefault === 'closed';
    if (card) card.classList.toggle('collapsed', shut);
  });
}

// Щелчок по заголовку (не по кнопке, полю или меню в нём) — свернуть или
// развернуть. Привязка делегированная — один раз на область экрана.
export function bindCardToggles(scope, ui) {
  scope.on('click', '[data-card-toggle]', (e, head) => {
    if (e.target.closest('button') || e.target.closest('input')
      || e.target.closest('select') || e.target.closest('.dd')) return;
    e.stopPropagation();
    const card = head.closest('.card');
    if (!card) return;
    const key = cardKey(head);
    ui.cardsClosed = ui.cardsClosed || {};
    // Открытый руками блок «свёрнут по умолчанию» помнится открытым (false),
    // остальные — как прежде: открыт — ключа нет.
    if (card.classList.contains('collapsed')) {
      if (head.dataset.cardDefault === 'closed') ui.cardsClosed[key] = false; else delete ui.cardsClosed[key];
    } else ui.cardsClosed[key] = true;
    card.classList.toggle('collapsed', !!ui.cardsClosed[key]);
  });
}
