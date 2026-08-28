// Список однотипных элементов со своей площадью у каждого: лоджии, балконы и
// террасы (Л2.9). Устроен как поэтажная развёртка — добавление, удаление,
// площадь у каждого элемента и сумма сверху.
//
// Что было до этого: два числовых поля «Кол-во лоджий» и «Общая площадь
// застройки лоджий» с жёсткими ограничениями (не больше 10 штук, не больше
// 500 м²). Ни разбить площадь по элементам, ни выйти за лимит было нельзя, а
// лоджии у разных элементов разные — оценщику нужна каждая отдельно.
//
// Лимита на количество нет намеренно: он и был предметом правки.

import { num, fmtNum } from './fmt.js';

let seq = 1;

export function itemsOf(oi, key) {
  const v = oi && oi[key];
  return Array.isArray(v) ? v : [];
}

export const areaSum = (oi, key) =>
  itemsOf(oi, key).reduce((s, x) => s + num(x.area), 0);

// Перевод старых записей: было количество и общая площадь, стало список.
// Площадь делим поровну — точнее из старых данных не восстановить, а оценщик
// поправит по месту. Вызывать ДО отрисовки, чтобы перевод не попал в лог
// правок как правка пользователя.
export function migrateAreaList(oi, key, countKey, totalKey) {
  if (!oi || Array.isArray(oi[key])) return;

  const n = Math.max(0, Math.round(num(oi[countKey])));
  const total = num((oi.areas || {})[totalKey]);
  const each = n ? total / n : 0;

  oi[key] = Array.from({ length: n }, (_, i) => ({
    id: key + (seq++),
    label: `№${i + 1}`,
    area: each ? each.toFixed(2).replace('.', ',') : '',
  }));

  delete oi[countKey];
  if (oi.areas) delete oi.areas[totalKey];
}

// Блок сворачивается: списков теперь три (лоджии, балконы, террасы), и
// развёрнутыми все сразу они занимают полэкрана. Состояние открытости пишет
// общий переключатель аккордеонов модуля — в ui.accOpen по ключу «al|<список>»,
// поэтому и читаем его оттуда же.
export function areaListHTML(oi, key, label, unitLabel, ui) {
  const items = itemsOf(oi, key);
  const open = !ui || !ui.accOpen || ui.accOpen['al|' + key] !== false;

  const rows = items.map((it, i) => `<tr>
    <td class="al-n">${i + 1}</td>
    <td><input class="input" data-al-label="${key}|${it.id}" value="${it.label || ''}"
      placeholder="${unitLabel} №${i + 1}"></td>
    <td><input class="input" data-al-area="${key}|${it.id}" value="${it.area || ''}"
      inputmode="decimal" placeholder="м²"></td>
    <td class="al-act"><button class="btn btn-danger btn-sm" data-al-del="${key}|${it.id}" title="Удалить">×</button></td>
  </tr>`).join('');

  return `<div class="al acc ${open ? 'open' : ''}" data-al-block="${key}">
    <div class="sec-h acc-head" data-acc-toggle="al|${key}"
      style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span class="al-head-left" style="display:flex;align-items:center;gap:8px;min-width:0">
        <span class="chev">▾</span>${label}
        <span class="pill-mini ${items.length ? 'pill-pend' : ''}">${items.length}</span>
        <span class="al-sum">Σ ${fmtNum(areaSum(oi, key))} м²</span>
      </span>
      <button class="btn btn-ghost btn-sm" data-al-add="${key}">+ ${unitLabel}</button>
    </div>
    <div class="acc-body">${items.length ? `<table class="tbl al-tbl">
      <colgroup><col style="width:34px"><col><col style="width:120px"><col style="width:44px"></colgroup>
      <thead><tr><th>№</th><th>Наименование</th><th>Площадь, м²</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : `<div class="al-empty">Не добавлено.</div>`}</div>
  </div>`;
}

// Слушатели прямые, а не делегированные на скоуп: карточка перепривязывается на
// каждой отрисовке, и делегированные накапливались бы (этим уже отличились
// заметки, конструктивный состав и отопление).
export function bindAreaList(ctx, oi, key) {
  const box = ctx.scope.$(`[data-al-block="${key}"]`);
  if (!box) return;

  const find = (id) => itemsOf(oi, key).find((x) => x.id === id);

  box.querySelectorAll('[data-al-label]').forEach((inp) => {
    inp.oninput = () => {
      const it = find(inp.dataset.alLabel.split('|')[1]);
      if (it) it.label = inp.value;
    };
  });

  // Сумма пересчитывается по ходу набора, но перерисовки нет — иначе сбивался
  // бы курсор в поле.
  box.querySelectorAll('[data-al-area]').forEach((inp) => {
    inp.oninput = () => {
      const it = find(inp.dataset.alArea.split('|')[1]);
      if (!it) return;
      it.area = inp.value;
      const sum = box.querySelector('.al-sum');
      if (sum) sum.textContent = `Σ ${fmtNum(areaSum(oi, key))} м²`;
    };
  });

  const add = box.querySelector('[data-al-add]');
  if (add) add.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const list = itemsOf(oi, key).slice();
    list.push({ id: key + (seq++), label: `№${list.length + 1}`, area: '' });
    oi[key] = list;
    ctx.render();
  };

  box.querySelectorAll('[data-al-del]').forEach((b) => b.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const id = b.dataset.alDel.split('|')[1];
    oi[key] = itemsOf(oi, key).filter((x) => x.id !== id);
    ctx.render();
  });
}
