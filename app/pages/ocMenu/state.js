// Состояние реестра. Всё, что влияет на выборку, живёт в адресе:
// ссылку на подборку можно переслать коллеге.
export const ROLES = [
  { key: 'any', label: 'любая роль' },
  { key: 'insp', label: 'осмотрщик' },
  { key: 'appr', label: 'оценщик' },
  { key: 'cod', label: 'оператор ЦОД' },
  { key: 'gov', label: 'от учреждения' },
];

export const FLAG_LABELS = {
  pendingNotes: 'есть невып. заметки',
  mlUnverified: 'ML без проверки',
  defects: 'расхождение ТП/фото',
  ml: 'импорт ML',
};

export const COLUMNS = [
  { key: 'eni', label: 'Код ЕНИ', width: 126, mono: true, sort: 'eni' },
  { key: 'title', label: 'Адрес', width: 0, sort: 'title' },
  { key: 'typeLabel', label: 'Тип ОЦ', width: 150 },
  { key: 'status', label: 'Статус', width: 142, sort: 'status' },
  { key: 'institution', label: 'Учреждение', width: 168 },
  { key: 'city', label: 'Город / район', width: 130 },
  { key: 'area', label: 'Площадь, м²', width: 104, align: 'right', sort: 'area' },
  { key: 'oiCount', label: 'ОИ', width: 46, align: 'right', sort: 'oiCount' },
  { key: 'photos', label: 'Фото', width: 56, align: 'right' },
  { key: 'docs', label: 'Док.', width: 52, align: 'right' },
  { key: 'notes', label: 'Заметки', width: 74, align: 'right', sort: 'pendingNotes' },
  { key: 'insp', label: 'Осмотрщик', width: 150 },
  { key: 'appr', label: 'Оценщик', width: 150 },
  { key: 'updatedAt', label: 'Обновлён', width: 98, sort: 'updatedAt' },
];

const DEFAULT_COLUMNS = ['eni', 'title', 'typeLabel', 'status', 'institution', 'area', 'oiCount', 'notes', 'insp', 'updatedAt'];

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function emptyFilter() {
  return {
    q: '',
    status: [],
    typeId: [],
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
  return {
    filter: emptyFilter(),
    sort: { key: 'updatedAt', dir: 'desc' },
    density: 'compact',
    columns: DEFAULT_COLUMNS.slice(),
    columnsOpen: false,
    selected: new Map(),
    previewId: null,
    previewType: null,
    person: 'Осминов Н.',
    role: 'any',
    recent: [],
    sliceKey: null,
  };
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
