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
// Здесь — хранение контактов узлов, сборка цепочки и общий вид: в карточке ОЦ
// — сводка одной строкой и выпадающая панель со всеми контактами, в разделе
// «Учреждения» — своя вкладка узла.

import { esc } from './dom.js';
import { allNodes, pathOf } from './institutions.js';
import { registerPersisted, copyTag, scheduleSave } from './persist.js';
import { confirmDialog } from './dialog.js';

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
//
// Контакт — строка списка по образцу «контактной ячейки» (Salt DS, SAP Fiori):
// впереди аватар с инициалами, затем имя и должность, под ними телефон и почта
// ссылками-плашками, комментарий; действия — в конце строки. Строки отделены
// друг от друга рамкой и промежутком: сплошной список сливался (замечание
// пользователя 06.10.2026).

const tel = (p) => String(p || '').replace(/[^\d+]/g, '');

const ICON = {
  phone: '<path d="M3.6 1.8h2.1l1 2.6-1.4.9a7.5 7.5 0 0 0 3.4 3.4l.9-1.4 2.6 1v2.1a1.2 1.2 0 0 1-1.3 1.2A10.4 10.4 0 0 1 2.4 3.1a1.2 1.2 0 0 1 1.2-1.3z"/>',
  mail: '<rect x="1.8" y="3.2" width="10.4" height="7.6" rx="1.3"/><path d="m2.2 4 4.8 3.6L11.8 4"/>',
  edit: '<path d="M9.4 2.3 11.7 4.6 5 11.3l-2.9.6.6-2.9z"/><path d="m8.2 3.5 2.3 2.3"/>',
  del: '<path d="M2.6 4h8.8M5.6 4V2.6h2.8V4M3.8 4l.6 7.4h5.2l.6-7.4"/>',
  close: '<path d="m3.5 3.5 7 7m0-7-7 7"/>',
};
const svg = (name) => `<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor"
  stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function itemHTML(c, key, editable) {
  const chips = [
    c.phone ? `<a class="ct-chip" href="tel:${esc(tel(c.phone))}" title="Позвонить">${svg('phone')}<span>${esc(c.phone)}</span></a>` : '',
    c.email ? `<a class="ct-chip" href="mailto:${esc(c.email)}" title="Написать">${svg('mail')}<span>${esc(c.email)}</span></a>` : '',
  ].join('');
  return `<div class="ct-item ${editable ? 'own' : 'from'}" data-ct-row="${esc(c.id)}">
    <span class="ct-ava" aria-hidden="true">${esc(initials(c.name))}</span>
    <div class="ct-main">
      <div class="ct-name"><b>${esc(c.name || 'Без имени')}</b>${c.position ? `<span>${esc(c.position)}</span>` : ''}</div>
      ${chips ? `<div class="ct-chips">${chips}</div>` : ''}
      ${c.note ? `<div class="ct-note">${esc(c.note)}</div>` : ''}
    </div>
    ${editable ? `<div class="ct-acts">
      <button type="button" class="ct-icon" data-ct-edit="${key}|${esc(c.id)}" title="Изменить" aria-label="Изменить контакт">${svg('edit')}</button>
      <button type="button" class="ct-icon del" data-ct-del="${key}|${esc(c.id)}" title="Удалить" aria-label="Удалить контакт">${svg('del')}</button>
    </div>` : ''}
  </div>`;
}

function formHTML(c, key) {
  return `<div class="ct-form" data-ct-form="${esc(c.id)}">
    ${CONTACT_FIELDS.map((f) => `<label class="ct-f ${f.wide ? 'wide' : ''}"><span>${f.label}</span>
      <input ${f.type ? `type="${f.type}"` : ''} data-ct-f="${key}|${esc(c.id)}|${f.key}"
        value="${esc(c[f.key] || '')}" autocomplete="off"></label>`).join('')}
    <div class="ct-form-acts">
      <button type="button" class="btn btn-ghost btn-sm ct-form-del" data-ct-del="${key}|${esc(c.id)}">${svg('del')} Удалить</button>
      <button type="button" class="btn btn-primary btn-sm" data-ct-done="${key}">Готово</button>
    </div>
  </div>`;
}

function listHTML(list, { key = '', editing = null, editable = false } = {}) {
  return `<div class="ct-list">${list.map((c) => (editable && editing === c.id ? formHTML(c, key) : itemHTML(c, key, editable))).join('')}</div>`;
}

// Подтянутые: группа на узел — название узла и переход к нему для правки.
export function chainHTML(chain, hrefOf) {
  return chain.map(({ node, contacts }) => `<section class="ct-group from">
    <header class="ct-group-h"><span class="ct-group-k">От учреждения</span><b title="${esc(node.name)}">${esc(node.name)}</b>
      <a class="ct-go" href="${esc(hrefOf(node))}" title="Контакты правятся в учреждении">Править в учреждении →</a></header>
    ${listHTML(contacts)}
  </section>`).join('');
}

// Свои контакты: заголовок с «+ Контакт», список или строка «нет».
export function ownHTML(list, { key, editing, title = 'Контакты объекта', empty = 'Своих контактов нет' }) {
  const shown = list.filter((c) => editing === c.id || !isEmptyContact(c));
  return `<section class="ct-group own">
    <header class="ct-group-h"><span class="ct-group-k">${esc(title)}</span>
      <button type="button" class="ct-add" data-ct-add="${key}">+ Контакт</button></header>
    ${shown.length ? listHTML(shown, { key, editing, editable: true }) : `<div class="ct-empty">${esc(empty)}</div>`}
  </section>`;
}

// Сводка одной строкой и выпадающая панель с контактами. Панель — поверх
// карточки, закрывается щелчком снаружи и Esc (замечание пользователя
// 06.10.2026: «не спрятал их в скрывающемся меню»): раскрытый список больше не
// раздвигает карточку.
export function dropdownHTML(all, { key, open, body }) {
  const list = all.filter((c) => !isEmptyContact(c));
  const first = list[0];
  const sum = first
    ? `<b>${esc(first.name || 'Без имени')}</b>${first.phone ? `<span class="ct-sum-ph">${esc(first.phone)}</span>` : ''}
       ${list.length > 1 ? `<span class="ct-more">+${list.length - 1}</span>` : ''}`
    : '<span class="ct-sum-none">нет · добавить</span>';
  return `<div class="ct-dd ${open ? 'open' : ''}" data-ct-dd="${key}">
    <button type="button" class="ct-sum" data-ct-toggle="${key}" aria-expanded="${open}" aria-haspopup="dialog"
      title="${open ? 'Скрыть контакты' : 'Все контакты'}">${sum}<i class="ct-chev">▾</i></button>
    ${open ? `<div class="ct-pop" data-ct-pop="${key}" role="dialog" aria-label="Контакты для связи">
      <div class="ct-pop-h"><b>Контакты для связи</b><span class="ct-pop-n">${list.length}</span>
        <button type="button" class="ct-icon" data-ct-toggle="${key}" title="Закрыть (Esc)" aria-label="Закрыть">${svg('close')}</button></div>
      <div class="ct-pop-body">${body}</div>
    </div>` : ''}
  </div>`;
}

// Панель — position:fixed по фактическим размерам (правило проекта: всплывающее
// считается с границами окна и не режется overflow родителя): под сводкой, а
// если снизу тесно — над ней; прокрутка одна, у самой панели.
function placePop(dd) {
  const pop = dd.querySelector('.ct-pop');
  const btn = dd.querySelector('.ct-sum');
  if (!pop || !btn) return;
  const r = btn.getBoundingClientRect();
  const gap = 6;
  const pad = 12;
  const w = Math.min(560, innerWidth - pad * 2);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(pad, Math.min(r.left, innerWidth - w - pad)) + 'px';
  pop.style.maxHeight = 'none';
  const need = pop.scrollHeight;
  const below = innerHeight - r.bottom - gap - pad;
  const above = r.top - gap - pad;
  if (need <= below || below >= above) {
    pop.style.top = (r.bottom + gap) + 'px';
    pop.style.maxHeight = below + 'px';
  } else {
    const h = Math.min(need, above);
    pop.style.top = (r.top - gap - h) + 'px';
    pop.style.maxHeight = h + 'px';
  }
}

// --- поведение -----------------------------------------------------------------
//
// opts: list(create) — свои контакты; ui — { open, editing } на ключ;
// rerender() — перерисовать; onChange() — правка.
const cleanups = {};

export function bindContacts(scope, key, { list, ui, rerender, onChange = () => {} }) {
  if (cleanups[key]) { cleanups[key](); delete cleanups[key]; }

  const own = (id) => list(false).find((c) => c.id === id);
  const finish = () => {
    const arr = list(false);
    for (let i = arr.length - 1; i >= 0; i--) if (isEmptyContact(arr[i])) arr.splice(i, 1);
    ui.editing = null;
  };
  const close = () => { ui.open = false; finish(); rerender(); };
  const focusName = (id) => {
    const el = scope.$(`[data-ct-f="${key}|${id}|name"]`);
    if (el) el.focus();
  };

  scope.$$(`[data-ct-toggle="${key}"]`).forEach((b) => b.onclick = () => {
    if (ui.open) return close();
    ui.open = true;
    rerender();
  });
  scope.$$(`[data-ct-add="${key}"]`).forEach((b) => b.onclick = () => {
    finish();
    const c = newContact();
    list(true).push(c);
    ui.open = true;
    ui.editing = c.id;
    rerender();
    focusName(c.id);
  });
  scope.$$('[data-ct-edit]').forEach((b) => {
    const [k, id] = b.dataset.ctEdit.split('|');
    if (k !== key) return;
    b.onclick = () => { finish(); ui.editing = id; rerender(); focusName(id); };
  });
  scope.$$('[data-ct-del]').forEach((b) => {
    const [k, id] = b.dataset.ctDel.split('|');
    if (k !== key) return;
    b.onclick = async () => {
      const c = own(id);
      // Окно макета, а не confirm браузера (kernel/dialog.js): нативное окно
      // браузер может молча заблокировать, и удаление «не работало».
      if (c && !isEmptyContact(c)) {
        const ok = await confirmDialog({
          title: 'Удалить контакт', text: `Контакт «${c.name || 'без имени'}» будет удалён.`,
          okLabel: 'Удалить', danger: true,
        });
        if (!ok) return;
      }
      const arr = list(false);
      const i = arr.findIndex((x) => x.id === id);
      if (i >= 0) arr.splice(i, 1);
      if (ui.editing === id) ui.editing = null;
      onChange();
      // Удаление идёт после окна подтверждения, без события в документе, —
      // сохранение надо позвать самим.
      scheduleSave();
      rerender();
    };
  });
  scope.$$(`[data-ct-done="${key}"]`).forEach((b) => b.onclick = () => { finish(); onChange(); rerender(); });
  scope.$$('[data-ct-f]').forEach((inp) => {
    const [k, id, field] = inp.dataset.ctF.split('|');
    if (k !== key) return;
    inp.oninput = () => { const c = own(id); if (c) c[field] = inp.value; };
    inp.onchange = () => onChange();
    // Enter — «Готово», Esc — выйти из правки (панель остаётся открытой).
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(); onChange(); rerender(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); rerender(); }
    };
  });

  // Выпадающая панель: место по факту, закрытие щелчком снаружи и Esc.
  const dd = scope.$(`[data-ct-dd="${key}"]`);
  if (!dd || !ui.open) return;
  placePop(dd);
  // Ушли с экрана — панели нет, слушатели снимаются и чужой экран не трогают.
  const gone = () => {
    if (dd.isConnected) return false;
    if (cleanups[key]) { cleanups[key](); delete cleanups[key]; }
    return true;
  };
  const onMove = () => { if (!gone()) placePop(dd); };
  const onDown = (e) => {
    if (gone() || dd.contains(e.target) || e.target.closest('.modal-back')) return;
    close();
  };
  const onKey = (e) => {
    // Esc в поле формы — выход из правки (обработчик поля), не закрытие панели.
    if (e.target.closest && e.target.closest('[data-ct-f]')) return;
    if (gone() || e.key !== 'Escape' || document.querySelector('.modal-back')) return;
    // Esc закрыл панель — дальше не идёт: иначе тот же Esc закрывал бы и
    // просмотрщик документов.
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  window.addEventListener('resize', onMove);
  window.addEventListener('scroll', onMove, true);
  document.addEventListener('mousedown', onDown, true);
  // На перехвате: обработчики экрана (просмотрщик, ящик заметок) сами ловят Esc
  // и дальше его не пускают.
  document.addEventListener('keydown', onKey, true);
  cleanups[key] = () => {
    window.removeEventListener('resize', onMove);
    window.removeEventListener('scroll', onMove, true);
    document.removeEventListener('mousedown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
  };
}
