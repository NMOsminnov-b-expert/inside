import { esc } from '../../../kernel/dom.js';
import { nextId } from '../data/store.js';
import { allNames, getTemplate, valuesFor } from '../data/fieldTemplates.js';
import { pickFile, attachedFileFrom, isFileTooLarge, MAX_DOC_FILE_MB } from './docs/model.js';
import { photoFileAt, photoPages, addPhotoFile, removePhotoFile, MECH_PHOTO_CAT } from './photos/model.js';

// Конструктор полей карточки «Механизмы и оборудование» — переиспользуемый
// кусок UI. Работает с ПЛОСКИМ объектом-записью механизма
// {id, name, qty, cost, fields:[{id,label,value}], photos:{cat:count},
// photoFiles:{cat:[file,...]}}, а не с rec/oi целиком, — так же, как карточка
// земельного участка (land-plot/oi/land) переиспользуется всеми модулями ОЦ
// (см. app/README.md). Форма photos/photoFiles — та же, что и у остальных
// модулей (production/civil parts/photos/model.js), нарочно: фото открываются
// ОБЩИМ просмотрщиком (parts/viewer/*), а не своим мини-лайтбоксом (уточнение
// пользователя 07.09.2026: «возьми просмотрщик с других карточек») — общий
// просмотрщик как раз и рассчитан на эту форму.
//
// Один API — renderMechList/bindMechList — СПИСОК записей механизма
// (rec.mechanisms в этом модуле, card/ocForm.*, и oi.mechanisms во
// встраиваемой карточке ОИ «Механизмы и оборудование», подключаемой из
// production/civil как свой вид ОИ): и запись ОЦ этого модуля, и один ОИ
// внутри чужого модуля может описывать сразу несколько единиц техники — по
// задаче пользователя, «+ добавить механизм» доступна в обоих местах, а не
// только на уровне ОЦ.
//
// Подписи полей придумывает пользователь в рантайме, поэтому этот файл не
// использует kernel-овый движок словарей (kernel/dicts.js) — тот строит
// перечни только из статических data/dictExport.js. Источник автодополнения
// здесь — своя, не kernel-овая, история шаблонов/значений (data/fieldTemplates.js).

export function uid() {
  return nextId('mf');
}

// Подпись списка механизмов для мест, которым нужна одна строка, а не вся
// карточка — плашка над ОИ (ctxPlate.js), крошки, строка перечня ОИ
// (oi/registry.js: listLabel/crumbLabel). Первое название + «(+N)» на
// остальные — тот же приём, что и mechFacts() в records.js для сводки
// реестра, только вынесенный сюда, чтобы им мог пользоваться чужой модуль
// (production/civil), не заглядывая в records.js этого модуля.
export function mechListLabel(list) {
  const items = (list && list.length) ? list : [{ name: '' }];
  const first = items[0];
  const extra = items.length > 1 ? ` (+${items.length - 1})` : '';
  return (first.name || 'Без названия') + extra;
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
  return `<tr class="mech-field-row ${invalid ? 'invalid' : ''}" data-mech-field="${esc(f.id)}">
    <td><input class="input mech-field-label" data-mech-field-label="${esc(f.id)}" required
      value="${esc(f.label || '')}" placeholder="Подпись*" title="${esc(f.label || '')}"></td>
    <td><input class="input mech-field-value" data-mech-field-value="${esc(f.id)}"
      list="dl-mech-val-${esc(f.id)}" value="${esc(f.value || '')}" placeholder="Значение" title="${esc(f.value || '')}">
      <datalist id="dl-mech-val-${esc(f.id)}">${valuesFor(f.label).map((v) => `<option value="${esc(v)}">`).join('')}</datalist></td>
    <td><button type="button" class="btn btn-ghost btn-sm mech-field-rm" data-mech-field-rm="${esc(f.id)}" title="Убрать поле">✕</button></td>
  </tr>`;
}

// Фото механизма — свои у каждой записи, но открываются ОБЩИМ просмотрщиком
// (parts/viewer/*, тот же, что у документов) — миниатюры здесь только для
// беглого обзора и удаления; полноразмерный просмотр, зум, поворот, лента —
// в просмотрщике (см. bindEntry: data-mech-photo-open зовёт openPhoto,
// переданный вызывающей стороной, а не открывает картинку сам).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: файл живёт blob-ссылкой в памяти вкладки (как и
// документы, см. parts/docs/model.js) — после перезагрузки пропадает.
function photosBlockHTML(m) {
  const pages = photoPages(m);
  return `<div class="mech-photos">
    <div class="mech-photos-list" data-mech-photos-list>
      ${pages.map((p, idx) => {
        const f = photoFileAt(m, p.cat, p.i);
        return `<div class="mech-photo-tile" data-mech-photo-open="${idx}" title="${esc(f ? f.name : 'Фото')}">
          ${f ? `<img src="${esc(f.dataUrl)}" alt="${esc(f.name || '')}">` : ''}
          <button type="button" class="mech-photo-rm" data-mech-photo-rm="${idx}" title="Убрать фото">✕</button>
        </div>`;
      }).join('')}
      <button type="button" class="mech-photo-add" data-mech-add-photo title="Прикрепить фото">Фото</button>
    </div>
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

    <table class="tbl mech-fields-list">
      <thead><tr><th style="width:34%">Подпись</th><th>Значение</th><th style="width:36px"></th></tr></thead>
      <tbody data-mech-fields-list>
        ${fields.map(fieldRowHTML).join('')}
        <tr class="mech-field-add-row"><td colspan="3">
          <button type="button" class="btn btn-ghost btn-sm mech-field-add" data-mech-add-field>+ добавить поле</button>
        </td></tr>
      </tbody>
    </table>

    ${photosBlockHTML(m)}`;
}

// list — [{id, name, qty, cost, fields, photos}] — весь состав механизмов записи ОЦ.
// Каждая запись — свой визуально обособленный блок (граница/подложка, см.
// module.css) с собственной кнопкой «✕ убрать механизм» в шапке (рядом с
// «Название»/«Количество» этой же записи — не путать с кнопкой «✕» у
// отдельного ПОЛЯ, та мельче и стоит в строке самого поля).
export function renderMechList(list) {
  const entries = (list && list.length) ? list : [{ name: '', fields: [], qty: 1, cost: 0, photos: {} }];

  return `<div class="mech-list">
    ${entries.map((m) => `<div class="mech-entry" data-mech-entry="${esc(m.id || '')}">
      ${entryBodyHTML(m, `<button type="button" class="btn btn-ghost btn-sm mech-entry-rm" data-mech-entry-rm="${esc(m.id || '')}" title="Убрать механизм целиком">✕</button>`)}
    </div>`).join('')}
    <button type="button" class="btn btn-ghost btn-sm" data-mech-add-entry>+ добавить механизм</button>
  </div>`;
}

// Обвязка ОДНОЙ записи механизма — общая для одиночного использования (root —
// весь скоуп экрана) и renderMechList (root — DOM-узел конкретного элемента
// списка, чтобы правки одной записи не задевали соседние: несколько таких
// блоков стоят в скоупе одновременно). openPhoto(mech, idx) — открыть
// просмотрщик записи (переданный вызывающей стороной: у каждого модуля свой
// ctx/ctx.ui.viewer, конструктор об этом не знает, см. bindMechList).
function bindEntry(root, m, onChange, openPhoto) {
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

  const addPhotoBtn = root.querySelector('[data-mech-add-photo]');
  if (addPhotoBtn) addPhotoBtn.onclick = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    if (isFileTooLarge(file)) {
      window.alert(`Файл больше ${MAX_DOC_FILE_MB} МБ — выберите файл поменьше.`);
      return;
    }
    const attached = await attachedFileFrom(file);
    addPhotoFile(m, MECH_PHOTO_CAT, attached);
    // Открываем прикреплённое фото сразу в просмотрщике — как если бы кликнули
    // по его миниатюре (см. data-mech-photo-open ниже). Без этого вкладка
    // «Фото» просмотрщика показывала бы прежнее (пустое) состояние, пока
    // пользователь не кликнет по свежей миниатюре вручную — жалоба
    // пользователя «почему фото не появляются во вкладке».
    const justAddedIdx = photoPages(m).length - 1;
    if (openPhoto) openPhoto(m, justAddedIdx);
    else onChange();
  };

  Array.from(root.querySelectorAll('[data-mech-photo-rm]')).forEach((btn) => btn.onclick = (e) => {
    e.stopPropagation();
    const idx = +btn.dataset.mechPhotoRm;
    const p = photoPages(m)[idx];
    if (p) removePhotoFile(m, p.cat, p.i);
    onChange();
  });

  // Полноразмерный просмотр — в общем просмотрщике записи (parts/viewer/*,
  // тот же, что у документов), а не в отдельном лайтбоксе (задача
  // пользователя 07.09.2026). openPhoto — открыть его на конкретном фото;
  // если вызывающая сторона его не передала (сейчас так не бывает, но
  // функция не должна падать), просто ничего не делаем.
  Array.from(root.querySelectorAll('[data-mech-photo-open]')).forEach((tile) => tile.onclick = () => {
    if (openPhoto) openPhoto(m, +tile.dataset.mechPhotoOpen);
  });
}

// scope — DOM-скоуп экрана, list — rec.mechanisms (или oi.mechanisms)
// целиком, onChange — вызывается после любой правки, openPhoto(mech, idx) —
// открыть фото конкретной записи в общем просмотрщике (ctx у каждого модуля
// свой, конструктор его не знает — вызывающая сторона передаёт готовую
// функцию, см. card/ocForm.ctrl.js и oi/mech/ctrl.js). Помимо правок внутри
// каждой записи (name/qty/поля — по одному разу на элемент списка), здесь ещё:
//  - кнопка «✕ убрать механизм» у записи — splice из list; если убрали
//    последнюю оставшуюся запись, список не остаётся пустым — вместо этого
//    подставляется одна свежая пустая запись (запись ОЦ всегда описывает
//    хотя бы один механизм);
//  - кнопка «+ добавить механизм» — добавляет пустую запись в конец списка.
export function bindMechList(scope, list, onChange, openPhoto) {
  const root = scope.root;

  list.forEach((entry) => {
    const entryRoot = root.querySelector(`[data-mech-entry="${CSS.escape(String(entry.id || ''))}"]`);
    if (entryRoot) bindEntry(entryRoot, entry, onChange, openPhoto);
  });

  Array.from(root.querySelectorAll('[data-mech-entry-rm]')).forEach((btn) => btn.onclick = () => {
    const id = btn.dataset.mechEntryRm;
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;

    list.splice(i, 1);
    if (!list.length) list.push({ id: uid(), name: '', qty: 1, cost: 0, fields: [], photos: {} });
    onChange();
  });

  const addBtn = root.querySelector('[data-mech-add-entry]');
  if (addBtn) addBtn.onclick = () => {
    list.push({ id: uid(), name: '', qty: 1, cost: 0, fields: [], photos: {} });
    onChange();
  };
}
