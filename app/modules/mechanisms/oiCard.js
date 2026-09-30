// Механизмы и оборудование как объект имущества — в любом типе ОЦ (решение
// пользователя 28.09.2026: «механизмы могут быть в любом ОЦ»). Карточка и
// описание для реестра карточек ОИ одни на все модули: модуль недвижимости
// подключает их через дверь ../card.js и своего кода механизмов не держит.
import { esc } from '../../kernel/dom.js';
import { splitWrap, viewerHTML } from '../../kernel/viewer/shell.js';
import { mechFormHTML } from './form/view.js';
import { bindMechForm } from './form/ctrl.js';
import { mechUnits, createUnit, syncMechName, totalQty } from './form/model.js';

export const mechOiCard = {
  id: 'mech',

  // Состав не бывает пустым: ОИ без единиц открылся бы карточкой, в которой
  // нечего заполнять.
  init(oi) {
    const list = mechUnits(oi);
    if (!list.length) list.push(createUnit());
    syncMechName(oi);
  },

  render(ctx, oi) {
    return splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, mechFormHTML(ctx, oi));
  },

  bind: bindMechForm,
};

// Запись реестра карточек ОИ (<модуль>/oi/registry.js, OI_CARDS.mech) без
// load: ленивую загрузку карточки модуль задаёт сам. stateChips — чипы
// статуса и проверки импорта (kernel/oiStage.js) — передаёт реестр модуля.
//
// Подпись ОИ — производная от состава (form/model.js, syncMechName); своего
// кода ЕНИ и литеры нет (решение пользователя 07.09.2026, ветка mech): пустой
// чип «ЕНИ» в плашке только путал.
export function mechCardMeta(stateChips) {
  return {
    id: 'mech',
    headLabel: 'Механизмы и оборудование',
    listLabel: (oi) => `Механизмы · ${esc(oi.name)}`,
    crumbLabel: (oi) => esc(oi.name),
    plateKind: 'ОЦ → ОИ',
    hasLetter: false,
    hasEni: false,
    tableCategory: () => 'Движимое · Механизмы',
    tableArea: () => '—',
    tableAreaBuild: () => '—',
    areaValues: () => ({ area: 0, build: 0 }),
    plateChips: (oi) => {
      const units = mechUnits(oi);
      return [
        `<span class="ctx-chip">${units.length} ${units.length === 1 ? 'позиция' : (units.length < 5 ? 'позиции' : 'позиций')} · ${totalQty(oi)} шт.</span>`,
        ...stateChips(oi),
      ];
    },
  };
}
