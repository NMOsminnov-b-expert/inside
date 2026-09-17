// Карточка ОИ «Механизмы и оборудование».
//
// Устройство — «перечень и подробная карточка»: сверху таблица единиц техники,
// под ней карточка выбранной единицы (практика stacked master-detail, Oracle
// APEX «Master Detail Forms»). Таблица нужна, чтобы единицы сравнивать и видеть
// итог по количеству и стоимости; подробная карточка — чтобы уместить
// классификацию и параметры, которые в строку таблицы не помещаются.
//
// Параметры единицы берутся из классификатора (data/mechClassifier.js, собран
// из таблицы «Группы движимого имущества»): класс → подгруппа → тип, и у
// подгруппы свой набор основных и дополнительных параметров. Так устроен лист
// «Модель» той же таблицы: три зависимых списка и параметры выбранного типа.
import { esc } from '../../../../kernel/dom.js';
import { fmtNum } from '../../../../kernel/fmt.js';
import { numText } from '../../../../kernel/numField.js';
import { devNote } from '../../../../kernel/devNote.js';
import { blockNumbers } from '../../../../kernel/blockIndex.js';
import { splitWrap, viewerHTML } from '../../parts/viewer/shell.js';
import { photoFileAt } from '../../parts/photos/model.js';
import {
  mechUnits, classNames, classOf, subgroupOf, hasSubgroups, paramsOf, asksCountry,
  unitParam, unitParamUnit, unitTitle, unitClassPath, totalQty, totalCost, hasCost,
  unitPhotoCount,
} from './model.js';

// Стоимость — балансовая (уточнение пользователя 17.09.2026). За единицу она
// или за всё количество в строке, по-прежнему не решено.
const COST_NOTE = 'Балансовая стоимость — за единицу или за всё количество в строке, пока '
  + 'не решено. Итог складывает столбец как есть, без умножения на количество.';

const CLASS_NOTE = 'На схеме «Группы движимого имущества» есть класс «Технологическое '
  + '(производственное) оборудование» — станки, технологические линии, печи, насосы. '
  + 'В классификаторе строк по нему нет, поэтому и в списке его нет: параметры для '
  + 'него не заданы.';

// Выбранная единица. Хранится по ОИ: у каждого ОИ своя, и при возврате в
// карточку открывается та, с которой работали.
export function selectedUnit(ctx, oi) {
  const list = mechUnits(oi);
  const sel = (ctx.ui.mechSel || {})[oi.id];
  return list.find((u) => u.id === sel) || list[0] || null;
}

const optionHTML = (value, current) => `<option ${value === current ? 'selected' : ''}>${esc(value)}</option>`;

// Пустой пункт — подсказка, что выбирать. Пока родитель не выбран, список
// заблокирован и говорит, чего ему не хватает (практика каскадных списков).
function selectField({ label, attr, options, value, placeholder, locked, lockedText }) {
  return `<div class="field">
    <label>${label}</label>
    <select class="select" data-mu-${attr} ${locked ? 'disabled' : ''}>
      <option value="">${esc(locked ? lockedText : placeholder)}</option>
      ${options.map((o) => optionHTML(o, value)).join('')}
    </select>
  </div>`;
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// --- Перечень единиц --------------------------------------------------------

// Экспортируется ради точечного обновления: пока правят поля единицы, таблица
// над ней пересчитывает строку и итог без отрисовки всей карточки.
export function unitsTable(ctx, oi, current) {
  const list = mechUnits(oi);

  const rows = list.map((u) => {
    const path = unitClassPath(u);
    const photos = unitPhotoCount(oi, u);
    const on = current && u.id === current.id;
    return `<tr class="mu-row ${on ? 'on' : ''}" data-mu-pick="${u.id}" aria-selected="${on}"
        tabindex="0" title="Открыть карточку единицы">
      <td class="mu-c-name">
        <div class="mu-name mu-clip" title="${esc(unitTitle(u))}">${esc(unitTitle(u))}</div>
        <div class="mu-path mu-clip ${path ? '' : 'mu-path-empty'}" title="${esc(path)}">${esc(path || 'Класс не выбран')}</div>
      </td>
      <td class="mu-c-num">${esc(u.year || '—')}</td>
      <td class="mu-c-num">${esc(u.qty || '—')}</td>
      <td class="mu-c-num">${String(u.cost || '').trim() ? fmtNum(u.cost) : '—'}</td>
      <td class="mu-c-num">${photos || '—'}</td>
      <td class="mu-c-act"><button class="ax-x mu-del" data-mu-del="${u.id}"
        title="Убрать единицу из перечня" aria-label="Убрать ${esc(unitTitle(u))}">×</button></td>
    </tr>`;
  }).join('');

  return `<div class="mu-table-wrap">
    <table class="tbl mu-tbl">
      <colgroup><col><col style="width:56px"><col style="width:70px"><col style="width:124px">
        <col style="width:58px"><col style="width:36px"></colgroup>
      <thead><tr>
        <th title="Наименование и классификация">Наименование</th>
        <th class="mu-c-num">Год</th>
        <th class="mu-c-num" title="Количество, шт.">Кол-во</th>
        <th class="mu-c-num" title="Балансовая стоимость, сом">Бал. стоимость</th>
        <th class="mu-c-num">Фото</th>
        <th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="oi-total">
        <td>Итого: ${list.length} ${plural(list.length, 'позиция', 'позиции', 'позиций')}</td>
        <td></td>
        <td class="mu-c-num">${totalQty(oi)} шт.</td>
        <td class="mu-c-num" title="Сумма балансовой стоимости, сом">${hasCost(oi) ? fmtNum(totalCost(oi)) : '—'}</td>
        <td></td><td></td>
      </tr></tfoot>
    </table>
  </div>`;
}

function listCard(ctx, oi, current, idx) {
  return `<div class="card t-blue" id="q-mech-list">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">${String(idx).padStart(2, '0')}</span>
      <h3>Состав</h3>
      <span class="hint">единицы техники в этом объекте имущества</span>
      <button class="btn btn-primary btn-sm" data-mu-add style="margin-left:auto" title="Добавить единицу техники в состав">+ Добавить ОИ</button>
      <span class="chev" style="margin-left:8px">▾</span>
    </div>
    <div class="card-body-wrap">${groupRow(oi)}${unitsTable(ctx, oi, current)}</div>
  </div>`;
}

// Название списка — то, под чем эта техника числится: название списка, номер
// счёта по бухгалтерскому балансу или материально ответственное лицо
// (уточнение пользователя 17.09.2026). Показывается всегда: список по счёту или
// МОЛ бывает и у одной единицы. Пока не заполнено, ОИ в перечне называется по
// первой единице — это и сказано в подсказке поля.
//
// Пояснение — строкой под подписью, как у комментария единицы: что именно
// вписывать, надо видеть до ввода, а не после наведения.
function groupRow(oi) {
  const list = mechUnits(oi);
  const fallback = list.length ? `${unitTitle(list[0])}${list.length > 1 ? ` (+${list.length - 1})` : ''}` : '';
  return `<div class="mu-group field">
    <label for="mu-group">Название списка</label>
    <span class="mu-hint" id="mu-group-hint">Можно указать номер счёта по бухгалтерскому балансу (ББ)
      или материально ответственное лицо (МОЛ)</span>
    <input class="input" id="mu-group" data-mu-group value="${esc(oi.groupName || '')}"
      aria-describedby="mu-group-hint"
      placeholder="${esc(fallback ? `Если не указано — «${fallback}»` : '')}">
  </div>`;
}

// --- Карточка единицы -------------------------------------------------------

// Поле параметра по описанию из справочника полей (data/mechFields.js).
//
// Число с единицей измерения — одно слитное поле: число и список единиц в общей
// рамке, подпись одна на оба (практика Filament FusedGroup, UX Collective).
// Единственная единица списком не выбирается — она стоит в подписи через
// запятую, как в остальных карточках макета («Высота, м»).
function fieldHTML(unit, f) {
  const value = unitParam(unit, f.key);
  const id = 'mu-f-' + f.key;
  const one = f.units && f.units.length === 1 ? f.units[0] : '';
  const many = f.units && f.units.length > 1 ? f.units : null;
  const label = esc(f.label + (one ? ', ' + one : ''));

  const control = () => {
    if (f.type === 'select') {
      return `<select class="select" id="${id}" data-mu-f="${esc(f.key)}">
        <option value="">Не выбрано</option>
        ${f.options.map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      </select>`;
    }
    if (f.type === 'date') {
      return `<input class="input mu-date" type="date" id="${id}" data-mu-f="${esc(f.key)}" value="${esc(value)}">`;
    }

    // Числовое поле — общее для всего макета (kernel/numField.js): разряды,
    // запятая и вычисление выражения. `data-num` говорит контроллеру, какая это
    // величина: «int» — штуки, дробной части у них не бывает.
    const numeric = f.type === 'num' || f.type === 'int';
    const kind = f.type === 'int' ? 'int' : 'dec';
    const shown = numeric ? numText(value, kind) : value;
    const input = `<input class="input ${numeric ? 'mu-num' : ''}" id="${id}" data-mu-f="${esc(f.key)}"
      ${numeric ? `data-num="${kind}"` : ''} value="${esc(shown)}">`;

    if (!many) return input;
    const chosen = unitParamUnit(unit, f);
    return `<span class="mu-unit-group">${input}
      <select class="select mu-unit" data-mu-unit="${esc(f.key)}" aria-label="Единица измерения: ${label}">
        ${many.map((u) => `<option ${u === chosen ? 'selected' : ''}>${esc(u)}</option>`).join('')}
      </select></span>`;
  };

  return `<div class="field mu-param">
    <label for="${id}">${label}</label>
    ${f.hint ? `<span class="mu-hint">${esc(f.hint)}</span>` : ''}
    ${control()}
  </div>`;
}

function classificationHTML(unit) {
  const c = classOf(unit.cls);
  const s = subgroupOf(unit.cls, unit.sub);
  const withSubs = !unit.cls || hasSubgroups(unit.cls);

  return `<div class="mu-sec">
    <div class="sec-h">Классификация${devNote(CLASS_NOTE)}</div>
    <div class="grid mu-grid-class">
      ${selectField({ label: 'Класс', attr: 'cls', options: classNames(), value: unit.cls, placeholder: 'Выберите класс' })}
      ${withSubs ? selectField({
    label: 'Подгруппа', attr: 'sub', options: c ? c.subgroups.map((x) => x.name) : [], value: unit.sub,
    placeholder: 'Выберите подгруппу', locked: !c, lockedText: 'Сначала выберите класс',
  }) : ''}
      ${withSubs ? selectField({
    label: 'Тип', attr: 'type', options: s ? s.types : [], value: unit.type,
    placeholder: 'Выберите тип', locked: !s, lockedText: 'Сначала выберите подгруппу',
  }) : ''}
    </div>
    ${withSubs ? '' : '<div class="mu-note">У этого класса нет подгрупп и типов — '
      + 'поля заданы на сам класс.</div>'}
  </div>`;
}

function whyNoFields(unit) {
  if (!unit.cls) return 'Выберите класс и подгруппу — здесь появятся параметры этой категории.';
  if (hasSubgroups(unit.cls) && !unit.sub) return 'Выберите подгруппу — здесь появятся параметры этой категории.';
  return 'Для этой категории параметры не заданы — опишите механизм своими полями ниже.';
}

// Наименование, инвентарный номер и основные параметры — одним разделом:
// параметры подняты к наименованию (требование пользователя 17.09.2026), потому
// что по ним механизм и узнают, а год и стоимость — учётные сведения.
function nameHTML(unit) {
  const { main } = paramsOf(unit);
  const example = unit.type ? `Например: ${unit.type.toLowerCase()}` : 'Например: трансформатор ТМ-400';

  return `<div class="mu-sec">
    <div class="sec-h">Наименование и основные параметры</div>
    <div class="grid mu-grid-name">
      <div class="field mu-f-name">
        <label for="mu-name">Наименование</label>
        <input class="input" id="mu-name" data-mu-name value="${esc(unit.name || '')}" placeholder="${esc(example)}">
      </div>
      <div class="field">
        <label for="mu-inv">Инвентарный номер</label>
        <input class="input" id="mu-inv" data-mu-inv value="${esc(unit.inv || '')}">
      </div>
    </div>
    ${main.length ? `<div class="grid g-2 mu-params">${main.map((f) => fieldHTML(unit, f)).join('')}</div>`
    : `<div class="mu-empty">${esc(whyNoFields(unit))}</div>`}
  </div>`;
}

// Учётные сведения: год ввода в эксплуатацию, количество, балансовая стоимость
// и страна происхождения. Страну спрашиваем не у всех категорий — только у
// значимого оборудования (решение пользователя 17.09.2026).
function accountingHTML(unit) {
  return `<div class="mu-sec">
    <div class="sec-h">Учётные сведения</div>
    <div class="grid mu-grid-general">
      <div class="field">
        <label for="mu-year">Год ввода в эксплуатацию</label>
        <input class="input mu-num" id="mu-year" data-mu-year value="${esc(unit.year || '')}"
          inputmode="numeric" maxlength="4" placeholder="ГГГГ">
      </div>
      <div class="field">
        <label for="mu-qty">Количество, шт.</label>
        <input class="input mu-num" id="mu-qty" data-mu-qty value="${esc(numText(unit.qty, 'int'))}"
          inputmode="numeric">
      </div>
      <div class="field">
        <label for="mu-cost">Балансовая стоимость, сом${devNote(COST_NOTE)}</label>
        <input class="input mu-num" id="mu-cost" data-mu-cost value="${esc(unit.cost || '')}"
          inputmode="decimal" placeholder="не указана">
      </div>
      ${asksCountry(unit) ? `<div class="field">
        <label for="mu-country">Страна происхождения</label>
        <input class="input" id="mu-country" data-mu-country value="${esc(unit.country || '')}">
      </div>` : ''}
    </div>
  </div>`;
}

function paramsHTML(unit) {
  const { extra } = paramsOf(unit);
  if (!extra.length) return '';

  return `<div class="mu-sec">
    <div class="sec-h">Дополнительные параметры</div>
    <div class="grid g-2 mu-params">${extra.map((f) => fieldHTML(unit, f)).join('')}</div>
  </div>`;
}

// Свои поля — то, чего нет в справочнике полей, но есть у конкретной единицы:
// код ЕНИ, узел комплекса, особые отметки (конструктор полей из ветки mech).
function extraHTML(unit) {
  const rows = (unit.extra || []).map((f) => `<tr>
      <td><input class="ax-cell" data-mu-xlabel="${f.id}" value="${esc(f.label)}"
        placeholder="Название поля" aria-label="Название поля"></td>
      <td><input class="ax-cell" data-mu-xvalue="${f.id}" value="${esc(f.value)}"
        placeholder="Значение" aria-label="Значение поля"></td>
      <td class="mu-c-act"><button class="ax-x mu-del" data-mu-xdel="${f.id}"
        title="Убрать поле" aria-label="Убрать поле">×</button></td>
    </tr>`).join('');

  return `<div class="mu-sec">
    <div class="sec-h">Свои поля
      <span class="mu-sec-hint">то, чего нет среди полей категории</span>
      <button class="btn btn-ghost btn-sm" data-mu-xadd>+ Поле</button>
    </div>
    ${rows ? `<table class="tbl mu-xtbl">
      <colgroup><col style="width:38%"><col><col style="width:40px"></colgroup>
      <thead><tr><th>Поле</th><th>Значение</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<div class="mu-empty">Своих полей нет.</div>'}
  </div>`;
}

// Комментарий — место для сведений, которым не нашлось поля, и для сомнений в
// значении (требование пользователя 17.09.2026). Пояснение стоит под подписью
// строкой, а не подсказкой внутри поля: у свободного текста нет формата, и
// пример в поле читался бы как образец, который надо повторить (практика
// helper text, PatternFly, CFPB).
function commentHTML(unit) {
  return `<div class="mu-sec">
    <div class="sec-h">Комментарий</div>
    <div class="field mu-comment-field">
      <label for="mu-comment" class="sr-only">Комментарий</label>
      <span class="mu-hint" id="mu-comment-hint">Не нашли подходящего поля или сомневаетесь в значении —
        опишите здесь своими словами.</span>
      <textarea class="input mu-comment" id="mu-comment" data-mu-comment rows="3"
        aria-describedby="mu-comment-hint">${esc(unit.comment || '')}</textarea>
    </div>
  </div>`;
}

function photosHTML(oi, unit) {
  const n = unitPhotoCount(oi, unit);
  const tiles = Array.from({ length: n }, (_, i) => {
    const f = photoFileAt(oi, unit.id, i);
    return `<button class="ph mu-ph" data-mu-photo="${i}" title="Открыть фото ${i + 1} в просмотрщике">${
      f ? `<img class="ph-img" src="${f.dataUrl}" alt="${esc(f.name)}">` : `фото ${i + 1}`}</button>`;
  }).join('');

  return `<div class="mu-sec">
    <div class="sec-h">Фото${n ? ` <span class="mu-sec-hint">${n}</span>` : ''}
      <button class="btn btn-ghost btn-sm" data-mu-photo-add>+ Фото</button>
    </div>
    ${n ? `<div class="ph-row">${tiles}</div>` : '<div class="mu-empty">Фото этой единицы не загружены.</div>'}
  </div>`;
}

function unitCard(ctx, oi, unit, idx) {
  const num = String(idx).padStart(2, '0');

  if (!unit) {
    return `<div class="card t-teal"><div class="card-head"><span class="card-idx">${num}</span>
      <h3>Механизм</h3></div><div class="card-pad"><div class="mu-empty">В составе нет единиц.
      Добавьте первую кнопкой «+ Добавить ОИ».</div></div></div>`;
  }

  const list = mechUnits(oi);
  const pos = list.indexOf(unit) + 1;

  return `<div class="card t-teal" id="q-mech-unit" data-mu-unit="${unit.id}">
    <div class="card-head" data-card-toggle>
      <span class="card-idx">${num}</span>
      <h3 class="mu-title ell">${esc(unitTitle(unit))}</h3>
      ${list.length > 1 ? `<span class="mu-pager">
        <button class="btn btn-ghost btn-sm" data-mu-step="-1" ${pos <= 1 ? 'disabled' : ''}
          title="Предыдущая единица" aria-label="Предыдущая единица">‹</button>
        <span class="mu-pos">${pos} из ${list.length}</span>
        <button class="btn btn-ghost btn-sm" data-mu-step="1" ${pos >= list.length ? 'disabled' : ''}
          title="Следующая единица" aria-label="Следующая единица">›</button>
      </span>` : ''}
      <span class="chev" style="margin-left:${list.length > 1 ? '8px' : 'auto'}">▾</span>
    </div>
    <div class="card-body-wrap"><div class="card-pad">
      ${classificationHTML(unit)}
      ${nameHTML(unit)}
      ${accountingHTML(unit)}
      ${paramsHTML(unit)}
      ${extraHTML(unit)}
      ${commentHTML(unit)}
      ${photosHTML(oi, unit)}
    </div></div>
  </div>`;
}

export function render(ctx, oi) {
  const idx = blockNumbers();
  const unit = selectedUnit(ctx, oi);

  const body = `<div class="oi-stack mu-stack">
    ${listCard(ctx, oi, unit, idx())}
    ${unitCard(ctx, oi, unit, idx())}
  </div>`;

  return splitWrap(ctx.ui.viewer ? viewerHTML(ctx) : null, body);
}
