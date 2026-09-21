import { showMenu } from './menu.js';
import {
  activate, closeTab, closeOthers, closeRight, closeAll, moveTab, tabs, openAll,
  renameDoc, retypeDoc, downloadDoc, printDoc, docProperties, archiveTab, docOf,
} from './docActions.js';
import { tabKey } from './state.js';
import { openPopout } from './popout.js';

// Вкладки документов: переключение, закрытие, перестановка перетаскиванием,
// клавиатура и контекстное меню (требование пользователя 21.09.2026).
//
// Вкладки — строка с «блуждающим» фокусом, как принято для tablist (WAI-ARIA):
// Tab попадает на активную вкладку, стрелки двигают фокус, Enter открывает,
// Delete закрывает, Shift+F10 или клавиша меню — контекстное меню.

const parse = (key) => { const [sc, id] = String(key).split('|'); return { sc, id }; };

export function tabMenuItems(ctx, sc, id, onKey) {
  const list = tabs(ctx);
  const at = list.findIndex((x) => x.sc === sc && x.id === id);
  const d = docOf(ctx, sc, id);
  const hasFile = !!(d && d.file);
  return [
    { label: 'Закрыть', keys: 'Alt+W', action: () => closeTab(ctx, sc, id) },
    { label: 'Закрыть другие', disabled: list.length < 2, action: () => closeOthers(ctx, sc, id) },
    { label: 'Закрыть справа', disabled: at < 0 || at === list.length - 1, action: () => closeRight(ctx, sc, id) },
    { label: 'Закрыть все', keys: 'Alt+Shift+W', action: () => closeAll(ctx) },
    { sep: true },
    { label: 'Переименовать…', action: () => renameDoc(ctx, sc, id) },
    { label: 'Изменить вид…', action: () => retypeDoc(ctx, sc, id) },
    { label: 'Свойства', keys: 'Ctrl+D', action: () => docProperties(ctx, sc, id) },
    { sep: true },
    { label: 'Скачать', keys: 'Ctrl+S', disabled: !hasFile, action: () => downloadDoc(ctx, sc, id) },
    { label: 'Печать', keys: 'Ctrl+P', disabled: !hasFile, action: () => printDoc(ctx, sc, id) },
    { label: 'Открыть в отдельном окне', disabled: !!ctx.isPopout, action: () => { activate(ctx, sc, id); openPopout(ctx, onKey); } },
    { sep: true },
    { label: 'Убрать в архив…', danger: true, action: () => archiveTab(ctx, sc, id) },
  ];
}

export function bindTabs(ctx, onKey) {
  const s = ctx.scope;
  const doc = s.root.ownerDocument;

  s.$$('[data-vtab]').forEach((el) => {
    const { sc, id } = parse(el.dataset.vtab);

    el.onclick = (e) => {
      if (e.target.closest('[data-vtabclose]')) return;
      activate(ctx, sc, id);
    };
    // Средняя кнопка мыши закрывает вкладку — как в браузерах и Acrobat.
    el.onauxclick = (e) => { if (e.button === 1) { e.preventDefault(); closeTab(ctx, sc, id); } };
    el.oncontextmenu = (e) => {
      e.preventDefault();
      showMenu(doc, e.clientX, e.clientY, tabMenuItems(ctx, sc, id, onKey), el);
    };

    el.onkeydown = (e) => {
      const all = s.$$('[data-vtab]');
      const at = all.indexOf(el);
      const focus = (i) => { const t = all[(i + all.length) % all.length]; if (t) t.focus(); };
      switch (e.key) {
        case 'ArrowRight': focus(at + 1); break;
        case 'ArrowLeft': focus(at - 1); break;
        case 'Home': focus(0); break;
        case 'End': focus(all.length - 1); break;
        case 'Enter': case ' ': activate(ctx, sc, id); break;
        case 'Delete': closeTab(ctx, sc, id); break;
        case 'ContextMenu': case 'F10': {
          if (e.key === 'F10' && !e.shiftKey) return;
          const r = el.getBoundingClientRect();
          showMenu(doc, r.left, r.bottom + 2, tabMenuItems(ctx, sc, id, onKey), el);
          break;
        }
        default: return;
      }
      e.preventDefault();
      e.stopPropagation();
    };

    // Перестановка перетаскиванием. Свой тип данных — чтобы вкладку не спутать
    // с файлом, который тащат из проводника (files.js ловит именно файлы).
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-vtab', el.dataset.vtab);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      s.$$('[data-vtab]').forEach((t) => t.classList.remove('drop-before', 'drop-after'));
    });
    el.addEventListener('dragover', (e) => {
      if (!Array.from(e.dataTransfer.types).includes('application/x-vtab')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = el.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      el.classList.toggle('drop-after', after);
      el.classList.toggle('drop-before', !after);
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
    el.addEventListener('drop', (e) => {
      const key = e.dataTransfer.getData('application/x-vtab');
      if (!key) return;
      e.preventDefault();
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      const list = tabs(ctx).map((x) => tabKey(x.sc, x.id));
      const at = list.indexOf(el.dataset.vtab);
      const before = after ? list[at + 1] : el.dataset.vtab;
      if (before === key) return;
      moveTab(ctx, key, before || null);
    });
  });

  s.$$('[data-vtabclose]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const { sc, id } = parse(b.dataset.vtabclose);
    closeTab(ctx, sc, id);
  });

  s.$$('[data-vaddtab]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const { sc, id } = parse(b.dataset.vaddtab);
    activate(ctx, sc, id);
  });

  const oa = s.$('[data-vopenall]');
  if (oa) oa.onclick = (e) => { e.stopPropagation(); openAll(ctx); };
}
