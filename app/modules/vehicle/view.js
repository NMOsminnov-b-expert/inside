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
  moduleTitle, whatLabel, makeModel,
} from './tsModel.js';
import { PHOTO_CATS, photoSetOf, photoFileAt } from './photos.js';

// Карточка транспортного средства как объекта оценки — по категоризации
// «база + модуль» (справочник docs/kategorii-ts-baza-modul.xlsx).
//
// Порядок — как на свидетельстве о регистрации (практика «порядок полей как в
// документе», Smith & Mosier 1.4/25): ЦОД переписывает с бланка сверху вниз.
// Регистрационный учёт стоит первым — госномер ищут раньше всего (указание
// пользователя 23.09.2026). Откуда берётся значение, говорит метка у поля —
// «ТП» или «осмотр»; где графа на бланке — во всплывающей подсказке метки.
//
// Ширина поля — по длине значения (практика Baymard): год, места, руль, оси,
// массы — узкие, обычный текст — в полстроки, адрес и комплектность — во всю.
// Пояснения — «зачем это поле» у тех, чья надобность неочевидна (указание
// пользователя 23.09.2026), строкой под полем; откуда переписывать — в
// подсказке к метке «ТП», чтобы не загромождать форму.
//
//   01  Учреждение, собственники и ответственные
//   02  Вид объекта                  — транспортное средство, спецтехника или
//                                       оборудование без машины; каскад
//   03  Регистрационный учёт          — госномер, VID, дата, документ, адрес
//   04  Автотранспортное средство     — (у спецтехники — «Спецтехника»)
//                                       подразделы в порядке граф свидетельства,
//                                       особое для базы, дополнительные параметры
//   05  Наработка и состояние
//   06  Модули                        — что стоит на машине
//   07  Фото с осмотра                — «Машина» и «Модули»

const card = (tone, idx, title, hint, body, extra = '') => `<div class="card t-${tone}">
  <div class="card-head"><span class="card-idx">${idx}</span><h3>${esc(title)}</h3>
    ${hint ? `<span class="hint">${esc(hint)}</span>` : ''}${extra}</div>
  <div class="card-pad">${body}</div></div>`;


const options = (list, value, empty) => `<option value="">${esc(empty)}</option>${
  list.map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}`;

// --- ширина полей ----------------------------------------------------------------
// Сетка — четыре колонки. Число — сколько колонок занимает поле. Не названное
// — две (полстроки).
const SPAN = {
  year: 1, color: 1, wheel: 1, seats: 1, fuel: 1, engineVolume: 1, massEmpty: 1, massMax: 1, massDesign: 1,
  wheelFormula: 1, axles: 1, steerAxles: 1, gearbox: 1, pto: 1, plate: 1, regDate: 1, docNo: 1,
  mileage: 1, engineHours: 1, hours: 1, factAddr: 3, kit: 4, run: 4,
};
// В форме модуля поля короткие и их мало: изготовитель, модель, заводской № и
// год — в одну строку, моточасы, состояние и комплектность — в следующую
// (замечание пользователя 23.09.2026: «в модулях громоздко»).
const MODULE_SPAN = { maker: 1, model: 1, serialNo: 1, year: 1, hours: 1, state: 1, kit: 2 };
const spanOf = (f, owner) => (owner !== 'main' && MODULE_SPAN[f.key])
  || SPAN[f.key] || (f.type === 'yes' || f.type === 'int' || f.type === 'year' ? 1 : 2);
const cells = (vals, list, owner) => list.map((f) => tsFieldHTML(vals, f, owner, `vh-s${spanOf(f, owner)}`)).join('');
const grid = (vals, list, owner) => `<div class="grid vh-grid">${cells(vals, list, owner)}</div>`;
const sub = (title, body, extra = '') => `<div class="sec-h vh-sub">${esc(title)}${extra}</div>${body}`;

// Справка о выбранной базе, виде или оборудовании — «как узнать» и примеры —
// во всплывающей подсказке подписи списка, а не блоком под ним.
const aboutTip = (a) => {
  if (!a) return '';
  const text = [a.hint && `Как узнать: ${a.hint}`, a.run && `Ходовая: ${a.run}`, a.note, a.examples && `Примеры: ${a.examples}`]
    .filter(Boolean).join('\n');
  return text ? `class="vh-tip" title="${esc(text)}"` : '';
};

// --- 02 Вид объекта ---------------------------------------------------------------
// Сначала «что это», затем каскад. Три взаимоисключающих варианта видны сразу:
// переключатель, а не список.
function kindHTML(v, idx) {
  const KIND_TIP = {
    base: 'Всё, у чего есть свидетельство о регистрации: легковое, грузовое, автобус, мотоцикл, прицеп, трактор',
    self: 'Машина со встроенным рабочим органом: экскаватор, бульдозер, погрузчик, каток, комбайн. '
      + 'Трактор и вездеход — «Транспортное средство», категория «Спецтехника»',
    module: 'Ковш, отвал, цистерна, кран-манипулятор — снятые с машины или хранящиеся отдельно',
  };
  const seg = `<div class="vh-seg" role="radiogroup" aria-label="Вид объекта">${KINDS.map((k) => `
    <button type="button" class="vh-seg-btn ${v.kind === k.key ? 'on' : ''}" role="radio" title="${esc(KIND_TIP[k.key])}"
      aria-checked="${v.kind === k.key}" data-ts-kind="${k.key}">${esc(k.label)}</button>`).join('')}</div>`;

  let cascade = '';
  let about = null;
  if (v.kind === 'base') {
    const bases = basesOf(v.category).map((b) => b.name);
    about = baseInfo(v.base);
    cascade = `<div class="field vh-s2"><label for="ts-cat">Категория по техпаспорту</label>
        <select class="select" id="ts-cat" data-ts-cat>${options(CATEGORIES, v.category, 'Выберите категорию')}</select></div>
      <div class="field vh-s2"><label for="ts-base" ${aboutTip(about)}>База</label>
        <select class="select" id="ts-base" data-ts-base ${v.category ? '' : 'disabled'}>${
  options(bases, v.base, v.category ? 'Выберите базу' : 'Сначала категория')}</select></div>`;
  } else if (v.kind === 'self') {
    about = selfInfo(v.selfGroup, v.selfKind);
    cascade = `<div class="field vh-s2"><label for="ts-sg">Группа</label>
        <select class="select" id="ts-sg" data-ts-sgroup>${options(selfGroups(), v.selfGroup, 'Выберите группу')}</select></div>
      <div class="field vh-s2"><label for="ts-sk" ${aboutTip(about)}>Вид машины</label>
        <select class="select" id="ts-sk" data-ts-skind ${v.selfGroup ? '' : 'disabled'}>${
  options(selfKinds(v.selfGroup).map((k) => k.name), v.selfKind, v.selfGroup ? 'Выберите вид' : 'Сначала группа')}</select></div>`;
  } else if (v.kind === 'module') {
    about = moduleInfo(v.modGroup, v.modKind);
    cascade = `<div class="field vh-s2"><label for="ts-mg">Группа</label>
        <select class="select" id="ts-mg" data-ts-mgroup>${options(moduleGroups(), v.modGroup, 'Выберите группу')}</select></div>
      <div class="field vh-s2"><label for="ts-mk" ${aboutTip(about)}>Оборудование</label>
        <select class="select" id="ts-mk" data-ts-mkind ${v.modGroup ? '' : 'disabled'}>${
  options(moduleKinds(v.modGroup).map((k) => k.name), v.modKind, v.modGroup ? 'Выберите оборудование' : 'Сначала группа')}</select></div>`;
  }



  const body = `${seg}${cascade ? `<div class="grid vh-grid">${cascade}</div>` : ''}`;
  return card('blue', idx, 'Вид объекта', 'категоризация «база + модуль»', body);
}

// --- 03 Регистрационный учёт ---------------------------------------------------------
// Собственника здесь нет — он в блоке 01 (указание пользователя 23.09.2026:
// «дубляж собственника убираем»). Адрес — фактический: где машина стоит.
function regHTML(v, idx) {
  const list = commonFields(v).filter((f) => f.block === 'reg');
  return card('teal', idx, 'Регистрационный учёт', 'по нему машину находят и проверяют', grid(v.f, list, 'main'));
}

// --- 04 Автотранспортное средство / Спецтехника ------------------------------------
// Подразделы идут в порядке граф свидетельства (книжка 2019 года, левая
// страница): марка и модель, год, цвет → номера → тип ТС и места → двигатель →
// массы; затем то, что определяют на осмотре.
// Подразделов четыре: мелкие группы по два поля оставляли полстроки пустыми
// (замечание пользователя 23.09.2026: «куча пустых мест»). Порядок граф
// свидетельства внутри сохранён: марка, модель, год, цвет → номера → тип ТС,
// топливо, объём, мощность, массы; руль и места — в строке с годом и цветом.
const SECTIONS = [
  { key: 'general', title: 'Общие сведения' },
  { key: 'numbers', title: 'Номера' },
  { key: 'tech', title: 'Тип, двигатель, массы' },
  { key: 'chassis', title: 'Ходовая и трансмиссия' },
];
const SECTION_OF = {
  vin: 'numbers', bodyNo: 'numbers', chassisNo: 'numbers', engineNo: 'numbers', serialNo: 'numbers',
  vtype: 'tech', fuel: 'tech', engineVolume: 'tech', power: 'tech',
  massEmpty: 'tech', massMax: 'tech', massDesign: 'tech',
  wheelFormula: 'chassis', axles: 'chassis', steerAxles: 'chassis', gearbox: 'chassis', pto: 'chassis',
  run: 'chassis', turn: 'chassis',
};
// Руль и места — сразу за цветом: вместе с годом они заполняют строку.
const GENERAL_ORDER = ['make', 'model', 'maker', 'country', 'year', 'color', 'wheel', 'seats'];

// От топлива зависит, какие поля двигателя показывать: у электромобиля нет
// рабочего объёма, есть только мощность.
const ELECTRIC = 'Электро';
const shown = (v, f) => !(f.key === 'engineVolume' && v.f.fuel === ELECTRIC);

// Номера — таблицей (указание пользователя): у машины их несколько, и искать
// каждый по сетке полей неудобно.
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
    // Топливо — сразу за типом ТС: от него зависят поля рядом.
    if (sec.key === 'tech') {
      const rank = (k) => ['vtype', 'fuel', 'engineVolume', 'power', 'massEmpty', 'massMax', 'massDesign'].indexOf(k);
      own.sort((a, b) => rank(a.key) - rank(b.key));
    }
    if (sec.key === 'general') own.sort((a, b) => GENERAL_ORDER.indexOf(a.key) - GENERAL_ORDER.indexOf(b.key));
    const body = sec.key === 'numbers' ? numbersHTML(v, own)
      : sec.key === 'chassis' ? `<div class="grid vh-grid vh-grid-fit vh-fit-narrow">${cells(v.f, own, 'main')}</div>`
        : grid(v.f, own, 'main');
    return sub(sec.title, body);
  });

  const special = specialFields(v);
  if (special.length) {
    parts.push(sub(`Особое для базы «${v.base}»`,
      `<div class="grid vh-grid vh-grid-fit">${cells(v.f, special, 'main')}</div>`));
  }
  parts.push(extraPart(v.extra, 'main'));

  const title = v.kind === 'self' ? 'Спецтехника' : 'Автотранспортное средство';
  return card('teal', idx, title, 'в порядке граф свидетельства', parts.join(''));
}

function useHTML(v, idx) {
  const list = commonFields(v).filter((f) => f.block === 'use');
  return card('amber', idx, 'Наработка и состояние', 'по осмотру', grid(v.f, list, 'main'));
}

// --- дополнительные параметры -------------------------------------------------------
// Таблица «наименование — значение»: у машины — последним подразделом её блока,
// у каждого модуля — своя. Пустая таблица объясняет, что сюда писать, с
// примером (практика подсказок для новичка), в ячейках — пример заполнения.
export function extraTableHTML(rows, owner) {
  const body = rows.map((r) => `<tr>
      <td><input class="ax-cell" data-tsx-label="${esc(owner)}|${r.id}" value="${esc(r.label)}"
        placeholder="Например: Особые отметки" aria-label="Наименование параметра"></td>
      <td><input class="ax-cell" data-tsx-value="${esc(owner)}|${r.id}" value="${esc(r.value)}"
        placeholder="Например: взамен т/п АВ759281" aria-label="Значение параметра"></td>
      <td class="mu-c-act"><button class="ax-x mu-del" data-tsx-del="${esc(owner)}|${r.id}"
        title="Убрать строку" aria-label="Убрать строку">×</button></td>
    </tr>`).join('');

  return body ? `<table class="tbl mu-xtbl vh-xtbl">
      <colgroup><col style="width:42%"><col><col style="width:40px"></colgroup>
      <thead><tr><th>Наименование</th><th>Значение</th><th></th></tr></thead>
      <tbody>${body}</tbody>
    </table>` : '';
}

// Зачем таблица и когда в неё писать: полей на всё не заведёшь, а сведение,
// которому нет поля, иначе теряется. Как добавить строку — одной фразой.
// Одна фраза (GOV.UK: подсказка — несколько слов, в идеале одно предложение).
const EXTRA_HELP = {
  main: 'Для сведений без своего поля, чтобы они не терялись: особые отметки из свидетельства, данные других '
    + 'документов. Слева — что это, справа — значение.',
  module: 'Характеристики оборудования, у каждого вида свои: слева название с единицей («Грузоподъёмность, т»), '
    + 'справа значение.',
};

function extraPart(rows, owner, title = 'Дополнительные параметры', kind = owner === 'main' ? 'main' : 'module') {
  const add = `<button class="btn btn-ghost btn-sm vh-sub-act" data-tsx-add="${esc(owner)}">+ Параметр</button>`;
  const help = EXTRA_HELP[kind];
  return sub(title, `<p class="vh-howto vh-howto-sub">${help}</p>${extraTableHTML(rows, owner)}`, add);
}

// --- 06 Модули ---------------------------------------------------------------------------
// Сводная таблица и под ней форма выбранного модуля (практики «добавить ещё
// один» и «список с подробной формой»). Свой цвет блока — фиолетовый: модули
// не спутать с самой машиной (указание пользователя 23.09.2026).
function moduleRow(m, on) {
  const cell = (k) => esc(String(m.f[k] || '').trim() || '—');
  return `<tr class="vh-mrow ${on ? 'on' : ''}" data-ts-mpick="${m.id}" aria-selected="${on}" tabindex="0"
      title="Открыть модуль">
    <td><div class="vh-mname">${esc(moduleTitle(m))}</div><div class="vh-mpath">${esc(m.group || 'Группа не выбрана')}</div></td>
    <td>${cell('model')}</td>
    <td>${cell('serialNo')}</td>
    <td class="mu-c-num">${cell('year')}</td>
    <td>${cell('state')}</td>
    <td class="mu-c-act"><button class="ax-x mu-del" data-ts-mdel="${m.id}" title="Удалить модуль"
      aria-label="Удалить модуль ${esc(moduleTitle(m))}">×</button></td>
  </tr>`;
}

function moduleFormHTML(m) {
  const info = moduleInfo(m.group, m.kind);
  const cascade = `<div class="grid vh-grid">
      <div class="field vh-s2"><label for="ts-${m.id}-g">Группа</label>
        <select class="select" id="ts-${m.id}-g" data-ts-modgroup="${m.id}">${
  options(moduleGroups(), m.group, 'Выберите группу')}</select></div>
      <div class="field vh-s2"><label for="ts-${m.id}-k" ${aboutTip(info)}>Модуль</label>
        <select class="select" id="ts-${m.id}-k" data-ts-modkind="${m.id}" ${m.group ? '' : 'disabled'}>${
  options(moduleKinds(m.group).map((k) => k.name), m.kind, m.group ? 'Выберите модуль' : 'Сначала группа')}</select></div>
    </div>`;
  return `<div class="vh-mform" data-ts-mform="${m.id}">
    <div class="sec-h vh-sub">${esc(moduleTitle(m))}<button class="btn btn-danger btn-sm vh-sub-act"
      data-ts-mdel="${m.id}">Удалить модуль</button></div>
    ${cascade}
    ${m.kind ? `${grid(m.f, MODULE_FIELDS, m.id)}${extraPart(m.extra, m.id, 'Дополнительные параметры модуля')}` : ''}
  </div>`;
}

function modulesHTML(ctx, v, idx) {
  const cur = v.modules.find((m) => m.id === ctx.ui.tsModule) || v.modules[0] || null;
  const add = `<button class="btn btn-primary btn-sm" data-ts-madd style="margin-left:auto" title="${esc(
    'Модуль — то, что стоит на машине сверху: кузов, цистерна, кран-манипулятор, ковш, отвал. Описывается отдельно '
    + 'от машины — на то же шасси могли поставить другое')}">+ Модуль</button>`;
  const table = v.modules.length ? `<div class="mu-table-wrap"><table class="tbl vh-mtbl">
      <colgroup><col><col style="width:22%"><col style="width:18%"><col style="width:56px">
        <col style="width:18%"><col style="width:36px"></colgroup>
      <thead><tr><th>Модуль</th><th>Модель</th><th>Заводской №</th><th class="mu-c-num">Год</th>
        <th>Состояние</th><th></th></tr></thead>
      <tbody>${v.modules.map((m) => moduleRow(m, cur && m.id === cur.id)).join('')}</tbody>
    </table></div>` : '';
  return card('violet', idx, 'Модули', 'надстройки, навесное и сменное оборудование на машине',
    `${table || '<div class="vehicle-note">Модулей нет.</div>'}${cur ? moduleFormHTML(cur) : ''}`, add);
}

// --- Фото с осмотра ------------------------------------------------------------------------
// Две категории — «Машина» и «Модули»; у оборудования без машины — одна.
function photosHTML(ctx, v, idx) {
  const set = photoSetOf(ctx.rec);
  const cats = v.kind === 'module' ? ['Модули'] : PHOTO_CATS;
  const body = cats.map((cat) => {
    const n = (set.photos || {})[cat] || 0;
    const tiles = Array.from({ length: n }, (_, i) => {
      const f = photoFileAt(set, cat, i);
      return `<button type="button" class="ph" data-ts-photo-open="${esc(cat)}|${i}" title="${esc(cat)} · фото ${i + 1}">${
        f ? `<img class="ph-img" src="${f.dataUrl}" alt="${esc(f.name)}">` : `${esc(cat)} ${i + 1}`}</button>`;
    }).join('');
    const add = `<button class="btn btn-ghost btn-sm vh-sub-act" data-ts-photo-add="${esc(cat)}"
      title="Можно выбрать сразу несколько файлов">+ Фото</button>`;
    return sub(`${cat} · ${n}`, `<div class="ph-row">${tiles || '<span class="vehicle-note">Фото нет.</span>'}</div>`, add);
  }).join('');
  return card('blue', idx, 'Фото с осмотра', '', body);
}

// --- «Оборудование без машины» -----------------------------------------------------------
function loneModuleHTML(v, idx) {
  return card('violet', idx, 'Оборудование', 'снятое с машины или хранящееся отдельно',
    grid(v.f, MODULE_FIELDS.filter((f) => f.block === 'machine'), 'main') + extraPart(v.extra, 'main', 'Дополнительные параметры', 'module'));
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
      parts.push(loneModuleHTML(v, n()), loneUseHTML(v, n()), photosHTML(ctx, v, n()));
    } else {
      parts.push(regHTML(v, n()), machineHTML(v, n()), useHTML(v, n()), modulesHTML(ctx, v, n()),
        photosHTML(ctx, v, n()));
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
      { label: 'Марка и модель', value: makeModel(v) || 'не указаны', wide: true },
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
