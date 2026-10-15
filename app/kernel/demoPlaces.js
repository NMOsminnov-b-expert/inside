// Места демо-записей: настоящие ЕНИ Кадастра для нового ОИ и для сохранённых
// копий. Отдельно от demoParcels.js: тот целиком пересобирает утилита
// выгрузки (tools/cadastre/sample_parcels.py), и функции оттуда пропали бы.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: не нужен — ЕНИ объекта вносят по документам или
// подбирают по Кадастру; сам код система не выдумывает, а демо-записей нет.

import { DEMO_PARCELS } from './demoParcels.js';
import { syncOcAddress } from './address.js';

const digits = (e) => String(e == null ? '' : e).replace(/\D/g, '');

// Настоящий ЕНИ для нового ОИ демо-записи (указание пользователя 14.10.2026
// «переходим на реальные. Чтобы при демонстрации не искать подходящий»):
// свободный участок выгрузки, ближайший по коду к коду записи — тот же
// квартал, затем зона, район, область. Раньше новый ОИ получал «код записи
// + 1», которого Кадастр не знает. Занятые коды записи не повторяются —
// и после удаления ОИ тоже.
export function demoEniNear(base, used = []) {
  const taken = new Set(used.filter(Boolean).map(digits));
  const free = Object.values(DEMO_PARCELS).flat().map((p) => p.eni).filter((e) => !taken.has(e));
  if (!free.length) return '';
  const b = digits(base);
  const common = (e) => { let n = 0; while (n < e.length && e[n] === b[n]) n++; return n; };
  return free.reduce((best, e) => (common(e) > common(best) ? e : best), free[0]);
}

// Поля места: ЕНИ, адрес и координаты. Остальное в записи — правки человека.
const REC_PLACE = ['eni', 'region', 'city', 'district', 'micro', 'street', 'house', 'gps'];
const OI_PLACE = ['eni', 'street', 'house', 'gps'];

// Сохранённые копии демо-записей — на настоящие ЕНИ (решение пользователя
// 15.10.2026: «Делаем на качество. Тот вариант, который позволит без проблем
// работать всему функционалу. (тестовые данные на то и тестовые, что бы их
// можно было в любой момент заменить на реальные)»).
//
// Засев перешёл на настоящие участки 14.10.2026, а копии записей, сохранённые
// раньше (браузер, data/local), ложатся поверх засева и возвращали выдуманные
// коды 1-47-56-…: Кадастр по ним ничего не находит, карта и осмотры — без
// участка. Здесь у записи с двойником в засеве поля места берутся из засева,
// если её код Кадастру не известен (нет ни в выгрузке, ни в засеве); номер
// квартиры, состав, документы и прочие правки остаются. ОИ без двойника —
// свободный участок рядом (demoEniNear). Записи, заведённые человеком, не
// трогаются. Исправленная запись уходит в сохранения обычным порядком.
export function refreshDemoPlaces(list, seed) {
  if (!Array.isArray(list) || !Array.isArray(seed)) return;
  const twins = new Map(seed.filter((r) => r && r.id != null).map((r) => [r.id, r]));
  const known = new Set(Object.values(DEMO_PARCELS).flat().map((p) => p.eni));
  seed.forEach((r) => {
    if (!r) return;
    known.add(digits(r.eni));
    (r.eniList || []).forEach((e) => known.add(digits(e)));
    (r.oi || []).forEach((o) => known.add(digits(o && o.eni)));
  });
  const fake = (e) => !!digits(e) && !known.has(digits(e));

  list.forEach((rec) => {
    const twin = rec && twins.get(rec.id);
    if (!twin || twin === rec) return;
    let moved = false;
    const was = digits(rec.eni);

    if (fake(rec.eni)) {
      REC_PLACE.forEach((k) => {
        if (k in twin) rec[k] = twin[k];
        else if (k in rec) rec[k] = '';
      });
      moved = true;
    }
    if ((rec.eniList || []).some(fake)) {
      rec.eniList = Array.isArray(twin.eniList) ? twin.eniList.slice() : rec.eniList.filter((e) => !fake(e));
      moved = true;
    }

    const oiTwins = new Map((twin.oi || []).map((o) => [o.id, o]));
    (rec.oi || []).forEach((o) => {
      if (!o || !fake(o.eni)) return;
      const t = oiTwins.get(o.id);
      if (t) {
        OI_PLACE.forEach((k) => {
          if (k in t) o[k] = t[k];
          else if (k in o) o[k] = '';
        });
      } else if (digits(o.eni) === was && !fake(rec.eni)) {
        // ОИ на участке самой записи — туда же, куда перешла запись.
        o.eni = rec.eni;
      } else {
        o.eni = demoEniNear(rec.eni, [rec.eni, ...rec.oi.map((x) => x && x.eni)]);
      }
      moved = true;
    });

    // Адрес записи — производное значение (kernel/address.js): собирается
    // заново из новых частей, иначе реестр и поиск показывали бы прежний.
    if (moved && 'address' in rec) syncOcAddress(rec);
  });
}
