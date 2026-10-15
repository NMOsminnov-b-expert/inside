// Строка «Кадастр» в блоке «Местоположение» карточки ОЦ: адрес, рамка и
// контур участка — одной кнопкой по ЕНИ, и поиск ЕНИ по адресу (решение
// пользователя 15.10.2026: «Заполнение адреса и получение данных с кадастра
// пускай будут в 1 кнопке. Нечего плодить много сложных задач. Поиск по
// адресу при этом оставим»; прежде — две строки, «Портал Кадастра» с кнопкой
// «Заполнить адрес» и «Координаты участка» с «Координаты по ЕНИ»).
// Хранение — блок «Местоположение» (решение 13.10.2026). Обработчик —
// kernel/cadastreForm.ctrl.js (bindGeo), запросы — kernel/cadastre.js (адрес)
// и kernel/cadastreGeo.js (рамка и контур).
//
// rec.geo = { extent: [minx, miny, maxx, maxy] (долгота, широта), contour
// (MultiPolygon), house, eni, at, src, by: 'ЕНИ' | 'адрес' }: рамка
// хранится целиком (пользователь: «Если там рамка, забираем всю рамку»).
//
// Практики: найденное подтверждается картой и адресом источника (Google
// «Quick & Verified Sign-up», Smarty); одно уверенное совпадение берётся
// сразу, несколько — коротким списком на месте (Autoaddress, QuickAddress).
// Код ЕНИ виден до нажатия — по чему пойдёт запрос, понятно заранее.
import { esc } from './dom.js';

const fmt = (n) => Number(n).toFixed(5);
const day = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };

export function geoStatus(geo) {
  if (!geo || !geo.extent) return 'не получены';
  const [x1, y1, x2, y2] = geo.extent;
  const n = geo.contour ? geo.contour.reduce((k, p) => k + p.reduce((m, r) => m + r.length, 0), 0) : 0;
  return `рамка ${fmt(y1)}…${fmt(y2)} с. ш., ${fmt(x1)}…${fmt(x2)} в. д.`
    + (n ? ` · контур ${n} точ.` : ' · контура нет')
    + ` · ${esc(geo.src || 'Кадастр')}${geo.by === 'адрес' ? ' по адресу' : ''}, ${day(geo.at)}`;
}

export function geoRowHTML(rec) {
  const g = rec.geo;
  return `<div class="src-row geo-row" data-geo>
        <span class="src-ic" aria-hidden="true">⌖</span>
        <span class="src-name">Кадастр</span>
        <span class="src-code" id="cadCode"></span>
        <span class="src-msg ${g && g.extent ? 'ok' : ''}" id="geoMsg" role="status">${g && g.extent ? geoStatus(g) : ''}</span>
        <span class="src-acts">
          <button type="button" class="btn src-btn" id="btnGeoEni">Получить по ЕНИ</button>
          <button type="button" class="btn src-btn" id="btnGeoAddr">Найти по адресу</button>
        </span>
      </div>
      <div class="geo-cands" id="geoCands" hidden></div>
      <div class="geo-map" id="geoMap" ${g && g.extent ? '' : 'hidden'} role="img" aria-label="Участок на карте по контуру из Кадастра, вокруг — соседние участки и строения"></div>`;
}

// Карта участка в карточке ОЦ — раздел «Участок на карте» внизу блока 01
// (решение пользователя 15.10.2026: «стоит карту добавить в блок 01 ОЦ как
// опцию (скрываемая карта)»). Кнопка показа — по образцу раскрытия W3C ARIA
// (Disclosure: button + aria-expanded + aria-controls). Без координат —
// строка с кнопкой «Получить по ЕНИ», а не пустое место. Обработчик —
// kernel/cadastreForm.ctrl.js (bindOcMap).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: показ карты — удобство одного человека, хранится в
// браузере; на сервере можно держать в личных настройках пользователя.
const MAP_HIDDEN_KEY = 'inside.oc.mapHidden';
export function ocMapHidden() {
  try { return localStorage.getItem(MAP_HIDDEN_KEY) === '1'; } catch (e) { return false; }
}
export function setOcMapHidden(v) {
  try { localStorage.setItem(MAP_HIDDEN_KEY, v ? '1' : '0'); } catch (e) { /* без памяти — до перезагрузки */ }
}
export function ocMapHTML(rec) {
  const g = rec.geo;
  const hidden = ocMapHidden();
  const label = hidden ? 'Показать карту' : 'Скрыть карту';
  const body = g && g.extent
    ? `<div class="geo-map oc-map-box" id="ocMapBox" data-oc-map-box ${hidden ? 'hidden' : ''} role="img" aria-label="Участок на карте по контуру из Кадастра, вокруг — соседние участки и строения"></div>`
    : `<div class="oc-map-none" id="ocMapBox" ${hidden ? 'hidden' : ''}>
        <span>Координаты участка не получены</span>
        <button type="button" class="btn src-btn" data-oc-map-get ${rec.eni ? '' : 'disabled title="Нет кода ЕНИ — координаты можно найти по адресу в форме ОЦ"'}>Получить по ЕНИ</button>
        <span class="src-msg" data-oc-map-msg role="status"></span>
      </div>`;
  return `<div class="oc-map" data-oc-map>
      <div class="sec-h oc-map-h">Участок на карте
        <button type="button" class="btn btn-ghost btn-sm oc-map-tg" data-oc-map-toggle aria-expanded="${!hidden}" aria-controls="ocMapBox">${label}</button>
      </div>
      ${body}
    </div>`;
}
