import { esc } from '../../../kernel/dom.js';
import { fmtNum, num } from '../../../kernel/fmt.js';

// Реестр карточек ОИ модуля «Гражданское здание».
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
    tableArea: (oi) => (oi.areas && oi.areas.tp ? fmtNum(num(oi.areas.tp)) + ' м²' : '—'),
    plateChips: (oi) => {
      const v = verbal(oi);
      return [
        `<span class="ctx-chip">${fmtNum(num(oi.areas.tp || 0))} м² общая</span>`,
        `<span class="ctx-chip">этажей: ${oi.floors}</span>`,
        `<span class="ctx-chip ${v.c}">${v.t}</span>`,
      ];
    },
    load: () => import('./building/index.js'),
  },

  land: {
    id: 'land',
    headLabel: 'Земельный участок',
    listLabel: () => 'Земельный участок',
    crumbLabel: (oi) => esc(oi.name),
    plateKind: 'ОЦ → ОИ',
    hasLetter: false,
    tableCategory: () => 'Земельный участок',
    tableArea: (oi) => ((oi.areas && oi.areas.pravo) ? fmtNum(num(oi.areas.pravo)) + ' м²'
      : (oi.area ? fmtNum(num(oi.area)) + ' м²' : '—')),
    plateChips: () => [],
    load: () => import('./land/index.js'),
  },

  movable: {
    id: 'movable',
    headLabel: 'Движимое имущество',
    listLabel: (oi) => `${oi.kind === 'МЕХ' ? 'Механизм' : 'Офис. техника'} · ${esc(oi.name)}`,
    crumbLabel: (oi) => esc(oi.name),
    plateKind: 'ОЦ → ОИ',
    hasLetter: false,
    tableTag: (oi) => (oi.kind === 'МЕХ' ? 'Механизм' : 'Офис. техника'),
    tableCategory: (oi) => (oi.kind === 'МЕХ' ? 'Движимое · Механизм' : 'Движимое · Офисная техника'),
    tableArea: () => '—',
    plateChips: (oi) => {
      const v = verbal(oi);
      return [`<span class="ctx-chip ${v.c}">${v.t}</span>`];
    },
    load: () => import('./movable/index.js'),
  },
};

export function cardMeta(oi) {
  return OI_CARDS[oi && oi.card] || OI_CARDS.building;
}
