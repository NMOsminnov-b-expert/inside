// «Аналитика · Земли по айыл аймакам» — отдельная страница (пользователь
// 04.11.2026: «можно добавить отдельную страницу в макете. Что бы в осмотрах
// не городить. Пускай будет аналитикой»; «добавить бы на карте фильтры.
// Например где какая площадь не занята… полезным как для аналитики, так и для
// красивых и удобных демонстраций»).
//
// Раскладка — как «Осмотры» по APCS (решение perestroyka-osmotrov-po-apcs-
// karta-scena-ostrovki-paneli-rezhimov; пользователь 04.11.2026: «Работу с
// картой подтягиваем к тому же со стилей APCS. Позаботься и о плавности всех
// анимаций карты на странице»): карта — сцена на всю рабочую область, сверху
// островки (отбор; «Карта / Таблица» и итоги), слева панель списка аймаков со
// своей прокруткой, скрываемая язычком; «Таблица» — поверхностью над сценой;
// на окнах до 1100 — карта сверху, панели листом ниже. Движение — только
// transform и opacity, одна длительность на событие (практика dvizhenie-
// otvechaet-na-vopros-i-stoit-malo), «меньше движения» — без перелётов.
//
// Что на странице:
//   * отбор на карту, список и таблицу: поиск, область, район; «Отбор» —
//     «Занято, %» от–до, «Не занято от, га», «Только посчитанные»;
//   * итоги по показанному — в островке;
//   * карта: аймаки залиты по доле занятого (5 ступеней одного синего), внутри
//     посчитанных — незанятая земля оранжевым, ОЦ системы точками, участки
//     Кадастра вблизи, границы «Дарек» (кнопка карты); наведение — подсказка,
//     щелчок по аймаку — его строка в таблице, щелчок по строке — карта к аймаку;
//   * таблица аймаков: площадь по контуру и по балансу, занято, не занято, доля,
//     ГФСУ, ОЦ; строка раскрывается — баланс, занятость, ОЦ с ЕНИ.
// Данные — kernel/darekAdmin.js (привязка ОЦ), kernel/landStats.js (контур,
// баланс, занятость по координатам контуров Кадастра). Расчёт — кнопкой на
// аймак или «Посчитать показанные»; всю страну здесь не обходим («Для тестов в
// макете выгружать всю базу не стоит. Можно просто с десяток аймаков пройти»).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: привязка и расчёт — на сервере по выгрузке Кадастра,
// страница только показывает; кнопки расчёта станут датой выгрузки.
import { esc } from '../../kernel/dom.js';
import { OC_TYPES } from '../../kernel/registry.js';
import { scheduleSave } from '../../kernel/persist.js';
import { formatEniText } from '../../kernel/eniField.js';
import { enhanceSelects } from '../../kernel/dropdown.js';
import { loadMapLibre, createMap, hoverTip, emptyFC } from '../../kernel/mapgl.js';
import { attachCadastreGL } from '../../kernel/cadastreLayersGL.js';
import { fillAdmin, pointOf } from '../../kernel/darekAdmin.js';
import { allAimaks, aimakAt, estimateAimak, loadSeed, seedAdmOf, exportSeed } from '../../kernel/landStats.js';

const SEARCH_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
// Типы ОЦ с участком (у ТС и механизмов земли нет).
const LAND_TYPES = new Set(['residential-house', 'apartment', 'civil', 'land-plot']);
// Доля занятого — 5 ступеней одного синего (последовательная шкала, светлое —
// мало занято); незанятая земля — оранжевым поверх (другая сущность — другой цвет).
const STEPS = [
  { to: 0.2, color: '#cde2fb', label: 'до 20 %' },
  { to: 0.4, color: '#9ec5f4', label: '20–40 %' },
  { to: 0.6, color: '#5598e7', label: '40–60 %' },
  { to: 0.8, color: '#256abf', label: '60–80 %' },
  { to: 1.01, color: '#104281', label: '80–100 %' },
];
const FREE_COLOR = '#e8730c';
const LAYERS = [
  { key: 'share', label: 'Занятость аймаков' },
  { key: 'free', label: 'Незанятая земля' },
  { key: 'objs', label: 'ОЦ системы' },
  { key: 'cad', label: 'Участки Кадастра' },
];

const nf = (n, d = 2) => (n == null || !Number.isFinite(n) ? '' : n.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (x) => (x == null || !Number.isFinite(x) ? '' : (x * 100).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %');
const dateOf = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
const digits = (s) => String(s || '').replace(/\D/g, '');
const numIn = (v) => { const n = parseFloat(String(v || '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

// Рамка контура [[запад, юг], [восток, север]].
function boundsOf(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let b = null;
  polys.forEach((rings) => rings[0].forEach(([x, y]) => {
    b = b ? [[Math.min(b[0][0], x), Math.min(b[0][1], y)], [Math.max(b[1][0], x), Math.max(b[1][1], y)]] : [[x, y], [x, y]];
  }));
  return b;
}

export function mountAnalytics(host) {
  const { scope } = host;
  const view = {
    q: '', oblast: '', district: '', shareFrom: '', shareTo: '', freeFrom: '', onlyDone: false,
    open: new Set(), sel: '', layers: { share: true, free: true, objs: true, cad: true },
    mode: 'map', hideList: false, facets: false,
  };
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOVE_MS = reduce ? 0 : 650;   // перелёт карты к аймаку
  let sceneEl = null;
  const runs = new Map();   // код аймака → { done, total, ctrl, error }
  let batch = null;         // «Посчитать показанные»: { left, ctrl }
  let binding = { busy: false, error: '' };
  let dead = false;
  let gl = null;
  let map = null;
  let tip = null;

  // ОЦ с участком: запись, тип, заголовок, ссылка.
  const objects = () => {
    const out = [];
    OC_TYPES.filter((t) => LAND_TYPES.has(t.manifest.id)).forEach((t) => {
      const recs = t.records.allRecords ? t.records.allRecords() : [];
      recs.forEach((rec) => {
        if (!rec || !rec.id) return;
        let title = rec.address || rec.title || rec.id;
        try { if (t.records.summarize) title = t.records.summarize(rec).title || title; } catch (e) { /* сводка не собралась — адрес */ }
        out.push({ rec, typeId: t.manifest.id, typeLabel: t.manifest.label || '', title, href: `#/oc/${t.manifest.id}/${rec.id}` });
      });
    });
    return out;
  };

  const rows = () => {
    const by = new Map();
    objects().forEach((o) => { const c = o.rec.adm && o.rec.adm.aimakCode; if (c) (by.get(c) || by.set(c, []).get(c)).push(o); });
    return allAimaks().map((a) => ({ a, objs: by.get(a.code) || [] }))
      .sort((x, y) => (x.a.oblast || '').localeCompare(y.a.oblast || '', 'ru') || (x.a.district || '').localeCompare(y.a.district || '', 'ru') || (x.a.aimak || '').localeCompare(y.a.aimak || '', 'ru'));
  };

  const matches = (r) => {
    const a = r.a;
    if (view.oblast && a.oblast !== view.oblast) return false;
    if (view.district && a.district !== view.district) return false;
    const sf = numIn(view.shareFrom);
    const st = numIn(view.shareTo);
    const ff = numIn(view.freeFrom);
    if ((view.onlyDone || sf != null || st != null || ff != null) && !a.occ) return false;
    if (sf != null && a.occ.share * 100 < sf) return false;
    if (st != null && a.occ.share * 100 > st) return false;
    if (ff != null && a.occ.freeHa < ff) return false;
    const q = view.q.trim().toLowerCase();
    if (!q) return true;
    const qd = digits(q);
    const text = [a.aimak, a.code, a.district, a.oblast, ...r.objs.map((o) => `${o.title} ${o.rec.eni || ''} ${(o.rec.adm && o.rec.adm.quarter) || ''}`)].join(' ').toLowerCase();
    return text.includes(q) || (qd.length >= 4 && r.objs.some((o) => digits(o.rec.eni).includes(qd)));
  };

  const options = (list, cur, all) => `<option value="">${all}</option>${[...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'))
    .map((v) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('')}`;

  // --- островки: отбор, режим, итоги ---
  const facetCount = () => [view.shareFrom, view.shareTo, view.freeFrom].filter((v) => numIn(v) != null).length + (view.onlyDone ? 1 : 0);
  const islesHTML = (all, shown) => {
    const done = shown.filter((r) => r.a.occ);
    const area = done.reduce((s, r) => s + r.a.areaHa, 0);
    const occ = done.reduce((s, r) => s + r.a.occ.occHa, 0);
    const todo = shown.filter((r) => !r.a.occ && !runs.has(r.a.code)).length;
    const fc = facetCount();
    const kv = (label, value, sub = '') => `<span class="an-kv"><span>${label}</span><b>${value}</b>${sub ? `<i>${sub}</i>` : ''}</span>`;
    return `<div class="an-isl an-isl-filter">
        <span class="isearch">${SEARCH_ICON}<input data-an-q value="${esc(view.q)}" autocomplete="off" placeholder="Айыл аймак, код, ЕНИ, адрес" aria-label="Поиск по аймакам и объектам">
          ${view.q ? '<button class="isearch-clear" data-an-q-clear title="Очистить" aria-label="Очистить поиск">×</button>' : ''}</span>
        <select class="select an-f" data-an-oblast aria-label="Область">${options(all.map((r) => r.a.oblast), view.oblast, 'Все области')}</select>
        <select class="select an-f" data-an-district aria-label="Район">${options(all.filter((r) => !view.oblast || r.a.oblast === view.oblast).map((r) => r.a.district), view.district, 'Все районы')}</select>
        <button type="button" class="btn btn-ghost an-fbtn${view.facets ? ' on' : ''}" data-an-facets aria-expanded="${view.facets}" aria-controls="anFacets">Отбор${fc ? `<b>${fc}</b>` : ''}</button>
      </div>
      <div class="an-isl an-isl-sum">
        <span class="an-seg" role="group" aria-label="Вид">
          <button type="button" class="itab${view.mode === 'map' ? ' on' : ''}" data-an-mode="map" aria-pressed="${view.mode === 'map'}">Карта</button>
          <button type="button" class="itab${view.mode === 'table' ? ' on' : ''}" data-an-mode="table" aria-pressed="${view.mode === 'table'}">Таблица</button>
        </span>
        ${kv('Посчитано', `${done.length} из ${shown.length}`)}
        ${kv('Площадь, га', nf(area, 0))}
        ${kv('Занято, га', nf(occ, 0), area ? pct(occ / area) : '')}
        ${kv('Не занято, га', nf(area - occ, 0), area ? pct((area - occ) / area) : '')}
        ${batch ? `<span class="an-run" role="status">осталось: ${batch.left}</span><button type="button" class="btn btn-ghost btn-sm" data-an-batch-stop>Стоп</button>`
          : `<button type="button" class="btn btn-primary" data-an-batch ${todo ? '' : 'disabled'} title="${todo ? 'Посчитать по очереди непосчитанные аймаки из показанных' : 'Все показанные посчитаны'}">Посчитать показанные${todo ? ` · ${todo}` : ''}</button>`}
      </div>`;
  };
  const facetsHTML = () => `<div class="an-facets-in">
      <label class="an-range" title="Доля площади аймака под участками с ЕНИ"><span>Занято, %</span>
        <input class="an-num" data-an-f="shareFrom" inputmode="decimal" value="${esc(view.shareFrom)}" placeholder="от" aria-label="Занято, % от">
        <input class="an-num" data-an-f="shareTo" inputmode="decimal" value="${esc(view.shareTo)}" placeholder="до" aria-label="Занято, % до"></label>
      <label class="an-range" title="Незанятая площадь аймака не меньше, га"><span>Не занято, га</span>
        <input class="an-num an-num-w" data-an-f="freeFrom" inputmode="decimal" value="${esc(view.freeFrom)}" placeholder="от" aria-label="Не занято, га от"></label>
      <label class="an-check"><input type="checkbox" data-an-done ${view.onlyDone ? 'checked' : ''}> Только посчитанные</label>
      ${facetCount() ? '<button type="button" class="btn btn-ghost btn-sm" data-an-facets-clear>Сбросить</button>' : ''}
    </div>`;
  const statusText = (all, shown) => {
    const objs = objects();
    const withPoint = objs.filter((o) => pointOf(o.rec)).length;
    const bound = objs.filter((o) => o.rec.adm && o.rec.adm.aimakCode).length;
    return `ОЦ с точкой на карте: ${withPoint} · привязано к аймаку: ${bound}${binding.busy ? ' · идёт привязка…' : ''}${binding.error ? ` · ${esc(binding.error)}` : ''} · аймаков: ${all.length} · показано: ${shown.length}`;
  };

  // --- панель списка: строки-карточки ---
  const listHTML = (all, shown) => {
    if (!all.length) return `<p class="an-empty-page">${binding.busy ? 'Привязываю объекты к аймакам…' : 'Нет объектов с точкой на карте: аймаки появятся, когда у объектов будут координаты участка или GPS.'}</p>`;
    if (!shown.length) return '<p class="an-empty-page">Ничего не найдено</p>';
    return `<ul class="an-items">${shown.map((r) => {
      const a = r.a;
      const open = view.open.has(a.code);
      const run = runs.get(a.code);
      const going = run && !run.error && run.done < run.total;
      const sw = a.occ ? STEPS.find((x) => a.occ.share < x.to).color : '';
      return `<li class="an-item${open ? ' open' : ''}${view.sel === a.code ? ' sel' : ''}" data-an-open="${esc(a.code)}" aria-expanded="${open}" tabindex="0">
        <div class="an-it-h">${sw ? `<span class="an-sw" style="background:${sw}" aria-hidden="true"></span>` : ''}<b>${esc(a.aimak)}</b>
          <span class="an-it-share num">${a.occ ? pct(a.occ.share) : ''}</span></div>
        <div class="an-it-s"><span>${esc([a.code, a.district, a.oblast].filter(Boolean).join(' · '))}</span>
          <span class="num">${a.occ ? `не занято ${nf(a.occ.freeHa, 0)} га` : ''}</span></div>
        <div class="an-it-m"><span class="num">площадь ${nf(a.areaHa, 0)} га${a.balance ? ` · по балансу ${nf(a.balance.total, 0)}` : ''}${r.objs.length ? ` · ОЦ ${r.objs.length}` : ''}</span>
          <span class="an-it-act">${runCell(a)}</span></div>
        ${going ? `<div class="an-bar" aria-hidden="true"><i style="transform:scaleX(${(run.done / run.total).toFixed(3)})"></i></div>` : ''}
        ${open ? detailHTML(r) : ''}
      </li>`;
    }).join('')}</ul>`;
  };

  const runCell = (a) => {
    const r = runs.get(a.code);
    if (r && !r.error && r.done < r.total) {
      return `<span class="an-run" role="status">квадратов ${r.done} из ${r.total}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-an-stop="${esc(a.code)}">Стоп</button>`;
    }
    const label = a.occ ? 'Пересчитать' : 'Посчитать';
    const title = a.occ ? `Посчитано ${dateOf(a.occ.at)}: участков ${a.occ.parcels.toLocaleString('ru-RU')}` : 'Занятость участками с ЕНИ — по контурам Кадастра в границах аймака';
    return `${r && r.error ? `<span class="an-err" title="${esc(r.error)}">не посчитано</span>` : ''}
      <button type="button" class="btn btn-ghost btn-sm" data-an-run="${esc(a.code)}" title="${esc(title)}">${label}</button>`;
  };

  const detailHTML = ({ a, objs }) => {
    const bal = a.balance && a.balance.parts && a.balance.parts.length ? `<div class="an-d-sec"><h3>Земельный баланс аймака, га</h3>
      <dl class="an-bal">${a.balance.parts.map((p) => `<dt>${esc(p.label)}</dt><dd class="num">${nf(p.ha, 0)}</dd>`).join('')}
      <dt class="an-bal-total">Всего</dt><dd class="num an-bal-total">${nf(a.balance.total, 0)}</dd></dl></div>` : '';
    const occ = a.occ ? `<div class="an-d-sec"><h3>Занятость участками с ЕНИ</h3>
      <dl class="an-bal"><dt>Занято</dt><dd class="num">${nf(a.occ.occHa)} га · ${pct(a.occ.share)}</dd>
      <dt>Не занято</dt><dd class="num">${nf(a.occ.freeHa)} га · ${pct(1 - a.occ.share)}</dd>
      <dt>ГФСУ</dt><dd class="num">${nf(a.occ.gfsuHa)} га · ${pct(a.occ.gfsuShare)}</dd>
      <dt>Участков в расчёте</dt><dd class="num">${a.occ.parcels.toLocaleString('ru-RU')}</dd></dl>
      <p class="an-d-note">Посчитано ${dateOf(a.occ.at)} по контурам участков Кадастра в границах аймака; ГФСУ — по слою карты «Дарек».</p></div>` : '';
    const list = objs.length ? `<div class="an-d-sec an-d-objs"><h3>ОЦ системы в аймаке</h3>
      <table class="an-objs"><thead><tr><th>ЕНИ</th><th>Объект</th><th>Квартал</th><th>Земли в точке</th></tr></thead><tbody>
      ${objs.map((o) => {
        const ad = o.rec.adm || {};
        const lands = (ad.lands || []).map((l) => [l.kind, l.use, l.area, l.eni && `ЕНИ ${l.eni}`, l.note].filter(Boolean).join(', ')).join('; ');
        return `<tr><td class="an-eni">${esc(o.rec.eni ? formatEniText(digits(o.rec.eni).slice(0, 13)) : '—')}</td>
          <td><a href="${esc(o.href)}">${esc(o.title)}</a><span class="an-sub">${esc(o.typeLabel)}${ad.by ? ` · точка: ${esc(ad.by)}` : ''}</span></td>
          <td>${esc(ad.quarter || '')}${ad.coate ? `<span class="an-sub">СОАТЕ ${esc(ad.coate)}</span>` : ''}</td>
          <td>${esc(lands || '—')}</td></tr>`;
      }).join('')}</tbody></table></div>` : '';
    return `<div class="an-detail">${bal}${occ}${list}</div>`;
  };

  const tableHTML = (all, shown) => {
    if (!all.length) return `<p class="an-empty-page">${binding.busy ? 'Привязываю объекты к аймакам…' : 'Нет объектов с точкой на карте.'}</p>`;
    const done = shown.filter((r) => r.a.occ);
    const sum = (f) => done.reduce((s, r) => s + (f(r.a) || 0), 0);
    const tArea = sum((a) => a.areaHa);
    const tOcc = sum((a) => a.occ.occHa);
    const body = shown.map((r) => {
      const a = r.a;
      const open = view.open.has(a.code);
      return `<tr class="an-row${open ? ' open' : ''}${view.sel === a.code ? ' sel' : ''}" data-an-open="${esc(a.code)}" aria-expanded="${open}" tabindex="0">
          <td class="an-name"><span class="an-caret" aria-hidden="true">${open ? '▾' : '▸'}</span>${a.occ ? `<span class="an-sw" style="background:${STEPS.find((s) => a.occ.share < s.to).color}" aria-hidden="true"></span>` : ''}<b>${esc(a.aimak)}</b><span class="an-sub">${esc(a.code)}</span></td>
          <td>${esc(a.district)}</td><td>${esc(a.oblast)}</td>
          <td class="num">${nf(a.areaHa)}</td>
          <td class="num">${a.balance ? nf(a.balance.total, 0) : ''}</td>
          <td class="num">${a.occ ? nf(a.occ.occHa) : ''}</td>
          <td class="num">${a.occ ? nf(a.occ.freeHa) : ''}</td>
          <td class="num">${a.occ ? pct(a.occ.share) : ''}</td>
          <td class="num">${a.occ ? nf(a.occ.gfsuHa) : ''}</td>
          <td class="num">${r.objs.length || ''}</td>
          <td class="an-act">${runCell(a)}</td>
        </tr>${open ? `<tr class="an-drow"><td colspan="11">${detailHTML(r)}</td></tr>` : ''}`;
    }).join('');
    return `<div class="icols an-wrap"><table class="itbl an-tbl">
        <colgroup><col class="c-name"><col class="c-dist"><col class="c-obl"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-p"><col class="c-n"><col class="c-oc"><col class="c-act"></colgroup>
        <thead><tr>
          <th>Айыл аймак</th><th>Район</th><th>Область</th>
          <th class="num" title="Площадь аймака по его контуру на карте «Дарек»">Площадь, га</th>
          <th class="num" title="Общая площадь по земельному балансу аймака (Кадастр)">По балансу, га</th>
          <th class="num" title="Площадь под участками с ЕНИ в границах аймака">Занято, га</th>
          <th class="num" title="Площадь аймака без участков с ЕНИ">Не занято, га</th>
          <th class="num" title="Доля площади аймака под участками с ЕНИ">Занято</th>
          <th class="num" title="Государственный фонд сельскохозяйственных угодий">ГФСУ, га</th>
          <th class="num" title="Объектов оценки системы в аймаке">ОЦ</th>
          <th><span class="sr-only">Расчёт</span></th>
        </tr></thead>
        <tbody>${body || '<tr><td colspan="11" class="an-empty">Ничего не найдено</td></tr>'}</tbody>
        ${done.length ? `<tfoot><tr><td colspan="3">Итого по посчитанным: ${done.length}</td><td class="num">${nf(tArea)}</td><td></td>
          <td class="num">${nf(tOcc)}</td><td class="num">${nf(tArea - tOcc)}</td><td class="num">${pct(tArea ? tOcc / tArea : null)}</td>
          <td class="num">${nf(sum((a) => a.occ.gfsuHa))}</td><td colspan="2"></td></tr></tfoot>` : ''}
      </table></div>`;
  };

  // --- карта ---
  const legendHTML = () => `<div class="an-legend" aria-label="Легенда карты">
      <b>Занято участками с ЕНИ</b>
      <ul>${STEPS.map((s) => `<li><i style="background:${s.color}"></i>${s.label}</li>`).join('')}
        <li><i class="an-lg-none"></i>не посчитано</li>
        <li><i style="background:${FREE_COLOR}"></i>незанятая земля</li></ul>
    </div>`;
  const layersHTML = () => `<fieldset class="an-layers"><legend>Слои</legend>
      ${LAYERS.map((l) => `<label><input type="checkbox" data-an-layer="${l.key}" ${view.layers[l.key] ? 'checked' : ''}> ${l.label}</label>`).join('')}
    </fieldset>`;

  const freeIds = new Set();
  let freeShown = new Set();
  const syncMap = (shown) => {
    if (!map || !map.getSource('aim')) return;
    const feats = shown.map(({ a, objs }) => ({
      type: 'Feature', geometry: a.geometry,
      properties: { code: a.code, share: a.occ ? a.occ.share : -1, sel: view.sel === a.code, oc: objs.length },
    }));
    map.getSource('aim').setData({ type: 'FeatureCollection', features: feats });
    const pts = shown.flatMap(({ objs }) => objs).map((o) => {
      const p = pointOf(o.rec);
      return p && { type: 'Feature', geometry: { type: 'Point', coordinates: [p[1], p[0]] }, properties: { title: o.title, href: o.href, eni: o.rec.eni || '' } };
    }).filter(Boolean);
    map.getSource('objs').setData({ type: 'FeatureCollection', features: pts });
    // Незанятая земля — картинка на посчитанный аймак.
    // Скрытые отбором не снимаются с карты, а прячутся: снятие во время загрузки
    // картинки обрывает её с ошибкой в консоли.
    freeShown = new Set(shown.filter((r) => r.a.occ && r.a.occ.free).map((r) => r.a.code));
    shown.filter((r) => freeShown.has(r.a.code)).forEach(({ a }) => {
      const id = 'free-' + a.code;
      const src = map.getSource(id);
      if (src) {
        if (src._at !== a.occ.at) { src.updateImage({ url: a.occ.free.url, coordinates: a.occ.free.coords }); src._at = a.occ.at; }
        return;
      }
      map.addSource(id, { type: 'image', url: a.occ.free.url, coordinates: a.occ.free.coords });
      map.getSource(id)._at = a.occ.at;
      map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0.55, 'raster-opacity-transition': { duration: reduce ? 0 : 300, delay: 0 }, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' } }, 'aim-line');
      freeIds.add(a.code);
    });
    applyLayers();
  };

  const applyLayers = () => {
    if (!map) return;
    const vis = (on) => (on ? 'visible' : 'none');
    if (map.getLayer('aim-fill')) map.setLayoutProperty('aim-fill', 'visibility', vis(view.layers.share));
    freeIds.forEach((c) => map.setLayoutProperty('free-' + c, 'visibility', vis(view.layers.free && freeShown.has(c))));
    if (map.getLayer('objs')) map.setLayoutProperty('objs', 'visibility', vis(view.layers.objs));
    (map.getStyle().layers || []).filter((l) => l.source === 'cadP' || l.source === 'cadB')
      .forEach((l) => map.setLayoutProperty(l.id, 'visibility', vis(view.layers.cad)));
  };

  // Поля карты: слева — панель списка (если не скрыта), сверху — островки.
  const padding = () => {
    const list = scope.root.querySelector('.an-list');
    const wide = innerWidth > 1100;
    const left = wide && list && !view.hideList ? list.getBoundingClientRect().width + 30 : 30;
    return { top: wide ? 80 : 30, bottom: 40, left, right: 60 };
  };
  const ease = (t) => 1 - (1 - t) ** 3;
  const flyTo = (code) => {
    const a = allAimaks().find((x) => x.code === code);
    if (map && a && a.geometry) map.fitBounds(boundsOf(a.geometry), { padding: padding(), maxZoom: 13, duration: MOVE_MS, easing: ease, essential: false });
  };

  const tipHTML = (code) => {
    const r = rows().find((x) => x.a.code === code);
    if (!r) return '';
    const a = r.a;
    return `<div class="an-tip"><b>${esc(a.aimak)}</b><span>${esc([a.district, a.oblast].filter(Boolean).join(', '))} · код ${esc(a.code)}</span>
      <dl><dt>Площадь</dt><dd>${nf(a.areaHa, 0)} га</dd>
      ${a.occ ? `<dt>Занято</dt><dd>${nf(a.occ.occHa, 0)} га · ${pct(a.occ.share)}</dd><dt>Не занято</dt><dd>${nf(a.occ.freeHa, 0)} га · ${pct(1 - a.occ.share)}</dd>`
        : '<dt>Занятость</dt><dd>не посчитана</dd>'}
      ${r.objs.length ? `<dt>ОЦ системы</dt><dd>${r.objs.length}</dd>` : ''}</dl></div>`;
  };

  const mountMap = async () => {
    gl = await loadMapLibre(host.ensureStyle);
    if (dead) return;
    // Сцена — слоем под страницей в рабочей области каркаса (.main-row), как в «Осмотрах».
    sceneEl = document.createElement('div');
    sceneEl.className = 'an-scene';
    sceneEl.setAttribute('role', 'img');
    sceneEl.setAttribute('aria-label', 'Карта: аймаки по доле занятой земли, незанятая земля, объекты оценки');
    const row = document.querySelector('.main-row') || document.body;
    row.insertBefore(sceneEl, row.firstChild);
    map = await createMap(gl, sceneEl, { center: [74.6, 41.4], zoom: 5.6, fadeDuration: reduce ? 0 : 200 });
    if (dead) { map.remove(); return; }
    attachCadastreGL(gl, map);
    const firstCad = (map.getStyle().layers || []).find((l) => l.source === 'cadP' || l.source === 'cadB');
    const before = firstCad ? firstCad.id : undefined;
    map.addSource('aim', { type: 'geojson', data: emptyFC() });
    map.addSource('objs', { type: 'geojson', data: emptyFC() });
    const color = ['step', ['get', 'share'], STEPS[0].color, ...STEPS.slice(1).flatMap((s, i) => [STEPS[i].to, s.color])];
    // Переходы раскраски — одной длительностью: посчитанный аймак проявляется, а не вспыхивает.
    const fade = { duration: reduce ? 0 : 300, delay: 0 };
    map.addLayer({ id: 'aim-fill', type: 'fill', source: 'aim', filter: ['>=', ['get', 'share'], 0],
      paint: { 'fill-color': color, 'fill-color-transition': fade, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.62, 12, 0.3], 'fill-opacity-transition': fade } }, before);
    map.addLayer({ id: 'aim-hit', type: 'fill', source: 'aim', paint: { 'fill-color': '#000', 'fill-opacity': 0 } }, before);
    // Контур: посчитанный — сплошной, непосчитанный — пунктиром; выбранный — толще и темнее.
    const lineW = ['case', ['get', 'sel'], 3, 1.2];
    const lineC = ['case', ['get', 'sel'], '#0d366b', '#1c5cab'];
    map.addLayer({ id: 'aim-line', type: 'line', source: 'aim', filter: ['>=', ['get', 'share'], 0], paint: { 'line-color': lineC, 'line-width': lineW } }, before);
    map.addLayer({ id: 'aim-line-none', type: 'line', source: 'aim', filter: ['<', ['get', 'share'], 0],
      paint: { 'line-color': lineC, 'line-width': lineW, 'line-dasharray': [2, 1.5] } }, before);
    map.addLayer({ id: 'objs', type: 'circle', source: 'objs',
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4, 14, 7], 'circle-color': '#0d366b', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    tip = hoverTip(gl, map);
    const cadAt = (pt) => map.queryRenderedFeatures(pt).some((f) => f.source === 'cadP' || f.source === 'cadB' || f.layer.id === 'objs');
    map.on('mousemove', 'aim-hit', (e) => {
      if (cadAt(e.point)) { tip.hide(); return; }
      const c = e.features[0] && e.features[0].properties.code;
      if (c) { map.getCanvas().style.cursor = 'pointer'; tip.show(e.lngLat, tipHTML(c)); }
    });
    map.on('mouseleave', 'aim-hit', () => { map.getCanvas().style.cursor = ''; tip.hide(); });
    map.on('click', 'aim-hit', (e) => {
      if (cadAt(e.point)) return;
      const c = e.features[0] && e.features[0].properties.code;
      if (!c) return;
      view.sel = c;
      view.open.add(c);
      update();
      const row = scope.root.querySelector(`[data-an-open="${CSS.escape(c)}"]`);
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    map.on('click', 'objs', (e) => {
      const p = e.features[0].properties;
      new gl.Popup({ closeButton: true, maxWidth: '300px', className: 'map-tip-gl an-pop' }).setLngLat(e.lngLat)
        .setHTML(`<b><a href="${esc(p.href)}">${esc(p.title)}</a></b>${p.eni ? `<i>ЕНИ ${esc(p.eni)}</i>` : ''}`).addTo(map);
    });
    map.on('mouseenter', 'objs', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'objs', () => { map.getCanvas().style.cursor = ''; });
    await loadSeed();
    if (dead) return;
    update();
    const all = allAimaks().filter((a) => a.geometry);
    if (all.length) {
      const b = all.map((a) => boundsOf(a.geometry)).reduce((x, y) => [[Math.min(x[0][0], y[0][0]), Math.min(x[0][1], y[0][1])], [Math.max(x[1][0], y[1][0]), Math.max(x[1][1], y[1][1])]]);
      map.fitBounds(b, { padding: padding(), animate: false });
    }
  };

  // --- отрисовка ---
  const update = () => {
    if (dead) return;
    const all = rows();
    const shown = all.filter(matches);
    const page = scope.root.querySelector('.an-page');
    if (!page) return;
    page.classList.toggle('hide-list', view.hideList);
    document.body.classList.toggle('an-list-hidden', view.hideList);
    page.classList.toggle('on-table', view.mode === 'table');
    page.classList.toggle('facets-open', view.facets);
    document.body.classList.toggle('an-table-open', view.mode === 'table');
    const isles = page.querySelector('[data-an-isles]');
    const active = document.activeElement;
    const keep = active && page.contains(active) && active.matches('input[data-an-q],input[data-an-f]')
      ? { sel: active.matches('[data-an-q]') ? '[data-an-q]' : `[data-an-f="${active.dataset.anF}"]`, s: active.selectionStart, e: active.selectionEnd } : null;
    isles.innerHTML = islesHTML(all, shown);
    enhanceSelects(isles);
    page.querySelector('[data-an-facets-box]').innerHTML = facetsHTML();
    page.querySelector('[data-an-status]').innerHTML = statusText(all, shown);
    const list = page.querySelector('[data-an-list]');
    const top = list.scrollTop;
    list.innerHTML = listHTML(all, shown);
    list.scrollTop = top;
    if (view.mode === 'table') page.querySelector('[data-an-table]').innerHTML = tableHTML(all, shown);
    if (keep) { const i = page.querySelector(keep.sel); if (i) { i.focus(); try { i.setSelectionRange(keep.s, keep.e); } catch (e) { /* поле без выделения */ } } }
    syncMap(shown);
  };

  scope.setHTML(`<div class="an-page">
      <h1 class="sr-only">Земли по айыл аймакам</h1>
      <div class="an-isles" data-an-isles></div>
      <div class="an-facets" id="anFacets" data-an-facets-box></div>
      <aside class="an-list" aria-label="Айыл аймаки">
        <p class="an-status" role="status" data-an-status></p>
        <div class="an-list-body" data-an-list></div>
      </aside>
      <button type="button" class="an-edge" data-an-edge aria-label="Скрыть список аймаков" title="Скрыть список аймаков">‹</button>
      <section class="an-sheet" aria-label="Таблица аймаков"><div class="an-sheet-body" data-an-table></div></section>
      ${layersHTML()}
      ${legendHTML()}
    </div>`);

  // --- действия ---
  const run = async (code) => {
    const ctrl = { aborted: false };
    runs.set(code, { done: 0, total: 1, ctrl });
    update();
    try {
      await estimateAimak(code, { signal: ctrl, onProgress: (d, n) => { runs.set(code, { done: d, total: n, ctrl }); update(); } });
      runs.delete(code);
    } catch (e) {
      runs.set(code, { done: 0, total: 0, ctrl, error: e.message || String(e) });
    }
    update();
  };
  const runBatch = async () => {
    const codes = rows().filter(matches).filter((r) => !r.a.occ && !runs.has(r.a.code)).map((r) => r.a.code);
    batch = { left: codes.length, ctrl: { aborted: false } };
    update();
    for (const c of codes) {
      if (dead || batch.ctrl.aborted) break;
      await run(c);
      batch.left--;
      update();
    }
    batch = null;
    update();
  };

  scope.on('click', '[data-an-run]', (e, t) => { e.stopPropagation(); run(t.dataset.anRun); });
  scope.on('click', '[data-an-stop]', (e, t) => { e.stopPropagation(); const r = runs.get(t.dataset.anStop); if (r) r.ctrl.aborted = true; });
  scope.on('click', '[data-an-batch]', () => { runBatch(); });
  scope.on('click', '[data-an-batch-stop]', () => { if (batch) { batch.ctrl.aborted = true; runs.forEach((r) => { r.ctrl.aborted = true; }); } });
  scope.on('click', '[data-an-q-clear]', () => { view.q = ''; update(); });
  scope.on('click', '[data-an-facets]', () => { view.facets = !view.facets; update(); });
  scope.on('click', '[data-an-facets-clear]', () => { view.shareFrom = ''; view.shareTo = ''; view.freeFrom = ''; view.onlyDone = false; update(); });
  scope.on('click', '[data-an-mode]', (e, t) => { view.mode = t.dataset.anMode; update(); });
  scope.on('click', '[data-an-edge]', (e, t) => {
    view.hideList = !view.hideList;
    t.textContent = view.hideList ? '›' : '‹';
    t.setAttribute('aria-label', view.hideList ? 'Показать список аймаков' : 'Скрыть список аймаков');
    t.title = t.getAttribute('aria-label');
    update();
  });
  // Строка таблицы — тот же выбор, что в списке: карта к аймаку, вид — карта.
  scope.on('click', '.an-tbl [data-an-open]', (e, t) => {
    if (e.target.closest('a,button')) return;
    view.mode = 'map';
  });
  scope.on('click', '[data-an-open]', (e, t) => {
    if (e.target.closest('a,button,select,input')) return;
    const c = t.dataset.anOpen;
    if (view.open.has(c)) view.open.delete(c); else view.open.add(c);
    view.sel = c;
    update();
    flyTo(c);
  });
  scope.on('keydown', '[data-an-open]', (e, t) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === t) { e.preventDefault(); t.click(); }
  });
  scope.on('input', '[data-an-q]', (e, t) => { view.q = t.value; update(); });
  scope.on('input', '[data-an-f]', (e, t) => { view[t.dataset.anF] = t.value; update(); });
  scope.on('change', '[data-an-done]', (e, t) => { view.onlyDone = t.checked; update(); });
  scope.on('change', '[data-an-oblast]', (e, t) => { view.oblast = t.value; view.district = ''; update(); });
  scope.on('change', '[data-an-district]', (e, t) => { view.district = t.value; update(); });
  scope.on('change', '[data-an-layer]', (e, t) => { view.layers[t.dataset.anLayer] = t.checked; applyLayers(); });

  // --- привязка фоном: объекты → аймак, аймаки без контура → контур ---
  const bind = async () => {
    binding = { busy: true, error: '' };
    update();
    await loadSeed();
    // Привязки из готовых данных — записям без своей.
    objects().forEach((o) => { if (!o.rec.adm) { const s = seedAdmOf(o.typeId, o.rec.id); if (s) o.rec.adm = s; } });
    update();
    const recs = objects().map((o) => o.rec);
    let failed = 0;
    await fillAdmin(recs, () => { scheduleSave(); update(); });
    const known = new Set(allAimaks().map((a) => a.code));
    const need = new Map();
    recs.forEach((r) => { const c = r.adm && r.adm.aimakCode; if (c && !known.has(c) && !need.has(c)) need.set(c, pointOf(r)); });
    for (const [, pt] of need) {
      if (dead) return;
      try { await aimakAt(pt[0], pt[1]); } catch (e) { failed++; }
      update();
    }
    binding = { busy: false, error: failed ? `контур не получен у аймаков: ${failed}` : '' };
    update();
  };

  host.setCrumbs([{ label: 'Аналитика' }, { label: 'Земли по айыл аймакам' }]);
  update();
  mountMap().catch((e) => console.warn('Карта аналитики не нарисована', e));
  bind().catch((e) => { binding = { busy: false, error: 'Дарек не ответил' }; update(); console.warn('Привязка к аймакам', e); });

  // Для сборки файла готовых данных (tools/analytics/build_land_seed.py).
  host.exportLandSeed = () => exportSeed(objects());
  window.__anExport = () => exportSeed(objects());

  return {
    onRoute() { update(); },
    destroy() {
      dead = true;
      runs.forEach((r) => { if (r.ctrl) r.ctrl.aborted = true; });
      if (batch) batch.ctrl.aborted = true;
      if (map) { map.remove(); map = null; }
      if (sceneEl) { sceneEl.remove(); sceneEl = null; }
      delete window.__anExport;
      document.body.classList.remove('an-table-open', 'an-list-hidden');
    },
  };
}
