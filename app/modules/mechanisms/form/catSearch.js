// Поиск категории механизма по дереву «класс → подгруппа → тип».
//
// Задача пользователя 30.09.2026: «Надо в механизмы добавить поиск категорий.
// Например при поиске «Навес», чтобы предлагало навесное оборудование в
// конечной категории с автоматической подстановкой (поиск по дереву с
// отметкой пути)». Три каскадных списка годятся, когда человек знает, в каком
// классе искать; когда знает только, что перед ним («ИБП», «кран»), — нужен
// поиск по всему дереву сразу.
//
// Как устроено (практики):
//   * в выдаче — только КОНЕЧНЫЕ категории, то, что можно выбрать целиком;
//     путь до них стоит под названием серой строкой («Класс › Подгруппа») —
//     location-based breadcrumbs (NN/G, «Breadcrumbs: 11 Design Guidelines»):
//     одноимённые типы из разных веток различаются только путём;
//   * совпадение ищется по всему пути, каждое слово запроса — в любом месте
//     («кран мост» найдёт мостовой кран); найденное подсвечено;
//   * совпавшие в самом названии — выше совпавших только в пути;
//   * клавиатура — как у combobox со списком (WAI-ARIA APG, Combobox Pattern):
//     стрелки — по вариантам, Enter — выбрать, Escape — закрыть;
//   * выбор подставляет класс, подгруппу и тип разом; у класса без подгрупп
//     («Прочее») конечная категория — значение поля «Вид» («Навесное
//     оборудование»), и оно подставляется тоже.
import { esc } from '../../../kernel/dom.js';
import { MECH_CLASS_FIELDS } from '../data/mechFields.js';
import { classNames, classOf, setClass, setSub } from './model.js';

const LIMIT = 40;

// Как категорию называют в обиходе, а в классификаторе её названия нет:
// «ИБП» — это «Источники бесперебойного питания…». Ищется, но не
// показывается: в выдаче — название из классификатора.
const ALIASES = {
  'Источники бесперебойного питания и стабилизаторы напряжения': ['ИБП', 'UPS'],
  'Персональные компьютеры (настольные, моноблоки)': ['ПК', 'системный блок'],
  'Принтеры, МФУ, сканеры, копировальные аппараты': ['ксерокс', 'копир'],
  'Сетевое оборудование (роутеры, коммутаторы, точки доступа)': ['маршрутизатор', 'свитч', 'Wi-Fi'],
};
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');

// Конечные категории: тип подгруппы; у класса без подгрупп — значения поля
// «Вид» класса, а если его нет — сам класс.
function leaves() {
  const out = [];
  classNames().forEach((cls) => {
    const c = classOf(cls);
    if (c.subgroups.length) {
      c.subgroups.forEach((s) => s.types.forEach((type) => out.push({ cls, sub: s.name, type, name: type, path: [cls, s.name] })));
      return;
    }
    const kind = ((MECH_CLASS_FIELDS[cls] || {}).main || []).find((f) => f.key === 'otherKind');
    if (kind) kind.options.forEach((o) => out.push({ cls, kind: o, name: o, path: [cls] }));
    else out.push({ cls, name: cls, path: [] });
  });
  return out;
}

export function findCategories(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return { list: [], more: 0 };
  const found = [];
  leaves().forEach((l) => {
    const name = norm(l.name);
    const hay = norm([...l.path, l.name, ...(ALIASES[l.name] || [])].join(' '));
    if (!words.every((w) => hay.includes(w))) return;
    let score = 0;
    words.forEach((w) => {
      if (name.startsWith(w)) score += 20;
      else if (new RegExp('(^|[\\s(«-])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(name)) score += 12;
      else if (name.includes(w)) score += 6;
      else if ((ALIASES[l.name] || []).some((a) => norm(a).startsWith(w))) score += 15;
    });
    found.push({ ...l, score });
  });
  found.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ru'));
  return { list: found.slice(0, LIMIT), more: Math.max(0, found.length - LIMIT) };
}

// Подсветка слов запроса в строке. Экранирование — до разметки: подсветка
// ставится по экранированному тексту, иначе «<» в названии стал бы тегом.
function mark(text, words) {
  let html = esc(text);
  const src = norm(html);
  const hits = [];
  words.forEach((w) => {
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

export function catSearchHTML() {
  return `<div class="field mu-cs">
    <label for="mu-cs-q">Поиск категории</label>
    <div class="mu-cs-box">
      <input class="input" id="mu-cs-q" data-mu-csq autocomplete="off" spellcheck="false"
        role="combobox" aria-expanded="false" aria-controls="mu-cs-list" aria-autocomplete="list"
        placeholder="Например: навесное, ИБП, мостовой кран">
      <div class="mu-cs-drop" id="mu-cs-list" role="listbox" aria-label="Найденные категории" hidden></div>
    </div>
  </div>`;
}

// onPicked — перерисовать карточку после подстановки.
export function bindCatSearch(scope, unit, onPicked) {
  const q = scope.$('[data-mu-csq]');
  const drop = scope.$('#mu-cs-list');
  if (!q || !drop) return;
  let list = [];
  let active = -1;

  const open = (on) => {
    drop.hidden = !on;
    q.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (!on) q.removeAttribute('aria-activedescendant');
  };

  const setActive = (i) => {
    active = i;
    drop.querySelectorAll('[role="option"]').forEach((el, n) => el.setAttribute('aria-selected', n === i ? 'true' : 'false'));
    const el = drop.querySelector(`#mu-cs-o-${i}`);
    if (el) { q.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
  };

  const draw = () => {
    const words = norm(q.value).split(/\s+/).filter(Boolean);
    const r = findCategories(q.value);
    list = r.list;
    if (!words.length) { open(false); return; }
    drop.innerHTML = list.length
      ? list.map((l, i) => `<div class="mu-cs-opt" role="option" id="mu-cs-o-${i}" data-mu-cs="${i}" aria-selected="false">
          <span class="mu-cs-name">${mark(l.name, words)}</span>
          ${l.path.length ? `<span class="mu-cs-path">${l.path.map((p) => mark(p, words)).join(' <span aria-hidden="true">›</span> ')}</span>` : ''}
        </div>`).join('')
        + (r.more ? `<div class="mu-cs-more">Ещё ${r.more} — уточните запрос</div>` : '')
      : '<div class="mu-cs-more">Ничего не найдено</div>';
    open(true);
    setActive(list.length ? 0 : -1);
  };

  const pick = (i) => {
    const l = list[i];
    if (!l) return;
    setClass(unit, l.cls);
    if (l.sub) { setSub(unit, l.sub); unit.type = l.type; }
    if (l.kind) {
      unit.params = unit.params || {};
      unit.params.otherKind = l.kind;
    }
    open(false);
    onPicked();
  };

  q.oninput = draw;
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
  // mousedown, а не click: иначе поле теряет фокус раньше и список закрывается.
  drop.onmousedown = (e) => {
    const el = e.target.closest('[data-mu-cs]');
    if (!el) return;
    e.preventDefault();
    pick(+el.dataset.muCs);
  };
  scope.onDocument('click', (e) => {
    if (!q.parentElement.contains(e.target)) open(false);
  });
}
