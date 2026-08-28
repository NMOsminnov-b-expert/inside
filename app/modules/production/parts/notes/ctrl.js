import { NOTE_DEFAULT } from './store.js';
import { addNote, removeNote, findNote } from './model.js';
import { session } from '../../../../kernel/session.js';

// Кто и когда — берём в момент добавления. Пользователь общий на весь макет
// (kernel/session.js), поэтому смена роли/лица здесь сразу видна.
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: автор берётся из общей сессии макета, где текущее лицо
// выбирается вручную. На сервере это должен быть аутентифицированный
// пользователь, а автора и дату проставлять надёжнее на стороне сервера —
// клиентскому времени и клиентскому «кто я» доверять нельзя.
const author = () => session.state.person;
const today = () => new Date().toISOString().slice(0, 10);

function syncPop(input, text) {
  const row = input.closest('.note-row');
  const pop = row && row.querySelector('.note-pop');
  if (pop) pop.textContent = text;
}

// Слушатели ящика заметок. Регистрируются на скоупе ящика,
// поэтому порядок относительно других слушателей больше ничего не значит.
export function bindDrawerNotes(scope, ctx) {
  const { rec, ui, refresh, toast } = ctx;

  // Ящик перепривязывается при каждом обновлении (host.updateDrawer), а
  // слушатели здесь делегированные — они переживают замену разметки и потому
  // накапливались. Один клик обрабатывался столько раз, сколько было
  // обновлений: «Выполненные» переключались дважды и не открывались вовсе, а
  // «+ Заметка» добавляла сразу несколько. Привязываемся один раз на корень.
  if (scope.root.dataset.notesBound) return;
  scope.root.dataset.notesBound = '1';

  scope.on('click', '[data-note-add]', (e, btn) => {
    const s = btn.dataset.noteAdd;
    const n = addNote(rec, s, author(), today());
    if (!n) return;
    ui.accOpen['grp|' + s] = true;
    refresh();
    const inp = scope.$(`[data-note-edit="${s}|${n.id}"]`);
    if (inp) inp.focus();
  });


  // Заметка по шаблону (Л3.4). Текст подставляется и остаётся редактируемым —
  // к шаблону дописывают свободный текст, поэтому курсор ставится в конец.
  scope.on('click', '[data-note-tpl-toggle]', (e, btn) => {
    e.stopPropagation();
    const dd = btn.closest('.dd');
    const was = dd.classList.contains('open');
    scope.$$('.dd.open').forEach((d) => d.classList.remove('open'));
    if (!was) dd.classList.add('open');
  });

  scope.on('click', '[data-note-tpl]', (e, btn) => {
    e.stopPropagation();
    const s = btn.dataset.noteTpl;
    const n = addNote(rec, s, author(), today(), btn.dataset.noteTplText);
    if (!n) return;
    ui.accOpen['grp|' + s] = true;
    refresh();
    const inp = scope.$(`[data-note-edit="${s}|${n.id}"]`);
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  });

  scope.on('click', '[data-note-del]', (e, btn) => {
    const [s, id] = btn.dataset.noteDel.split('|');
    removeNote(rec, s, id);
    refresh();
    toast('Заметка удалена');
  });

  scope.on('click', '[data-done-toggle]', (e, btn) => {
    const s = btn.dataset.doneToggle;
    ui.doneOpen[s] = !ui.doneOpen[s];
    const list = btn.nextElementSibling;
    if (list && list.classList.contains('done-list')) list.hidden = !ui.doneOpen[s];
    btn.classList.toggle('open', !!ui.doneOpen[s]);
  });

  scope.on('click', '[data-acc-toggle]', (e, head) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    const acc = head.closest('.acc');
    if (!acc) return;
    acc.classList.toggle('open');
    ui.accOpen[head.dataset.accToggle] = acc.classList.contains('open');
  });

  scope.on('change', '[data-note-check]', (e, chk) => {
    const [s, id] = chk.dataset.noteCheck.split('|');
    const n = findNote(rec, s, id);
    if (!n) return;
    n.done = chk.checked;
    refresh();
    toast(chk.checked
      ? 'Заметка выполнена — доступна в «Выполненные», отметку можно снять'
      : 'Заметка возвращена в работу', 'ok');
  });

  scope.on('change', '[data-note-edit]', (e, ne) => {
    const [s, id] = ne.dataset.noteEdit.split('|');
    const n = findNote(rec, s, id);
    if (!n) return;
    const t = ne.value.trim();
    n.text = t || NOTE_DEFAULT;
    if (!t) ne.value = n.text;
    syncPop(ne, n.text);
  });

  // Всплывающая подсказка рисуется вместе со строкой, а строка при правке не
  // перерисовывается (иначе сбивался бы курсор) — поэтому текст подсказки
  // обновляем сами, по ходу набора.
  scope.on('input', '[data-note-edit]', (e, ne) => { syncPop(ne, ne.value); });

  scope.on('keydown', '[data-note-edit]', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });

  // Список шаблонов закрывается любым кликом мимо него.
  scope.onRoot('click', (e) => {
    if (!e.target.closest('.note-tpl-dd')) scope.$$('.dd.open').forEach((d) => d.classList.remove('open'));
  });

  // Окошко с полным текстом заметки. Координаты считаем в JS и держим окошко
  // на position:fixed: ящик заметок прокручиваемый, и окошко, привязанное к
  // строке обычным absolute, обрезалось его границей. Ставим слева от ящика —
  // сам ящик у правого края экрана; если слева не помещается, справа.
  scope.onRoot('mouseover', (e) => {
    const row = e.target.closest && e.target.closest('.note-row');
    if (!row) return;
    const pop = row.querySelector('.note-pop');
    if (!pop) return;

    const r = row.getBoundingClientRect();
    const w = 340;
    const left = r.left - w - 10 >= 8 ? r.left - w - 10 : Math.min(r.right + 10, window.innerWidth - w - 8);
    pop.style.left = left + 'px';
    pop.style.top = Math.max(8, Math.min(r.top, window.innerHeight - 60)) + 'px';
  });
}
