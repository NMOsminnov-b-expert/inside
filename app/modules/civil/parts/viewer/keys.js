// Горячие клавиши просмотрщика — как в Adobe Acrobat (требование пользователя
// 21.09.2026: «горячие клавиши все как в Adobe Acrobat, полный набор»).
//
// Одна таблица на всё: по ней работает обработчик (ctrl.js, viewerKeydown) и
// строится справка «?». Справка поэтому не расходится с поведением.
//
// Chrome не отдаёт странице Ctrl+W, Ctrl+Shift+W, Ctrl+Tab, Ctrl+Shift+Tab,
// Ctrl+PageUp/PageDown, Ctrl+T, Ctrl+N, а Ctrl+Shift+N открывает окно
// инкогнито (Chromium issue 40576491, Mozilla bug 1052569). Для этих действий —
// замены на Alt; сочетание Acrobat показано в справке с пометкой. Поиск по
// тексту (Ctrl+F) не делается: текстового слоя у сканов нет, распознавание не
// нужно (решение пользователя 21.09.2026) — Ctrl+F остаётся браузерным.
//
// Буквы сравниваются по физической клавише (e.code): в русской раскладке «F» —
// это «А», и сравнение по e.key не срабатывало бы.

const mods = (e, ctrl, shift, alt) => !!(e.ctrlKey || e.metaKey) === ctrl && !!e.shiftKey === shift && !!e.altKey === alt;
const plain = (e) => mods(e, false, false, false);
const code = (...c) => (e) => c.includes(e.code);
const isPlus = (e) => e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+';
const isMinus = (e) => e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-';

// a — набор действий, который даёт ctrl.js. doc — только в режиме документов.
export const KEYMAP = [
  // Документы и вкладки
  { group: 'Документы', label: 'Прикрепить файлы', keys: 'Ctrl+O', acrobat: 'Ctrl+O',
    match: (e) => mods(e, true, false, false) && e.code === 'KeyO', run: (a) => a.attach() },
  { group: 'Документы', label: 'Закрыть документ', keys: 'Alt+W', acrobat: 'Ctrl+W — занято браузером',
    match: (e) => mods(e, false, false, true) && e.code === 'KeyW', run: (a) => a.closeTab(), doc: true },
  { group: 'Документы', label: 'Закрыть все документы', keys: 'Alt+Shift+W', acrobat: 'Ctrl+Shift+W — занято браузером',
    match: (e) => mods(e, false, true, true) && e.code === 'KeyW', run: (a) => a.closeAll(), doc: true },
  { group: 'Документы', label: 'Следующий документ', keys: 'Alt+PageDown', acrobat: 'Ctrl+Tab — занято браузером',
    match: (e) => mods(e, false, false, true) && e.code === 'PageDown', run: (a) => a.stepDoc(1), doc: true },
  { group: 'Документы', label: 'Предыдущий документ', keys: 'Alt+PageUp', acrobat: 'Ctrl+Shift+Tab — занято браузером',
    match: (e) => mods(e, false, false, true) && e.code === 'PageUp', run: (a) => a.stepDoc(-1), doc: true },
  { group: 'Документы', label: 'Переставить вкладку влево / вправо', keys: 'Alt+Shift+← / →',
    match: (e) => mods(e, false, true, true) && (e.code === 'ArrowLeft' || e.code === 'ArrowRight'),
    run: (a, e) => a.shiftTab(e.code === 'ArrowLeft' ? -1 : 1), doc: true },
  { group: 'Документы', label: 'Скачать', keys: 'Ctrl+S', acrobat: 'Ctrl+S',
    match: (e) => (e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyS', run: (a) => a.download(), doc: true },
  { group: 'Документы', label: 'Печать', keys: 'Ctrl+P', acrobat: 'Ctrl+P',
    match: (e) => mods(e, true, false, false) && e.code === 'KeyP', run: (a) => a.print(), doc: true },
  { group: 'Документы', label: 'Свойства документа', keys: 'Ctrl+D', acrobat: 'Ctrl+D',
    match: (e) => mods(e, true, false, false) && e.code === 'KeyD', run: (a) => a.properties(), doc: true },
  { group: 'Документы', label: 'Убрать страницу (выбранные)', keys: 'Ctrl+Shift+D', acrobat: 'Ctrl+Shift+D',
    match: (e) => mods(e, true, true, false) && e.code === 'KeyD', run: (a) => a.deletePages(), doc: true },

  // Страницы
  { group: 'Страницы', label: 'Следующая страница', keys: '→ · PageDown', acrobat: '→ · PageDown',
    match: (e) => plain(e) && (e.code === 'ArrowRight' || e.code === 'PageDown'), run: (a) => a.page(1) },
  { group: 'Страницы', label: 'Предыдущая страница', keys: '← · PageUp', acrobat: '← · PageUp',
    match: (e) => plain(e) && (e.code === 'ArrowLeft' || e.code === 'PageUp'), run: (a) => a.page(-1) },
  { group: 'Страницы', label: 'Первая страница', keys: 'Home · Ctrl+Home', acrobat: 'Home · Ctrl+Home',
    match: (e) => !e.shiftKey && !e.altKey && e.code === 'Home', run: (a) => a.jump(1) },
  { group: 'Страницы', label: 'Последняя страница', keys: 'End · Ctrl+End', acrobat: 'End · Ctrl+End',
    match: (e) => !e.shiftKey && !e.altKey && e.code === 'End', run: (a) => a.jump(-1) },
  { group: 'Страницы', label: 'Перейти к странице', keys: 'Ctrl+G', acrobat: 'Ctrl+Shift+N — занято браузером',
    match: (e) => mods(e, true, false, false) && e.code === 'KeyG', run: (a) => a.goto() },
  { group: 'Страницы', label: 'Предыдущий вид', keys: 'Alt+←', acrobat: 'Alt+←',
    match: (e) => mods(e, false, false, true) && e.code === 'ArrowLeft', run: (a) => a.history(-1) },
  { group: 'Страницы', label: 'Следующий вид', keys: 'Alt+→', acrobat: 'Alt+→',
    match: (e) => mods(e, false, false, true) && e.code === 'ArrowRight', run: (a) => a.history(1) },

  // Масштаб и поворот
  { group: 'Масштаб', label: 'Страница целиком', keys: 'Ctrl+0 · P', acrobat: 'Ctrl+0',
    match: (e) => (mods(e, true, false, false) && code('Digit0', 'Numpad0')(e)) || (plain(e) && e.code === 'KeyP'),
    run: (a) => a.fit('page') },
  { group: 'Масштаб', label: 'Реальный размер', keys: 'Ctrl+1', acrobat: 'Ctrl+1',
    match: (e) => mods(e, true, false, false) && code('Digit1', 'Numpad1')(e), run: (a) => a.actualSize() },
  { group: 'Масштаб', label: 'По ширине', keys: 'Ctrl+2 · W', acrobat: 'Ctrl+2',
    match: (e) => (mods(e, true, false, false) && code('Digit2', 'Numpad2')(e)) || (plain(e) && e.code === 'KeyW'),
    run: (a) => a.fit('width') },
  { group: 'Масштаб', label: 'Увеличить', keys: 'Ctrl+= · +', acrobat: 'Ctrl+=',
    match: (e) => !e.altKey && !((e.ctrlKey || e.metaKey) && e.shiftKey) && isPlus(e), run: (a) => a.zoom(10) },
  { group: 'Масштаб', label: 'Уменьшить', keys: 'Ctrl+− · −', acrobat: 'Ctrl+−',
    match: (e) => !e.altKey && !((e.ctrlKey || e.metaKey) && e.shiftKey) && isMinus(e), run: (a) => a.zoom(-10) },
  { group: 'Масштаб', label: 'Масштаб 100% режима вписывания', keys: '0',
    match: (e) => plain(e) && code('Digit0', 'Numpad0')(e), run: (a) => a.zoomReset() },
  { group: 'Масштаб', label: 'Повернуть по часовой', keys: 'Ctrl+Shift+= · Ctrl+Alt+R', acrobat: 'Ctrl+Shift+=',
    match: (e) => ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && isPlus(e)) || (mods(e, true, false, true) && e.code === 'KeyR'),
    run: (a) => a.rotate(90) },
  { group: 'Масштаб', label: 'Повернуть против часовой', keys: 'Ctrl+Shift+−', acrobat: 'Ctrl+Shift+−',
    match: (e) => (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && isMinus(e), run: (a) => a.rotate(-90) },

  // Вид и инструменты
  { group: 'Вид', label: 'Миниатюры страниц', keys: 'F4', acrobat: 'F4',
    match: (e) => plain(e) && e.code === 'F4', run: (a) => a.rail() },
  { group: 'Вид', label: 'Раскрыть во всю высоту (карточка справа)', keys: 'F',
    match: (e) => plain(e) && e.code === 'KeyF', run: (a) => a.dock() },
  { group: 'Вид', label: 'Во весь экран поверх карточки', keys: 'Ctrl+L · Shift+F', acrobat: 'Ctrl+L',
    match: (e) => (mods(e, true, false, false) && e.code === 'KeyL') || (mods(e, false, true, false) && e.code === 'KeyF'),
    run: (a) => a.full() },
  { group: 'Вид', label: 'Рука — двигать лист', keys: 'H · держать Пробел', acrobat: 'H · Пробел',
    match: (e) => plain(e) && e.code === 'KeyH', run: (a) => a.tool('hand') },
  { group: 'Вид', label: 'Выделение (обычный режим)', keys: 'V', acrobat: 'V',
    match: (e) => plain(e) && e.code === 'KeyV', run: (a) => a.tool('select') },
  { group: 'Вид', label: 'Лупа: щелчок — ближе, с Alt — дальше', keys: 'Z', acrobat: 'Z',
    match: (e) => plain(e) && e.code === 'KeyZ', run: (a) => a.tool('zoom') },
  { group: 'Вид', label: 'Контекстное меню листа', keys: 'Shift+F10 · клавиша меню',
    match: (e) => (mods(e, false, true, false) && e.code === 'F10') || e.key === 'ContextMenu', run: (a) => a.menu() },
  { group: 'Вид', label: 'Выйти из режима / закрыть', keys: 'Esc', acrobat: 'Esc',
    match: (e) => e.key === 'Escape', run: (a) => a.escape() },
  { group: 'Вид', label: 'Справка по клавишам', keys: '?',
    match: (e) => e.key === '?' || (e.shiftKey && e.code === 'Slash'), run: (a) => a.help() },
];

// Справка: сгруппированный перечень для окна «Горячие клавиши».
export function keysHelpList() {
  return KEYMAP.map((k) => ({
    label: `${k.group} · ${k.label}`,
    value: k.keys + (k.acrobat && k.acrobat !== k.keys ? `   (Acrobat: ${k.acrobat})` : ''),
  }));
}
