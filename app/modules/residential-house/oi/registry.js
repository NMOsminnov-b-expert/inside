import { esc } from '../../../kernel/dom.js';
import { fmt, num } from '../../../kernel/fmt.js';

// Реестр карточек ОИ ЭТОГО модуля. Добавить/убрать вид ОИ =
// папка рядом + строка здесь. Другие модули об этом не знают.
//
// Статическая часть (метаданные) нужна перечню ОИ, крошкам и плашке,
// поэтому она не должна тянуть за собой код карточки: сам код грузится лениво.
function verbal(oi) {
  const f = oi.flags || {};
  if ((oi.origin || 'manual') === 'ml') {
    if (f.entered && f.matched) return { t: 'проверено (сверено с документами — удостоверено)', c: 'pill-done' };
    return { t: f.entered ? 'импортировано по ML — ожидает проверки' : 'импортировано по ML', c: 'pill-pend' };
  }
  if (f.entered) return { t: 'введено вручную', c: 'pill-done' };
  return { t: 'не заполнено', c: 'pill-gray' };
}

export const OI_CARDS = {
  building: {
    id: 'building',
    headLabel: 'Карточка ОИ (литера)',
    listLabel: (oi) => `Лит ${esc(oi.letter)} · ${esc(oi.name)}`,
    crumbLabel: (oi) => `Литера ${esc(oi.letter)} · ${esc(oi.name)}`,
    plateKind: 'ОЦ → литера',
    hasLetter: true,
    tableCategory: (oi) => oi.catClass || 'Гражданское здание',
    tableArea: (oi) => (oi.areas && oi.areas.tp ? fmt(num(oi.areas.tp)) + ' м²' : '—'),
    plateChips: (oi) => {
      const v = verbal(oi);
      return [
        `<span class="ctx-chip">${fmt(num(oi.areas.tp || 0))} м² общая</span>`,
        `<span class="ctx-chip">этажей: ${oi.floors}</span>`,
        `<span class="ctx-chip ${v.c}">${v.t}</span>`,
      ];
    },
    load: () => import('./building/index.js'),
  },

  apartment: {
    id: 'apartment',
    headLabel: 'Карточка квартиры',
    listLabel: (oi) => `Лит ${esc(oi.letter)} · ${esc(oi.name)}`,
    crumbLabel: (oi) => `Литера ${esc(oi.letter)} · ${esc(oi.name)}`,
    plateKind: 'ОЦ → литера',
    hasLetter: true,
    tableCategory: () => 'Квартира',
    tableArea: (oi) => (oi.areas && oi.areas.tp ? fmt(num(oi.areas.tp)) + ' м²' : '—'),
    plateChips: (oi) => {
      const v = verbal(oi);
      return [
        `<span class="ctx-chip">${fmt(num(oi.areas.tp || 0))} м² общая</span>`,
        `<span class="ctx-chip">этажей: ${oi.floors}</span>`,
        `<span class="ctx-chip ${v.c}">${v.t}</span>`,
      ];
    },
    load: () => import('./apartment/index.js'),
  },

  land: {
    id: 'land',
    headLabel: 'Земельный участок',
    listLabel: () => 'Земельный участок',
    crumbLabel: (oi) => esc(oi.name),
    plateKind: 'ОЦ → ОИ',
    hasLetter: false,
    tableCategory: () => 'Земельный участок',
    tableArea: (oi) => (oi.areas && oi.areas.pravo ? fmt(num(oi.areas.pravo)) + ' м²' : '—'),
    plateChips: () => [],
    load: () => import('./land/index.js'),
  },
};

export function cardMeta(oi) {
  return OI_CARDS[oi && oi.card] || OI_CARDS.building;
}
