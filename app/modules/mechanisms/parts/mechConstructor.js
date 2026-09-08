import { esc } from '../../../kernel/dom.js';
import { nextId } from '../data/store.js';
import { allNames, getTemplate, valuesFor } from '../data/fieldTemplates.js';

// Конструктор полей карточки «Механизмы и оборудование» — переиспользуемый
// кусок UI. Работает с ПЛОСКИМ объектом-записью механизма
// {id, name, qty, cost, fields:[{id,label,value}]}, а не с rec/oi целиком, — так
// же, как карточка земельного участка (land-plot/oi/land) переиспользуется
// всеми модулями ОЦ (см. app/README.md).
//
// Два уровня API:
//  - renderMechFields/bindMechFields — ОДНА запись механизма. Их использует
//    встраиваемая карточка ОИ «Механизмы» (oi/mech/*, подключается из
//    production/civil как свой вид ОИ) — там одна карточка ОИ всегда ровно
//    один физический экземпляр, список тут не нужен.
//  - renderMechList/bindMechList — СПИСОК записей механизма (rec.mechanisms
//    в этом модуле, card/ocForm.*): одна запись ОЦ теперь может описывать
//    несколько единиц техники сразу. Список переиспользует те же
//    per-record функции (bindMechFields — против каждого элемента списка),
//    чтобы поведение имени/полей не расходилось между одиночной и списочной
//    формой.
//
// Подписи полей придумывает пользователь в рантайме, поэтому этот файл не
// использует kernel-овый движок словарей (kernel/dicts.js) — тот строит
// перечни только из статических data/dictExport.js. Источник автодополнения
// здесь — своя, не kernel-овая, история шаблонов/значений (data/fieldTemplates.js).

export function uid() {
  return nextId('mf');
}

function clampQty(raw) {
  const n = parseInt(raw, 10);
  return (Number.isFinite(n) && n >= 1) ? n : 1;
}

// Стоимость не обязательна к заполнению вручную (уточнение пользователя) —
// поле само появляется у каждого механизма со значением 0 по умолчанию, а
// пустое/нечисловое/отрицательное при потере фокуса откатывается к 0, как и
// количество к 1 (clampQty) — а не блокирует сохранение.
function clampCost(raw) {
  const n = parseFloat(raw);
  return (Number.isFinite(n) && n >= 0) ? n : 0;
}

function fieldRowHTML(f) {
  // Пустая подпись — невалидное состояние (обязательное поле, задача
  // пользователя): подсвечивается прямо по данным, без отдельного отслеживания
  // «потрогали/не потрогали» — так это верно и сразу после добавления поля,
  // и после неудачной попытки сохранить.
  const invalid = !String(f.label || '').trim();
  return `<div class="mech-field-row ${invalid ? 'invalid' : ''}" data-mech-field="${esc(f.id)}">
    <input class="input mech-field-label" data-mech-field-label="${esc(f.id)}" required
      value="${esc(f.label || '')}" placeholder="Подпись*" title="${esc(f.label || '')}">
    <input class="input mech-field-value" data-mech-field-value="${esc(f.id)}"
      list="dl-mech-val-${esc(f.id)}" value="${esc(f.value || '')}" placeholder="Значение" title="${esc(f.value || '')}">
    <datalist id="dl-mech-val-${esc(f.id)}">${valuesFor(f.label).map((v) => `<option value="${esc(v)}">`).join('')}</datalist>
    <button type="button" class="btn btn-ghost btn-sm mech-field-rm" data-mech-field-rm="${esc(f.id)}" title="Убрать поле">✕</button>
  </div>`;
}

// Разметка одной записи механизма (название + количество + поля-конструктор).
// Общая для одиночного использования (renderMechFields) и для списка
// (renderMechList) — чтобы не разъезжались две копии одной и той же формы.
// removeBtnHTML — кнопка «убрать механизм целиком»: её показывает только
// список (одиночная карточка ОИ убирается целиком через «+ Добавить ОИ» /
// удаление ОИ, а не отсюда).
function entryBodyHTML(m, removeBtnHTML) {
  const fields = m.fields || [];
  const dlId = `dl-mech-names-${esc(m.id || 'x')}`;

  return `<div class="mech-entry-head">
      <div class="field mech-name-field">
        <label>Название</label>
        <input class="input" data-mech-name list="${dlId}" value="${esc(m.name || '')}"
          placeholder="Например, Станок токарный 16К20">
        <datalist id="${dlId}">${allNames().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <span class="field-hint">Известное название сразу подставит его прежний набор полей — их можно будет донабрать вручную</span>
      </div>

      <div class="field mech-qty-field">
        <label>Количество</label>
        <input class="input" type="number" min="1" step="1" required
          data-mech-qty value="${esc(m.qty != null ? m.qty : 1)}">
      </div>

      <div class="field mech-cost-field">
        <label>Стоимость</label>
        <input class="input" type="number" min="0" step="0.01"
          data-mech-cost value="${esc(m.cost != null ? m.cost : 0)}">
      </div>

      ${removeBtnHTML || ''}
    </div>

    <div class="mech-fields-list" data-mech-fields-list>
      ${fields.map(fieldRowHTML).join('')}
      <button type="button" class="mech-field-add" data-mech-add-field title="Добавить поле">+</button>
    </div>`;
}

// m — {id, name, qty, cost, fields}. Разметка вставляется целиком в карточку
// вызывающей стороны (своей карточки-обёртки у конструктора нет — решает
// вызывающий код, какой у него номер/цвет карточки). Один экземпляр на
// карточку — используется встраиваемой карточкой ОИ «Механизмы».
export function renderMechFields(mech) {
  const m = mech || { name: '', fields: [], qty: 1, cost: 0 };
  return `<div class="mech-constructor"><div class="mech-entry">${entryBodyHTML(m, '')}</div></div>`;
}

// list — [{id, name, qty, cost, fields}] — весь состав механизмов записи ОЦ.
// Каждая запись — свой визуально обособленный блок (граница/подложка, см.
// module.css) с собственной кнопкой «✕ убрать механизм» в шапке (рядом с
// «Название»/«Количество» этой же записи — не путать с кнопкой «✕» у
// отдельного ПОЛЯ, та мельче и стоит в строке самого поля).
export function renderMechList(list) {
  const entries = (list && list.length) ? list : [{ name: '', fields: [], qty: 1, cost: 0 }];

  return `<div class="mech-list">
    ${entries.map((m) => `<div class="mech-entry" data-mech-entry="${esc(m.id || '')}">
      ${entryBodyHTML(m, `<button type="button" class="btn btn-ghost btn-sm mech-entry-rm" data-mech-entry-rm="${esc(m.id || '')}" title="Убрать механизм целиком">✕</button>`)}
    </div>`).join('')}
    <button type="button" class="btn btn-ghost btn-sm" data-mech-add-entry>+ добавить механизм</button>
  </div>`;
}

// Обвязка ОДНОЙ записи механизма — общая для renderMechFields (root — весь
// скоуп экрана, там всегда ровно одна запись) и renderMechList (root —
// DOM-узел конкретного элемента списка, чтобы правки одной записи не задевали
// соседние: несколько таких блоков стоят в скоупе одновременно).
function bindEntry(root, m, onChange) {
  m.fields = m.fields || [];
  if (!(Number.isFinite(m.qty) && m.qty >= 1)) m.qty = 1;
  if (!(Number.isFinite(m.cost) && m.cost >= 0)) m.cost = 0;

  const nameInput = root.querySelector('[data-mech-name]');
  if (nameInput) nameInput.onchange = () => {
    m.name = nameInput.value;

    // Набор полей всегда пересобирается под текущее название (решение
    // пользователя): известное название — его прежние подписи (без значений),
    // новое или ещё не встречавшееся — пустой список. Смена названия отменяет
    // то, что было вписано в поля до неё, — так и задумано. Область
    // действия — только эта запись механизма.
    m.fields = getTemplate(m.name).map((label) => ({ id: uid(), label, value: '' }));
    onChange();
  };

  const qtyInput = root.querySelector('[data-mech-qty]');
  if (qtyInput) qtyInput.onblur = () => {
    // Количество обязательно (Л2.14, задача пользователя): пустое,
    // нечисловое или ⩽0 значение при потере фокуса откатывается к 1, а не
    // сохраняется как есть.
    m.qty = clampQty(qtyInput.value);
    qtyInput.value = m.qty;
    onChange();
  };

  const costInput = root.querySelector('[data-mech-cost]');
  if (costInput) costInput.onblur = () => {
    // Необязательна к заполнению — как и количество, просто откатывается к
    // значению по умолчанию (0), если оставили пустым/вписали не число.
    m.cost = clampCost(costInput.value);
    costInput.value = m.cost;
    onChange();
  };

  Array.from(root.querySelectorAll('[data-mech-field-label]')).forEach((inp) => {
    inp.onchange = () => {
      const f = m.fields.find((x) => x.id === inp.dataset.mechFieldLabel);
      if (f) f.label = inp.value.trim();
      onChange();
    };
  });

  Array.from(root.querySelectorAll('[data-mech-field-value]')).forEach((inp) => {
    inp.onchange = () => {
      const f = m.fields.find((x) => x.id === inp.dataset.mechFieldValue);
      if (f) f.value = inp.value;
      onChange();
    };
  });

  Array.from(root.querySelectorAll('[data-mech-field-rm]')).forEach((btn) => btn.onclick = () => {
    const id = btn.dataset.mechFieldRm;
    m.fields = m.fields.filter((x) => x.id !== id);
    onChange();
  });

  const addBtn = root.querySelector('[data-mech-add-field]');
  if (addBtn) addBtn.onclick = () => {
    // Поле добавляется сразу пустым, без диалога, — подпись и значение
    // вписываются прямо в его собственной строке (задача пользователя).
    // Подпись обязательна: пустая строка подсвечивается в fieldRowHTML.
    const id = uid();
    m.fields.push({ id, label: '', value: '' });
    onChange();
    // onChange() перерисовывает экран целиком (ctx.render()), поэтому новую
    // строку ищем заново по её уникальному id, а не через старый root.
    const added = document.querySelector(`[data-mech-field-label="${CSS.escape(id)}"]`);
    if (added) added.focus();
  };
}

// scope — DOM-скоуп экрана (ctx.scope), mech — {id, name, qty, cost, fields},
// onChange — вызывается после любой правки (обычно ctx.render() —
// конструктор сам не решает, как перерисоваться). Один экземпляр на экран.
export function bindMechFields(scope, mech, onChange) {
  bindEntry(scope.root, mech, onChange);
}

// scope — DOM-скоуп экрана, list — rec.mechanisms целиком, onChange —
// вызывается после любой правки. Помимо правок внутри каждой записи (те же
// name/qty/поля, что и bindMechFields — по одному разу на элемент списка),
// здесь ещё:
//  - кнопка «✕ убрать механизм» у записи — splice из list; если убрали
//    последнюю оставшуюся запись, список не остаётся пустым — вместо этого
//    подставляется одна свежая пустая запись (запись ОЦ всегда описывает
//    хотя бы один механизм);
//  - кнопка «+ добавить механизм» — добавляет пустую запись в конец списка.
export function bindMechList(scope, list, onChange) {
  const root = scope.root;

  list.forEach((entry) => {
    const entryRoot = root.querySelector(`[data-mech-entry="${CSS.escape(String(entry.id || ''))}"]`);
    if (entryRoot) bindEntry(entryRoot, entry, onChange);
  });

  Array.from(root.querySelectorAll('[data-mech-entry-rm]')).forEach((btn) => btn.onclick = () => {
    const id = btn.dataset.mechEntryRm;
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;

    list.splice(i, 1);
    if (!list.length) list.push({ id: uid(), name: '', qty: 1, cost: 0, fields: [] });
    onChange();
  });

  const addBtn = root.querySelector('[data-mech-add-entry]');
  if (addBtn) addBtn.onclick = () => {
    list.push({ id: uid(), name: '', qty: 1, cost: 0, fields: [] });
    onChange();
  };
}
