// Контакты для связи — у объекта оценки и у любого узла дерева учреждений.
//
// Решение пользователя 06.10.2026: «нам нужны контакты для связи. В каждом ОЦ.
// При том учти, что это может быть не 1 контакт… Чистым интерфейсом, но что бы
// каждый раз контакты не мозолили глаза»; «Контакт может быть и у организации и
// у учреждения… от организации/учреждения контакты должны тоже подтягиваться»;
// учреждение — любой узел дерева, у каждого узла цепочки может быть несколько
// контактов; подтянутые контакты в ОЦ только показываются, правятся в
// учреждении. Поля — имя, должность, телефон, почта, комментарий.
//
// Здесь — хранение контактов узлов, сборка цепочки и общий вид: список
// показывается в сводке одной строкой, целиком — по нажатию (карточка ОЦ), или
// на своей вкладке (раздел «Учреждения»).

import { esc } from './dom.js';
import { allNodes, pathOf } from './institutions.js';
import { registerPersisted, copyTag } from './persist.js';

export const CONTACT_FIELDS = [
  { key: 'name', label: 'Имя' },
  { key: 'position', label: 'Должность' },
  { key: 'phone', label: 'Телефон', type: 'tel' },
  { key: 'email', label: 'Почта', type: 'email' },
  { key: 'note', label: 'Комментарий', wide: true },
];

let seq = 0;
export function newContact() {
  seq += 1;
  const tag = copyTag();
  return { id: `ct-${tag ? tag + '-' : ''}${Date.now().toString(36)}${seq}`, name: '', position: '', phone: '', email: '', note: '' };
}

export const isEmptyContact = (c) => !CONTACT_FIELDS.some(({ key }) => String(c[key] || '').trim());

// --- контакты узлов учреждений -------------------------------------------------
//
// Ключ — название узла, а не его id: id узлов выдаются при каждой загрузке по
// порядку появления и в разных копиях макета не совпадают, а контакты общие
// для всех копий (kernel/persist.js, часть «contacts.institutions»).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: у учреждения будет постоянный идентификатор, и
// контакты привязываются к нему; переименование узла здесь отвязывает его
// контакты (в макете дерево и так не сохраняется — решение 09.09.2026).
const byNode = [];

registerPersisted('contacts.institutions', {
  snapshot: () => byNode,
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    byNode.splice(0, byNode.length, ...saved.filter((x) => x && x.id));
  },
});

// Контакты узла; create — завести пустой список, чтобы в него добавлять.
export function nodeContacts(node, create = false) {
  if (!node) return [];
  let entry = byNode.find((x) => x.id === node.name);
  if (!entry && create) {
    entry = { id: node.name, contacts: [] };
    byNode.push(entry);
  }
  return entry ? entry.contacts : [];
}

// Цепочка узлов от ближайшего к корню — только те, у кого есть контакты.
function chainOf(node) {
  if (!node) return [];
  return pathOf(node.id).reverse()
    .map((n) => ({ node: n, contacts: nodeContacts(n).filter((c) => !isEmptyContact(c)) }))
    .filter((x) => x.contacts.length);
}

// Подтянутые контакты объекта: от подведа (если он есть) вверх по дереву.
export function institutionChain(institution, podved) {
  const nodes = allNodes();
  const own = (podved && nodes.find((n) => n.name === podved)) || (institution && nodes.find((n) => n.name === institution));
  return chainOf(own);
}

// Подтянутые контакты узла — от родителей, без своих.
export function parentChain(node) {
  return chainOf(node).filter((x) => x.node.id !== node.id);
}

// --- вид -----------------------------------------------------------------------

const tel = (p) => String(p || '').replace(/[^\d+]/g, '');

function rowHTML(c, key, editable) {
  const lines = [
    c.phone ? `<a class="ct-phone" href="tel:${esc(tel(c.phone))}">${esc(c.phone)}</a>` : '',
    c.email ? `<a class="ct-mail" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '',
  ].filter(Boolean).join('');
  return `<div class="ct-row" data-ct-row="${esc(c.id)}">
    <div class="ct-who"><b>${esc(c.name || 'Без имени')}</b>${c.position ? `<span>${esc(c.position)}</span>` : ''}</div>
    <div class="ct-ways">${lines || '<span class="ct-none">нет телефона и почты</span>'}</div>
    ${c.note ? `<div class="ct-note">${esc(c.note)}</div>` : '<div class="ct-note"></div>'}
    ${editable ? `<div class="ct-acts">
      <button type="button" class="ct-icon" data-ct-edit="${key}|${esc(c.id)}" title="Изменить" aria-label="Изменить контакт">✎</button>
      <button type="button" class="ct-icon del" data-ct-del="${key}|${esc(c.id)}" title="Удалить" aria-label="Удалить контакт">×</button>
    </div>` : ''}
  </div>`;
}

function formHTML(c, key) {
  return `<div class="ct-form" data-ct-form="${esc(c.id)}">
    ${CONTACT_FIELDS.map((f) => `<label class="ct-f ${f.wide ? 'wide' : ''}"><span>${f.label}</span>
      <input class="input" ${f.type ? `type="${f.type}"` : ''} data-ct-f="${key}|${esc(c.id)}|${f.key}"
        value="${esc(c[f.key] || '')}" autocomplete="off"></label>`).join('')}
    <div class="ct-form-acts">
      <button type="button" class="btn btn-ghost btn-sm del" data-ct-del="${key}|${esc(c.id)}">Удалить</button>
      <button type="button" class="btn btn-primary btn-sm" data-ct-done="${key}">Готово</button>
    </div>
  </div>`;
}

// Список с правкой (свои контакты) или без (подтянутые).
export function contactListHTML(list, { key = '', editing = null, editable = false } = {}) {
  return list.map((c) => (editable && editing === c.id ? formHTML(c, key) : rowHTML(c, key, editable))).join('');
}

// Подтянутые: группа на узел — название узла и переход к нему для правки.
export function chainHTML(chain, hrefOf) {
  return chain.map(({ node, contacts }) => `<div class="ct-group from">
    <div class="ct-group-h"><span>От учреждения</span><b>${esc(node.name)}</b>
      <a class="ct-go" href="${esc(hrefOf(node))}" title="Контакты правятся в учреждении">Править в учреждении →</a></div>
    ${contactListHTML(contacts)}
  </div>`).join('');
}

// Свои контакты: список, «+ Контакт».
export function ownHTML(list, { key, editing, title = 'Контакты объекта', empty = 'Своих контактов нет' }) {
  const shown = list.filter((c) => editing === c.id || !isEmptyContact(c));
  return `<div class="ct-group own">
    <div class="ct-group-h"><b>${esc(title)}</b></div>
    ${shown.length ? contactListHTML(shown, { key, editing, editable: true }) : `<div class="ct-empty">${esc(empty)}</div>`}
    <button type="button" class="ct-add" data-ct-add="${key}">+ Контакт</button>
  </div>`;
}

// Сводка одной строкой: первый контакт и сколько ещё. Не мозолит глаза, но
// сразу видно, есть ли кому звонить.
export function summaryHTML(all, { key, open }) {
  const list = all.filter((c) => !isEmptyContact(c));
  const first = list[0];
  const body = first
    ? `<b>${esc(first.name || 'Без имени')}</b>${first.phone ? `<span class="ct-sum-ph">${esc(first.phone)}</span>` : ''}
       ${list.length > 1 ? `<span class="ct-more">и ещё ${list.length - 1}</span>` : ''}`
    : '<span class="ct-sum-none">нет · добавить</span>';
  return `<button type="button" class="ct-sum ${open ? 'open' : ''}" data-ct-toggle="${key}" aria-expanded="${open}"
    title="${open ? 'Свернуть контакты' : 'Показать все контакты'}">${body}<i class="ct-chev">▾</i></button>`;
}

// --- поведение -----------------------------------------------------------------
//
// opts: list(create) — свои контакты; ui — { open, editing } на ключ;
// rerender() — перерисовать; onChange() — правка (запись в журнал и т.п.).
export function bindContacts(scope, key, { list, ui, rerender, onChange = () => {} }) {
  const own = (id) => list(false).find((c) => c.id === id);
  const finish = () => {
    const arr = list(false);
    for (let i = arr.length - 1; i >= 0; i--) if (isEmptyContact(arr[i])) arr.splice(i, 1);
    ui.editing = null;
  };

  scope.$$(`[data-ct-toggle="${key}"]`).forEach((b) => b.onclick = () => {
    ui.open = !ui.open;
    if (!ui.open) finish();
    rerender();
  });
  scope.$$(`[data-ct-add="${key}"]`).forEach((b) => b.onclick = () => {
    finish();
    const c = newContact();
    list(true).push(c);
    ui.open = true;
    ui.editing = c.id;
    rerender();
    const first = scope.$(`[data-ct-f="${key}|${c.id}|name"]`);
    if (first) first.focus();
  });
  scope.$$('[data-ct-edit]').forEach((b) => {
    const [k, id] = b.dataset.ctEdit.split('|');
    if (k !== key) return;
    b.onclick = () => {
      finish();
      ui.editing = id;
      rerender();
      const first = scope.$(`[data-ct-f="${key}|${id}|name"]`);
      if (first) first.focus();
    };
  });
  scope.$$('[data-ct-del]').forEach((b) => {
    const [k, id] = b.dataset.ctDel.split('|');
    if (k !== key) return;
    b.onclick = () => {
      const c = own(id);
      if (c && !isEmptyContact(c) && !confirm(`Удалить контакт «${c.name || 'без имени'}»?`)) return;
      const arr = list(false);
      const i = arr.findIndex((x) => x.id === id);
      if (i >= 0) arr.splice(i, 1);
      if (ui.editing === id) ui.editing = null;
      onChange();
      rerender();
    };
  });
  scope.$$(`[data-ct-done="${key}"]`).forEach((b) => b.onclick = () => { finish(); onChange(); rerender(); });
  scope.$$('[data-ct-f]').forEach((inp) => {
    const [k, id, field] = inp.dataset.ctF.split('|');
    if (k !== key) return;
    inp.oninput = () => { const c = own(id); if (c) c[field] = inp.value; };
    inp.onchange = () => onChange();
    // Enter в поле — как «Готово»: короткая форма, переносов строк в ней нет.
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(); onChange(); rerender(); }
      if (e.key === 'Escape') { e.preventDefault(); finish(); rerender(); }
    };
  });
}
