// Значения перечней для полей карточек этого типа ОЦ.
//
// Поле карточки берёт значения из справочника раздела «Справочники»
// (kernel/dicts.js), а встроенный перечень из dictionaries.js остаётся
// запасным: если справочник не найден — например, его отвязали, — поле
// продолжает работать со старым списком, а не пустеет.
//
// Тип ОЦ здесь зашит: файл лежит внутри модуля и обслуживает только его.
import { optionsFor, groupedOptionsFor } from '../../../kernel/dicts.js';

const TYPE_ID = 'production';

export function opt(card, field, fallback) {
  return optionsFor(TYPE_ID, card, field) || fallback;
}

// Перечни с разделами («Категория ОИ», «Благоустройство»): структура собирается
// из позиций справочника, запасной вариант — встроенный перечень модуля.
export function optGroups(card, field, fallback) {
  return groupedOptionsFor(TYPE_ID, card, field) || fallback;
}
