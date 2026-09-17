import { esc } from '../../../kernel/dom.js';
import { fmtNum, num } from '../../../kernel/fmt.js';
import { mechUnits, totalQty } from './mech/model.js';

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
    // Вторая площадь перечня — по внутреннему обмеру (в данных areas.build).
    // Обе колонки нужны рядом: по ним и сверяют строение с техпаспортом.
    tableAreaBuild: (oi) => (oi.areas && oi.areas.build ? fmtNum(num(oi.areas.build)) + ' м²' : '—'),
    areaValues: (oi) => ({ area: num((oi.areas || {}).tp), build: num((oi.areas || {}).build) }),
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

  // Механизмы и оборудование: перечень единиц техники в одном ОИ. Подпись ОИ —
  // производная от состава (oi/mech/model.js, syncMechName), своего кода ЕНИ и
  // литеры нет (решение пользователя 07.09.2026, ветка mech).
  mech: {
    id: 'mech',
    headLabel: 'Механизмы и оборудование',
    listLabel: (oi) => `Механизмы · ${esc(oi.name)}`,
    crumbLabel: (oi) => esc(oi.name),
    plateKind: 'ОЦ → ОИ',
    hasLetter: false,
    // Кода ЕНИ у механизма нет — пустой чип «ЕНИ» в плашке только путал
    // (замечание пользователя 07.09.2026, ветка mech).
    hasEni: false,
    tableCategory: () => 'Движимое · Механизмы',
    tableArea: () => '—',
    tableAreaBuild: () => '—',
    areaValues: () => ({ area: 0, build: 0 }),
    plateChips: (oi) => {
      const units = mechUnits(oi);
      const v = verbal(oi);
      return [
        `<span class="ctx-chip">${units.length} ${units.length === 1 ? 'позиция' : (units.length < 5 ? 'позиции' : 'позиций')} · ${totalQty(oi)} шт.</span>`,
        `<span class="ctx-chip ${v.c}">${v.t}</span>`,
      ];
    },
    load: () => import('./mech/index.js'),
  },

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
