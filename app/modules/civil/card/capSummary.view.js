// Сводная по объекту оценки: капитальность, классы и состояние строений —
// методология «Категории и классы зданий» (граф:
// ref:metodologiya-kategorii-klassy-zdaniy, decision:zony-litery).
//
// Решения пользователя 25.09.2026: сводная — отдельным блоком карточки ОЦ под
// «Перечнем ОИ»; строка — литера или, у литеры из зон, каждая зона; прочие
// постройки — наш тип «Прочие», К у них фиксированный 0,05; состояние — по
// шкале методологии (ранг 5…1), у зоны своё.
//
// Колонки — как в сводной таблице методологии: площадь (по внутреннему
// обмеру — ту же площадь делят зоны), К, класс, площадь × К, состояние,
// площадь × состояние × К. Под таблицей — площади по классам, как в итоговой
// матрице «объект × класс».
//
// Практики оформления (граф: convention по числам и итогам, CLAUDE.md): числа
// по правому краю, цифры одной ширины; итоговая строка выделена, итог стоит в
// своей колонке; складывается то, что складывается: площади и взвешенные
// площади — суммой, К — средневзвешенным по площади (методология: «средняя
// капитальность застройки, взвешенная по площади каждого здания»), состояние
// не суммируется. Таблица прокручивается в своей обёртке, а не растягивает
// карточку.
import { esc } from '../../../kernel/dom.js';
import { num, fmtNum } from '../../../kernel/fmt.js';
import { capScore, capClass } from '../oi/building/capClass.js';
import { zonesOf, hasZones, zoneTitle } from '../oi/building/zones.js';
import { CONDITION_RANK } from '../data/dictionaries.js';
import { SCALE_LABELS, CONDITION_SCALE, conditionCorrection, fmtCorr } from '../data/conditionScale.js';

const area = (v) => {
  const n = num(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const kindShort = { civil: 'Гражд.', prod: 'Произв.', other: 'Прочие' };

// Строки сводной: литеры-строения (жилые — без класса, как в карточке) и зоны.
export function rowsOf(rec) {
  const out = [];
  (rec.oi || []).filter((o) => o.card === 'building' && !o.residential).forEach((oi) => {
    const parts = hasZones(oi)
      ? zonesOf(oi).map((z, i) => ({ t: z, name: zoneTitle(z, i), zone: true, area: area(z.area), cond: z.condition }))
      : [{ t: oi, name: oi.name, zone: false, area: area((oi.areas || {}).build), cond: oi.conditionTotal }];
    parts.forEach((p, i) => {
      const sc = capScore(p.t);
      const rank = CONDITION_RANK[p.cond] || null;
      out.push({
        oi, first: i === 0, span: parts.length, zone: p.zone, name: p.name, kind: sc.kind, area: p.area,
        k: sc.k, key: sc.key, cls: sc.key === 'other' ? 'Прочие' : sc.key ? `${sc.key.split('-')[1]} класс` : '',
        cond: rank ? p.cond : '', rank, missing: sc.k === null ? missingOf(p.t) : '',
      });
    });
  });
  return out;
}

// Чего не хватает для класса — для подсказки ячейки «не хватает признаков».
function missingOf(t) {
  const c = capClass(t);
  return c.missing.length ? `Не хватает: ${c.missing.join(', ')}` : '';
}

// Площади по классам и средневзвешенный К объекта — их берёт и сравнительный
// подход (card/comparative.view.js): паспорт объекта оценки.
export function classAreas(rec) {
  const byClass = {};
  let area = 0;
  let areaK = 0;
  rowsOf(rec).filter((r) => r.k !== null && r.area).forEach((r) => {
    byClass[r.key] = (byClass[r.key] || 0) + r.area;
    area += r.area;
    areaK += r.area * r.k;
  });
  return { byClass, total: area, avgK: area ? areaK / area : null };
}

const k2 = (k) => (k === null ? '—' : k.toFixed(2).replace('.', ','));

// Колонки итоговой матрицы — как в методологии: произв. 4…1, гражд. 4…1, прочие.
export const MATRIX = [
  ...[4, 3, 2, 1].map((n) => ({ key: `prod-${n}`, label: `Произв. ${n}`, title: `Производственно-складские, ${n} класс` })),
  ...[4, 3, 2, 1].map((n) => ({ key: `admin-${n}`, label: `Гражд. ${n}`, title: `Гражданские, ${n} класс` })),
  { key: 'other', label: 'Прочие', title: 'Прочие постройки: навесы, ТП, КПП, охрана — К = 0,05' },
];

// Матрица корректировок по состоянию — справочно, раскрывается по запросу:
// нужна при подборе аналогов, а не при каждом заходе в карточку. Строка — из
// какого состояния, столбец — к какому; недопустимые значения выделены, пары,
// которые методология не рассчитывает, пусты. Короткие подписи столбцов —
// ранг, полное название — в подсказке.
function correctionMatrixHTML() {
  const head = CONDITION_SCALE.map((s) => `<th class="num" scope="col" title="${esc(s.label)} · износ ${s.wearFrom}–${s.wearTo} %">${String(s.rank).replace('.', ',')}</th>`).join('');
  const body = SCALE_LABELS.map((from) => {
    const s = CONDITION_SCALE.find((x) => x.label === from);
    const cells = SCALE_LABELS.map((to) => {
      const c = conditionCorrection(from, to);
      if (!c) return '<td class="num cm-none" title="Не рассчитывается: разница состояний заведомо запредельная">—</td>';
      const cls = from === to ? 'cm-diag' : c.invalid ? 'cm-bad' : '';
      const tip = `${from} → ${to}: ${fmtCorr(c.value)}${c.invalid ? ' — недопустимо: аналог слишком далёк по состоянию' : ''}`;
      return `<td class="num ${cls}" title="${esc(tip)}">${fmtCorr(c.value)}</td>`;
    }).join('');
    return `<tr><th scope="row" title="${esc(from)} · износ ${s.wearFrom}–${s.wearTo} %"><span class="cm-rank">${String(s.rank).replace('.', ',')}</span> ${esc(from)}</th>${cells}</tr>`;
  }).join('');
  return `<details class="cm-box" data-cond-matrix>
<summary>Корректировки по состоянию</summary>
<p class="cm-note">Во сколько раз скорректировать стоимость объекта в состоянии строки, чтобы привести его к состоянию столбца:
(100 − средний % ремонта строки) / (100 − средний % ремонта столбца). <span class="cm-bad-key">Выделенные</span> значения
недопустимы — аналог в таком состоянии исключают; «—» — пара не рассчитывается.</p>
<div class="cs-scroll"><table class="tbl cm-tbl">
<colgroup><col style="width:28%">${CONDITION_SCALE.map(() => '<col style="width:8%">').join('')}</colgroup>
<thead><tr><th scope="col">Из состояния → в ранг</th>${head}</tr></thead>
<tbody>${body}</tbody></table></div>
</details>`;
}

export function capSummaryHTML(ctx) {
  const rows = rowsOf(ctx.rec);
  if (!rows.length) return '';

  const done = rows.filter((r) => r.k !== null && r.area);
  const sumArea = rows.reduce((a, r) => a + r.area, 0);
  const sumAreaK = done.reduce((a, r) => a + r.area * r.k, 0);
  const doneArea = done.reduce((a, r) => a + r.area, 0);
  const avgK = doneArea ? sumAreaK / doneArea : null;
  const withCond = done.filter((r) => r.rank);
  const sumAC = rows.filter((r) => r.rank && r.area).reduce((a, r) => a + r.area * r.rank, 0);
  const sumACK = withCond.reduce((a, r) => a + r.area * r.rank * r.k, 0);
  const notReady = rows.length - done.length;

  const body = rows.map((r) => {
    const lit = r.first
      ? `<td rowspan="${r.span}" class="cs-lit"><button type="button" class="cs-open" data-open-oi="${esc(r.oi.id)}"
          title="Открыть карточку литеры">${esc(r.oi.letter || '—')}</button>${r.zone
    ? `<div class="cs-litname" title="${esc(r.oi.name || '')}">${esc(r.oi.name || '')}</div>` : ''}</td>` : '';
    const name = r.zone ? `<span class="cs-zone">${esc(r.name)}</span>` : esc(r.name || '');
    const kind = r.kind ? kindShort[r.kind] : '<span class="muted">тип не выбран</span>';
    return `<tr class="${r.zone ? 'is-zone' : ''} ${r.first ? 'first' : ''}">${lit}
      <td class="cs-name" title="${esc(r.name || '')}">${name}</td>
      <td>${kind}</td>
      <td class="num">${r.area ? fmtNum(r.area) : '<span class="muted">—</span>'}</td>
      <td class="num">${k2(r.k)}</td>
      <td>${r.cls || `<span class="muted" title="${esc(r.missing)}">не хватает признаков</span>`}</td>
      <td class="num">${r.k !== null && r.area ? fmtNum(r.area * r.k) : '—'}</td>
      <td title="${esc(r.cond)}">${r.rank ? `${esc(r.cond)} <span class="muted">· ${String(r.rank).replace('.', ',')}</span>` : '<span class="muted">не выбрано</span>'}</td>
      <td class="num">${r.rank && r.area ? fmtNum(r.area * r.rank) : '—'}</td>
      <td class="num">${r.rank && r.k !== null && r.area ? fmtNum(r.area * r.rank * r.k) : '—'}</td>
    </tr>`;
  }).join('');

  const byClass = {};
  done.forEach((r) => { byClass[r.key] = (byClass[r.key] || 0) + r.area; });

  return `<div class="card t-slate cs-card" id="q-capsum">
<div class="card-head" data-card-toggle><span class="card-idx">03</span><h3>Капитальность и классы</h3>
<span class="hint">по методологии «Категории и классы зданий»</span><span class="chev">▾</span></div>
<div class="card-body-wrap"><div class="card-pad">
<div class="cs-avg" data-cs-avgk><span class="cs-avg-l lk-tip" title="Средняя капитальность застройки, взвешенная по площади каждого строения: Σ (площадь × К) / Σ площадь — по строкам, у которых есть и площадь, и К (прочие — с К 0,05). По ней корректируют на капитальность в сравнительном подходе">Средневзвешенная капитальность</span>
  <span class="cs-avg-v">${k2(avgK)}</span>
  <span class="cs-avg-n">${avgK === null ? 'нет строк с площадью и классом' : `Σ площадь × К ${fmtNum(sumAreaK)} / Σ площадь ${fmtNum(doneArea)} м²`}${
  rows.length - done.length ? ` · не учтено строк: ${rows.length - done.length} (нет класса или площади)` : ''}</span></div>
<div class="cs-scroll"><table class="tbl cs-tbl">
<colgroup><col style="width:11%"><col style="width:13%"><col style="width:7%"><col style="width:10%"><col style="width:6%">
<col style="width:9%"><col style="width:10%"><col style="width:14%"><col style="width:10%"><col style="width:10%"></colgroup>
<thead><tr>
  <th>Литера</th><th>Наименование / подгруппа</th><th>Тип</th>
  <th class="num" title="Площадь по внутреннему обмеру, м² (у подгруппы помещений — её площадь)">Площадь внутр., м²</th>
  <th class="num" title="Коэффициент капитальности: произведение коэффициентов признаков; у прочих — 0,05">К</th>
  <th>Класс</th>
  <th class="num" title="Площадь, взвешенная по капитальности: площадь × К">Площадь × К</th>
  <th title="Состояние по шкале методологии, ранг от 5 (отличное) до 1 (неудовлетворительное)">Состояние</th>
  <th class="num" title="Состояние взвешенное: площадь × ранг состояния">Площ. × сост.</th>
  <th class="num" title="Состояние взвешенное, скорректированное на капитальность: площадь × ранг состояния × К">Площ. × сост. × К</th>
</tr></thead>
<tbody>${body}</tbody>
<tfoot><tr>
  <td colspan="3">Итого${notReady ? ` <span class="muted">· без класса: ${notReady}</span>` : ''}</td>
  <td class="num">${fmtNum(sumArea)}</td>
  <td class="num" title="Средневзвешенный по площади К строк с классом">${k2(avgK)}</td>
  <td></td>
  <td class="num">${fmtNum(sumAreaK)}</td>
  <td></td>
  <td class="num">${sumAC ? fmtNum(sumAC) : '—'}</td>
  <td class="num">${withCond.length ? fmtNum(sumACK) : '—'}</td>
</tr></tfoot>
</table></div>
<div class="sec-h cs-mh">Площади по классам, м²</div>
<div class="cs-scroll"><table class="tbl cs-matrix">
<thead><tr>${MATRIX.map((c) => `<th class="num" title="${esc(c.title)}">${c.label}</th>`).join('')}</tr></thead>
<tbody><tr>${MATRIX.map((c) => `<td class="num">${byClass[c.key] ? fmtNum(byClass[c.key]) : ''}</td>`).join('')}</tr></tbody>
</table></div>
${correctionMatrixHTML()}
</div></div>
</div>`;
}
