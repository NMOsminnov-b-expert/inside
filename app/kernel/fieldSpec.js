// Описание поля и его отрисовка — общий примитив макета.
//
// Первой на описаниях выросла карточка механизма (civil/data/mechFields.js):
// состав полей там зависит от выбранной категории, и держать разметку каждого
// поля в шаблоне было нечем. Карточка транспортного средства устроена так же,
// но живёт в двух модулях сразу — как объект имущества и как объект оценки, —
// поэтому конструкторы и отрисовка лежат в ядре: два одинаковых поля,
// нарисованных по-разному, расходятся на первой же правке.
//
// Предметной области здесь нет: ядро по-прежнему не знает ни одного типа ОЦ и
// ни одного вида ОИ — только виды значений и то, как поле выглядит.
//
// Поле: { key, label, type, units, options, hint }
//   type   — text | num | int | select | date;
//   units  — единицы числа: одна пишется в подписи («Длина, мм»), несколько
//            выбираются списком рядом с числом;
//   key    — устойчивое имя: значение хранится по нему, и одинаковый ключ в
//            разных категориях сохраняет введённое при смене категории.
import { esc } from './dom.js';
import { numText } from './numField.js';
import { msDropBodyHTML } from './multiSelect.js';

export const text = (key, label, o = {}) => ({ key, label, type: 'text', ...o });
export const num = (key, label, units = [], o = {}) => ({ key, label, type: 'num', units: [].concat(units), ...o });
export const int = (key, label, o = {}) => ({ key, label, type: 'int', ...o });
export const sel = (key, label, options, o = {}) => ({ key, label, type: 'select', options, ...o });
export const date = (key, label, o = {}) => ({ key, label, type: 'date', ...o });
export const yes = (key, label) => sel(key, label, ['Да', 'Нет']);
// Мультивыбор — когда значений у одной величины бывает несколько сразу:
// машина с завода ездит и на бензине, и на газе.
export const multi = (key, label, options, o = {}) => ({ key, label, type: 'multi', options, ...o });

// Значение поля и выбранная единица измерения. Единица — отдельное сведение и
// лежит отдельным ключом: «400» и «кВА» это разные данные.
export const paramOf = (params, key) => String((params || {})[key] || '');

export const paramList = (params, key) => {
  const v = (params || {})[key];
  return Array.isArray(v) ? v : [];
};

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
    // Мультивыбор — общий для проекта список с поиском (kernel/multiSelect.js):
    // в закрытом виде одна строка сводки с обрезкой, чтобы поле не росло по
    // высоте от числа выбранных значений.
    if (f.type === 'multi') {
      const picked = paramList(params, f.key);
      const shown = picked.join(', ');

      return `<div class="ms" data-${attr}-ms="${esc(f.key)}">
        <div class="ms-control" data-ms-control data-ms-toggle title="Открыть список">
          <span class="ms-summary ${picked.length ? '' : 'muted'}" title="${esc(shown)}">${
  esc(shown || 'не выбрано')}</span>
          <span class="ms-count" ${picked.length ? '' : 'hidden'}>${picked.length}</span>
          <span class="chev">▾</span>
        </div>
        <div class="ms-drop" hidden>
          ${msDropBodyHTML({ options: f.options, selected: picked, optAttr: attr + '-opt' })}
        </div>
      </div>`;
    }

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
