// Адрес из портала Кадастра по коду ЕНИ — блок 02 «Местоположение».
//
// Подстановка идёт ТОЛЬКО по нажатию кнопки. Автоматическая, по вводу кода, не
// давала убрать адрес вовсе: сотрёшь поля, тронешь код — и они заполнены снова
// (замечание пользователя 09.09.2026).
//
// Обработчик один на форму правки и форму создания: пары таких копий в проекте
// уже расходились, и правка доходила только до одной из них.
//
// Сам запрос — kernel/cadastre.js, там же обходы CORS и тексты ошибок.
import { addressByEni } from './cadastre.js';
import { syncOcAddress, parseAddress } from './address.js';
import { eniCodesOf, formatEniText } from './eniField.js';
import { geoByEni, eniByAddress, centerOf } from './cadastreGeo.js';
import { geoStatus } from './cadastreGeoView.js';
import { esc } from './dom.js';
import { loadMapLibre, createMap, ownParcelsGL } from './mapgl.js';
import { attachCadastreGL } from './cadastreLayersGL.js';

// Поставить значение в поле части адреса.
//
// Область, район и город — выпадающие списки из справочника, и значения, какого
// в справочнике нет, у них просто не существует: присвоение el.value молча
// ничего не сделало бы. Поэтому недостающий вариант добавляем в список и
// помечаем — видно, что справочник его не знает, и значение не потеряно.
export function setAddrField(el, value) {
  if (!el) return;

  if (el.tagName === 'SELECT' && value
      && ![...el.options].some((o) => o.value === value)) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = `${value} — нет в справочнике`;
    el.appendChild(o);
  }

  el.value = value;
}

// Поля блока «Местоположение»: куда раскладывается разобранный адрес. Карта
// общая для разбора вставленной строки и для ответа Кадастра — иначе одно из
// двух со временем отстаёт.
export const ADDR_PARTS = {
  region: '#fRegion',
  district: '#fDistrict',
  city: '#fCity',
  micro: '#fMicro',
  street: '#fStreet',
  house: '#fHouse',
  flat: '#fFlat',
};

// --- координаты участка (строка «Координаты участка», kernel/cadastreGeoView.js) ---
//
// Решения пользователя 13.10.2026: хранится в карточке, блок «Местоположение»;
// заполняется кнопкой по ЕНИ, по адресу, если ЕНИ нет, и массово из реестра.
// Рамка — целиком («забираем всю рамку»), контур — тем же запросом; поле GPS
// получает центр рамки и остаётся правимым.
function ensureCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

// Карта участка — MapLibre GL (видеокарта; переход с Leaflet по указанию
// пользователя 13.10.2026 «Переходи на maplibre»): подложка OSM, сам участок
// — по контуру поверх соседних, вокруг — участки и строения Кадастра, где
// смотришь (kernel/cadastreLayersGL.js).
async function drawGeoMap(box, geo) {
  if (!box || !geo || !geo.extent) return;
  box.hidden = false;
  ensureCss('./app/vendor/maplibre/maplibre-gl.css');
  const gl = await loadMapLibre();
  if (box._map) { box._map.remove(); box._map = null; }
  const map = await createMap(gl, box);
  box._map = map;
  map.scrollZoom.disable();       // колесо — прокрутка карточки, масштаб — кнопками
  attachCadastreGL(gl, map);
  const ext = ownParcelsGL(map, [geo]);
  map.fitBounds(ext, { padding: 24, maxZoom: 19, animate: false });
}

export function bindGeo(ctx, rec) {
  const s = ctx.scope;
  const row = s.$('[data-geo]');
  if (!row) return;
  const btnEni = s.$('#btnGeoEni');
  const btnAddr = s.$('#btnGeoAddr');
  const msg = s.$('#geoMsg');
  const cands = s.$('#geoCands');
  const mapBox = s.$('#geoMap');
  const eniField = s.$('#fEni');
  const say = (text, kind) => { msg.innerHTML = text; msg.className = 'src-msg' + (kind ? ' ' + kind : ''); };
  const codeOf = () => eniCodesOf((eniField || {}).value || rec.eni || '')[0] || '';
  const addrOf = () => ({ region: rec.region, district: rec.district, city: rec.city, street: rec.street, house: rec.house });

  // Кнопки говорят, чего не хватает (практика APCS: недоступная кнопка
  // объясняет причину).
  const refresh = () => {
    const code = codeOf();
    btnEni.disabled = !code;
    btnEni.title = code ? `Рамка и контур участка по ЕНИ ${formatEniText(code)}` : 'Сначала введите код ЕНИ в блоке «Основные параметры»';
    const a = addrOf();
    const ok = a.street && (a.city || a.region);
    btnAddr.disabled = !ok;
    btnAddr.title = ok ? 'Найти ЕНИ участка по адресу в справочнике Кадастра' : 'Нужны населённый пункт (или область) и улица';
  };
  if (eniField) eniField.addEventListener('input', refresh);
  row.addEventListener('mouseenter', refresh);
  refresh();
  if (rec.geo && rec.geo.extent) drawGeoMap(mapBox, rec.geo).catch(() => {});

  const apply = (res, by) => {
    rec.geo = { extent: res.extent, contour: res.contour, house: res.house, eni: res.eni, at: res.at, src: res.src || 'Кадастр', by };
    rec.gps = centerOf(res.extent);
    const gps = s.$('#fGps');
    if (gps) gps.value = rec.gps;
    say(geoStatus(rec.geo), 'ok');
    cands.hidden = true;
    cands.innerHTML = '';
    drawGeoMap(mapBox, rec.geo).catch((e) => console.warn('Карта участка не нарисована', e));
  };
  const busy = (b, on, text) => { b.disabled = on; b.textContent = on ? 'Запрашиваю…' : text; };

  btnEni.onclick = async () => {
    const code = codeOf();
    if (!code) return;
    busy(btnEni, true);
    say('идёт запрос к Кадастру…');
    const res = await geoByEni(code);
    busy(btnEni, false, 'Координаты по ЕНИ');
    refresh();
    if (res.error) { say(esc(res.error), 'err'); return; }
    apply(res, 'ЕНИ');
    ctx.toast('Координаты участка получены из Кадастра', 'ok');
  };

  btnAddr.onclick = async () => {
    busy(btnAddr, true);
    say('ищу адрес в справочнике Кадастра…');
    const found = await eniByAddress(addrOf());
    busy(btnAddr, false, 'Найти по адресу');
    refresh();
    if (found.error) { say(esc(found.error), 'err'); return; }
    // Один участок (без «кв.») — берём сразу и говорим, что взяли; несколько —
    // список на месте: искали — нашлось.
    const plots = found.candidates.filter((c) => !/кв\./.test(c.address));
    if (plots.length === 1) {
      say('нашёлся участок — запрашиваю координаты…');
      const res = await geoByEni(plots[0].eni);
      if (res.error) { say(esc(res.error), 'err'); return; }
      apply(res, 'адрес');
      say(`${geoStatus(rec.geo)} · ЕНИ по Кадастру ${esc(formatEniText(plots[0].eni))}: ${esc(plots[0].address)}`, 'ok');
      return;
    }
    say(`в Кадастре ${found.candidates.length} подходящих — выберите участок`);
    cands.hidden = false;
    cands.innerHTML = `<p class="geo-cands-h">Искали: ${esc([rec.city || rec.region, rec.street, rec.house].filter(Boolean).join(', '))}</p>
      <ul>${found.candidates.map((c, i) => `<li><span>${esc(c.address)}</span><span class="src-code">${esc(formatEniText(c.eni))}</span>
        <button type="button" class="btn src-btn" data-geo-take="${i}">Взять</button></li>`).join('')}</ul>`;
    cands.querySelectorAll('[data-geo-take]').forEach((b) => {
      b.onclick = async () => {
        const c = found.candidates[+b.dataset.geoTake];
        say('запрашиваю координаты…');
        const res = await geoByEni(c.eni);
        if (res.error) { say(esc(res.error), 'err'); return; }
        apply(res, 'адрес');
        say(`${geoStatus(rec.geo)} · ЕНИ по Кадастру ${esc(formatEniText(c.eni))}: ${esc(c.address)}`, 'ok');
      };
    });
  };
}

export function bindCadastre(ctx, rec) {
  const s = ctx.scope;
  bindGeo(ctx, rec);
  const btn = s.$('#btnCadastre');
  if (!btn) return;

  const eniField = s.$('#fEni');
  const codeBox = s.$('#cadCode');
  const msgBox = s.$('#cadMsg');

  const say = (text, kind) => {
    if (!msgBox) return;
    msgBox.textContent = text || '';
    msgBox.className = 'src-msg' + (kind ? ' ' + kind : '');
  };

  // Кодов у записи бывает несколько, а Кадастр отвечает по одному — берём
  // первый, тот же, что уходит в архив и документы.
  const codeOf = () => eniCodesOf((eniField || {}).value || '')[0] || '';

  // Код виден до нажатия: человек проверяет, по чему пойдёт запрос, а не гадает
  // после. Кнопка без кода выключена — незачем звать портал впустую.
  const refresh = () => {
    const code = codeOf();
    if (codeBox) codeBox.textContent = code ? formatEniText(code) : 'код ЕНИ не введён';
    btn.disabled = !code;
    btn.title = code
      ? `Запросить адрес по коду ${formatEniText(code)}`
      : 'Сначала введите код ЕНИ в блоке «Основные параметры»';
  };

  if (eniField) eniField.addEventListener('input', refresh);
  refresh();

  btn.onclick = async () => {
    const code = codeOf();
    if (!code) return;

    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Запрашиваю…';
    say('идёт запрос к порталу…');

    const res = await addressByEni(code);

    btn.textContent = label;
    refresh();

    if (!res.address) {
      // Ответ показываем в самой строке, а не только всплывающим сообщением:
      // причина отказа длинная (перезапустить Live Server, поднять прокси), и
      // всплывашка успевает исчезнуть раньше, чем её дочитают.
      say(res.error || 'адрес не найден', 'err');
      ctx.toast(res.error || 'Адрес не найден', 'warn');
      return;
    }

    // Заполняем и пустые поля, и заполненные: человек сам нажал кнопку, значит
    // ждёт адрес из Кадастра, а не смесь со своим.
    const parsed = parseAddress(res.address);
    Object.entries(ADDR_PARTS).forEach(([key, sel]) => {
      const el = s.$(sel);
      if (!el || !parsed[key]) return;
      setAddrField(el, parsed[key]);
      rec[key] = parsed[key];
    });

    syncOcAddress(rec);
    const box = s.$('[data-addr-sum]');
    if (box) box.value = rec.address;
    if (ctx.updatePlate) ctx.updatePlate();

    say(res.address, 'ok');
    ctx.toast('Адрес заполнен из Кадастра', 'ok');
  };
}
