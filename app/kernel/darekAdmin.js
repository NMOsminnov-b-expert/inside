// Административная привязка и земли участка — по точке, с карты адресного
// регистра «Дарек» ГУ «Кадастр» (сервер QGIS map.darek.kg, WMS GetFeatureInfo).
//
// Пользователь 04.11.2026: «Буквально получить доступ к тому, какие ЕНИ в
// каких аймаках… сопоставить земельные участки с их административными
// привязками»; «заодно необходимо найти и сами земли». Один запрос на участок
// (точка — центр рамки участка из Кадастра), как адрес и контур по ЕНИ;
// массовой выгрузки нет — она по официальному доступу (запись графа
// cadastre-kg-otkrytye-zaprosy-portala-chto-mozhno-poluchit).
//
// Что отдаёт сервер в точке (проверено 04.11.2026):
//   «Границы айылных аймаков» — Аймак, Код аймака, Район, Область и земельный
//      баланс аймака в га по категориям;
//   «Границы районов», «Границы областей» — названия (у областей — только
//      издали, по масштабу; запрос идёт по всем трём слоям сразу);
//   «Квартал (насел. пункт)» — kvartalcod, coate (код СОАТЕ);
//   «Сельскохозяйственные земли» — Код ЕНИ, Форма использования, амнистия, GPS;
//   «ГФСУ» (фонд сельхозугодий) — Код ЕНИ, Площадь;
//   «Лесная служба», «Особо охранемые природные территории», «Трансформация
//      земель» — что найдётся (поля пишутся как есть).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: открытая карта Дарека без договора; в системе — по
// официальному доступу (Кадастр готовит модуль карты) и на стороне сервера, с
// хранением привязки в базе, а не в записи ОЦ браузера.

const BASE = 'http://map.darek.kg/qgis/qgis_mapserv.fcgi.exe?map=' + encodeURIComponent('C:/OSGeo4W64/projects/ГИСАР/ГИСАР.qgz');
const LAYERS = ['Границы айылных аймаков', 'Границы районов', 'Границы областей', 'Квартал (насел. пункт)',
  'Сельскохозяйственные земли', 'ГФСУ', 'Лесная служба', 'Особо охранемые природные территории', 'Трансформация земель'];

// Земельный баланс аймака: поле слоя → подпись. Порядок — как в земельном
// балансе (сначала сельхозназначение, затем населённые пункты…).
export const BALANCE = [
  ['Земли сельскохозяйственного назначения (га)', 'Сельскохозяйственного назначения'],
  ['Земли населенных пунктов (га)', 'Населённых пунктов'],
  ['Земли промышленности, транспорта, связи, энергетики, обороны и иного назначения (га)', 'Промышленности, транспорта, связи, энергетики, обороны'],
  [' Земли лесного фонда (га)', 'Лесного фонда'],
  ['Земли водного фонда (га)', 'Водного фонда'],
  ['Земли особо охраняемых природных территорий (га)', 'Особо охраняемых природных территорий'],
  ['Земли запаса (га)', 'Запаса'],
];

const val = (v) => {
  const s = String(v == null ? '' : v).trim();
  return !s || s === 'NULL' || s === 'None' || s === '-9999' ? '' : s;
};
// «1547,12» и 13634.0 → число га.
export const ha = (v) => {
  const n = parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const layerOf = (f) => String(f.id || '').replace(/\.\d+$/, '');

// Разбор ответа GetFeatureInfo (JSON) — отдельно, чтобы проверять без сети.
export function parseAdmin(fc) {
  const out = { oblast: '', district: '', aimak: '', aimakCode: '', quarter: '', coate: '', balance: null, lands: [] };
  (fc.features || []).forEach((f) => {
    const p = f.properties || {};
    const layer = layerOf(f);
    if (layer === 'Границы айылных аймаков') {
      out.aimak = val(p['Аймак']);
      out.aimakCode = val(p['Код аймака']);
      out.district = out.district || val(p['Район']);
      out.oblast = out.oblast || val(p['Область']);
      const total = ha(p['Общая площадь (га)']);
      out.balance = { total, parts: BALANCE.map(([k, label]) => ({ label, ha: ha(p[k]) })).filter((x) => x.ha != null) };
    } else if (layer === 'Границы районов') {
      // Название района из слоя районов полнее («Аламединский»), чем в слое аймаков («Аламудун»).
      out.districtFull = val(p['Район']);
      if (!out.balance && !out.aimak) {
        const total = ha(p['Общая площадь (га)']);
        out.districtBalance = { total, parts: BALANCE.map(([k, label]) => ({ label, ha: ha(p[k === 'Земли сельскохозяйственного назначения (га)' ? 'Земли сельскохоз. назначения (га)' : k]) })).filter((x) => x.ha != null) };
      }
    } else if (layer === 'Границы областей') {
      out.oblast = out.oblast || val(p['Область'] || p['name_ru'] || p['Name']);
    } else if (layer === 'Квартал (насел. пункт)') {
      out.quarter = val(p.kvartalcod).replace(/-$/, '');
      out.coate = val(p.coate) === '0' ? '' : val(p.coate);
    } else if (layer === 'Сельскохозяйственные земли') {
      out.lands.push({ kind: 'Сельскохозяйственные земли', eni: val(p['Код ЕНИ']), use: val(p['Форма использования']) });
    } else if (layer === 'ГФСУ') {
      out.lands.push({ kind: 'Фонд сельхозугодий (ГФСУ)', eni: val(p['Код ЕНИ']), area: val(p['Площадь']) });
    } else if (layer) {
      // Лес, ООПТ, трансформация: поля как есть, без служебных.
      const facts = Object.entries(p).filter(([k, v]) => val(v) && !/^(oid|fid|id)$/i.test(k)).map(([k, v]) => `${k}: ${val(v)}`);
      out.lands.push({ kind: layer, note: facts.join('; ') });
    }
  });
  return out;
}

const memo = new Map();

// Привязка точки [широта, долгота]. Ошибка сети — { error }.
export async function adminAt(lat, lon) {
  const key = lat.toFixed(6) + ',' + lon.toFixed(6);
  if (memo.has(key)) return memo.get(key);
  const d = 0.0005;
  const q = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetFeatureInfo', LAYERS: LAYERS.join(','), QUERY_LAYERS: LAYERS.join(','),
    CRS: 'CRS:84', BBOX: [lon - d, lat - d, lon + d, lat + d].join(','), WIDTH: '101', HEIGHT: '101', I: '50', J: '50',
    INFO_FORMAT: 'application/json', FEATURE_COUNT: '20', WITH_GEOMETRY: 'false',
  });
  let res;
  try {
    const r = await fetch(BASE + '&' + q.toString());
    if (!r.ok) throw new Error('ответ ' + r.status);
    res = { ...parseAdmin(await r.json()), at: new Date().toISOString(), src: 'Дарек' };
  } catch (e) {
    res = { error: 'Дарек не ответил: ' + (e.message || e) };
  }
  if (!res.error) memo.set(key, res);
  return res;
}

// Точка записи ОЦ [широта, долгота]: центр рамки участка из Кадастра
// (rec.geo.extent), иначе поле GPS карточки («42.87, 74.61»).
export function pointOf(rec) {
  const e = rec && rec.geo && rec.geo.extent;
  if (e) return [(e[1] + e[3]) / 2, (e[0] + e[2]) / 2];
  const m = String((rec && rec.gps) || '').match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = +m[1];
  const lon = +m[2];
  return lat > 35 && lat < 45 && lon > 65 && lon < 85 ? [lat, lon] : null;
}

// Привязать записи без привязки (rec.adm): по три запроса сразу. onEach(rec) —
// после каждой записанной привязки (сохранить, перерисовать).
export async function fillAdmin(recs, onEach, { limit = 3 } = {}) {
  const queue = recs.filter((r) => pointOf(r) && !(r.adm && r.adm.at));
  let i = 0;
  const work = async () => {
    while (i < queue.length) {
      const rec = queue[i++];
      const [lat, lon] = pointOf(rec);
      const res = await adminAt(lat, lon);
      if (res.error) continue;
      rec.adm = { ...res, by: rec.geo && rec.geo.extent ? 'участок Кадастра' : 'GPS карточки' };
      if (onEach) onEach(rec);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, work));
  return queue.length;
}
