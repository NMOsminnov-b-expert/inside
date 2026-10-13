// Плавный масштаб колесом для карт Leaflet — одной кривой, без ступеней.
//
// Указания пользователя 13.10.2026: «Зум тоже плавный, а не рывками»;
// «словно клацает на + заместо нормального приближения… не ломаной, а
// единой плавной кривой по скорости»; «И пусть скорость зависит от
// масштаба». Встроенный обработчик колеса Leaflet копит щелчки и делает
// анимированный шаг на каждую пачку — отсюда ступени. Здесь колесо двигает
// только цель масштаба, а карта каждый кадр догоняет её по экспоненте
// (одна гладкая кривая скорости, без изломов на новых щелчках); точка под
// курсором остаётся под курсором. Скорость — от масштаба: издали (страна,
// область) — быстро, вблизи (улица, участок) — медленнее и точнее.
// Приём — как у дополнения Leaflet.SmoothWheelZoom (mutsuyuki, MIT):
// внутренние _moveStart/_move/_moveEnd карты, слои и подписи следуют сами.
// «Меньше движения» в системе — масштаб без догоняния.

const PX_PER_STEP = 100;     // щелчок колеса мыши — около 100 px прокрутки
const EASE = 0.2;            // доля оставшегося пути за кадр (≈60 кадров/с)

// Уровней масштаба на один щелчок колеса: 1,2 на уровне страны (z ≤ 7),
// 0,55 на уровне участка (z ≥ 17), между ними — плавно.
function stepAt(z) {
  const t = Math.min(1, Math.max(0, (z - 7) / 10));
  return 1.2 - 0.65 * t;
}

export function smoothWheel(L, map) {
  map.scrollWheelZoom.disable();
  const el = map.getContainer();
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let goal = null;
  let point = null;
  let raf = 0;

  const finish = () => {
    raf = 0;
    goal = null;
    map._moveEnd(true);
  };

  const frame = () => {
    if (!map._loaded) { raf = 0; goal = null; return; }
    const z = map.getZoom();
    let next = reduce ? goal : z + (goal - z) * EASE;
    const done = Math.abs(goal - next) < 0.003;
    if (done) next = goal;
    // Масштаб вокруг точки под курсором — как setZoomAround, но без анимации.
    const half = map.getSize().divideBy(2);
    const shift = point.subtract(half).multiplyBy(1 - 1 / map.getZoomScale(next, z));
    map._move(map.containerPointToLatLng(half.add(shift)), next);
    if (done) finish(); else raf = requestAnimationFrame(frame);
  };

  const onWheel = (e) => {
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 33;        // построчная прокрутка
    else if (e.deltaMode === 2) dy *= 400;  // постраничная
    if (!dy) return;
    if (goal === null) {
      map._stop();
      map._moveStart(true, false);
      goal = map.getZoom();
    }
    goal -= (dy / PX_PER_STEP) * stepAt(goal);
    goal = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), goal));
    point = map.mouseEventToContainerPoint(e);
    if (!raf) raf = requestAnimationFrame(frame);
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  map.on('unload', () => { el.removeEventListener('wheel', onWheel); if (raf) cancelAnimationFrame(raf); });
}
