import { esc } from '../../../kernel/dom.js';
// Статус ОИ и метка проверки импорта — одни на все виды ОИ (kernel/oiStage.js).
import { oiStageChips } from '../../../kernel/oiStage.js';
import { fmtNum, num } from '../../../kernel/fmt.js';
import { mechCardMeta } from '../../mechanisms/card.js';
import { vehicleCardMeta } from '../../vehicle/card.js';

// Реестр карточек ОИ модуля «Нежилое здание».
export const OI_CARDS = {
  building: {
    id: 'building',
    headLabel: 'Карточка ОИ (литера)',
    listLabel: (oi) => `Лит ${esc(oi.letter)} · ${esc(oi.name)}`,
    crumbLabel: (oi) => `Литера ${esc(oi.letter)} · ${esc(oi.name)}`,
    plateKind: 'ОЦ → литера',
    hasLetter: true,
    tableCategory: (oi) => oi.catClass || '—',
    tableArea: (oi) => (oi.areas && oi.areas.tp ? fmtNum(num(oi.areas.tp)) + ' м²' : '—'),
    // Вторая площадь перечня — по внутреннему обмеру (в данных areas.build).
    // Обе колонки нужны рядом: по ним и сверяют строение с техпаспортом.
    tableAreaBuild: (oi) => (oi.areas && oi.areas.build ? fmtNum(num(oi.areas.build)) + ' м²' : '—'),
    areaValues: (oi) => ({ area: num((oi.areas || {}).tp), build: num((oi.areas || {}).build) }),
    plateChips: (oi) => {
      return [
        `<span class="ctx-chip">${fmtNum(num(oi.areas.tp || 0))} м² общая</span>`,
        ...oiStageChips(oi),
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
    // У участка внутреннего обмера нет — там площадь по правоустанавливающим.
    tableAreaBuild: () => '—',
    areaValues: (oi) => ({ area: num((oi.areas && oi.areas.pravo) || oi.area), build: 0 }),
    plateChips: () => [],
    load: () => import('./land/index.js'),
  },

  // Механизмы и оборудование: перечень единиц техники в одном ОИ. Описание
  // общее на все типы ОЦ (mechanisms/card.js); карточка грузится лениво.
  mech: { ...mechCardMeta(oiStageChips), load: () => import('./mech/index.js') },

  // Транспортное средство: одно ТС — один объект имущества. Описание общее на
  // все типы ОЦ (vehicle/card.js); карточка грузится лениво.
  vehicle: { ...vehicleCardMeta(oiStageChips), load: () => import('./vehicle/index.js') },

  // Вспомогательная постройка: гараж, навес, летняя кухня. Своего экрана нет —
  // всё, что у неё есть, правится раскрытием строки в перечне ОЦ, поэтому нет
  // и load. Мета нужна ради перечня: подпись вида, площади и подытог.
  aux: {
    id: 'aux',
    headLabel: 'Вспомогательная постройка',
    listLabel: (oi) => `Лит ${esc(oi.letter)} · ${esc(oi.name)}`,
    crumbLabel: (oi) => esc(oi.name),
    plateKind: 'ОЦ → ОИ',
    hasLetter: true,
    tableCategory: () => 'Вспомогательная постройка',
    tableArea: (oi) => (oi.areas && oi.areas.tp ? fmtNum(num(oi.areas.tp)) + ' м²' : '—'),
    tableAreaBuild: (oi) => (oi.areas && oi.areas.build ? fmtNum(num(oi.areas.build)) + ' м²' : '—'),
    areaValues: (oi) => ({ area: num((oi.areas || {}).tp), build: num((oi.areas || {}).build) }),
    plateChips: () => [],
  },

  // Квартиру можно добавить в объект оценки любого типа (решение пользователя
  // 02.09.2026), поэтому карточка есть и здесь — импортом из модуля квартиры.
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
    plateChips: (oi) => {
      return [
        `<span class="ctx-chip">${fmtNum(num(oi.areas.tp || 0))} м² общая</span>`,
        ...oiStageChips(oi),
      ];
    },
    load: () => import('./apartment/index.js'),
  },
};

export function cardMeta(oi) {
  return OI_CARDS[oi && oi.card] || OI_CARDS.building;
}
