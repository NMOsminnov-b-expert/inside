// Состояние реестра. Всё, что влияет на выборку, живёт в адресе:
// ссылку на подборку можно переслать коллеге.

// Роли соответствуют этапам конвейера ОЦ (см. STAGE_INDEX в table.js):
// ЦОД заполняет и удостоверяет → осмотрщик осматривает → оценщик оценивает.
// «От учреждения» — сторона-заказчик, по этапам объект не ведёт.
// «Администратор» видит панель логов изменений в карточке ОЦ (см.
// kernel/auditLog.js) — в остальном права как у «любая роль».
// Сам список ролей и текущая роль/пользователь — общие с карточками ОЦ
// всех 5 модулей (kernel/session.js), поэтому смена роли здесь сразу
// видна и внутри карточек.
import { session, ROLES } from '../../kernel/session.js';

export { ROLES };

// Что роли можно делать в реестре — какие срезы «мне…» видны и какие
// действия доступны. «any» и «admin» — видно как администратору.
const ROLE_PERMS = {
  any: { slices: ['my-insp', 'my-appr', 'my-cod', 'my-all'], create: true, assignInsp: true, setStatus: true },
  insp: { slices: ['my-insp', 'my-all'], create: false, assignInsp: false, setStatus: false },
  appr: { slices: ['my-appr', 'my-all'], create: false, assignInsp: false, setStatus: false },
  cod: { slices: ['my-cod', 'my-all'], create: true, assignInsp: true, setStatus: true },
  gov: { slices: ['my-all'], create: true, assignInsp: false, setStatus: false },
  admin: { slices: ['my-insp', 'my-appr', 'my-cod', 'my-all'], create: true, assignInsp: true, setStatus: true },
};

export function rolePerms(key) {
  return ROLE_PERMS[key] || ROLE_PERMS.any;
}

export function roleHint(key) {
  const r = ROLES.find((x) => x.key === key);
  return r ? r.hint : '';
}

export const FLAG_LABELS = {
  specials: 'есть особенности',
  pendingNotes: 'есть невып. заметки',
  mlUnverified: 'ML без проверки',
  defects: 'расхождение ТП/фото',
  ml: 'импорт ML',
};

// Столбцы реестра. width — ширина ПО УМОЛЧАНИЮ: изменённую вручную держит
// state.colWidths, механика общая для всех таблиц (kernel/columns.js).
// Столбец «Адрес» с width: 0 — тянущийся, он забирает остаток строки.
export const COLUMNS = [
  { key: 'eni', label: 'Код ЕНИ', width: 126, mono: true, sort: 'eni' },
  { key: 'title', label: 'Адрес', width: 0, sort: 'title' },
  { key: 'typeLabel', label: 'Тип ОЦ', width: 150 },
  { key: 'status', label: 'Статус', width: 142, sort: 'status' },
  { key: 'institution', label: 'Учреждение', width: 150 },
  { key: 'city', label: 'Город / район', width: 130 },
  // Новые столбцы (Л1.5, Л1.8, Л1.9, Л1.10). По умолчанию скрыты — иначе
  // таблица при первом открытии перегружена; включаются в меню столбцов.
  { key: 'podved', label: 'Подвед', width: 160 },
  { key: 'landArea', label: 'Площадь ЗУ, м²', width: 112, align: 'right', sort: 'landArea' },
  { key: 'owners', label: 'Собственники', width: 160 },
  { key: 'users', label: 'Пользователи', width: 150 },
  // Сортировка по флажкам: наверх поднимаются отмеченные (решение
  // пользователя 28.08.2026).
  { key: 'tags', label: 'Теги', width: 150, sort: 'specials' },
  { key: 'area', label: 'Площадь, м²', width: 104, align: 'right', sort: 'area' },
  { key: 'oiCount', label: 'ОИ', width: 46, align: 'right', sort: 'oiCount' },
  { key: 'photos', label: 'Фото', width: 56, align: 'right' },
  { key: 'docs', label: 'Док.', width: 52, align: 'right' },
  { key: 'notes', label: 'Заметки', width: 74, align: 'right', sort: 'pendingNotes' },
  { key: 'insp', label: 'Осмотрщик', width: 150 },
  { key: 'appr', label: 'Оценщик', width: 150 },
  { key: 'updatedAt', label: 'Обновлён', width: 98, sort: 'updatedAt' },
];

export const DEFAULT_COLUMNS = ['eni', 'title', 'typeLabel', 'status', 'institution', 'area', 'oiCount', 'notes', 'insp', 'updatedAt'];

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function emptyFilter() {
  return {
    q: '',
    status: [],
    typeId: [],
    // Область берётся из первой цифры ЕНИ (Л1.7), отдельного поля в записи нет.
    region: [],
    city: [],
    institution: [],
    insp: [],
    flags: [],
    staleDays: 0,
    mine: null,
    today: todayIso(),
  };
}

export function createState() {
  const s = {
    filter: emptyFilter(),
    sort: { key: 'updatedAt', dir: 'desc' },
    // Порядок = порядок показа (kernel/columns.js), состав = что в массиве.
    columns: DEFAULT_COLUMNS.slice(),
    // Только изменённые вручную ширины; остальные берутся из COLUMNS.
    colWidths: {},
    facetsOpen: true,
    barOpen: { slices: true, recent: true },
    selected: new Map(),
    previewId: null,
    previewType: null,
    recent: [],
    sliceKey: null,
  };

  // person/role — не собственное поле, а прямой доступ к общей сессии
  // (kernel/session.js), чтобы смена роли здесь была видна и в карточках.
  Object.defineProperty(s, 'person', {
    enumerable: true,
    get() { return session.state.person; },
    set(v) { session.set({ person: v }); },
  });
  Object.defineProperty(s, 'role', {
    enumerable: true,
    get() { return session.state.role; },
    set(v) { session.set({ role: v }); },
  });
  Object.defineProperty(s, 'institutions', {
    enumerable: true,
    get() { return session.state.institutions; },
    set(v) { session.set({ institutions: v }); },
  });

  return s;
}

const LIST_KEYS = ['status', 'typeId', 'city', 'institution', 'insp', 'flags'];

// --- Адрес ↔ состояние ---------------------------------------------------

export function stateToQuery(state) {
  const f = state.filter;
  const q = {};

  if (f.q) q.q = f.q;
  LIST_KEYS.forEach((k) => { if (f[k].length) q[k] = f[k].join('~'); });
  if (f.staleDays) q.stale = String(f.staleDays);
  if (f.mine) q.mine = f.mine.role;
  if (state.sort.key !== 'updatedAt' || state.sort.dir !== 'desc') q.sort = state.sort.key + ':' + state.sort.dir;
  if (state.sliceKey) q.slice = state.sliceKey;

  return q;
}

export function applyQueryToState(state, query) {
  const f = emptyFilter();

  if (query.q) f.q = query.q.toLowerCase();
  LIST_KEYS.forEach((k) => { if (query[k]) f[k] = query[k].split('~').filter(Boolean); });
  if (query.stale) f.staleDays = +query.stale || 0;
  if (query.mine) f.mine = { role: query.mine, person: state.person };

  state.filter = f;
  state.sliceKey = query.slice || null;

  if (query.sort) {
    const [key, dir] = query.sort.split(':');
    state.sort = { key: key || 'updatedAt', dir: dir === 'asc' ? 'asc' : 'desc' };
  } else {
    state.sort = { key: 'updatedAt', dir: 'desc' };
  }

  return state;
}

export function hashFor(state) {
  const q = stateToQuery(state);
  const qs = Object.entries(q)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return '#/' + (qs ? '?' + qs : '');
}

export function isFilterEmpty(f) {
  return !f.q && !f.status.length && !f.typeId.length && !f.city.length
    && !f.institution.length && !f.insp.length && !f.flags.length
    && !f.staleDays && !f.mine;
}
