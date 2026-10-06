// Поиск по дереву справочника — помощник над каскадом списков.
//
// Первым такой поиск появился в механизмах (задача пользователя 30.09.2026:
// «поиск по дереву с отметкой пути»), затем понадобился карточке ТС — вид
// объекта и модули. Ядро не знает, что за дерево: модуль отдаёт список конечных
// вариантов с путём до них и говорит, что делать с выбранным.
//
// Указание пользователя 30.09.2026 по карточке ТС: «Поиск — помощник, а не
// альтернатива». Поэтому поиск ничего не заменяет: каскад списков стоит рядом
// и остаётся главным, выбор в выдаче только заполняет его — и каждый уровень
// потом можно поменять. «На кран путь „Подъёмные“, хотя там есть и другие узлы
// пути» — в выдаче все совпадения из всех веток, у каждого полный путь.
//
// Как устроено (практики):
//   * в выдаче — конечные варианты, путь до них серой строкой под названием
//     (location-based breadcrumbs, NN/G): одноимённое из разных веток
//     различается только путём;
//   * каждое слово запроса ищется по всему пути; совпавшие в названии — выше;
//     найденное подсвечено; совпадение только в примерах показывается
//     отдельной строкой «в примерах: …»;
//   * клавиатура — как у combobox (WAI-ARIA APG): стрелки, Enter, Escape;
//     выдача закрывается, когда фокус уходит с поля, сам список фокус по Tab
//     не берёт.
//
// Вариант: { name, path: [..], aliases?: [..], extra?: 'текст', removable? } и
// любые поля модуля — их вернёт onPick; removable — в строке крестик, по нему
// зовётся onRemove (свои шаблоны карточки ТС). aliases — обиходные названия («ИБП»): ищутся, но
// не показываются; extra — пояснение вроде примеров марок: ищется слабее.
import { esc } from './dom.js';

const LIMIT = 40;
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
const words = (q) => norm(q).split(/\s+/).filter(Boolean);
const escRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function findLeaves(all, q) {
  const ws = words(q);
  if (!ws.length) return { list: [], more: 0 };
  const found = [];
  all.forEach((l) => {
    const name = norm(l.name);
    const aliases = (l.aliases || []).map(norm);
    const hay = norm([...(l.path || []), l.name, ...aliases, l.extra || ''].join(' '));
    if (!ws.every((w) => hay.includes(w))) return;
    let score = 0;
    let inExtra = false;
    ws.forEach((w) => {
      if (name.startsWith(w)) score += 20;
      else if (new RegExp('(^|[\\s(«-])' + escRe(w)).test(name)) score += 12;
      else if (name.includes(w)) score += 6;
      else if (aliases.some((a) => a.startsWith(w))) score += 15;
      else if (norm((l.path || []).join(' ')).includes(w)) score += 3;
      else inExtra = true;
    });
    found.push({ ...l, score, inExtra });
  });
  found.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ru'));
  return { list: found.slice(0, LIMIT), more: Math.max(0, found.length - LIMIT) };
}

// Подсветка слов запроса. Экранирование — до разметки: подсветка ставится по
// экранированному тексту, иначе «<» в названии стал бы тегом.
function mark(text, ws) {
  let html = esc(text);
  const src = norm(html);
  const hits = [];
  ws.forEach((w) => {
    const ew = norm(esc(w));
    let at = src.indexOf(ew);
    while (at >= 0) { hits.push([at, at + ew.length]); at = src.indexOf(ew, at + ew.length); }
  });
  if (!hits.length) return html;
  hits.sort((a, b) => a[0] - b[0]);
  const merged = [];
  hits.forEach((h) => {
    const last = merged[merged.length - 1];
    if (last && h[0] <= last[1]) last[1] = Math.max(last[1], h[1]);
    else merged.push([...h]);
  });
  for (let i = merged.length - 1; i >= 0; i--) {
    const [a, b] = merged[i];
    html = html.slice(0, a) + '<mark>' + html.slice(a, b) + '</mark>' + html.slice(b);
  }
  return html;
}

// Кусок пояснения вокруг совпадения — чтобы было видно, почему нашлось.
function snippet(text, ws) {
  const t = String(text || '');
  const n = norm(t);
  const at = Math.min(...ws.map((w) => { const i = n.indexOf(w); return i < 0 ? Infinity : i; }));
  if (!Number.isFinite(at)) return '';
  const from = Math.max(0, at - 24);
  return (from ? '…' : '') + t.slice(from, from + 70) + (from + 70 < t.length ? '…' : '');
}

// id — имя поиска на экране: поле #<id>-q, выдача #<id>-list.
export function treeSearchHTML({ id, label, placeholder = '' }) {
  return `<div class="field tsr" data-tsr="${esc(id)}">
    <label for="${esc(id)}-q">${esc(label)}</label>
    <div class="tsr-box">
      <input class="input tsr-q" id="${esc(id)}-q" autocomplete="off" spellcheck="false"
        role="combobox" aria-expanded="false" aria-controls="${esc(id)}-list" aria-autocomplete="list"
        placeholder="${esc(placeholder)}">
      <div class="tsr-drop" id="${esc(id)}-list" role="listbox" aria-label="Найдено в справочнике" tabindex="-1" hidden></div>
    </div>
  </div>`;
}

// leaves() — варианты (зовётся при каждом наборе: состав может зависеть от
// уже выбранного); onPick(вариант) — подставить в каскад и перерисовать.
export function bindTreeSearch(scope, { id, leaves, onPick, onRemove }) {
  const q = scope.$(`#${id}-q`);
  const drop = scope.$(`#${id}-list`);
  if (!q || !drop) return;
  let list = [];
  let active = -1;

  // Выдача не выходит за край окна (правило проекта о всплывающем): высота —
  // по месту до края, а если снизу тесно — над полем. Прокрутка одна, у выдачи.
  const place = () => {
    const r = q.getBoundingClientRect();
    const below = innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 200 && above > below;
    drop.classList.toggle('up', up);
    drop.style.maxHeight = Math.max(120, Math.min(320, up ? above : below)) + 'px';
  };
  const open = (on) => {
    drop.hidden = !on;
    q.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) place();
    if (!on) q.removeAttribute('aria-activedescendant');
  };

  const setActive = (i) => {
    active = i;
    drop.querySelectorAll('[role="option"]').forEach((el, n) => el.setAttribute('aria-selected', n === i ? 'true' : 'false'));
    const el = drop.querySelector(`#${id}-o-${i}`);
    if (el) { q.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
  };

  const draw = () => {
    const ws = words(q.value);
    if (!ws.length) { open(false); return; }
    const r = findLeaves(leaves(), q.value);
    list = r.list;
    drop.innerHTML = list.length
      ? list.map((l, i) => `<div class="tsr-opt" role="option" id="${id}-o-${i}" data-tsr-i="${i}" aria-selected="false">
          <span class="tsr-name">${mark(l.name, ws)}</span>
          ${l.path && l.path.length ? `<span class="tsr-path">${l.path.map((p) => mark(p, ws)).join(' <span aria-hidden="true">›</span> ')}</span>` : ''}
          ${l.inExtra && l.extra ? `<span class="tsr-path">в примерах: ${mark(snippet(l.extra, ws), ws)}</span>` : ''}
          ${l.removable && onRemove ? `<button type="button" class="tsr-del" data-tsr-del="${i}" tabindex="-1"
            aria-label="Удалить «${esc(l.name)}»" title="Удалить">×</button>` : ''}
        </div>`).join('')
        + (r.more ? `<div class="tsr-more">Ещё ${r.more} — уточните запрос</div>` : '')
      : '<div class="tsr-more">Ничего не найдено</div>';
    open(true);
    setActive(list.length ? 0 : -1);
  };

  const pick = (i) => {
    const l = list[i];
    if (!l) return;
    open(false);
    onPick(l);
  };

  q.oninput = draw;
  // Ушли из поля — выдачу закрыть. Выбор мышью этому не мешает: mousedown в
  // списке фокус не отнимает.
  q.onblur = () => open(false);
  q.onfocus = () => { if (q.value.trim()) draw(); };
  q.onkeydown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (drop.hidden) { draw(); return; }
      if (!list.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + list.length) % list.length);
    } else if (e.key === 'Enter') {
      if (!drop.hidden && active >= 0) { e.preventDefault(); pick(active); }
    } else if (e.key === 'Escape') {
      if (!drop.hidden) { e.preventDefault(); e.stopPropagation(); open(false); }
    }
  };
  drop.onmousedown = (e) => {
    const del = e.target.closest('[data-tsr-del]');
    if (del && onRemove) {
      e.preventDefault();
      const l = list[+del.dataset.tsrDel];
      open(false);
      if (l) onRemove(l);
      return;
    }
    const el = e.target.closest('[data-tsr-i]');
    if (!el) return;
    e.preventDefault();
    pick(+el.dataset.tsrI);
  };
}
