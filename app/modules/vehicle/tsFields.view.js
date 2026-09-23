// Отрисовка поля карточки ТС по описанию из справочника (data/tsCatalog.js).
//
// Своя, а не kernel/fieldSpec.js: у поля ТС есть то, чего нет у общего
// примитива, — пометка, откуда поле заполняется, с подсказкой, где графа стоит
// на бланках свидетельства; год (четыре цифры без разрядов); флажки для
// ходовой; подсказки к свободной записи «Тип ТС, вид кузова».
//
// Поле находится контроллером по data-tsf="<чьё>|<ключ>": «main» — сама
// машина, иначе — id модуля. Так один контроллер обслуживает и машину, и
// каждый модуль на ней.
import { esc } from '../../kernel/dom.js';
import { numText } from '../../kernel/numField.js';
import { vinWarning } from './tsModel.js';

// Зачем поле — у тех, чья надобность неочевидна (указание пользователя
// 23.09.2026: «пояснения про надобность некоторых полей»). Одна короткая фраза
// под полем, видна всегда (практика подсказок для новичка). Откуда
// переписывать — не здесь, а в подсказке к метке «ТП».
export const WHY = {
  plate: 'Он же госномер',
  vid: 'Номер машины в базе регистрации — по нему её находят в реестре',
  engineNo: 'Есть на старых бланках и в документах на тракторы; на книжке 2019 г. графы нет',
  wheel: 'Праворульные с 2015 г. не регистрируют — важно для подбора аналогов',
  massMax: 'По ней выбирают базу: до 3,5 т, 3,5–12 т, свыше 12 т',
  wheelFormula: 'Полный привод или нет — по ней подбирают аналоги',
  steerAxles: 'Отличает многоосную технику: краны, тягачи, спецшасси',
  pto: 'Есть коробка отбора — от двигателя может работать гидравлика модулей',
  engineHours: 'Наработка, когда машина работает стоя: кран, насос, спецтехника',
  hours: 'Счётчик самого оборудования: крана, насоса, холодильной установки',
  regDate: 'С какого числа машина за нынешним собственником',
  factAddr: 'Куда ехать на осмотр',
  country: 'От сборки зависит подбор аналогов: лицензионная и китайская стоят иначе',
  kit: 'Ключи, запасное колесо, инструмент, документы — что передаётся вместе с машиной',
};

const TAG = {
  'Техпаспорт': { text: 'ТП', title: 'Из техпаспорта (свидетельства о регистрации)' },
  'Осмотр': { text: 'осмотр', title: 'Определяется на осмотре' },
  'Техпаспорт или осмотр': { text: 'ТП · осмотр', title: 'Из техпаспорта, а если графы нет — на осмотре' },
};

const valueOf = (vals, key) => String((vals || {})[key] ?? '');

// Короткая подпись для узкого поля (правило проекта: сокращение — с точкой,
// полное название — в подсказке). Длинная подпись в поле на четверть строки
// переносилась в две-три строки и раздувала высоту формы.
const SHORT = {
  massMax: 'Макс. разреш. масса', massEmpty: 'Масса без нагр.', steerAxles: 'Управляемых осей',
  axles: 'Число осей', pto: 'Отбор мощности (КОМ)', engineVolume: 'Рабочий объём', seats: 'Мест',
  regDate: 'Дата регистрации', docNo: 'Серия и № документа', wheelFormula: 'Колёсная формула',
  engineHours: 'Моточасы', mileage: 'Пробег', massDesign: 'Констр. масса',
  maker: 'Изготовитель', model: 'Модель', year: 'Год выпуска', hours: 'Моточасы', state: 'Тех. состояние',
  serialNo: 'Заводской №',
};

export function unitOf(vals, f) {
  const saved = valueOf(vals, f.key + '@unit');
  return (f.units || []).includes(saved) ? saved : ((f.units || [])[0] || '');
}

// Пометка источника в строке подписи (практика «пометка источника поля»):
// короткое слово видно сразу, подробности — во всплывающей подсказке.
function tagHTML(f) {
  const t = TAG[f.source];
  if (!t) return '';
  const tip = [t.title, f.place ? 'Где на бланке — ' + f.place : '', f.hint || ''].filter(Boolean).join('\n');
  const kind = { 'Осмотр': 'is-insp', 'Техпаспорт или осмотр': 'is-mixed' }[f.source] || '';
  return `<span class="vh-src ${kind}" title="${esc(tip)}"
    aria-label="${esc(tip)}">${t.text}</span>`;
}

export function tsFieldHTML(vals, f, owner, cls = '') {
  const id = `ts-${owner}-${f.key}`;
  const bind = `${owner}|${f.key}`;
  const value = valueOf(vals, f.key);
  const one = f.units && f.units.length === 1 ? f.units[0] : '';
  const many = f.units && f.units.length > 1;
  const label = esc((SHORT[f.key] || f.label) + (one ? ', ' + one : ''));
  const full = esc(f.label + (one ? ', ' + one : ''));
  // У поля без пометки источника (особые поля баз) пояснение — строкой под
  // полем: оно короткое, и спрятать его некуда.
  // Пояснение, которое только перечисляет варианты списка, не показываем: из
  // него варианты и собраны, и под полем оно их повторяет.
  const hint = String(f.hint || '').toLowerCase();
  const echoes = (f.options || []).length && f.options.every((o) => hint.includes(o.toLowerCase()));
  // Комплектность модуля — не «что передаётся с машиной»: пояснение только у машины.
  const why = f.key === 'kit' && owner !== 'main' ? '' : WHY[f.key];
  const note = why || (!f.source && f.hint && !echoes ? f.hint : '');
  const under = note ? `<span class="vh-why">${esc(note)}</span>` : '';

  const head = `<label for="${id}" title="${full}">${label}${tagHTML(f)}</label>`;

  if (f.type === 'checks') {
    const picked = Array.isArray((vals || {})[f.key]) ? vals[f.key] : [];
    return `<fieldset class="field vh-checks field-wide ${cls}" data-ts-key="${esc(f.key)}">
      <legend>${label} <span class="vh-note">можно несколько</span>${tagHTML(f)}</legend>
      <div class="vh-check-grid">${f.options.map((o) => `<label class="vh-check">
        <input type="checkbox" data-tsf-check="${esc(bind)}" value="${esc(o)}" ${picked.includes(o) ? 'checked' : ''}>
        <span>${esc(o)}</span></label>`).join('')}</div>
      ${under}
    </fieldset>`;
  }

  let control;
  if (f.type === 'select' || f.type === 'yes') {
    const opts = f.type === 'yes' ? ['Да', 'Нет'] : f.options;
    control = `<select class="select" id="${id}" data-tsf="${esc(bind)}">
      <option value="">Не выбрано</option>
      ${opts.map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select>`;
  } else if (f.type === 'area') {
    control = `<textarea class="input mu-area" id="${id}" data-tsf="${esc(bind)}" rows="2">${esc(value)}</textarea>`;
  } else if (f.type === 'date') {
    control = `<input class="input mu-date" type="date" id="${id}" data-tsf="${esc(bind)}" value="${esc(value)}">`;
  } else if (f.type === 'year') {
    control = `<input class="input mu-num vh-year" id="${id}" data-tsf="${esc(bind)}" value="${esc(value)}"
      inputmode="numeric" maxlength="4" placeholder="ГГГГ">`;
  } else if (f.type === 'int' || f.type === 'num') {
    const kind = f.type === 'int' ? 'int' : 'dec';
    control = `<input class="input mu-num" id="${id}" data-tsf="${esc(bind)}" data-num="${kind}"
      value="${esc(numText(value, kind))}">`;
    if (many) {
      const chosen = unitOf(vals, f);
      control = `<span class="mu-unit-group">${control}
        <select class="select mu-unit" data-tsf-unit="${esc(bind)}" aria-label="Единица измерения: ${esc(f.label)}">
          ${f.units.map((u) => `<option ${u === chosen ? 'selected' : ''}>${esc(u)}</option>`).join('')}
        </select></span>`;
    }
  } else {
    const list = f.suggest ? `list="${id}-list"` : '';
    control = `<input class="input" id="${id}" data-tsf="${esc(bind)}" value="${esc(value)}" ${list}
      ${f.key === 'vin' ? 'autocapitalize="characters" spellcheck="false" maxlength="30"' : ''}
      ${f.key === 'plate' ? 'autocapitalize="characters" spellcheck="false"' : ''}>
      ${f.suggest ? `<datalist id="${id}-list">${f.suggest.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>` : ''}`;
  }

  // Сообщение-предупреждение (VIN) — в потоке под полем: оно длиннее строки и
  // не должно перекрывать соседнее поле.
  // Рисуется по значению: иначе любая перерисовка карточки его прятала.
  const vw = f.key === 'vin' ? vinWarning(value) : '';
  const warn = f.key === 'vin' ? `<span class="vh-warn" data-ts-warn="${esc(bind)}" ${vw ? '' : 'hidden'}>${esc(vw)}</span>` : '';
  return `<div class="field${f.type === 'area' ? ' field-wide' : ''} ${cls}" data-ts-key="${esc(f.key)}">
    ${head}${control}${under}${warn}
  </div>`;
}
