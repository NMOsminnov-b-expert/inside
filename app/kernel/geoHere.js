// Место съёмки — координаты телефона в момент снимка (ответ пользователя на
// В4 27.10.2026: «Пока что не записывали, но имеет смысл внедрить»; запись
// графа osmotr-ts-na-meste-i-po-snimkam). ТС не закреплено за адресом, и место,
// где его сняли, — единственная привязка снимка к земле; у недвижимости место
// снимка подтверждает, что снимали на объекте.
//
// Нет разрешения, нет спутников или сети, браузер без геолокации — снимок
// остаётся без координат, без ошибки и без окна: осмотр важнее координат.
// Ответ держится минуту (maximumAge): серия снимков не спрашивает телефон
// заново на каждый кадр.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: в приложении — координаты из EXIF снимка, если камера
// их пишет, иначе — геолокация устройства в момент съёмки; хранить вместе со
// снимком на сервере. Развилка: показывать ли ЦОД снимки, снятые дальше
// N метров от объекта (недвижимость), и с какой точностью считать место
// годным.
const TIMEOUT_MS = 8000;
const MAX_AGE_MS = 60000;

// Текущее место или null. Никогда не бросает.
export function hereNow({ timeout = TIMEOUT_MS, maxAge = MAX_AGE_MS } = {}) {
  return new Promise((resolve) => {
    let geo = null;
    try { geo = navigator.geolocation || null; } catch (e) { geo = null; }
    if (!geo || typeof geo.getCurrentPosition !== 'function') { resolve(null); return; }
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    // Запасной предел: getCurrentPosition без ответа на запрос разрешения
    // может не вызвать ни один из обработчиков.
    const guard = setTimeout(() => finish(null), timeout + 1000);
    try {
      geo.getCurrentPosition((pos) => {
        clearTimeout(guard);
        const c = pos && pos.coords;
        if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) { finish(null); return; }
        finish({
          lat: +c.latitude.toFixed(6),
          lon: +c.longitude.toFixed(6),
          acc: Number.isFinite(c.accuracy) ? Math.round(c.accuracy) : null,
          at: new Date(pos.timestamp || Date.now()).toISOString(),
        });
      }, () => { clearTimeout(guard); finish(null); }, { enableHighAccuracy: true, timeout, maximumAge: maxAge });
    } catch (e) {
      clearTimeout(guard);
      finish(null);
    }
  });
}

// «42.874600, 74.612200 · ±12 м · 14:05» — широта, долгота, точность, время.
export function fmtPlace(p) {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return '';
  const d = p.at ? new Date(p.at) : null;
  const time = d && !isNaN(d) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
  return [`${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`, Number.isFinite(p.acc) ? `±${p.acc} м` : '', time].filter(Boolean).join(' · ');
}
