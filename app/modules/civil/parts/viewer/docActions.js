import { archiveDoc } from '../../../../kernel/archive.js';
import { docListFor, scopeLabel } from '../docs/model.js';
import { DOC_TYPES } from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';
import { pushDocPageLog } from '../../audit/model.js';
import { VS, vSt, tabKey, scopesOf, orderedTabs, openTabOnly } from './state.js';

// Действия с документами и вкладками просмотрщика. Одни и те же функции зовут
// кнопки панели, контекстное меню и горячие клавиши — поведение не должно
// расходиться в зависимости от того, как человек дошёл до действия.

export const docOf = (ctx, sc, id) => docListFor(ctx, sc).find((x) => x.id === id) || null;

export function currentTab(ctx) {
  const vd = ctx.ui.viewerDoc;
  return vd ? { sc: vd.scope, id: vd.id } : null;
}

export const tabs = (ctx) => orderedTabs(scopesOf(ctx));

export function activate(ctx, sc, id) {
  openTabOnly(sc, id);
  ctx.ui.viewerDoc = { scope: sc, id };
  if (!ctx.ui.viewer || ctx.ui.viewer.mode === 'photo') ctx.ui.viewer = { mode: 'doc' };
  ctx.ui.viewerClosed = false;
  ctx.render();
}

// Закрыть вкладки. Документ при этом не удаляется — он остаётся в записи и
// открывается снова кнопкой «+».
function closeKeys(ctx, keys) {
  const cur = currentTab(ctx);
  const list = tabs(ctx);
  const curPos = cur ? list.findIndex((x) => x.sc === cur.sc && x.id === cur.id) : -1;
  keys.forEach((k) => {
    const [sc, id] = k.split('|');
    VS.openTabs[sc] = (VS.openTabs[sc] || []).filter((x) => x !== id);
    VS.tabOrder = VS.tabOrder.filter((x) => x !== k);
  });
  const rest = tabs(ctx);
  if (cur && keys.includes(tabKey(cur.sc, cur.id))) {
    // Как в Acrobat и браузерах: после закрытия активной — соседняя справа,
    // а если справа нет — слева.
    const next = rest[Math.min(Math.max(curPos, 0), rest.length - 1)];
    ctx.ui.viewerDoc = next ? { scope: next.sc, id: next.id } : null;
  }
  ctx.render();
}

export function closeTab(ctx, sc, id) {
  const t = sc ? { sc, id } : currentTab(ctx);
  if (t) closeKeys(ctx, [tabKey(t.sc, t.id)]);
}

export function closeOthers(ctx, sc, id) {
  closeKeys(ctx, tabs(ctx).filter((x) => !(x.sc === sc && x.id === id)).map((x) => tabKey(x.sc, x.id)));
  ctx.ui.viewerDoc = { scope: sc, id };
  ctx.render();
}

export function closeRight(ctx, sc, id) {
  const list = tabs(ctx);
  const at = list.findIndex((x) => x.sc === sc && x.id === id);
  closeKeys(ctx, list.slice(at + 1).map((x) => tabKey(x.sc, x.id)));
}

export function closeAll(ctx) {
  closeKeys(ctx, tabs(ctx).map((x) => tabKey(x.sc, x.id)));
}

// Следующий / предыдущий документ по кругу.
export function stepDoc(ctx, dir) {
  const list = tabs(ctx);
  if (!list.length) return;
  const cur = currentTab(ctx);
  const at = cur ? list.findIndex((x) => x.sc === cur.sc && x.id === cur.id) : -1;
  const n = list[(at + dir + list.length) % list.length];
  activate(ctx, n.sc, n.id);
}

// Переставить вкладку: на шаг (Alt+Shift+←/→) или перед другой (перетаскивание).
export function moveTab(ctx, key, beforeKey) {
  const order = VS.tabOrder.filter((k) => k !== key);
  const at = beforeKey ? order.indexOf(beforeKey) : -1;
  if (at < 0) order.push(key); else order.splice(at, 0, key);
  VS.tabOrder = order;
  ctx.render();
}

export function shiftTab(ctx, dir) {
  const cur = currentTab(ctx);
  if (!cur) return;
  const list = tabs(ctx).map((x) => tabKey(x.sc, x.id));
  const key = tabKey(cur.sc, cur.id);
  const at = list.indexOf(key);
  const to = at + dir;
  if (to < 0 || to >= list.length) return;
  const others = list.filter((k) => k !== key);
  others.splice(to, 0, key);
  // Невидимые из этого экрана вкладки (другие литеры) сохраняют свои места в
  // хвосте общего порядка.
  VS.tabOrder = others.concat(VS.tabOrder.filter((k) => !others.includes(k)));
  ctx.render();
}

// Документы видимых областей, ещё не открытые вкладкой.
export function notOpened(ctx) {
  const out = [];
  scopesOf(ctx).forEach((sc) => docListFor(ctx, sc).forEach((d) => {
    if (!(VS.openTabs[sc] || []).includes(d.id)) out.push({ sc, d });
  }));
  return out;
}

export function openAll(ctx) {
  const rest = notOpened(ctx);
  rest.forEach((x) => openTabOnly(x.sc, x.d.id));
  if (rest.length) activate(ctx, rest[0].sc, rest[0].d.id);
}

export async function renameDoc(ctx, sc, id) {
  const d = docOf(ctx, sc, id);
  if (!d) return;
  const name = await ctx.host.prompt({ title: 'Переименовать документ', label: 'Название', value: d.name, okLabel: 'Переименовать' });
  if (name == null || !String(name).trim()) return;
  d.name = String(name).trim();
  ctx.render();
}

export async function retypeDoc(ctx, sc, id) {
  const d = docOf(ctx, sc, id);
  if (!d) return;
  const type = await ctx.host.select({ title: 'Вид документа', options: opt('oc', 'docType', DOC_TYPES), value: d.type });
  if (!type) return;
  d.type = type;
  ctx.render();
}

// Скачать — под именем документа: его человек и задал, и узнаёт.
export function downloadDoc(ctx, sc, id) {
  const d = docOf(ctx, sc, id);
  if (!d || !d.file) { ctx.toast('У документа нет файла', 'warn'); return; }
  const doc = ctx.scope.root.ownerDocument;
  const a = doc.createElement('a');
  a.href = d.file.dataUrl;
  const ext = (d.file.name.match(/\.[^.]+$/) || [''])[0];
  a.download = d.name.toLowerCase().endsWith(ext.toLowerCase()) ? d.name : d.name + ext;
  doc.body.appendChild(a);
  a.click();
  a.remove();
}

// Печать — самим файлом через встроенную печать браузера: скрытая рамка с
// файлом и её print(). Страницы, «отрезанные» в просмотрщике, файл не меняют —
// об этом говорит сообщение.
export function printDoc(ctx, sc, id) {
  const d = docOf(ctx, sc, id);
  if (!d || !d.file) { ctx.toast('У документа нет файла', 'warn'); return; }
  const doc = ctx.scope.root.ownerDocument;
  const frame = doc.createElement('iframe');
  frame.className = 'vprint-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.src = d.file.dataUrl;
  frame.onload = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { doc.defaultView.open(d.file.dataUrl, '_blank'); }
    setTimeout(() => frame.remove(), 60000);
  };
  doc.body.appendChild(frame);
  if (d.file.pageCount && d.pages && d.pages.length !== d.file.pageCount) {
    ctx.toast('Печатается исходный файл — убранные в просмотрщике страницы в него входят', 'warn');
  }
}

const size = (n) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ');

// Свойства (Ctrl+D, как в Acrobat).
export function docProperties(ctx, sc, id) {
  const d = docOf(ctx, sc, id);
  if (!d) return;
  const oi = sc === 'oc' ? null : (ctx.rec.oi || []).find((o) => o.id === sc);
  const list = [
    { label: 'Название', value: d.name },
    { label: 'Вид', value: d.type },
    { label: 'Принадлежит', value: sc === 'oc' ? 'Объект оценки' : `${scopeLabel(sc)} · ${oi ? (oi.letter ? 'литера ' + oi.letter : oi.name) : ''}` },
    { label: 'Прикреплён', value: d.date || '—' },
  ];
  if (d.file) {
    list.push({ label: 'Файл', value: d.file.name });
    list.push({ label: 'Размер', value: size(d.file.size || 0) });
    list.push({ label: 'Формат', value: d.file.mime || '—' });
    if (d.file.pageCount) {
      list.push({ label: 'Страниц', value: d.pages && d.pages.length !== d.file.pageCount
        ? `${d.pages.length} из ${d.file.pageCount} (часть убрана в просмотрщике)` : String(d.file.pageCount) });
    }
  }
  ctx.host.confirm({ title: 'Свойства документа', list, okLabel: 'Закрыть' });
}

export async function archiveTab(ctx, sc, id) {
  const d = docOf(ctx, sc, id);
  if (!d) return;
  const ok = await ctx.host.confirm({
    title: 'Убрать документ в архив?',
    text: `«${d.name}» исчезнет из карточки, но останется в архиве — его можно будет найти и вернуть.`,
    okLabel: 'В архив',
  });
  if (!ok) return;
  const oi = sc === 'oc' ? null : (ctx.rec.oi || []).find((o) => o.id === sc);
  const entry = archiveDoc({ rec: ctx.rec, oi, docId: id, typeId: 'civil', typeLabel: 'Гражданское здание', today: ctx.today });
  if (!entry) return;
  closeKeys(ctx, [tabKey(sc, id)]);
  ctx.toast('Документ в архиве: ' + entry.name, 'ok');
}

// Убрать страницы: выбранные Ctrl+кликом, иначе текущую.
export async function deletePages(ctx) {
  const t = currentTab(ctx);
  const d = t && docOf(ctx, t.sc, t.id);
  if (!d || !d.pages) return;
  const st = vSt(ctx);
  const sel = (ctx.ui.pageSel || []).length ? ctx.ui.pageSel.slice() : [st ? st.page : 1];
  if (sel.length >= d.pages.length) { ctx.toast('Нельзя убрать все страницы документа', 'warn'); return; }
  const ok = await ctx.host.confirm({
    title: sel.length > 1 ? `Убрать страницы: ${sel.length}?` : `Убрать страницу ${sel[0]}?`,
    text: 'Страницы уберутся из документа в карточке; исходный файл не меняется.',
    okLabel: 'Убрать', danger: true,
  });
  if (!ok) return;
  sel.sort((a, b) => b - a).forEach((n) => { d.pages.splice(n - 1, 1); pushDocPageLog(ctx.rec, d, 'delete', n); });
  ctx.ui.pageSel = [];
  if (st) st.page = Math.min(st.page, d.pages.length);
  ctx.render();
}

// Подпись вкладки: область и вид — «ОЦ · Техпаспорт»; полное название в
// подсказке и в меню.
export function tabLabel(sc, d) {
  return `${scopeLabel(sc)} · ${d.type}`;
}

