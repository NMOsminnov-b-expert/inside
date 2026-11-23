import { esc } from '../../kernel/dom.js';
import { FLAGS } from '../../kernel/flagBadges.js';
import { getType } from '../../kernel/registry.js';

// Обозначения под таблицей реестра — «Признаки» и «Виды ОЦ», как в рабочей системе (снимок пользователя 23.11.2026;
// запись графа maket-v-format-rabochey-sistemy-…). Значки — те же, что в строках (kernel/flagBadges.js) и в ячейке
// адреса (typeIconHTML ниже).

// Вид ОЦ — линейный значок в квадрате у адреса. Подпись — из манифеста модуля.
const TYPE_ICONS = {
  'residential-house': '<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
  apartment: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M11 21v-4h2v4"/>',
  civil: '<path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M9 12h6M9 16h6"/>',
  'land-plot': '<path d="M4 7 12 3l8 4-8 4z"/><path d="M4 12l8 4 8-4M4 17l8 4 8-4"/>',
  vehicle: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3.5V16h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  mechanisms: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
};
const TAB_TYPES = {
  estate: ['residential-house', 'apartment', 'civil', 'land-plot'],
  vehicle: ['vehicle'],
  mech: ['mechanisms'],
};
// Признаки движимого — без ТП и ML (у ТС и оборудования их нет).
const MOVABLE_FLAGS = ['pendingNotes', 'earlySent', 'earlyDone'];

export function typeIconHTML(typeId) {
  const d = TYPE_ICONS[typeId];
  if (!d) return '';
  const t = getType(typeId);
  const label = t ? t.manifest.label : typeId;
  return `<span class="reg-ti reg-ti-${esc(typeId)}" title="${esc(label)}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${d}</svg></span>`;
}

export function legendHTML(tab) {
  const movable = tab !== 'estate';
  const flags = FLAGS.filter((f) => !movable || MOVABLE_FLAGS.includes(f.key));
  const ml = movable ? [] : [
    { icon: 'ML', cls: 'ml ml-raw', title: 'импорт ML не сверен' },
    { icon: 'ML', cls: 'ml', title: 'импорт ML сверен' },
  ];
  const badge = (f) => `<span class="reg-lg-i"><span class="reg-badge ${esc(f.cls)}" aria-hidden="true">${esc(f.icon)}</span>${esc(f.title)}</span>`;
  const types = (TAB_TYPES[tab] || []).filter((id) => getType(id)).map((id) => `<span class="reg-lg-i">${typeIconHTML(id)}${esc(getType(id).manifest.label.toLowerCase())}</span>`);
  return `<div class="reg-lg-row"><b>Признаки:</b>${[...flags, ...ml].map(badge).join('')}</div>
    ${types.length > 1 ? `<div class="reg-lg-row"><b>Виды ОЦ:</b>${types.join('')}</div>` : ''}`;
}
