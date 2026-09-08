// Значения перечней для полей карточек этого типа ОЦ.
//
// Поле карточки берёт значения из справочника раздела «Справочники»
// (kernel/dicts.js), а встроенный перечень из dictionaries.js остаётся
// запасным: если справочник не найден — например, его отвязали, — поле
// продолжает работать со старым списком, а не пустеет.
import { optionsFor } from '../../../kernel/dicts.js';
import { activeOcType } from '../../../kernel/ocType.js';

const OWN_TYPE = 'mechanisms';

const typeId = () => activeOcType() || OWN_TYPE;

export function opt(card, field, fallback) {
  return optionsFor(typeId(), card, field) || fallback;
}
