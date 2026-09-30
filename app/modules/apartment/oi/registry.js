import { esc } from '../../../kernel/dom.js';
// Статус ОИ и метка проверки импорта — одни на все виды ОИ (kernel/oiStage.js).
import { oiStageChips } from '../../../kernel/oiStage.js';
import { fmtNum, num } from '../../../kernel/fmt.js';
import { mechCardMeta } from '../../mechanisms/card.js';
import { vehicleCardMeta } from '../../vehicle/card.js';

// Реестр карточек ОИ модуля «Жилое здание (квартира)».
const chips = (oi) => {
  return [
    `<span class="ctx-chip">${fmtNum(num(oi.areas.tp || 0))} м² общая</span>`,
    ...oiStageChips(oi),
  ];
};

export const OI_CARDS = {
  apartment: {
    id: 'apartment',
    headLabel: 'Карточка квартиры',
    listLabel: (oi) => `Лит ${esc(oi.letter)} · ${esc(oi.name)}`,
    crumbLabel: (oi) => `Литера ${esc(oi.letter)} · ${esc(oi.name)}`,
    plateKind: 'ОЦ → литера',
    hasLetter: true,
    tableCategory: () => 'Квартира',
    tableArea: (oi) => (oi.areas && oi.areas.tp ? fmtNum(num(oi.areas.tp)) + ' м²' : '—'),
    // Вторая площадь перечня — по внутреннему обмеру (в данных areas.build).
    // Обе колонки нужны рядом: по ним и сверяют строение с техпаспортом.
    tableAreaBuild: (oi) => (oi.areas && oi.areas.build ? fmtNum(num(oi.areas.build)) + ' м²' : '—'),
    areaValues: (oi) => ({ area: num((oi.areas || {}).tp), build: num((oi.areas || {}).build) }),
    plateChips: chips,
    load: () => import('./apartment/index.js'),
  },

  building: {
    id: 'building',
    headLabel: 'Карточка ОИ (литера)',
    listLabel: (oi) => `Лит ${esc(oi.letter)} · ${esc(oi.name)}`,
    crumbLabel: (oi) => `Литера ${esc(oi.letter)} · ${esc(oi.name)}`,
    plateKind: 'ОЦ → литера',
    hasLetter: true,
    tableCategory: (oi) => oi.catClass || 'Гражданское здание',
    tableArea: (oi) => (oi.areas && oi.areas.tp ? fmtNum(num(oi.areas.tp)) + ' м²' : '—'),
    // Вторая площадь перечня — по внутреннему обмеру (в данных areas.build).
    // Обе колонки нужны рядом: по ним и сверяют строение с техпаспортом.
    tableAreaBuild: (oi) => (oi.areas && oi.areas.build ? fmtNum(num(oi.areas.build)) + ' м²' : '—'),
    areaValues: (oi) => ({ area: num((oi.areas || {}).tp), build: num((oi.areas || {}).build) }),
    plateChips: chips,
    load: () => import('./building/index.js'),
  },
  // Карточка участка берётся из land-plot — то же сознательное исключение из
  // изоляции модулей, что и в остальных модулях (см. oi/land/index.js).
  land: {
    id: 'land',
    headLabel: 'Земельный участок',
    listLabel: () => 'Земельный участок',
    crumbLabel: (oi) => esc(oi.name),
    plateKind: 'ОЦ → ОИ',
    hasLetter: false,
    tableCategory: () => 'Земельный участок',
    tableArea: (oi) => (oi.areas && oi.areas.pravo ? fmtNum(num(oi.areas.pravo)) + ' м²' : '—'),
    // У участка внутреннего обмера нет — там площадь по правоустанавливающим.
    tableAreaBuild: () => '—',
    areaValues: (oi) => ({ area: num((oi.areas && oi.areas.pravo) || oi.area), build: 0 }),
    plateChips: () => [],
    load: () => import('./land/index.js'),
  },

  // Механизмы и оборудование и транспортное средство — объекты имущества в
  // любом типе ОЦ (решение пользователя 28.09.2026). Описания общие на все
  // модули (mechanisms/card.js, vehicle/card.js); карточки грузятся лениво.
  mech: { ...mechCardMeta(oiStageChips), load: () => import('./mech/index.js') },
  vehicle: { ...vehicleCardMeta(oiStageChips), load: () => import('./vehicle/index.js') },
};
export function cardMeta(oi) {
  return OI_CARDS[oi && oi.card] || OI_CARDS.apartment;
}
