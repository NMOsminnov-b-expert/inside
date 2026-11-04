// «Аналитика · Участки» — сводка по участкам с ЕНИ, собранным при расчёте
// аймаков (kernel/landStats.js, parcelStats; файл готовых данных
// app/data/analytics/land-parcels.json).
//
// Пользователь 04.11.2026: «нужна сводка по тому, что вытащили. Сколько в гос
// собственности, сколько в частной. Что без меток. На отдельный экран в
// аналитике. Нужно добавить всевозможные срезы… Надо будет продемонстрировать
// возможности».
//
// Срезы — перекрёстные (как в аналитических панелях): щелчок по столбцу любого
// среза отбирает участки, остальные срезы пересчитываются по отобранному; свой
// срез считается без своего отбора — видно, из чего выбирать. Мера — число
// участков или площадь (по контуру участка). Значения — как в Кадастре, без
// толкования: «Без метки» — поле в Кадастре пустое.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: срезы — запросами к базе участков (выгрузка Кадастра),
// а не по строкам в браузере.
import { esc } from '../../kernel/dom.js';

const NONE = 'Без метки';
// Классы площади участка, га — от приусадебного до крупных сельхозугодий.
const AREA_CLASSES = [
  [0.02, 'до 2 соток'], [0.06, '2–6 соток'], [0.1, '6–10 соток'], [0.25, '10–25 соток'], [0.5, '25 соток – 0,5 га'],
  [1, '0,5–1 га'], [5, '1–5 га'], [20, '5–20 га'], [Infinity, 'больше 20 га'],
];
// Срезы: ключ, заголовок, как показывать значения.
export const DIMS = [
  { key: 'form', title: 'Форма собственности', order: ['Государственная', 'Муниципальная', 'Частная', 'Другая', 'Самовольная застройка', NONE] },
  { key: 'use', title: 'Вид использования' },
  { key: 'purp', title: 'Назначение по Кадастру', top: 12 },
  { key: 'marks', title: 'Заполненность меток', order: ['Все три метки', 'Частично', NONE + ' (ни одной)'], hint: 'Форма собственности, вид использования, назначение' },
  { key: 'size', title: 'Площадь участка', order: AREA_CLASSES.map((c) => c[1]) },
  { key: 'year', title: 'Год внесения в Кадастр', sortKey: true },
  { key: 'amn', title: 'Амнистия', order: ['Да', 'Нет'] },
  { key: 'gps', title: 'Координаты сняты по GPS', order: ['Да', 'Нет'] },
  { key: 'oblast', title: 'Область' },
  { key: 'district', title: 'Район' },
  { key: 'aimak', title: 'Айыл аймак' },
];

// Назначение: «земельный участок» и «Земельный участок» — одно значение.
const normPurp = (s) => { const t = String(s || '').trim().replace(/\s+/g, ' '); return t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : ''; };

// Плоская таблица участков из сведений аймаков: значения срезов строками.
// aimaks — [{ code, aimak, district, oblast }]; stats — Map код → { dict, rows }.
export function buildCube(aimaks, stats) {
  const rows = [];
  aimaks.forEach((a) => {
    const st = stats.get(a.code);
    if (!st) return;
    const d = st.dict;
    st.rows.forEach(([m2, fi, ui, pi, year, amn, gps]) => {
      const form = d.form[fi] || '';
      const use = d.use[ui] || '';
      const purp = normPurp(d.purp[pi]);
      const n = [form, use, purp].filter(Boolean).length;
      const ha = m2 / 1e4;
      rows.push({
        ha,
        form: form || NONE, use: use || NONE, purp: purp || NONE,
        marks: n === 3 ? 'Все три метки' : n ? 'Частично' : NONE + ' (ни одной)',
        size: AREA_CLASSES.find((c) => ha < c[0])[1],
        year: year ? String(year) : 'Без даты',
        amn: amn ? 'Да' : 'Нет', gps: gps ? 'Да' : 'Нет',
        oblast: a.oblast || NONE, district: a.district || NONE, aimak: a.aimak || a.code,
      });
    });
  });
  return rows;
}

const pass = (r, f, skip) => Object.entries(f).every(([k, set]) => k === skip || !set.size || set.has(r[k]));

// Значения среза по отобранным строкам (без отбора самого среза): [{ v, n, ha }].
function dimValues(rows, f, dim, metric = 'count') {
  const m = new Map();
  rows.forEach((r) => {
    if (!pass(r, f, dim.key)) return;
    const v = r[dim.key];
    const x = m.get(v) || { v, n: 0, ha: 0 };
    x.n++;
    x.ha += r.ha;
    m.set(v, x);
  });
  let out = [...m.values()];
  if (dim.order) out.sort((a, b) => (dim.order.indexOf(a.v) + 1 || 99) - (dim.order.indexOf(b.v) + 1 || 99));
  else if (dim.sortKey) out.sort((a, b) => (a.v === 'Без даты') - (b.v === 'Без даты') || a.v.localeCompare(b.v));
  else out.sort((a, b) => (metric === 'area' ? b.ha - a.ha : b.n - a.n));
  return out;
}

// Сводка: итоги по отбору и значения всех срезов.
export function summarize(rows, f, metric = 'count') {
  const sel = rows.filter((r) => pass(r, f, ''));
  const tot = { n: sel.length, ha: sel.reduce((t, r) => t + r.ha, 0) };
  // Плитки собственности — срез формы: свой отбор их не сужает (видно все формы, выбранная подсвечена).
  const forForm = rows.filter((r) => pass(r, f, 'form'));
  const formTot = { n: forForm.length, ha: forForm.reduce((t, r) => t + r.ha, 0) };
  const byForm = new Map();
  forForm.forEach((r) => { const x = byForm.get(r.form) || { n: 0, ha: 0 }; x.n++; x.ha += r.ha; byForm.set(r.form, x); });
  const noneAll = sel.filter((r) => r.marks === NONE + ' (ни одной)');
  return {
    tot, byForm, formTot,
    noMarks: { n: noneAll.length, ha: noneAll.reduce((t, r) => t + r.ha, 0) },
    dims: DIMS.map((d) => ({ dim: d, vals: dimValues(rows, f, d, metric) })),
  };
}

// --- разметка ---
// fmt — { n: число → строка, area: га → строка с единицей, pct: доля → строка }.
export function parcelsHTML(sum, f, metric, fmt, { loading = false, empty = false } = {}) {
  if (loading) return '<div class="ap-wait" role="status">Загружаю сведения участков…</div>';
  if (empty) return '<p class="an-empty-page">Сведений участков нет: они собираются при расчёте аймака («Посчитать»).</p>';
  const T = sum.tot;
  const share = (x) => (metric === 'area' ? (T.ha ? x.ha / T.ha : 0) : (T.n ? x.n / T.n : 0));
  const tile = (label, x, cls = '', hint = '', base = T, key = '') => {
    const sh = metric === 'area' ? (base.ha ? x.ha / base.ha : 0) : (base.n ? x.n / base.n : 0);
    const on = key && (f.form || new Set()).has(key);
    return `<${key ? `button type="button" data-ap-dim="form" data-ap-v="${esc(key)}" aria-pressed="${!!on}"` : 'div'} class="ap-kpi ${cls}${on ? ' on' : ''}"${hint ? ` title="${esc(hint)}"` : ''}><span>${esc(label)}</span>
      <b>${fmt.n(x.n)}</b><i>${fmt.area(x.ha)} · ${fmt.pct(sh)}</i></${key ? 'button' : 'div'}>`;
  };
  const f0 = (k) => sum.byForm.get(k) || { n: 0, ha: 0 };
  const ft = sum.formTot;
  const chips = Object.entries(f).filter(([, s]) => s.size).flatMap(([k, s]) => [...s].map((v) => {
    const d = DIMS.find((x) => x.key === k);
    return `<button type="button" class="ap-chip" data-ap-off="${esc(k)}" data-ap-v="${esc(v)}" title="Снять отбор">${esc(d ? d.title : k)}: <b>${esc(v)}</b><span aria-hidden="true">×</span></button>`;
  }));
  const card = ({ dim, vals }) => {
    const on = f[dim.key] || new Set();
    let list = vals;
    let rest = null;
    if (dim.top && list.length > dim.top) {
      const tail = list.slice(dim.top);
      rest = { v: `прочие (${tail.length})`, n: tail.reduce((t, x) => t + x.n, 0), ha: tail.reduce((t, x) => t + x.ha, 0), rest: true };
      list = list.slice(0, dim.top);
    }
    const all = rest ? [...list, rest] : list;
    const max = Math.max(1e-9, ...all.map((x) => (metric === 'area' ? x.ha : x.n)));
    const sumAll = all.reduce((t, x) => t + (metric === 'area' ? x.ha : x.n), 0) || 1;
    return `<section class="ap-card" aria-label="${esc(dim.title)}">
      <h3>${esc(dim.title)}${dim.hint ? `<span class="ap-hint" title="${esc(dim.hint)}">?</span>` : ''}</h3>
      <ul class="ap-bars">${all.map((x) => {
        const val = metric === 'area' ? x.ha : x.n;
        const picked = on.has(x.v);
        return `<li><button type="button" class="ap-bar${picked ? ' on' : ''}${on.size && !picked ? ' dim' : ''}${x.rest ? ' rest' : ''}" ${x.rest ? 'disabled' : `data-ap-dim="${esc(dim.key)}" data-ap-v="${esc(x.v)}"`}
            aria-pressed="${picked}" title="${esc(x.v)}: ${fmt.n(x.n)} уч. · ${esc(fmt.area(x.ha))}">
          <span class="ap-l">${esc(x.v)}</span>
          <span class="ap-track" aria-hidden="true"><i style="width:${((val / max) * 100).toFixed(2)}%"></i></span>
          <span class="ap-v">${metric === 'area' ? esc(fmt.area(x.ha)) : fmt.n(x.n)}</span>
          <span class="ap-p">${fmt.pct(val / sumAll)}</span></button></li>`;
      }).join('')}</ul></section>`;
  };
  return `<div class="ap">
    <div class="ap-head">
      <div class="ap-title"><b>Участки с ЕНИ в посчитанных аймаках</b><span>по Кадастру: участок — в том аймаке, где центр его контура; площадь — по контуру</span></div>
      <span class="an-seg ap-metric" role="group" aria-label="Мера">
        <button type="button" class="itab${metric === 'count' ? ' on' : ''}" data-ap-metric="count" aria-pressed="${metric === 'count'}">Число</button>
        <button type="button" class="itab${metric === 'area' ? ' on' : ''}" data-ap-metric="area" aria-pressed="${metric === 'area'}">Площадь</button>
      </span>
    </div>
    ${chips.length ? `<div class="ap-chips">${chips.join('')}<button type="button" class="btn btn-ghost btn-sm" data-ap-clear>Сбросить отбор</button></div>` : ''}
    <div class="ap-kpis">
      ${tile('Участков', T, 'ap-kpi-main')}
      ${tile('Государственная', f0('Государственная'), 'k-gos', '', ft, 'Государственная')}
      ${tile('Муниципальная', f0('Муниципальная'), 'k-mun', '', ft, 'Муниципальная')}
      ${tile('Частная', f0('Частная'), 'k-pri', '', ft, 'Частная')}
      ${tile('Другая', f0('Другая'), 'k-oth', '', ft, 'Другая')}
      ${tile('Без метки собственности', f0(NONE), 'k-none', 'В Кадастре форма собственности не указана', ft, NONE)}
      ${tile('Без меток вовсе', sum.noMarks, 'k-none', 'Нет ни формы собственности, ни вида использования, ни назначения')}
    </div>
    <div class="ap-grid">${sum.dims.map(card).join('')}</div>
  </div>`;
}
