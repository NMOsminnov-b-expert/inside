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
// Вариант: { name, path: [..], aliases?: [..], extra?: 'текст', removable?, boost? } и
// любые поля модуля — их вернёт onPick; removable — в строке крестик, по нему
// зовётся onRemove (свои шаблоны карточки ТС). aliases — обиходные названия («ИБП»): ищутся, но
// не показываются; extra — пояснение вроде примеров марок: ищется слабее;
// note — подпись под названием, которая показывается, но не ищется (у модели
// машины — что она соберёт: иначе «самосвал» находил бы все модели-самосвалы).
import { esc } from './dom.js';
import { openModal } from './dialog.js';

const LIMIT = 40;
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
// Запись для сравнения: без знаков и с «э» как «е» — в техпаспортах пишут
// «бетономешалка/миксер», «цистерна (водовоз)», «изотерм. фургон», «хэтчбэк».
const clean = (s) => norm(s).replace(/э/g, 'е').replace(/ъ/g, 'ь').replace(/[^a-z0-9а-я]+/g, ' ').trim();
const words = (q) => clean(q).split(' ').filter((w) => w.length > 1);
const escRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Основа слова — без окончания: «колёсный» и «колёсная», «крановый» и «краны».
const stem = (w) => (w.length >= 6 ? w.slice(0, Math.max(4, w.length - 3)) : w);
// Слова записей техпаспорта, которые вид не различают (сверка с реестром ТС
// учреждений 06.10.2026: «пожарная машина», «автомобиль скорой помощи»,
// «специальный фургон»): ищутся, но вариант без них не отбрасывается.
const SOFT = new Set(['специальныи', 'специальный', 'специальная', 'специальное', 'спец', 'машина', 'автомобиль',
  'техника', 'другое', 'другая', 'для', 'перевозки', 'самоходнои', 'самоходной', 'колесный', 'колесная',
  'гусеничный', 'гусеничная', 'комплекс', 'установка']);
const startRe = (w) => new RegExp('(^| )' + escRe(w));
const byName = new Intl.Collator('ru').compare;

// Текст варианта для отбора — один раз на вариант: вариантов тысячи (модели
// машин карточки ТС), а поиск идёт на каждое нажатие, в том числе на слабом
// железе. Варианты не меняются, пока живут (модуль собирает новые объекты).
const PREP = new WeakMap();
const prep = (l) => {
  let p = PREP.get(l);
  if (!p) {
    p = {
      hay: clean([...(l.path || []), l.name, ...(l.aliases || []), l.extra || ''].join(' ')),
      name: clean(l.name), aliases: (l.aliases || []).map(clean), path: clean((l.path || []).join(' ')),
    };
    PREP.set(l, p);
  }
  return p;
};

// Отбор: варианты, где совпало больше всего значимых слов запроса. Слово,
// которого нет ни в одном варианте (опечатка, лишнее слово записи), отбор не
// обнуляет: «вилочный погрузчик/штабелер» находит вилочный погрузчик, даже
// если «штабелер» стоит у другого вида.
export function findLeaves(all, q) {
  const ws = words(q);
  if (!ws.length) return { list: [], more: 0 };
  const whole = clean(q);
  const ps = all.map(prep);
  const hays = ps.map((p) => p.hay);
  const hard = ws.filter((w) => !SOFT.has(w));
  const need = hard.length ? hard : ws;
  const stems = need.map(stem);
  const hits = hays.map((h) => stems.filter((sw) => h.includes(sw)).length);
  const best = Math.max(0, ...hits);
  if (!best) return { list: [], more: 0 };
  // Слова запроса готовятся один раз, а не на каждый вариант.
  const W = ws.map((w) => { const sw = stem(w); return { w, sw, re: startRe(sw) }; });
  const found = [];
  all.forEach((l, i) => {
    if (hits[i] !== best) return;
    const { name, aliases, path } = ps[i];
    // boost — надбавка варианта (записи техпаспорта у «Тип ТС» карточки ТС: по
    // «седан» первой — «легковой, седан», а не база, где «седан» — другое имя).
    let score = (name === whole ? 40 : aliases.includes(whole) ? 30 : 0) + (l.boost || 0);
    let inExtra = false;
    W.forEach(({ w, sw, re }) => {
      if (name.startsWith(w)) score += 20;
      else if (re.test(name)) score += 12;
      else if (aliases.includes(w)) score += 15;
      else if (aliases.some((a) => re.test(a))) score += 10;
      else if (name.includes(sw)) score += 6;
      else if (re.test(path)) score += 3;
      else if (hays[i].includes(sw)) inExtra = true;
    });
    found.push({ l, score, inExtra });
  });
  // При равных баллах — порядок варианта (у шаблонов — носитель: грузовое ТС
  // раньше вездехода), затем по алфавиту.
  found.sort((a, b) => b.score - a.score || (a.l.order || 0) - (b.l.order || 0) || byName(a.l.name, b.l.name));
  return {
    list: found.slice(0, LIMIT).map(({ l, score, inExtra }) => ({ ...l, score, inExtra })),
    more: Math.max(0, found.length - LIMIT),
  };
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

// id — имя поиска на экране: поле #<id>-q, выдача #<id>-list. Поле может быть и
// полем данных (value, attrs — например data-tsf): набранное хранится как
// значение, а выдача помогает выбрать вариант справочника (карточка ТС, «Тип ТС,
// вид кузова» — заметки пользователя 07.10.2026: «единое окно для поиска»).
// browse — подпись кнопки полного списка («Показать все»): весь справочник
// вертикальным списком по группам (bindTreeSearch, allGroups).
export function treeSearchHTML({ id, label, placeholder = '', value = '', attrs = '', hint = '', browse = '' }) {
  return `<div class="field tsr" data-tsr="${esc(id)}">
    <label for="${esc(id)}-q">${esc(label)}${hint ? ` <span class="hint">${esc(hint)}</span>` : ''}</label>
    ${browse ? `<button type="button" class="tsr-all" id="${esc(id)}-all" aria-haspopup="dialog">${esc(browse)}</button>` : ''}
    <div class="tsr-box">
      <input class="input tsr-q" id="${esc(id)}-q" autocomplete="off" spellcheck="false"
        role="combobox" aria-expanded="false" aria-controls="${esc(id)}-list" aria-autocomplete="list"
        placeholder="${esc(placeholder)}" value="${esc(value)}" ${attrs}>
      <div class="tsr-drop" id="${esc(id)}-list" role="listbox" aria-label="Найдено в справочнике" tabindex="-1" hidden></div>
    </div>
  </div>`;
}

// leaves(набранное) — варианты (зовётся при каждом наборе: состав и подписи
// могут зависеть от уже выбранного и набранного); onPick(вариант) — подставить в каскад и перерисовать.
// Поиски, где только что выбрали вариант (по id поля): переживает перерисовку.
const settled = new Set();

// emptyLeaves() — что показать в пустом поле по щелчку (у «Тип ТС» карточки
// ТС — записи техпаспорта своей категории, как прежний список подсказок поля:
// замечание пользователя 07.10.2026 «у нас были подсказки для вида ТС и типа
// кузова… чтобы они выдавались»).
export function bindTreeSearch(scope, { id, leaves, onPick, onRemove, emptyLeaves, allGroups, allTitle }) {
  const q = scope.$(`#${id}-q`);
  const drop = scope.$(`#${id}-list`);
  if (!q || !drop) return;
  const allBtn = scope.$(`#${id}-all`);
  if (allBtn && allGroups) allBtn.onclick = () => browseDialog({ title: allTitle || allBtn.textContent.trim(),
    groups: allGroups(), onPick: (l) => { settled.add(id); onPick(l); }, back: allBtn });
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
    const empty = !ws.length && emptyLeaves ? emptyLeaves() : [];
    if (!ws.length && !empty.length) { open(false); return; }
    // Набранное — и в leaves(): подпись варианта может от него зависеть (у базы
    // ТС — какая запись встанет в «Тип ТС» по набранному слову кузова).
    const r = ws.length ? findLeaves(leaves(q.value), q.value) : { list: empty, more: 0 };
    list = r.list;
    drop.innerHTML = list.length
      ? list.map((l, i) => `<div class="tsr-opt" role="option" id="${id}-o-${i}" data-tsr-i="${i}" aria-selected="false">
          <span class="tsr-name">${mark(l.name, ws)}</span>
          ${l.path && l.path.length ? `<span class="tsr-path">${l.path.map((p) => mark(p, ws)).join(' <span aria-hidden="true">›</span> ')}</span>` : ''}
          ${l.note ? `<span class="tsr-path">${esc(l.note)}</span>` : ''}
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
    settled.add(id);
    onPick(l);
  };

  // Слушатель, а не q.oninput: у поля-данных свой обработчик ввода (запись значения).
  q.addEventListener('input', () => { settled.delete(id); draw(); });
  // Ушли из поля — выдачу закрыть. Выбор мышью этому не мешает: mousedown в
  // списке фокус не отнимает.
  q.onblur = () => open(false);
  // После выбора выдача по фокусу не открывается: карточка перерисовывается и
  // возвращает фокус в поле, а у поля-данных текст остаётся — выдача закрыла бы
  // соседние кнопки. Снова откроется, когда начнут печатать (или стрелкой вниз).
  q.onfocus = () => { if ((q.value.trim() || emptyLeaves) && !settled.has(id)) draw(); };
  // Щелчок по полю, где фокус уже стоит, — тоже открыть выдачу (у пустого
  // поля с emptyLeaves — список записей).
  q.addEventListener('mousedown', () => { if (document.activeElement === q && drop.hidden) { settled.delete(id); draw(); } });
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

// Весь справочник вертикальным списком по группам (указание пользователя
// 07.10.2026: «Нужен способ просмотра всех списков модулей и видов ТС. В том
// числе марок. (кнопка показать все и список вертикальный. По категориям.)»).
//
// Практики: длинный перечень — группами с заголовками, группы сворачиваются и
// вкладываются (категория › марка › модель), заголовок группы липнет к верху
// при прокрутке, сверху — фильтр (сгруппированный combobox: shadcn Combobox
// Grouped — collapsible и nested groups; Telerik ComboBox Grouping — sticky
// group header). Группа рисует свои пункты, только когда её открыли: в марках
// тысячи моделей, а плавность нужна на слабом железе.
//
// groups — [{ title, open, items: [{ name, note, leaf }], groups: [...] }]; выбор
// пункта закрывает окно и отдаёт leaf в onPick.
const BROWSE_MAX = 400;
export function browseDialog({ title, groups, onPick, back: returnTo }) {
  const leafs = [];
  const count = (g) => (g.n = (g.items || []).length + (g.groups || []).reduce((a, x) => a + count(x), 0));
  groups.forEach(count);
  const itemHTML = (it) => `<button type="button" class="tsb-item" data-tsb-i="${leafs.push(it.leaf) - 1}">
      <span class="tsr-name">${esc(it.name)}</span>${it.note ? `<span class="tsr-path">${esc(it.note)}</span>` : ''}</button>`;
  const flat = [];
  const walk = (g, path) => { (g.items || []).forEach((it) => flat.push({ it, path })); (g.groups || []).forEach((x) => walk(x, [...path, x.title])); };
  groups.forEach((g) => walk(g, [g.title]));
  // Свёрнутая группа — пустая; содержимое дорисовывается при открытии.
  const lazy = new Map();
  const groupHTML = (g, depth) => {
    const key = lazy.size;
    lazy.set(String(key), g);
    return `<details class="tsb-g tsb-d${depth}" data-tsb-g="${key}" ${g.open || (depth === 0 && groups.length === 1) ? 'open' : ''}>
      <summary><span class="tsb-t">${esc(g.title)}</span><span class="tsb-n">${g.n}</span></summary><div class="tsb-in"></div></details>`;
  };
  const fill = (det) => {
    const g = lazy.get(det.dataset.tsbG);
    const box = det.querySelector(':scope > .tsb-in');
    if (!g || box.dataset.done) return;
    box.dataset.done = '1';
    const depth = +det.className.match(/tsb-d(\d)/)[1] + 1;
    box.innerHTML = (g.groups || []).map((x) => groupHTML(x, depth)).join('') + (g.items || []).map(itemHTML).join('');
    box.querySelectorAll('details[open]').forEach(fill);
  };
  const close = openModal(`<div class="modal-head">${esc(title)}</div>
    <div class="modal-body tsb-body">
      <input class="input tsb-q" type="search" placeholder="Отобрать по названию" aria-label="Отобрать по названию" autocomplete="off">
      <div class="tsb-list" tabindex="-1">${groups.map((g) => groupHTML(g, 0)).join('')}</div>
    </div>
    <div class="modal-foot"><button type="button" class="btn btn-ghost" data-modal-cancel>Закрыть</button></div>`, {
    onMount(backEl, done) {
      backEl.querySelector('.modal').classList.add('tsb');
      const list = backEl.querySelector('.tsb-list');
      const fq = backEl.querySelector('.tsb-q');
      const finish = () => { done(); if (returnTo && returnTo.isConnected) returnTo.focus(); };
      list.querySelectorAll('details[open]').forEach(fill);
      list.addEventListener('toggle', (e) => { if (e.target.open) fill(e.target); }, true);
      list.onclick = (e) => {
        const b = e.target.closest('[data-tsb-i]');
        if (!b) return;
        done();
        onPick(leafs[+b.dataset.tsbI]);
      };
      // Фильтр: совпавшие пункты плоским списком с путём (как в выдаче поиска).
      fq.oninput = () => {
        const ws = words(fq.value);
        leafs.length = 0;
        if (!ws.length) { lazy.clear(); list.innerHTML = groups.map((g) => groupHTML(g, 0)).join(''); list.querySelectorAll('details[open]').forEach(fill); return; }
        const hit = flat.filter(({ it, path }) => { const t = clean([it.name, ...path].join(' ')); return ws.every((w) => t.includes(w)); });
        list.innerHTML = hit.length
          ? hit.slice(0, BROWSE_MAX).map(({ it, path }) => itemHTML({ ...it, note: [path.join(' › '), it.note].filter(Boolean).join(' · ') })).join('')
            + (hit.length > BROWSE_MAX ? `<div class="tsr-more">Ещё ${hit.length - BROWSE_MAX} — уточните</div>` : '')
          : '<div class="tsr-more">Ничего не найдено</div>';
      };
      backEl.querySelector('[data-modal-cancel]').onclick = finish;
      backEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); finish(); } });
      fq.focus();
    },
  });
  return close;
}
