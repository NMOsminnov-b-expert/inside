import { esc } from '../../kernel/dom.js';
import { blockNumbers } from '../../kernel/blockIndex.js';
import { ownerNames } from './records.js';
import { splitWrap, viewerHTML } from '../../kernel/viewer/shell.js';
import { ocHeadHTML } from '../../kernel/ocHead.js';
import { partiesHTML } from './parties.view.js';
import { tsFieldHTML } from './tsFields.view.js';
import {
  KINDS, CATEGORIES, basesOf, baseInfo, selfGroups, selfKinds, selfInfo, moduleGroups, moduleKinds,
  moduleInfo, MODULE_FIELDS, tsOf, classified, commonFields, specialFields,
  moduleTitle, tsTitle, whatLabel,
} from './tsModel.js';

// Карточка транспортного средства как объекта оценки — по категоризации
// «база + модуль» (справочник docs/kategorii-ts-baza-modul.xlsx).
//
// Блоки — по смыслу, а не по тому, кто их заполняет (указание пользователя
// 23.09.2026): откуда берётся значение, говорит метка у поля — «ТП» или
// «осмотр». Порядок внутри «Машины» и «Регистрации» — как на свидетельстве о
// регистрации (практика «порядок полей как в документе», Smith & Mosier
// 1.4/25): ЦОД переписывает с бланка сверху вниз, не прыгая по форме. Бланков
// два, порядок у них разный, поэтому группы общие для обоих, а у каждой графы
// в подсказке — где она на каждом бланке.
//
//   01  Учреждение, собственники и ответственные
//   02  Вид объекта            — ТС, самоходная машина или отдельный модуль;
//                                 категория → база или группа → вид
//   03  Машина (или Модуль)    — подразделы: общие сведения, номера (таблицей),
//                                 двигатель, массы, ходовая и трансмиссия,
//                                 особое для базы, дополнительные параметры
//   04  Регистрация            — рег. номер, собственник по свидетельству
//   05  Наработка и состояние
//   06  Модули                 — что стоит на машине: таблица и форма модуля

const card = (tone, idx, title, hint, body, extra = '') => `<div class="card t-${tone}">
  <div class="card-head"><span class="card-idx">${idx}</span><h3>${esc(title)}</h3>
    ${hint ? `<span class="hint">${esc(hint)}</span>` : ''}${extra}</div>
  <div class="card-pad">${body}</div></div>`;

const options = (list, value, empty) => `<option value="">${esc(empty)}</option>${
  list.map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}`;

// --- 02 Вид объекта -----------------------------------------------------------
// Сначала «что это», затем каскад. Вид объекта — три взаимоисключающих
// варианта, все видны сразу: переключатель, а не список.
function kindHTML(v, idx) {
  const seg = `<div class="vh-seg" role="radiogroup" aria-label="Вид объекта">${KINDS.map((k) => `
    <button type="button" class="vh-seg-btn ${v.kind === k.key ? 'on' : ''}" role="radio"
      aria-checked="${v.kind === k.key}" data-ts-kind="${k.key}">${esc(k.label)}</button>`).join('')}</div>`;

  let cascade = '';
  let about = null;
  if (v.kind === 'base') {
    const bases = basesOf(v.category).map((b) => b.name);
    about = baseInfo(v.base);
    cascade = `<div class="field"><label for="ts-cat">Категория по техпаспорту</label>
        <select class="select" id="ts-cat" data-ts-cat>${options(CATEGORIES, v.category, 'Выберите категорию')}</select>
        <span class="mu-hint mu-hint-under">Как записано в свидетельстве: «легковой», «грузовой», «прицеп»…</span></div>
      <div class="field"><label for="ts-base">База</label>
        <select class="select" id="ts-base" data-ts-base ${v.category ? '' : 'disabled'}>${
  options(bases, v.base, v.category ? 'Выберите базу' : 'Сначала категория')}</select></div>`;
  } else if (v.kind === 'self') {
    about = selfInfo(v.selfGroup, v.selfKind);
    cascade = `<div class="field"><label for="ts-sg">Группа</label>
        <select class="select" id="ts-sg" data-ts-sgroup>${options(selfGroups(), v.selfGroup, 'Выберите группу')}</select></div>
      <div class="field"><label for="ts-sk">Вид машины</label>
        <select class="select" id="ts-sk" data-ts-skind ${v.selfGroup ? '' : 'disabled'}>${
  options(selfKinds(v.selfGroup).map((k) => k.name), v.selfKind, v.selfGroup ? 'Выберите вид' : 'Сначала группа')}</select></div>`;
  } else if (v.kind === 'module') {
    about = moduleInfo(v.modGroup, v.modKind);
    cascade = `<div class="field"><label for="ts-mg">Группа</label>
        <select class="select" id="ts-mg" data-ts-mgroup>${options(moduleGroups(), v.modGroup, 'Выберите группу')}</select></div>
      <div class="field"><label for="ts-mk">Модуль</label>
        <select class="select" id="ts-mk" data-ts-mkind ${v.modGroup ? '' : 'disabled'}>${
  options(moduleKinds(v.modGroup).map((k) => k.name), v.modKind, v.modGroup ? 'Выберите модуль' : 'Сначала группа')}</select></div>`;
  }

  // Справка о выбранном: как узнать и примеры — чтобы сверить выбор с машиной,
  // не открывая справочник.
  const info = about ? `<div class="vh-about">
      ${about.hint && v.kind === 'base' ? `<div><b>Как узнать.</b> ${esc(about.hint)}</div>` : ''}
      ${v.kind === 'self' && about.run ? `<div><b>Ходовая.</b> ${esc(about.run)}</div>` : ''}
      ${v.kind === 'module' && about.note ? `<div>${esc(about.note)}</div>` : ''}
      ${about.examples ? `<div><b>Примеры.</b> ${esc(about.examples)}</div>` : ''}
    </div>` : '';

  const body = `${seg}${cascade ? `<div class="grid g-2 g-roomy g-top vh-cascade">${cascade}</div>` : ''}${info}
    ${v.kind ? '' : '<div class="vehicle-note">Выберите, что оценивается, — появятся поля.</div>'}`;
  return card('blue', idx, 'Вид объекта', 'категоризация «база + модуль»', body);
}

// --- поля машины --------------------------------------------------------------
const grid = (vals, list, owner) => `<div class="grid g-2 g-roomy g-top vh-grid">${
  list.map((f) => tsFieldHTML(vals, f, owner)).join('')}</div>`;

// Подразделы «Машины» — по смыслу, в порядке граф свидетельства внутри
// каждого (указание пользователя 23.09.2026: «полей много, надо разбить на
// категории, чтобы не теряться»). Поле, которого нет ни в одном подразделе,
// попадает в «Общие сведения».
const SECTIONS = [
  { key: 'general', title: 'Общие сведения' },
  { key: 'numbers', title: 'Номера' },
  { key: 'engine', title: 'Двигатель' },
  { key: 'mass', title: 'Массы' },
  { key: 'chassis', title: 'Ходовая и трансмиссия' },
];
const SECTION_OF = {
  vin: 'numbers', bodyNo: 'numbers', chassisNo: 'numbers', engineNo: 'numbers', serialNo: 'numbers',
  fuel: 'engine', engineVolume: 'engine', power: 'engine',
  massEmpty: 'mass', massMax: 'mass', massDesign: 'mass',
  wheelFormula: 'chassis', axles: 'chassis', steerAxles: 'chassis', gearbox: 'chassis', pto: 'chassis',
  run: 'chassis', turn: 'chassis',
};

// От топлива зависит, какие поля двигателя показывать: у электромобиля нет
// рабочего объёма, есть только мощность (в свидетельстве у бензиновых
// мощность пустая, а у электро заполнена — слова пользователя 23.09.2026).
const ELECTRIC = 'Электро';
const shown = (v, f) => !(f.key === 'engineVolume' && v.f.fuel === ELECTRIC);

const sub = (title, body, extra = '') => `<div class="sec-h vh-sub">${esc(title)}${extra}</div>${body}`;

// Номера — таблицей (указание пользователя): у машины их несколько, и искать
// каждый по сетке полей неудобно. Строка — номер: подпись с меткой источника
// слева, значение справа. Под таблицей — общее для номеров предупреждение
// (практика «предупреждение вместо ошибки»): машину опознают хотя бы по
// одному из них.
function numbersHTML(v, list) {
  const rows = list.map((f) => `<tr><td class="vh-ncell">${tsFieldHTML(v.f, f, 'main')}</td></tr>`).join('');
  const idWarn = v.kind === 'base'
    ? '<div class="vh-warn vh-warn-group" data-ts-idwarn hidden>Нет ни VIN, ни № кузова, ни № шасси — '
      + 'машину не по чему опознать. Заполните хотя бы один номер.</div>'
    : '';
  return `<table class="tbl vh-ntbl"><tbody>${rows}</tbody></table>${idWarn}`;
}

function machineHTML(v, idx) {
  const list = commonFields(v).filter((f) => f.block === 'machine' && shown(v, f));
  const parts = SECTIONS.map((sec) => {
    const own = list.filter((f) => (SECTION_OF[f.key] || 'general') === sec.key);
    if (!own.length) return '';
    return sub(sec.title, sec.key === 'numbers' ? numbersHTML(v, own) : grid(v.f, own, 'main'));
  });

  const special = specialFields(v);
  if (special.length) parts.push(sub(`Особое для базы «${v.base}»`, grid(v.f, special, 'main')));
  parts.push(extraPart(v.extra, 'main'));
  return card('teal', idx, 'Машина', 'в порядке граф свидетельства', parts.join(''));
}

function regHTML(v, idx) {
  const list = commonFields(v).filter((f) => f.block === 'reg');
  return card('teal', idx, 'Регистрация', 'правая страница свидетельства с 2019 г.', grid(v.f, list, 'main'));
}

function useHTML(v, idx) {
  const list = commonFields(v).filter((f) => f.block === 'use');
  return card('amber', idx, 'Наработка и состояние', 'по осмотру', grid(v.f, list, 'main'));
}

// --- дополнительные параметры -------------------------------------------------
// Таблица «наименование — значение» (практика строкового ввода): кнопка
// добавления есть всегда. У машины — последним подразделом её блока, у каждого
// модуля — своя (указание пользователя 23.09.2026). Подсказок «что обычно
// вписывают» нет: названия пишет пользователь.
export function extraTableHTML(rows, owner) {
  const body = rows.map((r) => `<tr>
      <td><input class="ax-cell" data-tsx-label="${esc(owner)}|${r.id}" value="${esc(r.label)}"
        placeholder="Наименование параметра" aria-label="Наименование параметра"></td>
      <td><input class="ax-cell" data-tsx-value="${esc(owner)}|${r.id}" value="${esc(r.value)}"
        placeholder="Значение" aria-label="Значение параметра"></td>
      <td class="mu-c-act"><button class="ax-x mu-del" data-tsx-del="${esc(owner)}|${r.id}"
        title="Убрать параметр" aria-label="Убрать параметр">×</button></td>
    </tr>`).join('');

  return body ? `<table class="tbl mu-xtbl">
      <colgroup><col style="width:42%"><col><col style="width:40px"></colgroup>
      <thead><tr><th>Наименование параметра</th><th>Значение</th><th></th></tr></thead>
      <tbody>${body}</tbody>
    </table>` : '<div class="vehicle-note">Дополнительных параметров нет.</div>';
}

function extraPart(rows, owner, title = 'Дополнительные параметры') {
  const add = `<button class="btn btn-ghost btn-sm vh-sub-act" data-tsx-add="${esc(owner)}">+ Параметр</button>`;
  return sub(title, extraTableHTML(rows, owner), add);
}

// --- 06 Модули ----------------------------------------------------------------
// Сводная таблица и под ней форма выбранного модуля (практики «добавить ещё
// один» и «список с подробной формой»): у машины обычно один-три модуля, и
// сравнить их удобнее строками, а заполнять — полной формой.
function moduleRow(m, on) {
  const cell = (k) => esc(String(m.f[k] || '').trim() || '—');
  return `<tr class="vh-mrow ${on ? 'on' : ''}" data-ts-mpick="${m.id}" aria-selected="${on}" tabindex="0"
      title="Открыть модуль">
    <td><div class="vh-mname">${esc(moduleTitle(m))}</div><div class="vh-mpath">${esc(m.group || 'Группа не выбрана')}</div></td>
    <td>${cell('model')}</td>
    <td>${cell('serialNo')}</td>
    <td class="mu-c-num">${cell('year')}</td>
    <td>${cell('state')}</td>
    <td class="mu-c-act"><button class="ax-x mu-del" data-ts-mdel="${m.id}" title="Убрать модуль"
      aria-label="Убрать модуль ${esc(moduleTitle(m))}">×</button></td>
  </tr>`;
}

function moduleFormHTML(m) {
  const info = moduleInfo(m.group, m.kind);
  const cascade = `<div class="grid g-2 g-roomy g-top vh-grid">
      <div class="field"><label for="ts-${m.id}-g">Группа</label>
        <select class="select" id="ts-${m.id}-g" data-ts-modgroup="${m.id}">${
  options(moduleGroups(), m.group, 'Выберите группу')}</select></div>
      <div class="field"><label for="ts-${m.id}-k">Модуль</label>
        <select class="select" id="ts-${m.id}-k" data-ts-modkind="${m.id}" ${m.group ? '' : 'disabled'}>${
  options(moduleKinds(m.group).map((k) => k.name), m.kind, m.group ? 'Выберите модуль' : 'Сначала группа')}</select></div>
    </div>`;
  const note = info && info.note ? `<div class="vh-about"><div>${esc(info.note)}</div></div>` : '';
  return `<div class="vh-mform" data-ts-mform="${m.id}">
    <div class="sec-h vh-sub">${esc(moduleTitle(m))}</div>
    ${cascade}${note}
    ${m.kind ? `${grid(m.f, MODULE_FIELDS, m.id)}${extraPart(m.extra, m.id, 'Дополнительные параметры модуля')}` : ''}
  </div>`;
}

function modulesHTML(ctx, v, idx) {
  const cur = v.modules.find((m) => m.id === ctx.ui.tsModule) || v.modules[0] || null;
  const add = '<button class="btn btn-primary btn-sm" data-ts-madd style="margin-left:auto">+ Модуль</button>';
  const table = v.modules.length ? `<div class="mu-table-wrap"><table class="tbl vh-mtbl">
      <colgroup><col><col style="width:22%"><col style="width:18%"><col style="width:56px">
        <col style="width:18%"><col style="width:36px"></colgroup>
      <thead><tr><th>Модуль</th><th>Модель</th><th>Заводской №</th><th class="mu-c-num">Год</th>
        <th>Состояние</th><th></th></tr></thead>
      <tbody>${v.modules.map((m) => moduleRow(m, cur && m.id === cur.id)).join('')}</tbody>
    </table></div>` : `<div class="vehicle-note">Модулей нет. Надстройка, навесное или сменное оборудование на
      машине — отдельный модуль: цистерна, кран-манипулятор, ковш, отвал.</div>`;
  return card('blue', idx, 'Модули', 'надстройки, навесное и сменное оборудование на машине',
    `${table}${cur ? moduleFormHTML(cur) : ''}`, add);
}

// --- «Отдельный модуль»: поля модуля вместо машины ------------------------------
function loneModuleHTML(v, idx) {
  return card('teal', idx, 'Модуль', 'снятый с машины или хранящийся отдельно',
    grid(v.f, MODULE_FIELDS.filter((f) => f.block === 'machine'), 'main') + extraPart(v.extra, 'main'));
}

function loneUseHTML(v, idx) {
  return card('amber', idx, 'Наработка и состояние', 'по осмотру',
    grid(v.f, MODULE_FIELDS.filter((f) => f.block === 'use'), 'main'));
}

function formHTML(ctx) {
  const v = tsOf(ctx.rec);
  const idx = blockNumbers();
  const n = () => String(idx()).padStart(2, '0');
  const parts = [partiesHTML(ctx.rec, n(), ownerNames()), kindHTML(v, n())];

  if (classified(v)) {
    if (v.kind === 'module') {
      parts.push(loneModuleHTML(v, n()), loneUseHTML(v, n()));
    } else {
      parts.push(machineHTML(v, n()), regHTML(v, n()), useHTML(v, n()), modulesHTML(ctx, v, n()));
    }
  }
  return `<div class="vehicle-form">${parts.join('')}</div>`;
}

// Шапка — общая на все типы ОЦ (kernel/ocHead.js). Объектов имущества у ТС
// нет, поэтому меню «+ Добавить ОИ» тоже нет, а карточка правится прямо на
// месте: вместо «Редактировать» и «Удалить» — сохранение и возврат.
function headVehicle(ctx) {
  const v = tsOf(ctx.rec);
  return ocHeadHTML(ctx, {
    meta: [
      { label: 'Тип ОЦ', value: ctx.manifest.label },
      { label: 'Вид', value: whatLabel(v) || '—' },
      { label: 'Рег. номер', value: v.f.plate || 'не указан' },
      { label: 'Марка и модель', value: tsTitle(v), wide: true },
    ],
    actions: `<button class="btn btn-ghost" data-vehicle-back>← К объектам оценки</button>
      <button class="btn btn-primary" data-vehicle-save>Сохранить</button>`,
    tabs: [{ key: 'general', label: 'Общие данные' }],
  });
}

export function viewVehicle(ctx) {
  return `${headVehicle(ctx)}
    ${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, formHTML(ctx))}`;
}
