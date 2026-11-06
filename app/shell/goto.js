// «Перейти» — общий поиск-переход в шапке каркаса (решение пользователя 06.11.2026 на вопрос
// «Общий поиск Ctrl+K в сканах, реестре и у осмотрщика»: «На всех экранах» — одно поле в шапке:
// объекты по ЕНИ и адресу, люди, разделы, сканы — с любого экрана). Ctrl+K (и Ctrl+Л в русской
// раскладке) ставит в него фокус.
//
// В «Осмотрах (регионалы)» у панели своё поле «Перейти» с её разделами и картой — там поле
// шапки прячется, а Ctrl+K остаётся за панелью, чтобы на экране не было двух одинаковых полей.
//
// Поведение — как у списка с подсказками (combobox): стрелки, Enter, Esc; выбранная строка —
// aria-activedescendant. Подсказки — по мере ввода; разделы видны и с пустым полем.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: объекты, люди и сканы ищет сервер одним запросом (индекс поиска);
// здесь обходятся данные вкладки.
import { $, esc } from '../kernel/dom.js';
import { sortedTypes } from '../kernel/registry.js';
import { build, MENU_HREF, DOCS_HREF, DICTS_HREF, INST_HREF, OSMOTR_HREF, INSPECTIONS_HREF, SCANS_HREF, ANALYTICS_HREF, ARCHIVE_HREF } from '../kernel/router.js';
import { profileNames } from '../kernel/inspections.js';
import { scanQueue } from '../kernel/scanQueue.js';

const SECTIONS = [
  ['Объекты оценки', 'реестр', MENU_HREF, 'реестр главная ОЦ'],
  ['Осмотры (регионалы)', 'назначения, осмотрщики, кадастр', INSPECTIONS_HREF, 'назначить очередь регионал'],
  ['Уведомления осмотров', 'Осмотры (регионалы)', `${INSPECTIONS_HREF}?s=notes`, 'пропуски лента'],
  ['Кадастр', 'запросы документов · Осмотры', `${INSPECTIONS_HREF}?s=cadastre`, 'запрос'],
  ['Осмотры (осмотрщики)', 'приложение «Осмотр»', OSMOTR_HREF, 'приложение телефон'],
  ['Сканы с осмотров', 'разбор документов и ответов кадастра', SCANS_HREF, 'разбор скан'],
  ['Документы', 'поиск по всем документам', DOCS_HREF, 'реестр документов'],
  ['Учреждения', 'дерево учреждений', INST_HREF, 'министерство подвед'],
  ['Аналитика', 'земли по айыл аймакам', ANALYTICS_HREF, 'земля участки'],
  ['Архив', 'архивные объекты', ARCHIVE_HREF, ''],
  ['Справочники', 'перечни значений', DICTS_HREF, 'словари'],
];

function objects(words, q) {
  if (q.length < 2) return [];
  const out = [];
  for (const t of sortedTypes()) {
    if (!t.records.queryRecords) continue;
    t.records.queryRecords({ filter: { q: words.join(' ') }, offset: 0, limit: 12 }).rows.forEach((r) => out.push({
      label: r.title || r.address || r.id, sub: `${t.manifest.label}${r.eni ? ' · ' + r.eni : ''}${r.status ? ' · ' + r.status : ''}`,
      href: build({ typeId: t.manifest.id, ocId: r.id }), kind: 'Объекты',
      // Совпало в адресе или ЕНИ — выше совпавших только по учреждению.
      w: words.every((w) => `${r.title || ''} ${r.eniAll || r.eni || ''}`.toLowerCase().includes(w)) ? 0 : 1,
    }));
  }
  return out.map((x, i) => ({ x, i })).sort((a, b) => a.x.w - b.x.w || a.i - b.i).map(({ x }) => x).slice(0, 6);
}

export function gotoItems(text) {
  const q = String(text || '').trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const has = (s) => words.every((w) => s.toLowerCase().includes(w));
  const sections = SECTIONS.filter(([l, s, , kw]) => !words.length || has(`${l} ${s} ${kw}`))
    .map(([label, sub, href]) => ({ label, sub, href, kind: 'Разделы' }));
  if (!words.length) return sections;
  const people = profileNames().filter((n) => has(n)).slice(0, 4)
    .map((n) => ({ label: n, sub: 'осмотрщик · карточка', href: `${INSPECTIONS_HREF}?s=people&p=${encodeURIComponent(n)}&t=trips`, kind: 'Люди' }));
  const scans = q.length < 2 ? [] : scanQueue({}).filter((x) => has(`${x.title} ${x.eni} ${x.place} ${x.by}`)).slice(0, 4)
    .map((x) => ({ label: x.title, sub: `скан · ${x.place || x.eni || ''}`, href: `${SCANS_HREF}?${x.state !== 'wait' ? `state=${x.state}&` : ''}key=${encodeURIComponent(x.key)}`, kind: 'Сканы' }));
  return [...objects(words, q), ...people, ...sections, ...scans].slice(0, 14);
}

export function mountGoto() {
  const bar = $('.topbar');
  if (!bar || $('[data-goto]')) return;
  const box = document.createElement('div');
  box.className = 'goto';
  box.setAttribute('role', 'combobox');
  box.setAttribute('aria-expanded', 'false');
  box.setAttribute('aria-haspopup', 'listbox');
  box.setAttribute('aria-owns', 'goto-list');
  box.innerHTML = `<span class="goto-in"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4 14 14"/></svg>
    <input data-goto placeholder="Перейти: ЕНИ, адрес…" aria-label="Перейти (Ctrl+K)" autocomplete="off" aria-controls="goto-list" aria-autocomplete="list">
    <kbd class="goto-kbd" aria-hidden="true">Ctrl K</kbd></span>
    <ul class="goto-list" id="goto-list" role="listbox" aria-label="Куда перейти" hidden></ul>`;
  const user = $('#userMenu');
  bar.insertBefore(box, user || null);
  const inp = box.querySelector('[data-goto]');
  const ul = box.querySelector('.goto-list');
  // На узком экране подсказка короче — длинная обрезалась бы на середине слова.
  const narrow = window.matchMedia('(max-width: 900px)');
  const ph = () => { inp.placeholder = narrow.matches ? 'Перейти…' : 'Перейти: ЕНИ, адрес…'; };
  ph();
  narrow.addEventListener('change', ph);
  let list = [];
  let hi = 0;
  const close = () => { ul.hidden = true; box.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); };
  const draw = () => {
    list = gotoItems(inp.value);
    hi = Math.max(0, Math.min(hi, list.length - 1));
    let kind = '';
    ul.innerHTML = list.map((x, i) => {
      const sep = x.kind !== kind ? `<li class="goto-sep" role="presentation">${esc(x.kind)}</li>` : '';
      kind = x.kind;
      return `${sep}<li role="option" id="goto-${i}" data-goto-i="${i}" class="${i === hi ? 'hi' : ''}" aria-selected="${i === hi}"><b>${esc(x.label)}</b><span>${esc(x.sub)}</span></li>`;
    }).join('') || '<li class="goto-none">Ничего не нашлось. Наберите ЕНИ, улицу без номера дома или имя осмотрщика.</li>';
    ul.hidden = false;
    box.setAttribute('aria-expanded', 'true');
    if (list.length) inp.setAttribute('aria-activedescendant', `goto-${hi}`);
  };
  const go = (i) => {
    const x = list[i];
    if (!x) return;
    inp.value = '';
    close();
    inp.blur();
    location.hash = x.href;
  };
  inp.addEventListener('focus', () => { hi = 0; draw(); });
  inp.addEventListener('input', () => { hi = 0; draw(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      hi = Math.max(0, Math.min(list.length - 1, hi + (e.key === 'ArrowDown' ? 1 : -1)));
      draw();
      const cur = ul.querySelector('.hi');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); go(hi); } else if (e.key === 'Escape') { e.preventDefault(); inp.value = ''; close(); inp.blur(); }
  });
  inp.addEventListener('blur', () => setTimeout(close, 150));
  ul.addEventListener('mousedown', (e) => {
    const li = e.target.closest('[data-goto-i]');
    if (li) { e.preventDefault(); go(+li.dataset.gotoI); }
  });
  // Ctrl+K — с любого экрана; в «Осмотрах (регионалы)» — поле панели (оно там своё).
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !(e.key === 'k' || e.key === 'л' || e.code === 'KeyK')) return;
    if (document.body.dataset.page === 'inspections' && document.querySelector('[data-ip-jump]')) return;
    e.preventDefault();
    inp.focus();
    inp.select();
  });
}
