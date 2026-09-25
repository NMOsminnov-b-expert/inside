// Сравнительный подход — итоговая расчётная таблица методологии «Категории и
// классы зданий» (граф: ref:metodologiya-kategorii-klassy-zdaniy,
// decision:sravnitelnyy-podhod). Данные — rec.comparative.
//
// Состав строк и порядок корректировок — как в примере методологии: паспорт
// объекта и аналогов, затем цепочка корректировок — цена аналога
// последовательно умножается на коэффициенты, после каждого — промежуточная
// стоимость 1 м². Результат — простое среднее скорректированных цен аналогов,
// умноженное на общую площадь построек объекта.
//
// Коэффициенты корректировок вводит пользователь — в методологии это
// экспертные значения. Исключение — корректировка на состояние: она берётся
// из матрицы (data/conditionScale.js) на пересечении состояния объекта
// (строка) и аналога (столбец). Недопустимое значение исключает аналог из
// результата — методология: «такой аналог должен быть исключён или заменён».
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: аналоги здесь живут в записи объекта. В системе это
// скорее общий справочник предложений рынка (одно объявление — аналог сразу
// для нескольких объектов) с датой и источником; развилка — копировать аналог
// в расчёт (расчёт не меняется задним числом) или ссылаться на него.
import { num } from '../../../kernel/fmt.js';
import { conditionCorrection } from '../data/conditionScale.js';

// Паспорт: key, подпись, вид ввода. obj — поле есть и у объекта; analog — у
// аналога. classes — площади по классам (строки из MATRIX сводной).
export const PASSPORT = [
  { key: 'date', label: 'Дата', kind: 'text' },
  { key: 'source', label: 'Источник информации', kind: 'text', analogOnly: true },
  { key: 'rights', label: 'Состав оцениваемых прав', kind: 'text' },
  { key: 'location', label: 'Местоположение', kind: 'text' },
  { key: 'locationSpec', label: 'Специфика местоположения', kind: 'text' },
  { key: 'purpose', label: 'Целевое назначение объекта', kind: 'text' },
];

export const PASSPORT_2 = [
  { key: 'walls', label: 'Основной материал стен', kind: 'text' },
  { key: 'condition', label: 'Состояние зданий', kind: 'condition' },
  { key: 'landShape', label: 'Форма земельного участка', kind: 'text' },
  { key: 'relief', label: 'Рельеф участка', kind: 'text' },
  { key: 'servitudes', label: 'Наличие сервитутов', kind: 'text' },
  { key: 'landArea', label: 'Площадь земельного участка, м²', kind: 'num' },
  { key: 'improvement', label: 'Благоустройство территории', kind: 'text' },
  { key: 'utilities', label: 'Наличие коммуникаций', kind: 'text' },
  { key: 'railway', label: 'Наличие ж/д ветки', kind: 'text' },
  { key: 'equipment', label: 'Наличие оборудования', kind: 'text' },
  { key: 'saleTerms', label: 'Условия продажи', kind: 'text', analogOnly: true },
  { key: 'priceUsd', label: 'Цена предложения, долл. США', kind: 'num', analogOnly: true },
];

// Корректировки — в порядке методологии. auto — считается, не вводится.
export const CORRECTIONS = [
  { key: 'sale', label: 'на условия продажи' },
  { key: 'rights', label: 'на состав передаваемых прав' },
  { key: 'location', label: 'на местоположение' },
  { key: 'locationSpec', label: 'на специфику местоположения' },
  { key: 'purpose', label: 'на назначение' },
  { key: 'landShape', label: 'на форму земельного участка' },
  { key: 'capital', label: 'на капитальность зданий и сооружений' },
  { key: 'otherBuildings', label: 'на прочие некапитальные строения' },
  { key: 'walls', label: 'на материал стен' },
  { key: 'condition', label: 'на состояние зданий и сооружений', auto: true },
  { key: 'improvement', label: 'на благоустройство территории' },
  { key: 'relief', label: 'на рельеф' },
  { key: 'servitudes', label: 'на сервитуты' },
  { key: 'utilities', label: 'на наличие коммуникаций' },
  { key: 'landArea', label: 'на площадь з/у' },
  { key: 'size', label: 'на размер объекта' },
  { key: 'railway', label: 'на наличие ж/д ветки' },
  { key: 'equipment', label: 'на наличие оборудования' },
];

const uid = () => 'an' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function comparativeOf(rec) {
  if (!rec.comparative) rec.comparative = { rate: '', object: {}, analogs: [] };
  return rec.comparative;
}

export function addAnalog(rec) {
  const c = comparativeOf(rec);
  c.analogs.push({ id: uid(), rights: 'полное право собственности', classes: {}, corr: {} });
}

export function removeAnalog(rec, id) {
  const c = comparativeOf(rec);
  c.analogs = c.analogs.filter((a) => a.id !== id);
}

const n = (v) => {
  const x = num(v);
  return Number.isFinite(x) ? x : null;
};

export const analogArea = (a) => Object.values(a.classes || {}).reduce((s, v) => s + (n(v) || 0), 0);

// Расчёт по аналогу: цена за м² и цепочка корректировок. objCondition —
// состояние зданий объекта оценки.
export function calcAnalog(a, rate, objCondition) {
  const area = analogArea(a);
  const usd = n(a.priceUsd);
  const r = n(rate);
  const som = usd !== null && r ? usd * r : null;
  const perM2Usd = usd !== null && area ? usd / area : null;
  const perM2Som = som !== null && area ? som / area : null;

  const cond = objCondition && a.condition ? conditionCorrection(objCondition, a.condition) : null;
  let cur = perM2Som;
  const steps = CORRECTIONS.map((c) => {
    let k;
    let invalid = false;
    if (c.key === 'condition') {
      k = cond ? cond.value : null;
      invalid = !!(cond && cond.invalid);
    } else {
      const raw = (a.corr || {})[c.key];
      k = raw === undefined || raw === '' ? 1 : n(raw);
    }
    if (cur !== null && k !== null) cur *= k;
    else if (k === null) cur = null;
    return { key: c.key, k, invalid, value: cur };
  });
  const finalSom = cur;
  const excluded = !!(cond && cond.invalid);
  return {
    area, som, perM2Usd, perM2Som, steps, finalSom,
    finalUsd: finalSom !== null && r ? finalSom / r : null, excluded,
    condMissing: !cond,
  };
}

// Результат: среднее скорректированных цен годных аналогов × площадь объекта.
export function calcResult(rec, objArea) {
  const c = comparativeOf(rec);
  const rate = n(c.rate);
  const calcs = c.analogs.map((a) => calcAnalog(a, c.rate, c.object.condition));
  const ok = calcs.filter((x) => x.finalSom !== null && !x.excluded);
  const avgSom = ok.length ? ok.reduce((s, x) => s + x.finalSom, 0) / ok.length : null;
  return {
    calcs, used: ok.length,
    perM2Som: avgSom,
    perM2Usd: avgSom !== null && rate ? avgSom / rate : null,
    valueSom: avgSom !== null && objArea ? avgSom * objArea : null,
    valueUsd: avgSom !== null && objArea && rate ? (avgSom * objArea) / rate : null,
  };
}
