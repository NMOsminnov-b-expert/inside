// Конструктор полей: описание отдельно от разметки.
//
// Зачем (задача пользователя 08.09.2026): «пусть берёт основу в карточках по
// структуре ОЦ → ОИ… чтобы изменения карточки и осмотры подхватывали. Так
// сказать нужен конструктор. Таким образом и синхронизируем карточки».
//
// Сегодня одно и то же поле описано в разметке каждого экрана своими руками, и
// синхронность карточек держится ПРОВЕРКОЙ (check_building_same.py, 365
// сравнений), а не устройством кода. Сломать её может любая правка одного
// модуля из пяти; проверка это поймает, но только после того, как расхождение
// уже написано.
//
// Здесь другой порядок: поле описывается ОДИН раз — что это за поле, какие у
// него значения, где лежит значение в записи, когда поле видно, — а разметку
// по описанию строит этот файл. Из одного описания получаются и настольная
// карточка, и мобильный экран осмотра; переименовали значение или добавили
// вариант — подхватывают оба.
//
// Что описание УЖЕ умеет: текст, число с единицей, одиночный и множественный
// выбор кнопками-чипами, длинный текст, обязательность, показ рядом значения
// «по документам» (для полей, которые осмотрщик заполняет своим замером).
//
// Чего оно СПЕЦИАЛЬНО не умеет: поэтажную развёртку, таблицу конструктива с
// износом, аренду по этажам, выбор с поиском. Это не поля, а свои виджеты со
// своим поведением — им место в собственных файлах, и описание должно уметь
// сослаться на такой виджет, а не пытаться его заменить. Иначе конструктор
// превратится во второй язык разметки, только хуже.
import { esc } from './dom.js';

// --- чтение и запись значения ---------------------------------------------
//
// Путь вида 'areas.tp' — потому что в записи значения лежат и в корне
// («year»), и во вложенных объектах («areas.tp», «heights.ext», «struct.roof»).
// Описанию поля не нужно знать про эту разницу.
export function getValue(obj, path) {
  if (!obj || !path) return undefined;
  return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

export function setValue(obj, path, value) {
  const keys = String(path).split('.');
  const last = keys.pop();
  const box = keys.reduce((o, k) => {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    return o[k];
  }, obj);
  box[last] = value;
}

export const isFilled = (v) => (Array.isArray(v)
  ? v.length > 0
  : String(v == null ? '' : v).trim() !== '');

// --- разметка --------------------------------------------------------------
//
// Классы приходят снаружи (ui): у настольной карточки и у мобильного экрана
// оформление разное, а описание поля одно. Конструктор не должен решать, как
// поле выглядит, — только из чего оно состоит.
const DEF_UI = {
  field: 'fs-field',
  label: 'fs-label',
  req: 'fs-req',
  opts: 'fs-opts',
  opt: 'fs-opt',
  on: 'on',
  input: 'fs-input',
  unit: 'fs-unit',
  area: 'fs-area',
  hint: 'fs-hint',
};

function optsHTML(field, value, ui) {
  const list = Array.isArray(value) ? value : (value ? [value] : []);

  return `<div class="${ui.opts}" ${field.multi ? 'data-fs-multi' : ''}>
    ${field.opts.map((o) => `<button type="button"
      class="${ui.opt} ${list.includes(o) ? ui.on : ''}"
      data-fs-opt="${esc(field.key)}|${esc(o)}"
      aria-pressed="${list.includes(o) ? 'true' : 'false'}">${esc(o)}</button>`).join('')}
  </div>`;
}

function inputHTML(field, value, ui) {
  return `<div class="${ui.input}-wrap">
    <input class="${ui.input}" data-fs-input="${esc(field.key)}"
      value="${esc(value == null ? '' : value)}"
      ${field.num ? 'inputmode="decimal"' : ''}
      ${field.max ? `maxlength="${field.max}"` : ''}
      ${field.placeholder ? `placeholder="${esc(field.placeholder)}"` : ''}>
    ${field.unit ? `<span class="${ui.unit}">${esc(field.unit)}</span>` : ''}
  </div>`;
}

// hint — то, что показываем рядом со значением: обычно «по документам», чтобы
// расхождение с замером было видно сразу (решение пользователя 08.09.2026 —
// осмотрщик не правит данные ЦОД, а дублирует своим значением).
export function fieldHTML(field, value, { ui = {}, hint = '' } = {}) {
  const u = Object.assign({}, DEF_UI, ui);

  const body = field.opts ? optsHTML(field, value, u)
    : field.long ? `<textarea class="${u.area}" data-fs-input="${esc(field.key)}"
        rows="${field.rows || 3}">${esc(value == null ? '' : value)}</textarea>`
      : inputHTML(field, value, u);

  return `<div class="${u.field}" data-fs-field="${esc(field.key)}">
    <span class="${u.label}">${esc(field.label)}${field.req ? `<i class="${u.req}" aria-hidden="true">*</i>` : ''}</span>
    ${body}
    ${hint ? `<span class="${u.hint}">${esc(hint)}</span>` : ''}
  </div>`;
}

export function sectionHTML(section, values, opts = {}) {
  const fields = (section.fields || []).filter((f) => !f.visible || f.visible(values, opts.rec));
  if (!fields.length) return '';

  const inner = fields
    .map((f) => fieldHTML(f, getValue(values, f.path || f.key), {
      ui: opts.ui,
      hint: opts.hintFor ? opts.hintFor(f) : '',
    }))
    .join('');

  return opts.wrap ? opts.wrap(section, inner) : inner;
}

// --- поведение -------------------------------------------------------------
//
// Слушатели вешаются делегированием на корень экрана: разметка переписывается
// на каждой отрисовке, и слушатели на самих элементах пришлось бы навешивать
// заново.
//
// onChange вызывается ПОСЛЕ записи значения — экран сам решает, перерисовывать
// себя или нет. Текстовые поля перерисовывать нельзя: потеряется фокус.
// values — объект значений ИЛИ функция, возвращающая его. Функция нужна там,
// где значения зависят от маршрута: слушатели вешаются один раз при монтаже, и
// объект, взятый в этот момент, остался бы навсегда от первого экрана. На этом
// я и попался 08.09.2026: чипы писали в значения того ОИ, на котором экран
// смонтировался, а показывали значения открытого — и выбор «не отмечался».
export function bindFields(scope, { values, fields, onChange }) {
  const byKey = new Map((fields || []).map((f) => [f.key, f]));
  const vals = () => (typeof values === 'function' ? values() : values);

  scope.on('click', '[data-fs-opt]', (e, el) => {
    const [key, opt] = String(el.dataset.fsOpt).split('|');
    const field = byKey.get(key);
    if (!field) return;

    const box = vals();
    const path = field.path || field.key;
    const cur = getValue(box, path);

    if (field.multi) {
      const list = Array.isArray(cur) ? cur.slice() : [];
      const i = list.indexOf(opt);
      if (i >= 0) list.splice(i, 1); else list.push(opt);
      setValue(box, path, list);
    } else {
      // Повторное нажатие снимает выбор: на телефоне это единственный способ
      // исправить ошибочное касание — очистить поле иначе нечем.
      setValue(box, path, cur === opt ? '' : opt);
    }

    if (onChange) onChange(field, getValue(box, path));
  });

  scope.on('input', '[data-fs-input]', (e, el) => {
    const field = byKey.get(el.dataset.fsInput);
    if (!field) return;
    setValue(vals(), field.path || field.key, el.value);
    if (onChange) onChange(field, el.value, { typing: true });
  });
}

// --- сводка по заполненности ----------------------------------------------

export function requiredLeft(fields, values) {
  return (fields || []).filter((f) => f.req && !isFilled(getValue(values, f.path || f.key))).length;
}

export function filledCount(fields, values) {
  return (fields || []).filter((f) => isFilled(getValue(values, f.path || f.key))).length;
}
