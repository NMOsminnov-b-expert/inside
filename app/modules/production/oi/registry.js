import { esc } from '../../../kernel/dom.js';
import { fmtNum, num } from '../../../kernel/fmt.js';
import { mechListLabel } from '../../mechanisms/parts/mechConstructor.js';

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
    plateName: (oi) => oi.name,
    plateKind: 'ОЦ → литера',
    hasLetter: true,
    tableCategory: (oi) => oi.catClass || 'Гражданское здание',
    tableArea: (oi) => (oi.areas && oi.areas.tp ? fmtNum(num(oi.areas.tp)) + ' м²' : '—'),
    plateChips: (oi) => {
      const v = verbal(oi);
      return [
        `<span class="ctx-chip">${fmtNum(num(oi.areas.tp || 0))} м² общая</span>`,
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
    plateName: (oi) => oi.name,
    hasEni: false,
    plateKind: 'ОЦ → ОИ',
    hasLetter: false,
    tableCategory: () => 'Земельный участок',
    tableArea: (oi) => ((oi.areas && oi.areas.pravo) ? fmtNum(num(oi.areas.pravo)) + ' м²'
      : (oi.area ? fmtNum(num(oi.area)) + ' м²' : '—')),
    plateChips: () => [],
    load: () => import('./land/index.js'),
  },

  // Механизмы и оборудование — встроен из mechanisms (см. app/README.md,
  // исключение из изоляции модулей). Заменяет прежние card:'movable' с
  // kind:'МЕХ' и kind:'ОФИС' (были два разных пункта меню — по решению
  // пользователя объединены в один: офисная техника ничем принципиально не
  // отличается от любого другого механизма). Один ОИ — контейнер списка
  // механизмов (oi.mechanisms), поэтому нет ни своего oi.name (см.
  // mechListLabel), ни ЕНИ (у механизма его нет вовсе, не только тут).
  mech: {
    id: 'mech',
    headLabel: 'Механизмы',
    listLabel: (oi) => `Механизмы · ${esc(mechListLabel(oi.mechanisms))}`,
    crumbLabel: (oi) => esc(mechListLabel(oi.mechanisms)),
    plateName: (oi) => mechListLabel(oi.mechanisms),
    hasEni: false,
    plateKind: 'ОЦ → ОИ',
    hasLetter: false,
    tableCategory: () => 'Движимое · Механизм',
    tableArea: () => '—',
    plateChips: () => [],
    load: () => import('./mech/index.js'),
  },

  // Квартиру можно добавить в объект оценки любого типа (решение пользователя
  // 02.09.2026), поэтому карточка есть и здесь — импортом из модуля квартиры.
  apartment: {
    id: 'apartment',
    headLabel: 'Карточка квартиры',
    listLabel: (oi) => `Лит ${esc(oi.letter)} · ${esc(oi.name)}`,
    crumbLabel: (oi) => `Литера ${esc(oi.letter)} · ${esc(oi.name)}`,
    plateName: (oi) => oi.name,
    plateKind: 'ОЦ → литера',
    hasLetter: true,
    tableCategory: () => 'Квартира',
    tableArea: (oi) => (oi.areas && oi.areas.tp ? fmtNum(num(oi.areas.tp)) + ' м²' : '—'),
    plateChips: (oi) => {
      const v = verbal(oi);
      return [
        `<span class="ctx-chip">${fmtNum(num(oi.areas.tp || 0))} м² общая</span>`,
        `<span class="ctx-chip ${v.c}">${v.t}</span>`,
      ];
    },
    load: () => import('./apartment/index.js'),
  },
};

export function cardMeta(oi) {
  return OI_CARDS[oi && oi.card] || OI_CARDS.building;
}
