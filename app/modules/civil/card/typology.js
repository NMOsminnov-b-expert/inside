// Тип нежилого здания по внутренней площади — считает система (решение
// пользователя 28.09.2026, граф: tipizaciya-oc-po-vnutrenney-ploschadi).
//
// Три типа литер — гражданская, производственно-складская, прочие («Тип и
// класс капитальности» карточки литеры; у литеры из подгрупп помещений — у
// каждой подгруппы свой). Доля типа — его внутренняя площадь (по внутреннему
// обмеру) от площади всех литер и подгрупп, у которых тип выбран. Тип
// учитывается, если его доля не меньше трети минус допуск 5% (28⅓%): один
// учтённый — ОЦ этого типа, два — пара, три — «Смешанное». Литеры и подгруппы
// без выбранного типа в расчёт не входят — сводка говорит, сколько их.
// Вспомогательные постройки, участок, механизмы и ТС не входят вовсе.
//
// Раскладка по литерам и подгруппам — та же, что у сводной по капитальности
// (capSummary.view.js, rowsOf): одна строка — одна площадь одного типа.
// Строки передаёт вызывающий (ocTypology в capSummary.view.js): сводная сама
// рисует тип, и импорт отсюда в неё замкнул бы круг.

export const THRESHOLD = 100 / 3 - 5;

export const KINDS = [
  { key: 'civil', label: 'Гражданское', part: 'гражданская' },
  { key: 'prod', label: 'Производственное', part: 'производственно-складская' },
  { key: 'other', label: 'Прочие', part: 'прочие' },
];

export const UNDEFINED_LABEL = 'Нежилое здание · тип не определён';

function nameOf(counted) {
  if (!counted.length) return '';
  if (counted.length === 3) return 'Смешанное';
  return counted.map((k, i) => (i ? k.label.toLowerCase() : k.label)).join(', ');
}

export function typologyOf(rows) {
  const byKind = { civil: 0, prod: 0, other: 0 };
  let untyped = 0;
  rows.forEach((r) => {
    if (!r.kind) { untyped += 1; return; }
    byKind[r.kind] += r.area;
  });
  const total = byKind.civil + byKind.prod + byKind.other;
  const parts = KINDS.map((k) => {
    const share = total ? (byKind[k.key] / total) * 100 : 0;
    return { ...k, area: byKind[k.key], share, counted: total > 0 && share >= THRESHOLD };
  });
  const label = nameOf(parts.filter((p) => p.counted));
  return { parts, total, untyped, label, shown: label || UNDEFINED_LABEL };
}

// Подсказка к типу: доли и правило — чтобы было видно, откуда он взялся.
export function typologyTip(t) {
  if (!t.total) return 'Тип считается по внутренней площади литер, у которых выбран тип; таких литер пока нет';
  const pct = (v) => `${v.toFixed(1).replace('.', ',')} %`;
  return [
    ...t.parts.map((p) => `${p.part}: ${pct(p.share)}${p.counted ? '' : ' — меньше 28⅓ %, не учитывается'}`),
    t.untyped ? `без типа: ${t.untyped} — в расчёт не входят` : '',
    'Тип учитывается от 28⅓ % внутренней площади (треть минус допуск 5 %)',
  ].filter(Boolean).join('\n');
}
