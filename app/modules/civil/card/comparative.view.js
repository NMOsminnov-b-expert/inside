// Вкладка «Сравнительный подход» карточки ОЦ — итоговая расчётная таблица
// методологии «Категории и классы зданий» (модель — comparative.model.js).
//
// Оформление (практики, CLAUDE.md, граф convention по числам и итогам): колонка
// подписей закреплена при горизонтальной прокрутке; числа по правому краю,
// цифры одной ширины; расчётные строки выделены фоном и не редактируются;
// корректировка и стоимость после неё — в одной ячейке (коэффициент → сом/м²),
// а не двумя строками, как в методологии: пара «поправка — итог» читается
// вместе, а таблица вдвое короче. Таблица прокручивается в своей обёртке.
import { esc } from '../../../kernel/dom.js';
import { fmtNum } from '../../../kernel/fmt.js';
import { numText } from '../../../kernel/numField.js';
import { MATRIX, classAreas } from './capSummary.view.js';
import { SCALE_LABELS, fmtCorr } from '../data/conditionScale.js';
import {
  PASSPORT, PASSPORT_2, CORRECTIONS, comparativeOf, calcResult,
} from './comparative.model.js';

const money = (v) => (v === null || v === undefined ? '—' : fmtNum(Math.round(v)).replace(/,00$/, ''));

// Паспорт объекта: что есть в записи, подставляется; остальное вводится.
function objectValue(rec, c, key) {
  const o = c.object || {};
  if (o[key] !== undefined && o[key] !== '') return o[key];
  if (key === 'location') return rec.address || '';
  if (key === 'purpose') return rec.purposeTP || '';
  if (key === 'rights') return 'полное право собственности';
  return '';
}

function inputHTML(owner, f, value) {
  if (f.kind === 'condition') {
    return `<select class="select cp-in" data-cp="${owner}|${f.key}" aria-label="${esc(f.label)}">
      <option value="">не выбрано</option>${SCALE_LABELS.map((s) => `<option ${s === value ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>`;
  }
  const num = f.kind === 'num';
  return `<input class="input cp-in ${num ? 'num' : ''}" data-cp="${owner}|${f.key}" ${num ? 'inputmode="decimal" data-cp-num' : ''}
    value="${esc(num ? numText(value) : value || '')}" aria-label="${esc(f.label)}">`;
}

function passportRows(rec, c, fields) {
  return fields.map((f) => `<tr><th scope="row">${esc(f.label)}</th>
    <td>${f.analogOnly ? '' : inputHTML('obj', f, objectValue(rec, c, f.key))}</td>
    ${c.analogs.map((a) => `<td>${inputHTML(a.id, f, a[f.key])}</td>`).join('')}</tr>`).join('');
}

// Все расчётные значения таблицы — по ключу [data-cp-out]: ими и заполняется
// разметка, и обновляются ячейки после ввода без перерисовки вкладки.
export function outputs(rec) {
  const c = comparativeOf(rec);
  const obj = classAreas(rec);
  const res = calcResult(rec, obj.total);
  const out = {};
  out['obj|area'] = obj.total ? fmtNum(obj.total) : '—';
  c.analogs.forEach((a, i) => {
    const x = res.calcs[i];
    out[`${a.id}|area`] = x.area ? fmtNum(x.area) : '—';
    out[`${a.id}|som`] = money(x.som);
    out[`${a.id}|m2usd`] = money(x.perM2Usd);
    out[`${a.id}|m2som`] = money(x.perM2Som);
    x.steps.forEach((s) => {
      out[`${a.id}|k:${s.key}`] = s.k === null ? '—' : fmtCorr(s.k);
      out[`${a.id}|v:${s.key}`] = money(s.value);
    });
    out[`${a.id}|final`] = money(x.finalUsd);
    out[`${a.id}|state`] = x.excluded ? 'исключён: состояние' : x.condMissing ? 'нет поправки на состояние' : '';
  });
  out['res|m2som'] = money(res.perM2Som);
  out['res|m2usd'] = money(res.perM2Usd);
  out['res|som'] = money(res.valueSom);
  out['res|usd'] = money(res.valueUsd);
  out['res|used'] = `по ${res.used} из ${c.analogs.length} аналогов`;
  out['obj|avgk'] = obj.avgK === null ? '—' : obj.avgK.toFixed(2).replace('.', ',');
  return { out, res };
}

const o = (out, key, cls = '') => `<span class="${cls}" data-cp-out="${esc(key)}">${esc(out[key] ?? '—')}</span>`;

export function comparativeTab(ctx) {
  const rec = ctx.rec;
  const c = comparativeOf(rec);
  const obj = classAreas(rec);
  const { out } = outputs(rec);
  const cols = c.analogs.length;

  const head = `<tr><th scope="col" class="cp-lbl">Наименование показателя</th><th scope="col">Объект оценки</th>
    ${c.analogs.map((a, i) => `<th scope="col"><div class="cp-ah">Аналог ${i + 1}
      <button type="button" class="btn btn-danger btn-sm cp-del" data-cp-del="${esc(a.id)}" title="Убрать аналог" aria-label="Убрать аналог ${i + 1}">×</button></div>
      ${o(out, `${a.id}|state`, 'cp-state')}</th>`).join('')}</tr>`;

  const classRows = MATRIX.map((m) => `<tr><th scope="row" class="cp-sub" title="${esc(m.title)}">${esc(m.label.replace('Произв.', 'произв. класс').replace('Гражд.', 'гражд. класс'))}</th>
    <td class="num cp-calc" title="Из блока «Капитальность и классы»">${obj.byClass[m.key] ? fmtNum(obj.byClass[m.key]) : '0,00'}</td>
    ${c.analogs.map((a) => `<td><input class="input cp-in num" data-cp-class="${esc(a.id)}|${m.key}" inputmode="decimal" data-cp-num
      value="${esc(numText((a.classes || {})[m.key]))}" aria-label="${esc(m.title)}"></td>`).join('')}</tr>`).join('');

  const calcRow = (label, key, objCell = '') => `<tr class="cp-calc-row"><th scope="row">${label}</th><td class="num cp-calc">${objCell}</td>
    ${c.analogs.map((a) => `<td class="num cp-calc">${o(out, `${a.id}|${key}`)}</td>`).join('')}</tr>`;

  const corrRows = CORRECTIONS.map((k) => `<tr><th scope="row" ${k.key === 'capital' ? `title="Средневзвешенный К объекта оценки — ${esc(out['obj|avgk'])} (блок «Капитальность и классы»)"` : ''}>
      Корректировка ${esc(k.label)}${k.auto ? ' <span class="cp-auto" title="Из матрицы корректировок по состоянию: строка — состояние объекта, столбец — аналога">авто</span>' : ''}</th><td></td>
    ${c.analogs.map((a) => {
      const coef = k.auto
        ? `<span class="cp-k auto" data-cp-out="${esc(`${a.id}|k:${k.key}`)}">${esc(out[`${a.id}|k:${k.key}`])}</span>`
        : `<input class="input cp-in cp-k num" data-cp-corr="${esc(a.id)}|${k.key}" inputmode="decimal" data-cp-num
            value="${esc(numText((a.corr || {})[k.key]) || '')}" placeholder="1,00" aria-label="Корректировка ${esc(k.label)}">`;
      return `<td class="cp-corr"><div class="cp-pair">${coef}<span class="cp-arrow" aria-hidden="true">→</span>${o(out, `${a.id}|v:${k.key}`, 'cp-v')}</div></td>`;
    }).join('')}</tr>`).join('');

  const table = `<div class="cp-scroll"><table class="tbl cp-tbl" style="--cp-cols:${cols}">
<thead>${head}</thead>
<tbody>
${passportRows(rec, c, PASSPORT)}
<tr class="cp-calc-row"><th scope="row">Общая площадь построек, м², из них</th><td class="num cp-calc">${o(out, 'obj|area')}</td>
  ${c.analogs.map((a) => `<td class="num cp-calc">${o(out, `${a.id}|area`)}</td>`).join('')}</tr>
${classRows}
${passportRows(rec, c, PASSPORT_2)}
${calcRow('Цена предложения, сом', 'som')}
${calcRow('Стоимость 1 м² зданий и сооружений, долл. США', 'm2usd')}
${calcRow('Стоимость 1 м² зданий и сооружений, сом', 'm2som')}
<tr class="cp-sec"><th scope="row" colspan="${2 + cols}">Корректировки — коэффициент → скорректированная стоимость, сом/м²</th></tr>
${corrRows}
${calcRow('<b>Скорректированная цена, долл. США/м²</b>', 'final')}
</tbody></table></div>`;

  return `<div class="card t-slate cp-card" id="q-comparative">
<div class="card-head"><span class="card-idx">СП</span><h3>Сравнительный подход</h3>
<span class="hint">по методологии «Категории и классы зданий»</span></div>
<div class="card-pad">
<div class="cp-top">
  <div class="field cp-rate"><label for="cp-rate">Курс, сом за 1 долл. США</label>
    <input class="input num" id="cp-rate" data-cp-rate inputmode="decimal" data-cp-num value="${esc(numText(c.rate))}"></div>
  <button type="button" class="btn btn-primary btn-sm" data-cp-add>+ Аналог</button>
</div>
${cols ? '' : '<div class="muted cp-empty">Аналогов пока нет — добавьте их кнопкой «+ Аналог». Паспорт объекта оценки уже в таблице: площади по классам — из блока «Капитальность и классы», адрес и назначение — из карточки.</div>'}
${table}
${cols ? `<div class="cp-result" data-cp-result>
  <div class="cp-res-h">Результат <span class="muted">${o(out, 'res|used')}</span></div>
  <dl>
    <div><dt>Стоимость 1 м² зданий и сооружений, сом</dt><dd>${o(out, 'res|m2som')}</dd></div>
    <div><dt>Стоимость 1 м² зданий и сооружений, долл. США</dt><dd>${o(out, 'res|m2usd')}</dd></div>
    <div><dt>Стоимость объекта оценки, сом</dt><dd>${o(out, 'res|som')}</dd></div>
    <div><dt>Стоимость объекта оценки, долл. США</dt><dd>${o(out, 'res|usd')}</dd></div>
  </dl>
  <p class="muted cp-note">Среднее скорректированных цен аналогов, кроме исключённых по состоянию, × общая площадь построек объекта (${esc(out['obj|area'])} м²).</p>
</div>` : ''}
</div></div>`;
}
