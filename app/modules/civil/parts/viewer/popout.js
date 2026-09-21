import { createScope } from '../../../../kernel/scope.js';

// Просмотрщик в отдельном окне — на второй монитор (решение пользователя
// 21.09.2026: «реализуем и вынос на отдельную страницу, и компактный режим, на
// выбор пользователя»).
//
// Окно — не вторая копия приложения, а вторая поверхность ТОГО ЖЕ экрана:
// главное окно рисует просмотрщик прямо в документе нового окна (окна одного
// сайта видят друг друга). Поэтому синхронизировать нечего: открытый документ,
// страница, масштаб и выбор фото — одно состояние, и каждая перерисовка
// карточки перерисовывает и окно. Отдельная загрузка приложения в новом окне
// не увидела бы прикреплённых файлов: они живут в памяти главного окна.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: здесь окно живёт, пока живёт главное, и закрывается
// вместе с ним. На сервере файлы будут по ссылкам, и окно сможет быть
// самостоятельной страницей просмотра со своим адресом; тогда состояние
// придётся передавать сообщениями (BroadcastChannel) — развилка: окно-«пульт»
// с общим состоянием, как здесь, или независимая страница с подпиской на
// события карточки.

let win = null;
let pscope = null;

export const isPopoutOpen = () => !!(win && !win.closed && pscope);

// Стили — те же, что у главного окна: копируем подключённые таблицы стилей
// абсолютными ссылками (у пустого окна свой адрес, относительные не сработали
// бы) и встроенные <style>.
function copyStyles(doc) {
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => {
    if (n.tagName === 'LINK') {
      const l = doc.createElement('link');
      l.rel = 'stylesheet';
      l.href = n.href;
      doc.head.appendChild(l);
    } else {
      doc.head.appendChild(doc.importNode(n, true));
    }
  });
}

// Выпадающие списки панели (выбор документа) открывает ядро одним слушателем на
// документ главного окна — в новое окно он не доходит, поэтому здесь свой.
function bindDropdowns(doc) {
  doc.addEventListener('click', (e) => {
    const t = e.target.closest('[data-dd-toggle]');
    doc.querySelectorAll('.dd.open').forEach((d) => { if (!t || d !== t.closest('.dd')) d.classList.remove('open'); });
    if (t) { e.stopPropagation(); t.closest('.dd').classList.toggle('open'); }
  });
}

export function openPopout(ctx, onKey) {
  if (isPopoutOpen()) { win.focus(); return; }

  win = window.open('', 'estate-viewer', 'popup,width=960,height=1040');
  if (!win) {
    ctx.toast('Браузер не дал открыть окно — разрешите всплывающие окна для этого сайта', 'warn');
    return;
  }

  const doc = win.document;
  doc.open();
  doc.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8">
    <title>Документы · E•state</title></head>
    <body data-module="civil" class="civil-popout"><div id="popRoot"></div></body></html>`);
  doc.close();
  copyStyles(doc);
  bindDropdowns(doc);

  // Нативные списки здесь не подменяются своими (kernel/dropdown.js): свой
  // список открывается в документе главного окна, то есть на другом мониторе.
  const root = doc.getElementById('popRoot');
  pscope = createScope(root);
  pscope.setHTML = (html) => { root.innerHTML = html; };

  doc.addEventListener('keydown', (e) => onKey(popCtx(ctx), e));

  // Окно закрыли — просмотрщик возвращается в карточку.
  win.addEventListener('pagehide', () => {
    win = null;
    pscope = null;
    ctx.ui.viewerPopout = false;
    ctx.render();
  });

  ctx.ui.viewerPopout = true;
  ctx.render();
}

export function closePopout() {
  if (win && !win.closed) win.close();
}

// Главное окно закрывают или перезагружают — окно просмотра без него пустое.
window.addEventListener('pagehide', () => closePopout());

// Контекст для окна: тот же экран, но поверхность — документ окна.
export function popCtx(ctx) {
  const c = Object.create(ctx);
  c.scope = pscope;
  c.isPopout = true;
  return c;
}

// Перерисовать окно — после каждой перерисовки карточки.
export function renderPopout(ctx, viewerHTML, bindViewer) {
  if (!isPopoutOpen() || !ctx.ui.viewerPopout) return;
  const c = popCtx(ctx);
  if (!ctx.ui.viewer) ctx.ui.viewer = { mode: 'doc' };
  c.scope.setHTML(viewerHTML(c));
  bindViewer(c);
}

export function focusPopout() {
  if (isPopoutOpen()) win.focus();
}
