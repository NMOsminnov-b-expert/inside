// Описание поля и его отрисовка — одни на все карточки модуля.
//
// Первой на описаниях выросла карточка механизма (data/mechFields.js): состав
// полей там зависит от категории, и держать разметку каждого поля в шаблоне
// было нечем. Карточка транспортного средства устроена так же — поля зависят
// от типа ТС, — поэтому конструкторы и отрисовка вынесены сюда, а не
// скопированы: два одинаковых поля, нарисованных по-разному, расходятся на
// первой же правке.
//
// Поле: { key, label, type, units, options, hint }
//   type   — text | num | int | select | date;
//   units  — единицы числа: одна пишется в подписи («Длина, мм»), несколько
//            выбираются списком рядом с числом;
//   key    — устойчивое имя: значение хранится по нему, и одинаковый ключ в
//            разных категориях сохраняет введённое при смене категории.
import { esc } from '../../../kernel/dom.js';
import { numText } from '../../../kernel/numField.js';

export const text = (key, label, o = {}) => ({ key, label, type: 'text', ...o });
export const num = (key, label, units = [], o = {}) => ({ key, label, type: 'num', units: [].concat(units), ...o });
export const int = (key, label, o = {}) => ({ key, label, type: 'int', ...o });
export const sel = (key, label, options, o = {}) => ({ key, label, type: 'select', options, ...o });
export const date = (key, label, o = {}) => ({ key, label, type: 'date', ...o });
export const yes = (key, label) => sel(key, label, ['Да', 'Нет']);

// Значение поля и выбранная единица измерения. Единица — отдельное сведение и
// лежит отдельным ключом: «400» и «кВА» это разные данные.
export const paramOf = (params, key) => String((params || {})[key] || '');

export function paramUnit(params, f) {
  const saved = String((params || {})[f.key + '@unit'] || '');
  const units = f.units || [];
  return units.includes(saved) ? saved : (units[0] || '');
}

// Поле по его описанию. attr — имя data-атрибута, по которому контроллер
// находит поле («mu-f» у механизма, «vh-f» у транспортного средства).
//
// Число с выбором единицы — одно слитное поле: число и список единиц в общей
// рамке, подпись одна на оба (практика слитных групп Filament). Единственная
// единица списком не выбирается — она стоит в подписи через запятую, как в
// остальных карточках макета («Высота, м»).
export function fieldHTML(params, f, attr, idPrefix) {
  const value = paramOf(params, f.key);
  const id = idPrefix + f.key;
  const one = f.units && f.units.length === 1 ? f.units[0] : '';
  const many = f.units && f.units.length > 1 ? f.units : null;
  const label = esc(f.label + (one ? ', ' + one : ''));

  const control = () => {
    if (f.type === 'select') {
      return `<select class="select" id="${id}" data-${attr}="${esc(f.key)}">
        <option value="">Не выбрано</option>
        ${f.options.map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      </select>`;
    }
    if (f.type === 'date') {
      return `<input class="input mu-date" type="date" id="${id}" data-${attr}="${esc(f.key)}" value="${esc(value)}">`;
    }

    // Числовое поле — общее для всего макета (kernel/numField.js): разряды,
    // запятая и вычисление выражения. `data-num` говорит, какая это величина:
    // «int» — штуки, дробной части у них не бывает.
    const numeric = f.type === 'num' || f.type === 'int';
    const kind = f.type === 'int' ? 'int' : 'dec';
    const shown = numeric ? numText(value, kind) : value;
    const input = `<input class="input ${numeric ? 'mu-num' : ''}" id="${id}" data-${attr}="${esc(f.key)}"
      ${numeric ? `data-num="${kind}"` : ''} value="${esc(shown)}">`;

    if (!many) return input;
    const chosen = paramUnit(params, f);
    return `<span class="mu-unit-group">${input}
      <select class="select mu-unit" data-${attr}-unit="${esc(f.key)}" aria-label="Единица измерения: ${label}">
        ${many.map((u) => `<option ${u === chosen ? 'selected' : ''}>${esc(u)}</option>`).join('')}
      </select></span>`;
  };

  return `<div class="field mu-param">
    <label for="${id}">${label}</label>
    ${f.hint ? `<span class="mu-hint">${esc(f.hint)}</span>` : ''}
    ${control()}
  </div>`;
}
