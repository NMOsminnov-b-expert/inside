// Всплывающая часть мультивыбора: открытый список выводится из обрезающих
// контейнеров.
//
// Какой дефект это лечит (замечание пользователя 08.09.2026 — «фундамент в
// раскрывающемся меню не отображается, как и другие метрики… не видно ни
// одного»): поля материалов стоят в ячейках таблицы «Конструктив и износ», у
// ячейки overflow:hidden, а у обёртки таблицы overflow-x:auto — по спецификации
// браузер делает из этого auto по обеим осям. Список рисовался
// position:absolute внутри ячейки высотой 47 px и обрезался целиком: не было
// видно НИ ОДНОГО значения. Снаружи это выглядело как «пропали словари», хотя
// перечни на месте и в поле приходят.
//
// Для обычных списков ту же болезнь уже вылечили в dropdown.js — там меню
// рисуется в <body> с position:fixed. Здесь список остаётся в своём поле:
// точечная перерисовка ищет его внутри [data-struct-field] / [data-heat-field],
// и переезд в <body> сломал бы её. Вместо переезда на время открытия
// включается position:fixed — обрезка overflow на fixed-потомка не действует,
// пока никто из предков не создаёт для него containing block
// (transform/filter/contain; проверено — таких на этих экранах нет).
//
// Точка подключения одна — scope.setHTML, как и у enhanceSelects: мультивыборов
// в проекте четыре вида (материалы, отопление, температурный режим, оснащение
// участка) и 42 места открытия в пяти модулях. Наблюдатель за атрибутом hidden
// покрывает их все разом и будет покрывать новые: модулям про него знать не
// нужно.

const GAP = 4;
const EDGE = 8;

// Ниже этого списку тесно: лучше открыть его вверх, чем оставить полоску в
// три строки.
const MIN_H = 160;

// Открытые списки — чтобы переставить их при прокрутке и изменении размера
// окна. Держим слабо: узел, выпавший из DOM при перерисовке, просто выбывает.
const open = new Set();

function controlOf(drop) {
  const ms = drop.closest('.ms');
  return ms && ms.querySelector('[data-ms-control]');
}

// Позиция и высота открытого списка. Направление — вниз, если снизу хватает
// места, иначе вверх: у нижних строк таблицы места под полем почти нет.
export function placeMsDrop(drop) {
  const ctrl = controlOf(drop);
  if (!ctrl) return;

  const r = ctrl.getBoundingClientRect();

  drop.style.position = 'fixed';
  // В разметке список растянут по полю (left:0;right:0). При fixed правая
  // привязка растянула бы его до края экрана.
  drop.style.right = 'auto';
  // Слой тот же, что у своих списков (.pick-menu): всплывающий список поля.
  // Разметочного z-index:60 при fixed не хватает — он считается уже не внутри
  // своей карточки, а в корневом контексте, и следующая карточка просвечивала
  // сквозь открытый список.
  drop.style.zIndex = '400';
  drop.style.minWidth = r.width + 'px';

  const below = window.innerHeight - r.bottom - GAP - EDGE;
  const above = r.top - GAP - EDGE;
  const up = below < Math.min(drop.scrollHeight, MIN_H) && above > below;

  drop.style.maxHeight = Math.max(MIN_H, up ? above : below) + 'px';

  // Ширину и высоту читаем ПОСЛЕ выставления maxHeight: до этого список ещё
  // мог быть выше доступного места, и «вверх» отложилось бы не от той высоты.
  drop.style.left = Math.max(EDGE, Math.min(r.left, window.innerWidth - drop.offsetWidth - EDGE)) + 'px';
  drop.style.top = (up ? Math.max(EDGE, r.top - GAP - drop.offsetHeight) : r.bottom + GAP) + 'px';
}

// Закрытому списку возвращаем разметочные стили: следующий раз он может
// открыться в другом месте, а на узких экранах — вовсе без всплытия.
export function resetMsDrop(drop) {
  ['position', 'left', 'top', 'right', 'minWidth', 'maxHeight', 'zIndex']
    .forEach((k) => { drop.style[k] = ''; });
}

let windowBound = false;

function replaceAll() {
  open.forEach((drop) => {
    if (!drop.isConnected || drop.hidden) { open.delete(drop); return; }
    placeMsDrop(drop);
  });
}

function bindWindow() {
  if (windowBound) return;
  windowBound = true;
  // Прокрутка списка не закрывает, а переставляет: закрытие на каждом колесе
  // мыши мешало бы выбирать материал в длинной таблице. capture — потому что
  // прокручивается не окно, а внутренний контейнер #content.
  window.addEventListener('scroll', replaceAll, true);
  window.addEventListener('resize', replaceAll);
}

// Наблюдатель за открытием: модули по-прежнему просто снимают и ставят hidden.
export function enhanceMsDrops(root) {
  bindWindow();

  if (!root.dataset.msDropBound) {
    root.dataset.msDropBound = '1';

    const obs = new MutationObserver((recs) => {
      recs.forEach((rec) => {
        if (rec.type === 'attributes') {
          const el = rec.target;
          if (!el.classList || !el.classList.contains('ms-drop')) return;
          if (el.hidden) { open.delete(el); resetMsDrop(el); } else { open.add(el); placeMsDrop(el); }
          return;
        }
        // Пока ничего не открыто, перерисовки нас не касаются — а их на
        // экране реестра много. Проверка размера множества дешевле, чем
        // closest() на каждой мутации.
        if (!open.size) return;

        // Содержимое открытого списка перерисовали (выбор материала
        // перегруппировывает «Выбрано / Не выбрано») — высота изменилась,
        // значит и позиция.
        const t = rec.target;
        const drop = t.closest ? t.closest('.ms-drop') : null;
        if (drop && !drop.hidden) placeMsDrop(drop);
      });
    });

    obs.observe(root, {
      attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true,
    });
  }

  // Список, отрисованный сразу открытым (ctx.ui.heatOpen): атрибут hidden не
  // менялся, наблюдателю сработать не с чего.
  root.querySelectorAll('.ms-drop:not([hidden])').forEach((drop) => {
    open.add(drop);
    placeMsDrop(drop);
  });
}
