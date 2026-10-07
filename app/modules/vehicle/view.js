import { colGroupHTML, colLabelHTML, resizeGripHTML, columnVarsStyle, bindColumnResize } from '../../kernel/columns.js';
import { esc } from '../../kernel/dom.js';
import { blockNumbers } from '../../kernel/blockIndex.js';
import { ownerNames } from './records.js';
import { splitWrap, viewerHTML } from '../../kernel/viewer/shell.js';
import { ocHeadHTML } from '../../kernel/ocHead.js';
import { partiesHTML } from './parties.view.js';
import { tsFieldHTML } from './tsFields.view.js';
import { canSaveTemplate } from './templates.js';
import { TS_CONDITION_SCALE } from './data/tsCatalog.js';
import {
  KINDS, SELF_CAT, CATEGORIES, basesOf, baseInfo, singleBase, selfGroups, selfKinds, selfInfo, moduleGroups, moduleKinds,
  moduleInfo, MODULE_FIELDS, tsOf, classified, commonFields, specialFields, isPassenger,
  moduleTitle, whatLabel, categoryCandidates, makeWithModules, isTrailer, moduleSpecial, FROM_BASE_DRIVE,
} from './tsModel.js';
import { treeSearchHTML } from '../../kernel/treeSearch.js';
import { lastSavedAt } from '../../kernel/persist.js';
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
//                                       особое для базы, наработка и состояние,
//                                       дополнительные параметры
//   05  Модули                        — надстройки и навесное оборудование на базе
//   06  Фото с осмотра                — «Машина» и «Модули»
//
// Пробег, моточасы и состояние машины — подразделом её блока, а не отдельным
// блоком (заметка пользователя 30.09.2026 «Пробег к базе»): у машины с
// модулями наработка своя у базы и своя у каждой установки, и отдельный блок
// между машиной и модулями читался как общий для всех.

const card = (tone, idx, title, hint, body, extra = '', attrs = '') => `<div class="card t-${tone}" ${attrs}>
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
  mileage: 1, engineHours: 1, hours: 1, factAddr: 3, kit: 4, run: 2,
};
// В форме модуля поля короткие и их мало: изготовитель, модель, заводской № и
// год — в одну строку, моточасы, состояние и комплектность — в следующую
// (замечание пользователя 23.09.2026: «в модулях громоздко»).
// Двигатель установки, объём, моточасы и состояние — второй строкой,
// комплектность — во всю ширину (двигатель добавлен 30.09.2026).
const MODULE_SPAN = { maker: 1, model: 1, serialNo: 1, year: 1, drive: 2, engineKind: 1, engineVolume: 1, hours: 1, state: 1, kit: 4 };

// Привод и двигатель установки (развёртка, согласована 30.09.2026): сначала
// привод — без двигателя, от двигателя базы через КОМ или свой; тип двигателя —
// только у своего, рабочий объём — только у топливного. У оборудования без
// машины привода от базы не бывает. В форме модуля подписи короче: блок и так
// про установку, полное название — в подсказке.
const FUEL_ENGINES = ['Дизель', 'Бензин', 'Газ'];
const FROM_BASE = FROM_BASE_DRIVE;
const MODULE_LABEL = { drive: 'Привод', engineKind: 'Двигатель', engineVolume: 'Раб. объём' };
// Модуль целиком заполняют на осмотре — это сказано в заголовке блока, метка
// «осмотр» у каждого его поля ничего не добавляла.
const moduleFields = (vals, list, lone = false) => list
  .map((f) => (f.source === 'Осмотр' ? { ...f, source: '' } : f))
  .filter((f) => f.key !== 'engineKind' || vals.drive === 'Свой двигатель')
  .filter((f) => f.key !== 'engineVolume' || (vals.drive === 'Свой двигатель' && FUEL_ENGINES.includes(vals.engineKind)))
  .map((f) => (f.key === 'drive' && lone ? { ...f, options: f.options.filter((o) => o !== FROM_BASE) } : f))
  .map((f) => (MODULE_LABEL[f.key] ? { ...f, short: MODULE_LABEL[f.key] } : f));
const spanOf = (f, owner) => f.span || (owner !== 'main' && MODULE_SPAN[f.key])
  || SPAN[f.key] || (f.type === 'yes' || f.type === 'int' || f.type === 'year' ? 1 : 2);
const cells = (vals, list, owner) => list.map((f) => tsFieldHTML(vals, f, owner, `vh-s${spanOf(f, owner)}`)).join('');
const grid = (vals, list, owner) => `<div class="grid vh-grid">${cells(vals, list, owner)}</div>`;
const sub = (title, body, extra = '') => `<div class="sec-h vh-sub">${esc(title)}${extra}</div>${body}`;

// --- 02 Вид объекта ---------------------------------------------------------------
// Развёртка согласована пользователем 30.09.2026 («Ок… Переноси в макет»):
//   * три варианта — кнопками с описанием видимой строкой: всплывающая
//     подсказка при наведении закрывала соседние списки;
//   * у ТС сначала «Тип ТС, вид кузова» — его переписывают с техпаспорта, —
//     затем категория и база. Категорию выбирает человек: строка «Тип ТС» лишь
//     предлагает варианты кнопками («откуда ты знаешь, что это грузовик, а не
//     пожарка?»);
//   * над каскадом — поиск по всему справочнику: помощник, а не замена
//     («поиск — помощник, а не альтернатива»); выбор заполняет списки;
//   * описание выбранной базы или вида — видимым блоком под каскадом;
//   * выбор сделан — блок сворачивается в строку «Изменить»: к нему
//     возвращаются редко, а место он занимал всю работу.

const kindLabel = (v) => (KINDS.find((k) => k.key === v.kind) || {}).label || '';

function aboutHTML(a) {
  if (!a) return '';
  const isBase = 'category' in a;
  const text = [a.run && `Ходовая: ${a.run}.`, a.hint && (isBase ? a.hint : `Характеристики: ${a.hint}`), a.note]
    .filter(Boolean).map((t) => (/[.!?]$/.test(t.trim()) ? t.trim() : t.trim() + '.')).join(' ');
  if (!text && !a.examples) return '';
  return `<div class="vh-about" data-ts-about><b>${esc(a.name)}.</b> ${esc(text)}${
    a.examples ? ` <span class="vh-about-ex">Например: ${esc(a.examples)}.</span>` : ''}</div>`;
}

// Заголовок блока — аккордеон: щелчок (Enter, пробел) по всему заголовку
// сворачивает и разворачивает блок, стрелка справа показывает состояние
// (указание пользователя 06.10.2026: «избавиться от кнопки изменить в блоке
// ТС. Лучше так же кликать скрывать и открывать аккордеон»; образец — W3C ARIA
// APG, Accordion). Пока выбор не закончен, сворачивать нечего — заголовок
// обычный.
function kindHeadHTML(v, idx, open) {
  const vt = v.kind === 'base' && v.f.vtype ? ` · по ТП «${v.f.vtype}»` : '';
  // Без всплывающей подсказки: состояние показывает стрелка, для чтения с
  // экрана — aria-expanded (вопрос пользователя 06.10.2026: «Зачем подсказка
  // Свернуть?»).
  return `<div class="card-head vh-acc-head" data-ts-kind-toggle role="button" tabindex="0" aria-expanded="${open}">
    <span class="card-idx">${idx}</span><h3>${esc(kindLabel(v))}</h3>
    <span class="hint vh-kind-what">${esc(whatLabel(v))}${esc(vt)}</span><i class="vh-acc-chev" aria-hidden="true">▾</i></div>`;
}

function kindSummaryHTML(v, idx) {
  return `<div class="card t-blue vh-kind-sum" data-ts-kind-sum>${kindHeadHTML(v, idx, false)}</div>`;
}

// Категории, которые может означать запись «Тип ТС», — кнопками под списками.
// Обёртка data-ts-sug-box есть всегда: по уходу из поля «Тип ТС» строка
// обновляется одна, без перерисовки карточки (иначе щелчок по соседней кнопке
// пропадал — кнопку заменяла перерисовка раньше, чем щелчок завершался).
export function sugHTML(v) {
  if (v.kind === 'self' || v.kind === 'module') return '';
  const cands = categoryCandidates(v.f.vtype).filter((c) => c !== v.category);
  return cands.length && !(v.category && categoryCandidates(v.f.vtype).includes(v.category))
    ? `<div class="vh-sug" data-ts-sug>По записи «${esc(v.f.vtype)}» может быть:${cands.map((c) => `
        <button type="button" class="vh-sug-btn" data-ts-sug-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>`
    : '';
}

function kindHTML(ctx, v, idx) {
  // По умолчанию блок открыт и сам не сворачивается (указание пользователя
  // 06.10.2026: «сделай уже по умолчанию открытым блок 02. Не скрываем его
  // автоматически. Сбивает!») — свёрнут, только если его свернули щелчком.
  if (classified(v) && ctx.ui && ctx.ui.tsKindOpen === false) return kindSummaryHTML(v, idx);

  // Вид объекта задаёт категория (указание пользователя 06.10.2026):
  // спецтехника — категория «Специализированная техника» со своим подменю
  // (группа → вид машины); переключателя видов нет. Оборудование без машины
  // новым не заводится (уходит в механизмы), у записей этого вида — прежний
  // каскад: данные не теряются.
  const seg = '';
  const catSel = (value) => `<div class="field vh-s2"><label for="ts-cat">Категория по техпаспорту</label>
      <select class="select" id="ts-cat" data-ts-cat>${options([...CATEGORIES, SELF_CAT], value, 'Выберите категорию')}</select></div>`;

  let cascade = '';
  let about = null;
  let sug = '';
  if (v.kind === 'module') {
    about = moduleInfo(v.modGroup, v.modKind);
    cascade = `<div class="field vh-s2"><label for="ts-mg">Группа</label>
        <select class="select" id="ts-mg" data-ts-mgroup>${options(moduleGroups(), v.modGroup, 'Выберите группу')}</select></div>
      <div class="field vh-s2"><label for="ts-mk">Оборудование</label>
        <select class="select" id="ts-mk" data-ts-mkind ${v.modGroup ? '' : 'disabled'}>${
  options(moduleKinds(v.modGroup).map((k) => k.name), v.modKind, v.modGroup ? 'Выберите оборудование' : 'Сначала группа')}</select></div>`;
  } else if (v.kind === 'self') {
    about = selfInfo(v.selfGroup, v.selfKind);
    cascade = `${catSel(SELF_CAT)}
      <div class="field vh-s2"><label for="ts-sg">Группа</label>
        <select class="select" id="ts-sg" data-ts-sgroup>${options(selfGroups(), v.selfGroup, 'Выберите группу')}</select></div>
      <div class="field vh-s4"><label for="ts-sk">Вид машины</label>
        <select class="select" id="ts-sk" data-ts-skind ${v.selfGroup ? '' : 'disabled'}>${
  options(selfKinds(v.selfGroup).map((k) => k.name), v.selfKind, v.selfGroup ? 'Выберите вид' : 'Сначала группа')}</select></div>`;
  } else {
    const bases = basesOf(v.category).map((b) => b.name);
    about = baseInfo(v.base);
    sug = sugHTML(v);
    // Где у категории одна база, списка баз нет (решение 06.10.2026) —
    // категория на всю строку: пустой половины не остаётся.
    const single = !v.category || singleBase(v.category);
    cascade = `${v.category && single ? catSel(v.category).replace('vh-s2', 'vh-s4') : catSel(v.category)}
      ${single && v.category ? '' : `<div class="field vh-s2"><label for="ts-base">База</label>
        <select class="select" id="ts-base" data-ts-base ${v.category ? '' : 'disabled'}>${
  options(bases, v.base, v.category ? 'Выберите базу' : 'Сначала категория')}</select></div>`}`;
  }

  // «Тип ТС, вид кузова» и поиск по справочнику — одно поле (заметки
  // пользователя 07.10.2026: «Найти в справочнике стоит с типом кузова
  // объединить. Единое окно для поиска. Упрощение интерфейса»): вписанное —
  // запись техпаспорта, по ней же выдача шаблонов, видов и моделей; выбор
  // заполняет категорию и базу ниже. У оборудования без машины (прежние
  // записи) «Типа ТС» нет — поле только ищет.
  const asVtype = v.kind !== 'module';
  const search = treeSearchHTML({ id: 'ts-find', label: asVtype ? 'Тип ТС, вид кузова' : 'Найти в справочнике',
    hint: asVtype ? 'по техпаспорту' : '',
    placeholder: asVtype ? 'Запись из техпаспорта, вид или модель: самосвал, автокран, КАМАЗ 65115'
      : 'Например: автокран, самосвал, погрузчик',
    value: asVtype ? (v.f.vtype || '') : '', attrs: asVtype ? 'data-tsf="main|vtype"' : '' });
  // Предложения категории — своей строкой под сеткой: в сетке у поля строки
  // фиксированной высоты, и добавка под списком наезжала на него.
  const body = `${seg}${search}${cascade ? `<div class="grid vh-grid">${cascade}</div>` : ''}<div data-ts-sug-box>${sug}</div>${
    about ? aboutHTML(about) : ''}`;
  if (!classified(v)) return card('blue', idx, 'Вид объекта', '', body);
  return `<div class="card t-blue vh-kind-open" data-ts-kind-sum>${kindHeadHTML(v, idx, true)}<div class="card-pad">${body}</div></div>`;
}

// --- 03 Регистрационный учёт ---------------------------------------------------------
// Собственника здесь нет — он в блоке 01 (указание пользователя 23.09.2026:
// «дубляж собственника убираем»). Адрес — фактический: где машина стоит.
// Дата регистрации — сразу за серией и номером документа (указание
// пользователя 06.10.2026: «во вторую строку после серии и номера… логичнее
// выглядит»). Строки заполнены целиком (замечание «Адаптива нет»: в общей
// сетке из четырёх равных колонок справа пустовали колонки) — у блока своя
// сетка, долями (module.css, .vh-reg): с видом документа — две колонки,
// «рег. номер | вид документа» и «серия и № | дата»; без него — одна строка
// «рег. номер | серия и № | дата», серия и номер шире (длиннее значение:
// практика Baymard — ширина поля по длине ожидаемого значения). На узком
// экране — один столбец.
const REG_ORDER = ['plate', 'docKind', 'docNo', 'regDate'];
function regHTML(v, idx) {
  const rank = (f) => (REG_ORDER.includes(f.key) ? REG_ORDER.indexOf(f.key) : REG_ORDER.length);
  const list = commonFields(v).filter((f) => f.block === 'reg').sort((a, b) => rank(a) - rank(b));
  const cols = list.some((f) => f.key === 'docKind') ? 'vh-reg-2' : 'vh-reg-3';
  // В три колонки дата узкая — подпись короткая, полная в подсказке (правило
  // проекта: «Высота внешн., м»).
  const label = (f) => (cols === 'vh-reg-3' && f.key === 'regDate' ? { ...f, short: 'Дата рег.' } : f);
  const body = `<div class="grid vh-grid vh-reg ${cols}">${list.map((f) => tsFieldHTML(v.f, label(f), 'main', 'vh-s1')).join('')}</div>`;
  return card('teal', idx, 'Регистрационный учёт', 'по техпаспорту', body, '', 'data-ts-block="reg"');
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
  { key: 'tech', title: 'Двигатель и массы' },
  { key: 'chassis', title: 'Ходовая и трансмиссия' },
];
const SECTION_OF = {
  vin: 'numbers', bodyNo: 'numbers', chassisNo: 'numbers', engineNo: 'numbers', serialNo: 'numbers', vid: 'numbers',
  vtype: 'tech', fuel: 'tech', engineVolume: 'tech', power: 'tech', battery: 'tech',
  massEmpty: 'tech', massMax: 'tech', massDesign: 'tech',
  wheelFormula: 'chassis', axles: 'chassis', steerAxles: 'chassis', gearbox: 'chassis', pto: 'chassis',
  driveType: 'chassis', transferCase: 'chassis', rearSteer: 'chassis',
  run: 'chassis', turn: 'chassis',
};
// Руль и места — сразу за цветом: вместе с годом они заполняют строку.
// Страна сборки — в конце: у машины она встаёт за местами на полстроки.
const GENERAL_ORDER = ['make', 'maker', 'year', 'color', 'wheel', 'seats', 'trim', 'trimNote', 'country'];

// От топлива зависит, какие поля двигателя показывать: у электромобиля нет
// рабочего объёма, есть только мощность.
const ELECTRIC = 'Электро';
// Ёмкость батареи — у электромобиля и гибрида (решение пользователя 02.10.2026).
// Комментарий к комплектации — только у своей, описание общего состояния —
// только у «Иное» (указания пользователя 06.10.2026).
export const OWN_TRIM = 'Своя';
export const OTHER_STATE = 'Иное';
const shown = (v, f) => !(f.key === 'engineVolume' && v.f.fuel === ELECTRIC)
  && !(f.key === 'battery' && ![ELECTRIC, 'Гибрид'].includes(v.f.fuel))
  && !(f.key === 'trimNote' && v.f.trim !== OWN_TRIM)
  && !(f.key === 'generalStateNote' && v.f.generalState !== OTHER_STATE);
// Заголовок подраздела двигателя: у легковых — «Двигатель», у остальных —
// «Двигатель и грузовые характеристики» (указание пользователя 02.10.2026).
// У прицепов двигателя нет — только грузовые характеристики (06.10.2026).
// и ходовая без трансмиссии.
const secTitle = (v, sec) => (sec.key === 'chassis' && isTrailer(v) ? 'Ходовая'
  : sec.key !== 'tech' ? sec.title
    : isPassenger(v) ? 'Двигатель' : isTrailer(v) ? 'Грузовые характеристики' : 'Двигатель и грузовые характеристики');

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

function machineHTML(v, idx, inspect = false) {
  // «Тип ТС, вид кузова» — в блоке 02, рядом с категорией, которую по ней подбирают.
  // Страна сборки — в общих сведениях у любого вида: у машины она лежала в
  // «Особом для базы», у спецтехники — в общих (развёртка 30.09.2026).
  const special = specialFields(v).filter((f) => f.key !== 'country');
  const country = specialFields(v).find((f) => f.key === 'country');
  const list = commonFields(v).filter((f) => f.block === 'machine' && shown(v, f) && f.key !== 'vtype')
    .concat(country && !commonFields(v).some((f) => f.key === 'country') ? [country] : [])
    .filter((f) => !inspect || inspectField(f))
    // В режиме осмотра всё — с осмотра: метка у поля ничего не добавляет.
    .map((f) => (inspect ? { ...f, source: '' } : f));
  const parts = SECTIONS.map((sec) => {
    const own = list.filter((f) => (SECTION_OF[f.key] || 'general') === sec.key);
    if (!own.length) return '';
    // Топливо — сразу за типом ТС: от него зависят поля рядом.
    if (sec.key === 'tech') {
      // У легковых — две колонки (замечание пользователя 02.10.2026: «оформить
      // максимально логично 2-мя столбцами для каждой комбинации»): первая
      // строка — что за двигатель и какой силы (тип топлива | мощность),
      // вторая — чем питается (рабочий объём | ёмкость батареи). У гибрида
      // заняты все четыре места, у ДВС и электро вторая строка — одно поле.
      // У спецтехники мощность (на полстроки) — первой: на узком экране она
      // встаёт одна, а тип топлива и масса — парой под ней, без пустот.
      const order = isPassenger(v)
        ? ['vtype', 'fuel', 'power', 'engineVolume', 'battery']
        : v.kind === 'self' ? ['power', 'fuel', 'massDesign']
          : ['vtype', 'fuel', 'engineVolume', 'power', 'massEmpty', 'massMax', 'massDesign'];
      // Две массы — по полстроки, строка заполнена.
      const masses = own.filter((f) => /^mass/.test(f.key));
      if (!isPassenger(v) && masses.length === 2) {
        masses.forEach((f) => { own[own.indexOf(f)] = { ...f, span: 2 }; });
      }
      const rank = (k) => order.indexOf(k);
      own.sort((a, b) => rank(a.key) - rank(b.key));
    }
    if (sec.key === 'general') own.sort((a, b) => GENERAL_ORDER.indexOf(a.key) - GENERAL_ORDER.indexOf(b.key));
    // Общие сведения — строки без пустот (замечание пользователя 23.09.2026):
    // у машины марка с моделью — во всю строку, под ней год, цвет, руль и места
    // по четверти; у спецтехники марка и изготовитель — по полстроки, под ними
    // страна сборки, год и цвет. Ширина поля — по длине ответа (GOV.UK Design
    // System, NN/g): марку с моделью пишут длинно, год и места — коротко.
    // Без комплектации (не легковой) страна сборки одна во второй строке
    // оставляла полстроки пустой. Порядок граф свидетельства не меняется:
    // марка — на полстроки, рядом год и цвет; во второй строке руль, места и
    // страна сборки.
    const pairCountry = !own.some((x) => x.key === 'maker' || x.key === 'trim') && own.some((x) => x.key === 'country');
    const genSpan = (f) => (f.key === 'make' && !own.some((x) => x.key === 'maker') ? (pairCountry ? 2 : 4)
      : spanOf(f, 'main'));
    // Подраздел, где все поля — с осмотра, помечен один раз в заголовке, а не
    // меткой у каждого поля.
    const allInsp = own.length > 1 && own.every((f) => f.source === 'Осмотр');
    if (allInsp) own.forEach((f, i) => { own[i] = { ...f, source: '' }; });
    const body = sec.key === 'numbers' ? numbersHTML(v, own)
      : sec.key === 'general' ? `<div class="grid vh-grid">${
        own.map((f) => tsFieldHTML(v.f, f, 'main', `vh-s${genSpan(f)}`)).join('')}</div>`
      : sec.key === 'chassis' ? `<div class="grid vh-grid vh-grid-fit vh-fit-narrow">${cells(v.f, own, 'main')}</div>`
      // У легкового и прицепа поля подраздела — пополам: строки заполнены (у
      // прицепа остались только массы — поля двигателя убраны).
      : sec.key === 'tech' && (isPassenger(v) || isTrailer(v)) ? `<div class="grid vh-grid">${
        own.map((f) => tsFieldHTML(v.f, f, 'main', 'vh-s2')).join('')}</div>`
        : grid(v.f, own, 'main');
    return sub(secTitle(v, sec), body, allInsp ? '<span class="hint">осмотр</span>' : '');
  });

  if (special.length && !inspect) {
    parts.push(sub('Особое для базы',
      `<div class="grid vh-grid vh-grid-fit vh-fit-narrow">${cells(v.f, special, 'main')}</div>`));
  }
  const useAll = commonFields(v).filter((f) => f.block === 'use' && shown(v, f));
  // Общее состояние — итоговой строкой таблицы состояния, где она есть
  // (указание пользователя 06.10.2026: «Общее состояние должно быть в таблице
  // состояний»); у остальных ТС — в «Наработке и состоянии».
  const hasCond = useAll.some((f) => COND.test(f.key));
  const inCond = (f) => COND.test(f.key) || (hasCond && GENERAL.test(f.key));
  const cond = useAll.filter(inCond);
  const use = useAll.filter((f) => !inCond(f));
  if (use.length) parts.push(sub('Наработка и состояние', useGrid(v.f, use), '<span class="hint">осмотр</span>'));
  if (cond.length) parts.push(sub('Состояние', condTableHTML(v.f, cond), '<span class="hint">осмотр</span>'));
  if (!inspect) parts.push(extraPart(v.extra, 'main'));

  const title = v.kind === 'self' ? SELF_CAT : 'Автотранспортное средство';
  return card('teal', idx, title, inspect ? 'для осмотра' : 'по техпаспорту; то, что смотрят на месте, помечено «осмотр»',
    parts.join(''), '', 'data-ts-block="machine"');
}

// Наработка и состояние — всё по осмотру: источник назван в заголовке подраздела,
// метка «осмотр» у каждого поля его только повторяла. Строки без пустот: у
// машины с пробегом — пробег, моточасы, состояние на полстроки, под ними
// комплектность; без пробега — моточасы, состояние и комплектность в одну
// строку. Комплектность — в одну строку ввода, растёт по тексту (замечание
// пользователя 23.09.2026: «блок наработка и состояние — поправь»).
// С 30.09.2026 здесь же «Где стоит (фактический адрес)» — на всю строку перед
// комплектностью.
const USE_ORDER = ['mileage', 'engineHours', 'hours', 'state', 'generalState', 'generalStateNote', 'factAddr', 'kit'];

// Состояние легкового — таблицей по элементам: оценка по шкале осмотра и
// краткое описание (указание пользователя 02.10.2026: «поля по состоянию +
// текстовое описание. Оформляем в виде таблицы»). Оформлена как таблица
// «Дополнительные параметры» ниже — ячейки-поля без рамок (mu-xtbl), а ширины
// столбцов меняются перегородками (указание пользователя: «столбцы должны быть
// оформлены как ниже доп параметры. И со столбцами, меняющими ширину»; механизм
// общий — kernel/columns.js, как у таблиц документов). Ширины — настройка
// показа на модуль, без перерисовки: в CSS-переменных обёртки.
const COND = /^cond[A-Z]/;
const COND_COLUMNS = [
  { key: 'el', label: 'Элемент', width: 210, minWidth: 120 },
  { key: 'grade', label: 'Состояние', width: 190, minWidth: 130 },
  { key: 'note', label: 'Краткое описание', width: 0 },
];
const condWidths = {};
// Характеристика ступени шкалы — подсказкой: у пункта списка, у выбранного
// значения и всей шкалой — у заголовка столбца (шкала — лист «Шкалы» методики
// расчёта ТС, передана пользователем 06.10.2026). Текст длинный, в ячейку
// таблицы не помещается — поэтому подсказка, а не строка под полем.
const GRADE_HINT = Object.fromEntries(TS_CONDITION_SCALE.map((g) => [g.name, g.hint]));
const SCALE_TIP = TS_CONDITION_SCALE.map((g) => `${g.name} — ${g.hint}`).join('\n\n');
// Элемент — именем, а не «состоянием чего»: в столбце «Элемент».
const GENERAL = /^generalState/;
const COND_NAMES = { condBody: 'Кузов и окраска', condInterior: 'Салон', condEngine: 'Двигатель',
  condChassis: 'Ходовая часть', condElectric: 'Электрооборудование', condOther: 'Прочие элементы',
  condCab: 'Кабина и окраска', condFrame: 'Рама и окраска', condMotoFrame: 'Рама и облицовка',
  generalState: 'Общее состояние' };
function condTableHTML(vals, list) {
  const row = (g) => {
    const note = list.find((f) => f.key === g.key + 'Note');
    const value = (vals || {})[g.key] || '';
    const name = COND_NAMES[g.key] || g.label;
    // Общее состояние — итоговая строка: своя шкала, описание — только при «Иное».
    const total = GENERAL.test(g.key);
    return `<tr data-ts-key="${esc(g.key)}" ${total ? 'class="vh-cond-total"' : ''}>
      <td class="vh-cond-el">${esc(name)}</td>
      <td><select class="ax-cell" data-tsf="main|${esc(g.key)}" data-ts-grade aria-label="${esc(g.label)}"
        title="${esc(GRADE_HINT[value] || '')}">
        <option value="">Не выбрано</option>${(g.options || []).map((o) => `<option ${o === value ? 'selected' : ''}
          title="${esc(GRADE_HINT[o] || '')}">${esc(o)}</option>`).join('')}
      </select></td>
      <td>${note ? `<input class="ax-cell" data-tsf="main|${esc(note.key)}" value="${esc((vals || {})[note.key] || '')}"
        aria-label="${esc(note.label)}" placeholder="${total ? 'Опишите состояние' : 'Кратко: что видно на осмотре'}">` : ''}</td>
    </tr>`;
  };
  // Общее состояние — в подвале таблицы, отдельно от элементов (указание
  // пользователя 06.10.2026: «отдели общее состояние более явно»; практика
  // итоговой строки: tfoot, черта над ней, свой фон, жирный шрифт).
  const items = list.filter((f) => !f.key.endsWith('Note'));
  const rows = items.filter((g) => !GENERAL.test(g.key)).map(row).join('');
  const foot = items.filter((g) => GENERAL.test(g.key)).map(row).join('');
  const head = COND_COLUMNS.map((c, i) => `<th data-col="${c.key}"${c.key === 'grade' ? ` title="${esc(SCALE_TIP)}" class="vh-tip"` : ''}>${colLabelHTML(c)}${resizeGripHTML(c, i === COND_COLUMNS.length - 1)}</th>`).join('');
  return `<div class="vh-cond-wrap" data-ts-cond-box style="${columnVarsStyle(COND_COLUMNS, condWidths)}">
    <table class="tbl mu-xtbl vh-xtbl vh-cond">${colGroupHTML(COND_COLUMNS, condWidths)}
    <thead><tr>${head}</tr></thead><tbody>${rows}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table></div>`;
}

// Перегородки таблицы состояния; ширины общие на модуль — после перетаскивания
// проставляются всем таблицам состояния на экране.
export function bindCondColumns(scope) {
  scope.$$('[data-ts-grade]').forEach((sel) => sel.addEventListener('change', () => {
    sel.title = GRADE_HINT[sel.value] || '';
  }));
  bindColumnResize(scope, {
    rootSel: '[data-ts-cond-box]',
    cols: COND_COLUMNS,
    widths: condWidths,
    onCommit(patch) {
      Object.assign(condWidths, patch);
      scope.$$('[data-ts-cond-box]').forEach((box) => {
        Object.entries(condWidths).forEach(([k, w]) => box.style.setProperty('--cw-' + k, w + 'px'));
      });
    },
  });
}

function useGrid(vals, raw) {
  const list = [...raw].sort((a, b) => USE_ORDER.indexOf(a.key) - USE_ORDER.indexOf(b.key));
  // Строки заполнены при любом составе (правило проекта, 06.10.2026: без
  // пустых колонок): списки состояния — не уже полстроки, иначе «Условно
  // пригодное» не помещается. Первая строка — наработка и тех. состояние
  // (два числа по четверти или одно на полстроки, состояние — полстроки);
  // вторая — общее состояние и описание при «Иное» либо «Где стоит»; у
  // легкового (состояние — в таблице) пробег и «Где стоит» — одной строкой.
  const has = (k) => list.some((f) => f.key === k);
  const nums = ['mileage', 'engineHours', 'hours'].filter(has);
  const sp = { kit: 4, factAddr: 4 };
  if (has('state')) {
    nums.forEach((k) => { sp[k] = nums.length > 1 ? 1 : 2; });
    sp.state = nums.length ? 2 : 4;
  } else if (nums.length === 1 && !has('generalState')) {
    sp[nums[0]] = 1;
    sp.factAddr = 3;
  } else {
    nums.forEach((k) => { sp[k] = 2; });
  }
  if (has('generalState')) {
    sp.generalState = 2;
    if (has('generalStateNote')) sp.generalStateNote = 2;
    else sp.factAddr = 2;
  }
  return `<div class="grid vh-grid vh-use">${list.map((f) => tsFieldHTML(vals, { ...f, source: '', rows: 1 }, 'main',
    `vh-s${sp[f.key] || 1}`)).join('')}</div>`;
}


// --- Строка разделов и режим осмотра -------------------------------------------------
// Развёртка, согласована 30.09.2026. Над формой — строка разделов с
// заполненностью: форма стоит в полэкрана рядом с просмотрщиком, до модулей —
// несколько экранов прокрутки, и не было видно, что осталось. Щелчок по
// «Учёту» или «Машине» открывает список пустых полей по подразделам, щелчок по
// полю ведёт к нему (практика: навигация по разделам длинной формы с отметкой
// заполненности). Переключатель «Все поля / Для осмотра» оставляет только то,
// что смотрят на месте: поля с пометкой «осмотр», наработку, модули и фото.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: «пусто» здесь — просто незаполненное поле. Какие
// поля обязательны на каком этапе, пользователь ещё не определил (вопрос
// 30.09.2026); на сервере это правило этапа, и список пустых станет списком
// обязательных.
export const inspectField = (f) => f.block === 'use' || f.source === 'Осмотр' || f.source === 'Техпаспорт или осмотр';

const isEmpty = (vals, f) => {
  const x = (vals || {})[f.key];
  return Array.isArray(x) ? !x.length : !String(x ?? '').trim();
};

// Поля раздела, как они стоят на экране: [{ group, fields }].
export function sectionFields(v, key, inspect = false) {
  const keep = (list) => list.filter((f) => !inspect || inspectField(f));
  if (key === 'reg') return [{ group: 'Регистрационный учёт', fields: keep(commonFields(v).filter((f) => f.block === 'reg')) }];
  if (key !== 'machine') return [];
  const special = specialFields(v).filter((f) => f.key !== 'country');
  const country = specialFields(v).find((f) => f.key === 'country');
  const list = commonFields(v).filter((f) => f.block === 'machine' && shown(v, f) && f.key !== 'vtype')
    .concat(country && !commonFields(v).some((f) => f.key === 'country') ? [country] : []);
  const out = SECTIONS.map((sec) => ({ group: secTitle(v, sec), fields: keep(list.filter((f) => (SECTION_OF[f.key] || 'general') === sec.key)) }));
  out.push({ group: 'Особое для базы', fields: keep(special) });
  out.push({ group: 'Наработка и состояние', fields: keep(commonFields(v).filter((f) => f.block === 'use')) });
  return out.filter((g) => g.fields.length);
}

function fillOf(v, key, inspect) {
  const all = sectionFields(v, key, inspect).flatMap((g) => g.fields);
  return { filled: all.filter((f) => !isEmpty(v.f, f)).length, total: all.length };
}

function missingHTML(v, key, inspect) {
  const groups = sectionFields(v, key, inspect)
    .map((g) => ({ group: g.group, fields: g.fields.filter((f) => isEmpty(v.f, f)) }))
    .filter((g) => g.fields.length);
  const n = groups.reduce((a, g) => a + g.fields.length, 0);
  return `<div class="vh-miss" data-ts-miss="${key}" hidden role="dialog" aria-label="Незаполненные поля">
    <div class="vh-miss-h">${n ? `Пусто ${n}` : 'Всё заполнено'}</div>
    ${groups.map((g) => `<div class="vh-miss-g">${esc(g.group)}</div>${g.fields.map((f) => `
      <button type="button" class="vh-miss-f" data-ts-jump="main|${esc(f.key)}">${esc(f.label)}</button>`).join('')}`).join('')}
  </div>`;
}

export function navHTML(ctx, v, set) {
  const inspect = !!ctx.ui.tsInspect;
  const chip = (key, label, text, extra = '') => `<span class="vh-navi">
      <button type="button" class="vh-chip ${extra}" data-ts-nav="${key}" aria-expanded="false">${esc(label)} <b>${esc(text)}</b></button>
      ${key === 'reg' || key === 'machine' ? missingHTML(v, key, inspect) : ''}</span>`;
  const chips = [];
  if (v.kind !== 'module' && !inspect) {
    const f = fillOf(v, 'reg', inspect);
    chips.push(chip('reg', 'Учёт', `${f.filled} из ${f.total}`, f.filled === f.total ? 'done' : ''));
  }
  if (v.kind !== 'module') {
    const f = fillOf(v, 'machine', inspect);
    chips.push(chip('machine', 'Машина', `${f.filled} из ${f.total}`, f.filled === f.total ? 'done' : ''));
    chips.push(chip('modules', 'Модули', String(v.modules.length)));
  }
  const photos = Object.values((set && set.photos) || {}).reduce((a, n) => a + (n || 0), 0);
  chips.push(chip('photos', 'Фото', String(photos)));
  const seg = v.kind === 'module' ? '' : `<div class="vh-mode" role="group" aria-label="Какие поля показать">
      <button type="button" class="${inspect ? '' : 'on'}" data-ts-mode="all" aria-pressed="${!inspect}">Все поля</button>
      <button type="button" class="${inspect ? 'on' : ''}" data-ts-mode="inspect" aria-pressed="${inspect}">Для осмотра</button></div>`;
  return `<nav class="vh-nav" aria-label="Разделы карточки">${chips.join('')}<span class="vh-nav-gap"></span>${seg}</nav>`;
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
  // Подписи модулей — терминами, без пометок об источнике (замечание
  // пользователя 06.10.2026: «комментарий к модулям плохо подходит. Особенно
  // непонятно, что там делает слово „осмотр“… более квалифицированными и без
  // лишнего»).
  module: 'Технические характеристики модуля без отдельного поля: наименование с единицей измерения и значение.',
};

function extraPart(rows, owner, title = 'Дополнительные параметры', kind = owner === 'main' ? 'main' : 'module') {
  const add = `<button class="btn btn-ghost btn-sm vh-sub-act" data-tsx-add="${esc(owner)}">+ Параметр</button>`;
  const help = EXTRA_HELP[kind];
  return sub(title, `<p class="vh-howto vh-howto-sub">${help}</p>${extraTableHTML(rows, owner)}`, add);
}

// --- 05 Модули ---------------------------------------------------------------------------
// Список с раскрытием (развёртка, согласована 30.09.2026; практика «добавить
// ещё», DWP/GOV.UK): строка — сводка модуля, щелчок раскрывает его поля;
// раскрыт один модуль за раз. Удалить — только крестиком в строке: прежние
// таблица и форма под ней повторяли одно и то же, а удаление было в двух
// местах. «+ Добавить модуль» — внизу списка. Свой цвет блока — фиолетовый:
// модули не спутать с самой машиной (указание пользователя 23.09.2026).
const CHEV = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

function moduleRow(m, open, noEngine) {
  const cell = (k) => `<span class="vh-mcell" data-ts-mcell="${k}">${esc(String(m.f[k] || '').trim() || '—')}</span>`;
  return `<div class="vh-mitem ${open ? 'open' : ''}" data-ts-mitem="${m.id}">
    <div class="vh-mrow">
      <button type="button" class="vh-mtoggle" data-ts-mpick="${m.id}" aria-expanded="${open}"
        aria-controls="ts-mform-${m.id}">
        <span class="vh-mcell-name"><span class="vh-mname">${esc(moduleTitle(m))}</span>
          <span class="vh-mpath">${esc(m.group || 'Группа не выбрана')}</span></span>
        ${cell('model')}${cell('year')}${cell('state')}
        <span class="vh-mchev">${CHEV}</span>
      </button>
      <button type="button" class="ax-x mu-del vh-mdel" data-ts-mdel="${m.id}" title="Удалить модуль"
        aria-label="Удалить модуль ${esc(moduleTitle(m))}">×</button>
    </div>
    ${open ? moduleFormHTML(m, noEngine) : ''}
  </div>`;
}

// Раскрытый модуль: над списками «Группа / Модуль» — поиск по справочнику
// модулей (помощник, а не замена: выбор заполняет оба списка).
// noEngine — модуль на прицепе: у базы нет двигателя, привода «от двигателя
// базы (КОМ)» быть не может.
function moduleFormHTML(m, noEngine = false) {
  const cascade = `<div class="grid vh-grid">
      <div class="field vh-s2"><label for="ts-${m.id}-g">Группа</label>
        <select class="select" id="ts-${m.id}-g" data-ts-modgroup="${m.id}">${
  options(moduleGroups(), m.group, 'Выберите группу')}</select></div>
      <div class="field vh-s2"><label for="ts-${m.id}-k">Модуль</label>
        <select class="select" id="ts-${m.id}-k" data-ts-modkind="${m.id}" ${m.group ? '' : 'disabled'}>${
  options(moduleKinds(m.group).map((k) => k.name), m.kind, m.group ? 'Выберите модуль' : 'Сначала группа')}</select></div>
    </div>`;
  const search = treeSearchHTML({ id: 'ts-mfind', label: 'Найти модуль', placeholder: 'Например: автокран, цистерна, ковш' });
  return `<div class="vh-mform" id="ts-mform-${m.id}" data-ts-mform="${m.id}">
    ${search}${cascade}
    ${m.kind ? `${grid(m.f, [...moduleFields(m.f, MODULE_FIELDS, noEngine), ...moduleSpecial(m.kind)], m.id)}${
  extraPart(m.extra, m.id, 'Параметры модуля')}` : ''}
  </div>`;
}

// Какой модуль раскрыт: выбранный; не выбирали — первый; «none» — ни один.
export const openModuleId = (ctx, v) => {
  const want = ctx.ui && ctx.ui.tsModule;
  if (want === 'none') return '';
  return (v.modules.find((m) => m.id === want) || v.modules[0] || {}).id || '';
};

function modulesHTML(ctx, v, idx) {
  const open = openModuleId(ctx, v);
  const list = v.modules.map((m) => moduleRow(m, m.id === open, isTrailer(v))).join('');
  // Набор «база + модули» можно сохранить своим шаблоном — он появится в поиске
  // «Вида объекта» у всех (решение пользователя 06.10.2026).
  const save = canSaveTemplate(v)
    ? '<button type="button" class="btn btn-ghost btn-sm" data-ts-tpl-save style="margin-left:auto">Сохранить как шаблон</button>' : '';
  return card('violet', idx, 'Модули', 'надстройки и навесное оборудование, смонтированные на базе',
    `<div class="vh-mlist">${list || '<div class="vehicle-note">Модулей нет.</div>'}
      <button type="button" class="vh-madd" data-ts-madd>+ Добавить модуль</button></div>`, save, 'data-ts-block="modules"');
}

// --- Фото с осмотра ------------------------------------------------------------------------
// Две категории — «Машина» и «Модули»; у оборудования без машины — одна.
function photosHTML(ctx, v, idx, set) {
  const cats = v.kind === 'module' ? ['Модули'] : PHOTO_CATS;
  const body = cats.map((cat) => {
    const n = (set.photos || {})[cat] || 0;
    const tiles = Array.from({ length: n }, (_, i) => {
      // После перезагрузки у снимка остаётся запись без ссылки на файл
      // (kernel/persist.js убирает blob-ссылки) — плитка показывает подпись,
      // а не картинку с адресом «undefined».
      const f = photoFileAt(set, cat, i);
      return `<button type="button" class="ph" data-ts-photo-open="${esc(cat)}|${i}" title="${esc(cat)} · фото ${i + 1}">${
        f && f.dataUrl ? `<img class="ph-img" src="${f.dataUrl}" alt="${esc(f.name)}">` : `${esc(cat)} ${i + 1}`}</button>`;
    }).join('');
    const add = `<button class="btn btn-ghost btn-sm vh-sub-act" data-ts-photo-add="${esc(cat)}"
      title="Можно выбрать сразу несколько файлов">+ Фото</button>`;
    // У оборудования без машины снимки подписаны его названием, а не «Модули»:
    // единица одна (развёртка 30.09.2026); категория в данных — прежняя.
    const label = v.kind === 'module' && v.modKind ? v.modKind : cat;
    return sub(`${label} · ${n}`, `<div class="ph-row">${tiles || '<span class="vehicle-note">Фото нет.</span>'}</div>`, add);
  }).join('');
  return card('blue', idx, 'Фото с осмотра', '', body, '', 'data-ts-block="photos"');
}

// --- «Оборудование без машины» -----------------------------------------------------------
// Наработка и состояние — подразделом того же блока, как у машины (развёртка
// 30.09.2026): отдельным блоком она была только здесь. Заголовок — название
// оборудования.
function loneModuleHTML(v, idx) {
  const use = MODULE_FIELDS.filter((f) => f.block === 'use');
  return card('violet', idx, v.modKind || 'Оборудование', 'оборудование, не смонтированное на транспортном средстве',
    grid(v.f, moduleFields(v.f, MODULE_FIELDS.filter((f) => f.block === 'machine'), true), 'main')
    + sub('Наработка и состояние', useGrid(v.f, use), '<span class="hint">осмотр</span>')
    + extraPart(v.extra, 'main', 'Параметры оборудования', 'module'));
}

// Форма ТС — от «Вида объекта» до фото. holder — запись, у которой лежит
// vehicle: у ТС как объекта оценки это сама запись ОЦ, у ТС внутри
// гражданского здания — объект имущества (civil/oi/vehicle). set — держатель
// снимков. Блок сторон нужен только ОЦ: у объекта имущества стороны — у ОЦ
// (указание пользователя 23.09.2026: «блок 01 не требуется»).
export function tsFormHTML(ctx, holder, set, { parties = null } = {}) {
  const v = tsOf(holder);
  ctx.ui = ctx.ui || {};
  const inspect = !!ctx.ui.tsInspect && v.kind !== 'module';
  const idx = blockNumbers();
  const n = () => String(idx()).padStart(2, '0');
  // В режиме осмотра стороны и регистрация не нужны: их на месте не смотрят.
  const parts = [parties && !inspect ? parties(n()) : '', kindHTML(ctx, v, n())];

  if (classified(v)) {
    parts.unshift(navHTML(ctx, v, set));
    if (v.kind === 'module') {
      parts.push(loneModuleHTML(v, n()), photosHTML(ctx, v, n(), set));
    } else {
      parts.push(inspect ? '' : regHTML(v, n()), machineHTML(v, n(), inspect), modulesHTML(ctx, v, n()),
        photosHTML(ctx, v, n(), set));
    }
  }
  return `<div class="vehicle-form ${inspect ? 'vh-inspect' : ''}">${parts.join('')}</div>`;
}

function formHTML(ctx) {
  // Свёрнуты ли стороны, решается один раз при открытии карточки: учреждение
  // уже выбрано — свёрнуты; нет — развёрнуты и остаются такими, пока с ними
  // работают (иначе блок схлопывался сразу после выбора учреждения).
  if (ctx.ui.partiesOpen === undefined) ctx.ui.partiesOpen = !ctx.rec.institution;
  const open = ctx.ui.partiesOpen;
  return tsFormHTML(ctx, ctx.rec, photoSetOf(ctx.rec), { parties: (n) => partiesHTML(ctx.rec, n, ownerNames(), open) });
}

// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: «сохранено» здесь — снимок в хранилище браузера
// (kernel/persist.js), он пишется сам после каждой правки. На сервере это
// время последнего принятого сервером изменения; развилка — сохранять каждую
// правку сразу или черновиком с явным «Сохранить».
export function savedText() {
  const at = lastSavedAt();
  return at ? `Сохранено · ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` : '';
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
      { label: 'Марка и модель', value: makeWithModules(v) || 'не указаны', wide: true },
    ],
    // «Сохранено · 13:42» — когда запись последний раз легла в хранилище
    // (kernel/persist.js); «Создать похожее» — для парка одинаковых машин.
    actions: `<span class="hint vh-saved" data-vehicle-saved>${esc(savedText())}</span>
      <button class="btn btn-ghost" data-vehicle-copy ${classified(v) ? '' : 'disabled'}
        title="Новый объект оценки с тем же видом, базой, характеристиками и модулями">Создать похожее</button>
      <button class="btn btn-ghost" data-vehicle-back>← К объектам оценки</button>
      <button class="btn btn-primary" data-vehicle-save>Сохранить</button>`,
    tabs: [{ key: 'general', label: 'Общие данные' }],
  });
}

export function viewVehicle(ctx) {
  return `${headVehicle(ctx)}
    ${splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, formHTML(ctx))}`;
}
