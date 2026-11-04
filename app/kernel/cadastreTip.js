// Подписи участков и строений Кадастра на картах — всё, что отдаёт слой
// картосервера портала (поля — запись графа
// cadastre-kg-otkrytye-zaprosy-portala-chto-mozhno-poluchit; DescribeFeatureType
// ENI_WGS84 и ENI_BUILDINGS, проверено 04.11.2026).
//
// Пользователь 04.11.2026: «пусть в эту метку выводится максимум информации об
// участке (земельном). И о здании если такая информация есть». Площади слой не
// отдаёт — она считается по контуру из Кадастра и так и подписана; строения
// участка — те строения слоя, чей код начинается с ЕНИ участка («…-0307-01»).
// Служебные и пустые значения (−9999, «None») не выводятся; назначение — с
// пометкой «по Кадастру» (решение 14.10.2026: не путать с назначением по ТП).
//
// Общий для карт Leaflet (cadastreLayers.js) и MapLibre (cadastreLayersGL.js).
import { esc } from './dom.js';
import { formatEniText } from './eniField.js';

// Поля запроса (WFS propertyname): всё, что показывается, и контур.
export const PARCEL_FIELDS = 'PROPCODE,DOMCODE,ADDRESS,FULL_ADDRESS,NAZNACHENI,PROPFOR_NAME,PROPFORM_NAME,DATEINS,DATEUPD,CODE_LRO,AMNESTIED,FROM_GPS,PRIMECHANI,THE_GEOM';
export const BUILD_FIELDS = 'PROPCODE,DOMCODE,BUILD_TYPE,ADDRESS,FULL_ADDRE,NAZNACHENI,PROPFOR_NA,PROPFORM_N,DATEINS,DATEUPD,CODE_LRO,PRIMECHANI,THE_GEOM';

const val = (v) => {
  const s = String(v == null ? '' : v).trim();
  return !s || s === '-9999' || s === 'None' || s === 'null' ? '' : s;
};
const yes = (v) => /^(true|1|да)$/i.test(String(v || ''));
// «2021-03-23 12:41:49», «2020/11/04 06:52:39.000» → «23.03.2021».
const date = (v) => {
  const m = val(v).match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};
const digits = (s) => String(s || '').replace(/\D/g, '');
const num = (n) => Math.round(n).toLocaleString('ru-RU');

// Площадь по контуру, м²: кольца [долгота, широта] в местные метры у средней широты, сумма внешних колец минус дыры.
export function areaM2(geometry) {
  if (!geometry) return 0;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  let total = 0;
  polys.forEach((rings) => rings.forEach((ring, i) => {
    if (!Array.isArray(ring) || ring.length < 3) return;
    const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
    const ky = 110540;
    let a = 0;
    for (let k = 0; k < ring.length; k++) {
      const [x1, y1] = ring[k];
      const [x2, y2] = ring[(k + 1) % ring.length];
      a += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky);
    }
    total += (i === 0 ? 1 : -1) * Math.abs(a / 2);
  }));
  return Math.max(0, total);
}

const areaText = (m2) => (!m2 ? '' : m2 >= 10000 ? `≈ ${num(m2)} м² (${(m2 / 10000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} га)` : `≈ ${num(m2)} м²`);

const row = (label, value) => (value ? `<div class="cad-tip-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>` : '');

const dates = (pr) => {
  const ins = date(pr.DATEINS);
  const upd = date(pr.DATEUPD);
  return [ins && `внесено ${ins}`, upd && upd !== ins && `изменено ${upd}`].filter(Boolean).join(' · ');
};

// Строения участка: код строения — ЕНИ участка и номер («1-03-07-0040-0307-01»).
export function buildsOfParcel(parcelCode, builds) {
  const code = digits(parcelCode);
  if (code.length !== 13) return [];
  return (builds || []).filter((f) => {
    const b = digits((f.properties || {}).PROPCODE);
    return b.length > 13 && b.startsWith(code);
  });
}

const buildWord = (pr) => [val(pr.BUILD_TYPE), val(pr.NAZNACHENI)].filter(Boolean).join(', ') || 'строение';

export function parcelTipHTML(pr, geometry, builds = []) {
  const code = digits(pr.PROPCODE);
  const addr = val(pr.FULL_ADDRESS) || val(pr.ADDRESS);
  const bl = builds.slice(0, 4).map((f) => `<li>${esc(buildWord(f.properties || {}))}${val((f.properties || {}).PRIMECHANI) ? ` — ${esc(val(f.properties.PRIMECHANI))}` : ''}</li>`).join('');
  return `<div class="cad-tip">
    <div class="cad-tip-h"><b>Участок · ЕНИ ${esc(code.length === 13 ? formatEniText(code) : val(pr.PROPCODE))}</b></div>
    ${addr ? `<div class="cad-tip-addr">${esc(addr)}</div>` : ''}
    ${row('Назначение по Кадастру', val(pr.NAZNACHENI))}
    ${row('Вид использования', val(pr.PROPFOR_NAME))}
    ${row('Форма собственности', val(pr.PROPFORM_NAME))}
    ${row('Площадь по контуру', areaText(areaM2(geometry)))}
    ${row('Номер дома', val(pr.DOMCODE) && !addr.includes(val(pr.DOMCODE)) ? val(pr.DOMCODE) : '')}
    ${builds.length ? `<div class="cad-tip-row"><span>Строения на участке</span><b>${builds.length}</b></div><ul class="cad-tip-list">${bl}${builds.length > 4 ? `<li>и ещё ${builds.length - 4}</li>` : ''}</ul>` : ''}
    ${row('Амнистия', yes(pr.AMNESTIED) ? 'да' : '')}
    ${row('Координаты', yes(pr.FROM_GPS) ? 'сняты по GPS' : '')}
    ${row('Примечание', val(pr.PRIMECHANI))}
    ${row('Регистрационный орган', val(pr.CODE_LRO) ? 'код ' + val(pr.CODE_LRO) : '')}
    ${dates(pr) ? `<div class="cad-tip-foot">${esc(dates(pr))}</div>` : ''}
  </div>`;
}

export function buildingTipHTML(pr, geometry) {
  const code = digits(pr.PROPCODE);
  const addr = val(pr.FULL_ADDRE) || val(pr.ADDRESS);
  const note = val(pr.PRIMECHANI);
  return `<div class="cad-tip">
    <div class="cad-tip-h"><b>Строение${val(pr.BUILD_TYPE) ? ` · ${esc(val(pr.BUILD_TYPE))}` : ''}</b></div>
    ${code ? `<div class="cad-tip-addr">код ${esc(val(pr.PROPCODE))}</div>` : ''}
    ${addr ? `<div class="cad-tip-addr">${esc(addr)}</div>` : ''}
    ${note ? `<div class="cad-tip-warn">${esc(note)}</div>` : ''}
    ${row('Назначение по Кадастру', val(pr.NAZNACHENI))}
    ${row('Вид использования', val(pr.PROPFOR_NA))}
    ${row('Форма собственности', val(pr.PROPFORM_N))}
    ${row('Площадь застройки по контуру', areaText(areaM2(geometry)))}
    ${row('Регистрационный орган', val(pr.CODE_LRO) ? 'код ' + val(pr.CODE_LRO) : '')}
    ${dates(pr) ? `<div class="cad-tip-foot">${esc(dates(pr))}</div>` : ''}
  </div>`;
}
