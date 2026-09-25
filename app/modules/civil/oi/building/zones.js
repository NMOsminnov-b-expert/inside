// Подгруппы помещений литеры (в коде — zones, «зоны»; в интерфейсе с
// 25.09.2026 — «подгруппа помещений», указание пользователя: «это не зона, а
// подгруппа помещений») — части одного здания разного типа или класса (общежитие и цех
// из металлоконструкций под одной крышей). Задача пользователя 25.09.2026:
// «нужно уметь разбивать здание на подклассы… бить литеру на зоны, в том числе
// по квадратуре (это важно)». Методика — «Категории и классы зданий»: у каждой
// части свои признаки и класс, а в сводной таблице объекта площади
// складываются по классам.
//
// Решения пользователя 25.09.2026:
//   * делится площадь литеры по внутреннему обмеру (areas.build);
//   * площади зон вводят руками; не сошлось с площадью литеры — предупреждение,
//     значения молча не подгоняются;
//   * высота у каждой зоны своя (по умолчанию — высота литеры);
//   * «Класс ОИ» литеры с зонами — площади по классам, как в сводной таблице.
//
// Зона хранит те же поля, что литера для класса (litKind, purposeFact,
// capSigns, heights.int), поэтому класс зоны считает тот же capClass, а
// переключатель типа и признаки рисуют те же функции карточки. Литера без зон
// (oi.zones пусто) работает как раньше.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: зона живёт внутри записи литеры массивом. Если по зонам
// понадобятся отчёты по всем объектам (площади по классам в сравнительном
// подходе), на сервере это своя таблица «зона литеры» со ссылкой на литеру —
// иначе выборку придётся собирать разбором JSON каждой записи.
import { num, fmtNum } from '../../../../kernel/fmt.js';
import { KINDS, capClass, capScore, kindOf } from './capClass.js';

export const zonesOf = (oi) => (Array.isArray(oi.zones) ? oi.zones : []);
export const hasZones = (oi) => zonesOf(oi).length > 1;

const uid = () => 'z' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clone = (v) => JSON.parse(JSON.stringify(v || {}));
const litHeight = (oi) => ((oi.heights || {}).int || '');

// Разбить литеру: первая зона — то, что уже заполнено у литеры целиком (тип,
// назначение, признаки, площадь и высота литеры), вторая — пустая: её тип и
// площадь указывают руками.
export function splitIntoZones(oi) {
  if (hasZones(oi)) return;
  oi.zones = [
    { id: uid(), name: '', litKind: oi.litKind || '', purposeFact: oi.purposeFact || '',
      capSigns: clone(oi.capSigns), heights: { int: litHeight(oi) }, area: (oi.areas || {}).build || '',
      condition: oi.conditionTotal || '' },
    newZone(oi),
  ];
  syncFromZones(oi);
}

export function newZone(oi) {
  // Состояние у зоны своё (решение пользователя 25.09.2026), по умолчанию —
  // итоговое состояние литеры.
  return { id: uid(), name: '', litKind: '', purposeFact: '', capSigns: {}, heights: { int: litHeight(oi) }, area: '',
    condition: oi.conditionTotal || '' };
}

export function addZone(oi) {
  oi.zones = zonesOf(oi).concat(newZone(oi));
}

// Убрать зону. Осталась одна — литера снова цельная: тип, назначение и
// признаки оставшейся зоны становятся признаками литеры.
export function removeZone(oi, id) {
  oi.zones = zonesOf(oi).filter((z) => z.id !== id);
  if (oi.zones.length === 1) {
    const [z] = oi.zones;
    oi.litKind = z.litKind;
    oi.purposeFact = z.purposeFact;
    oi.capSigns = clone(z.capSigns);
    delete oi.zones;
  }
  syncFromZones(oi);
}

export const zoneById = (oi, id) => zonesOf(oi).find((z) => z.id === id) || null;

// Зона, к которой относится элемент карточки (атрибут data-zone у обёртки
// зоны), либо сама литера.
export function targetOf(oi, el) {
  const box = el && el.closest && el.closest('[data-zone]');
  return (box && zoneById(oi, box.dataset.zone)) || oi;
}

const areaOf = (z) => {
  const v = num(z.area);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

// Главная зона — самая большая по площади: её тип, назначение и класс литера
// держит у себя (oi.litKind, oi.purposeFact, oi.oiCategory). Их читают
// перечень ОЦ, реестр и выгрузки, которые о зонах не знают.
function mainZone(oi) {
  return zonesOf(oi).reduce((a, z) => (areaOf(z) > areaOf(a) ? z : a), zonesOf(oi)[0]);
}

export function syncFromZones(oi) {
  if (!hasZones(oi)) return;
  const m = mainZone(oi);
  oi.litKind = m.litKind;
  oi.purposeFact = m.purposeFact;
  oi.oiCategory = capClass(m).key;
}

// Короткое имя класса для сводки: «Гражданская, 3 класс».
function classShort(z) {
  const c = capClass(z);
  if (c.key === 'other') return 'Прочие';
  if (!c.key) return '';
  const kind = KINDS.find((k) => k.key === kindOf(z));
  return `${kind ? kind.label : ''}, ${c.key.split('-')[1]} класс`;
}

// Площади по классам — как в сводной таблице методики: зоны одного класса
// складываются. Незаполненные зоны идут отдельной строкой с тем, чего не
// хватает.
export function classDistribution(oi) {
  const groups = new Map();
  const missing = [];
  zonesOf(oi).forEach((z, i) => {
    const c = capClass(z);
    if (!c.key) { missing.push({ id: z.id, name: zoneTitle(z, i), area: areaOf(z), missing: c.missing }); return; }
    const k = classShort(z);
    groups.set(k, (groups.get(k) || 0) + areaOf(z));
  });
  return { groups: Array.from(groups, ([label, area]) => ({ label, area })), missing };
}

// Коротко: площади по классам и сколько зон без класса. Перечень недостающих
// признаков — у самой зоны, в её группе «Класс капитальности»: список «Зона N:
// …» по всем зонам разрастался на абзац (замечание пользователя 25.09.2026).
export function unclassText(missing) {
  const n = missing.length;
  const word = n % 10 === 1 && n % 100 !== 11 ? 'подгруппа' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'подгруппы' : 'подгрупп');
  const area = missing.reduce((a, m) => a + m.area, 0);
  return `без класса — ${n} ${word}${area ? `, ${fmtNum(area)} м²` : ''}`;
}

export function distributionText(oi) {
  const { groups, missing } = classDistribution(oi);
  const parts = groups.map((g) => `${g.label} — ${fmtNum(g.area)} м²`);
  if (missing.length) parts.push(unclassText(missing));
  return parts.join(' · ') || '—';
}

export function typesText(oi) {
  const kinds = Array.from(new Set(zonesOf(oi).map((z) => z.litKind).filter(Boolean)));
  const labels = kinds.map((k) => (KINDS.find((x) => x.key === k) || {}).label).filter(Boolean);
  return `${labels.join(', ') || 'не выбран'} · подгрупп: ${zonesOf(oi).length}`;
}

// Класс зоны для её шапки — коротко: «2 класс», «Прочие» или «не определён»;
// чего не хватает — видимой строкой в группе «Класс капитальности» зоны
// (missingText), а не только в подсказке.
export function zoneClassInfo(z) {
  const c = capClass(z);
  if (c.key === 'other') return { text: 'Прочие', title: '', ok: true };
  if (c.key) return { text: `${c.key.split('-')[1]} класс`, title: c.label, ok: true };
  if (!c.missing.length) return { text: '—', title: '', ok: false };
  return { text: 'не определён', title: `Не хватает: ${c.missing.join(', ')}`, ok: false };
}

// Строка «Не хватает: …» под признаками зоны или литеры; пусто, если тип не
// выбран (об этом говорит заметка вместо признаков) или класс посчитан.
export function missingText(t) {
  const c = capClass(t);
  if (c.key || !kindOf(t)) return '';
  return c.missing.length ? `Не хватает для класса: ${c.missing.join(', ')}` : '';
}

export const zoneTitle = (z, i) => (z.name && z.name.trim()) || `Подгруппа ${i + 1}`;

// Сверка суммы зон с площадью литеры по внутреннему обмеру — теми же словами,
// что сверка этажей: «не хватает» / «лишние» / «сходится».
export function zonesSum(oi) {
  const total = num((oi.areas || {}).build);
  const sum = zonesOf(oi).reduce((a, z) => a + areaOf(z), 0);
  const diff = Math.round((sum - (Number.isFinite(total) ? total : 0)) * 100) / 100;
  return { total: Number.isFinite(total) ? total : 0, sum, diff, ok: Math.abs(diff) < 0.01 };
}

export function diffText(diff) {
  if (Math.abs(diff) < 0.01) return 'сходится';
  return (diff < 0 ? 'не хватает ' : 'лишние ') + fmtNum(Math.abs(diff)) + ' м²';
}

// Есть ли у литеры часть данного типа — производственные доп. параметры
// нужны, если производственная хоть одна зона.
export const hasKind = (oi, kind) => kindOf(oi) === kind || zonesOf(oi).some((z) => z.litKind === kind);

// Средневзвешенная капитальность литеры из зон: Σ (площадь × К) / Σ площадь —
// как «средняя капитальность застройки, взвешенная по площади каждого здания»
// методологии, только внутри литеры. Зона без площади или без К не входит;
// skipped — сколько таких.
export function zonesAvgK(oi) {
  let a = 0;
  let ak = 0;
  let skipped = 0;
  zonesOf(oi).forEach((z) => {
    const { k } = capScore(z);
    const s = areaOf(z);
    if (k === null || !s) { skipped += 1; return; }
    a += s;
    ak += s * k;
  });
  return { k: a ? ak / a : null, skipped, area: a, areaK: ak };
}

// Строка «Класс ОИ» в «Общих параметрах»: у цельной литеры — класс и К, у
// литеры из зон — площади по классам и средневзвешенный К.
export function classLine(oi) {
  const k2 = (v) => v.toFixed(2).replace('.', ',');
  if (hasZones(oi)) {
    const a = zonesAvgK(oi);
    return distributionText(oi) + (a.k === null ? '' : ` · К ср. ${k2(a.k)}`);
  }
  const c = capClass(oi);
  if (!c.label) return c.missing.length ? `Не хватает: ${c.missing.join(', ')}` : '—';
  const { k } = capScore(oi);
  return k === null || c.key === 'other' ? c.label : `${c.label} · К ${k2(k)}`;
}
