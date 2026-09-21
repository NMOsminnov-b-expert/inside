// Закреплённая шапка карточки: что остаётся вверху при прокрутке.
//
// Один на все типы ОЦ (уборка 21.09.2026): пять модулей держали побайтово
// одинаковую копию этой функции в своём index.js. Разное поведение здесь
// невозможно по смыслу — шапка и плашка «ОЦ → литера» устроены одинаково.

// Краткая сводка должна быть видна всегда, даже когда карточку прокрутили
// вниз. Поэтому при прокрутке шапка карточки уезжает вверх, а её место
// занимает плашка «ОЦ → литера» — она и так стоит сразу под шапкой и
// закреплена липко (см. #ctxPlateWrap в kernel/cards.css).
//
// Слушатель вешается один раз на корень: он переживает перерисовки, а
// scope.root между ними не меняется.
export function bindStickyHead(scope) {
  const root = scope.root;

  // Высота плашки нужна просмотрщику: он липкий и должен начинаться ПОД ней,
  // а не под ней прятаться. Отдаём её переменной, а не константой в стилях, —
  // плашка бывает в одну и в две строки.
  // Пороги РАЗНЫЕ на скрытие и возврат. С одним порогом получался дребезг:
  // шапка схлопывается, содержимое становится ниже, прокрутка сама уезжает
  // обратно за порог, шапка возвращается — и так по кругу, из-за чего плашку
  // приходилось «догонять» колесом.
  const HIDE_AT = 90;
  const SHOW_AT = 20;

  const sync = () => {
    const y = root.scrollTop;
    const on = root.classList.contains('scrolled');
    if (!on && y > HIDE_AT) root.classList.add('scrolled');
    else if (on && y < SHOW_AT) root.classList.remove('scrolled');
    // Вверху закреплено РАЗНОЕ: в карточке литеры — плашка «ОЦ → литера»,
    // в карточке ОЦ — её шапка. Просмотрщик должен начинаться под тем, что
    // закреплено сейчас, иначе он заезжает под него.
    const plate = root.querySelector('#ctxPlateWrap');
    const head = root.querySelector('[data-oc-head]');
    const hp = plate && plate.offsetParent !== null ? plate.offsetHeight : 0;
    const hh = head && head.offsetParent !== null ? head.offsetHeight : 0;
    const pinnedH = Math.max(hp, hh);
    root.style.setProperty('--plate-h', pinnedH + 'px');
    // И на корень документа: закладка заметок живёт в шелле (app.html), вне
    // дерева модуля, — переменную со scope.root она не видит и оставалась бы
    // под плашкой.
    document.documentElement.style.setProperty('--plate-h', pinnedH + 'px');

    // Высоту просмотрщика считаем по факту, а не формулой из констант:
    // высота плашки меняется (одна строка или две), и любая константа
    // промахивается — просмотрщик то вылезал за экран, то оставлял поле.
    const viewer = root.querySelector('.viewer');
    if (viewer) {
      const top = viewer.getBoundingClientRect().top;
      viewer.style.setProperty('--viewer-h', Math.max(320, window.innerHeight - top - 14) + 'px');
    }
  };

  // Слушатели — один раз на сам узел, а функцию они берут текущую: контейнер
  // переиспользуется между модулями, и жёстко привязанный sync остался бы от
  // предыдущего.
  root.syncStickyHeadFn = sync;
  if (!root.dataset.stickyHeadBound) {
    root.dataset.stickyHeadBound = '1';
    const call = () => { if (root.syncStickyHeadFn) root.syncStickyHeadFn(); };
    root.addEventListener('scroll', call);
    window.addEventListener('resize', call);
  }

  // Плашка появляется в DOM позже первого sync и меняет высоту от
  // содержимого — следим за её размером, а не гадаем, когда пересчитать.
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => sync());
    const watch = () => {
      ro.disconnect();
      [root.querySelector('#ctxPlateWrap'), root.querySelector('[data-oc-head]')]
        .forEach((el) => { if (el) ro.observe(el); });
    };
    watch();
    scope.watchStickyHead = watch;
  }
  // Пересчитываем и после каждой отрисовки: при переходе между карточками
  // меняется и прокрутка, и сама плашка.
  scope.syncStickyHead = sync;
  sync();
}
