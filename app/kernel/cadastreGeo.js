// Координаты участка из портала Кадастра — по ЕНИ и по адресу.
//
// Задача графа geokodirovanie-koordinat-po-adresam-ili-eni (13.10.2026):
// «Если там рамка, забираем всю рамку. Это нам надо!» — хранится рамка участка
// целиком и его контур, а не одна точка. Разведка портала — в записи графа.
//
// По ЕНИ:
//   1. getFeatureExtent.do?propCode=<13 цифр> → рамка { minx, miny, maxx, maxy }
//      в широте и долготе; несуществующий код — { extent: null };
//   2. контур — WFS картосервера портала (proxy.do → o2map), слой ENI_AREA,
//      отбор по коду С ДЕФИСАМИ (1-04-17-0014-0095), рамка запроса — в
//      EPSG:3857 (без неё картосервер отвечает пусто).
// По адресу — справочник Кадастра (searchAddr.do): область → район → айыльный
// аймак → село → улица; у Бишкека и Оша улицы сразу после области, у города
// областного значения (Токмок, Кант) — сразу после «района»-города; затем
// searchAddrResult.do (ADDR) → ЕНИ с адресами.
//
// Обходы CORS — те же, что у адреса по ЕНИ (kernel/cadastre.js): свой прокси
// (python tools/cadastre/proxy.py, путь /portal/…), затем прокси Live Server
// (/cadastre/…). Разбор ответов — здесь, один на оба обхода.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: запросы к Кадастру делает бэкенд, с кэшем; массовое
// заполнение — фоновой задачей с отчётом. Развилка — хранить контур в
// карточке (как здесь) или в отдельной таблице геометрий с индексом по
// пространству (поиск «что рядом», маршруты по многим объектам).

const OWN = 'http://127.0.0.1:8787/portal/';
const LIVE = '/cadastre/';
const TIMEOUT = 15000;

let via = '';                       // какой обход ответил последним
const memo = new Map();             // ответы по коду ЕНИ в пределах вкладки

async function call(base, path, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const resp = await fetch(base + path, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body, signal: ctl.signal }
      : { signal: ctl.signal });
    if (!resp.ok) return { fail: `HTTP ${resp.status}` };
    return { text: await resp.text() };
  } catch (e) {
    return { fail: 'не дошёл' };
  } finally {
    clearTimeout(timer);
  }
}

// Запрос к карте портала через первый ответивший обход.
async function portal(path, body) {
  const order = via === 'live' ? [LIVE, OWN] : [OWN, LIVE];
  const why = [];
  for (const base of order) {
    const r = await call(base, path, body);
    if (r.text !== undefined) { via = base === OWN ? 'own' : 'live'; return r.text; }
    why.push(`${base === OWN ? 'свой прокси' : 'прокси Live Server'} — ${r.fail}`);
  }
  throw new Error(`Кадастр не ответил (${why.join('; ')}). Запустите прокси: python tools/cadastre/proxy.py`);
}

const digits = (eni) => String(eni || '').replace(/\D/g, '').slice(0, 13);
// 1041700140095 → 1-04-17-0014-0095: так код записан в слое участков.
export const dashed = (code) => `${code[0]}-${code.slice(1, 3)}-${code.slice(3, 5)}-${code.slice(5, 9)}-${code.slice(9, 13)}`;
const R = 6378137;
const merc = (lon, lat) => [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];

// Центр рамки — «широта, долгота», как в поле GPS.
export const centerOf = (ext) => `${((ext[1] + ext[3]) / 2).toFixed(6)}, ${((ext[0] + ext[2]) / 2).toFixed(6)}`;

// Рамка и контур участка по ЕНИ. Ответ: { eni, extent: [minx, miny, maxx,
// maxy], contour: [[[ [lon, lat], … ]]] (MultiPolygon), house, at } либо
// { eni, error }. Кадастр не знает код — error «не найден», без исключения.
export async function geoByEni(eni) {
  const code = digits(eni);
  if (code.length !== 13) return { eni: code, error: 'код ЕНИ — 13 цифр' };
  if (memo.has(code)) return memo.get(code);
  let res;
  try {
    const ext = JSON.parse(await portal(`getFeatureExtent.do?propCode=${code}`)).extent;
    if (!ext) {
      res = { eni: code, error: 'Кадастр не знает участка с таким ЕНИ' };
    } else {
      const extent = [ext.minx, ext.miny, ext.maxx, ext.maxy];
      const [x1, y1] = merc(extent[0], extent[1]);
      const [x2, y2] = merc(extent[2], extent[3]);
      const filter = `<Filter><And><PropertyIsEqualTo matchCase="false"><PropertyName>PROPCODE</PropertyName><Literal>${dashed(code)}</Literal></PropertyIsEqualTo></And></Filter>`;
      const body = new URLSearchParams({
        service: 'WFS', version: '1.1.0', request: 'GetFeature', typename: 'ENI_AREA',
        propertyname: 'PROPCODE,DOMCODE,THE_GEOM', srsname: 'EPSG:4326', outputFormat: 'application/json',
        bbox: `${x1 - 5},${y1 - 5},${x2 + 5},${y2 + 5},EPSG:3857`, filter,
      });
      let contour = null;
      let house = '';
      try {
        const fc = JSON.parse(await portal('proxy.do?http://localhost/o2map/services/wfs', body));
        const f = (fc.features || [])[0];
        if (f && f.geometry) {
          contour = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
          house = (f.properties && f.properties.DOMCODE) || '';
        }
      } catch (e) { /* рамка есть — контур необязателен */ }
      res = { eni: code, extent, contour, house, at: new Date().toISOString(), src: 'Кадастр' };
    }
  } catch (e) {
    return { eni: code, error: e.message };
  }
  memo.set(code, res);
  return res;
}

// --- адрес → ЕНИ ---------------------------------------------------------------

// Основа названия: без «обл.», «г.», «р-н», «ул.», скобок, регистра и «ё» —
// «Чуйская область» и «Чуй обл.» сводятся к «чуй…».
// \b в JavaScript не видит кириллицу — граница слова через просмотр по буквам.
const STOP = /(?<![а-яёa-z])(обл(асть)?|г|город|р-н|район|ул(ица)?|пр(оспект|-т)?|пер(еулок)?|мкр|микрорайон|с|село|пгт|бул(ьвар)?|кв|д|дом|им)(?![а-яёa-z])\.?/gi;
const isCity = (name) => /(^|\s)г\.?\s*$/.test(String(name).trim()) || /^г\./.test(String(name).trim());
export function stem(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\([^)]*\)/g, ' ').replace(STOP, ' ')
    .replace(/[^a-zа-я0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();
}
// Совпадение основ: одно начинается с другого (не короче трёх букв) — «чуй» и
// «чуйская», «ахунбаева и» и «ахунбаева».
function like(a, b) {
  const x = stem(a); const y = stem(b);
  if (!x || !y) return false;
  const short = Math.min(x.length, y.length);
  const n = Math.min(short, 6);
  // «ош» — короткое название целиком: совпадает, если полностью.
  return (n >= 3 || (n === short && n >= 2)) && (x.startsWith(y.slice(0, n)) || y.startsWith(x.slice(0, n)));
}

let oblasts = null;
async function oblastList() {
  if (oblasts) return oblasts;
  const html = await portal('main.do');
  const sel = (html.match(/<select[^>]*id="oblast"[\s\S]*?<\/select>/i) || [''])[0];
  oblasts = [...sel.matchAll(/value="([0-9A-F]{32})">\s*([^<]+?)\s*</g)].map((m) => ({ code: m[1], name: m[2] }));
  return oblasts;
}
async function level(mode, q) {
  const qs = new URLSearchParams({ mode, oblast: q.oblast || '', region: q.region || '', ao: q.ao || '', village: q.village || '', street: '' });
  const json = JSON.parse(await portal(`searchAddr.do?${qs}`));
  return (json.searchAddrList || []).map((x) => ({ code: x.addrCd, name: x.addrName }));
}
const pick = (list, ...names) => list.find((x) => names.some((n) => n && like(x.name, n)));

// Кандидаты по адресу записи: [{ eni, address }]. addr — { region, district,
// city, street, house }. Не нашлось на каком-то шаге — { error } с тем, на
// каком: человеку видно, что поправить в адресе.
export async function eniByAddress(addr) {
  try {
    const obl = await oblastList();
    // Город — среди «… г.» (Бишкек, Ош), иначе область — среди «… обл.»:
    // «Ош г.» и «Ош обл.» иначе путаются.
    const o = (isCity(addr.city) && pick(obl.filter((x) => isCity(x.name)), addr.city))
      || pick(obl.filter((x) => !isCity(x.name)), addr.region);
    if (!o) return { error: `область «${addr.region || '—'}» не нашлась в справочнике Кадастра` };
    const q = { oblast: o.code };
    // Бишкек, Ош: улицы сразу после «области»-города.
    if (isCity(o.name)) {
      q.village = o.code;
    } else {
      const regs = await level('region', q);
      const r = (isCity(addr.city) && pick(regs.filter((x) => isCity(x.name)), addr.city))
        || pick(regs.filter((x) => !isCity(x.name)), addr.district);
      if (!r) return { error: `район или город «${addr.district || addr.city || '—'}» не нашёлся в справочнике Кадастра` };
      q.region = r.code;
      if (isCity(r.name)) {
        q.village = r.code;
      } else {
        const aos = await level('ao', q);
        for (const a of aos) {
          const vil = await level('village', { ...q, ao: a.code });
          const v = pick(vil, addr.city);
          if (v) { q.ao = a.code; q.village = v.code; break; }
        }
        if (!q.village) return { error: `населённый пункт «${addr.city || '—'}» не нашёлся в справочнике Кадастра` };
      }
    }
    const streets = await level('street', q);
    const st = streets.filter((x) => like(x.name, addr.street));
    if (!st.length) return { error: `улица «${addr.street || '—'}» не нашлась в справочнике Кадастра` };
    const out = [];
    for (const s of st.slice(0, 3)) {
      const body = new URLSearchParams({
        searchCondition: 'ADDR', inputPropCode: '', propCode: '', oblast: q.oblast, region: q.region || '', ao: q.ao || '',
        village: q.village, street: s.code, buildingNumb: String(addr.house || '').trim(), flatNumb: '', uchNo: '', page: '1', pageListSize: '12',
      });
      const html = await portal('searchAddrResult.do', body);
      const keys = [...html.matchAll(/data-gab-item-key="(\d{13})/g)].map((m) => m[1]);
      const dds = [...html.matchAll(/<dd[^>]*>([\s\S]*?)<\/dd>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim().replace(/[.\s]+$/, ''));
      keys.forEach((k, i) => { if (!out.some((x) => x.eni === k)) out.push({ eni: k, address: dds[i] || '' }); });
    }
    // Участок раньше квартир: у квартиры в адресе «кв.».
    out.sort((a, b) => /кв\./.test(a.address) - /кв\./.test(b.address));
    return out.length ? { candidates: out } : { error: 'дом на этой улице в Кадастре не нашёлся' };
  } catch (e) {
    return { error: e.message };
  }
}
