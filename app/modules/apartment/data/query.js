// Движок запросов по сводкам ЭТОГО модуля: фильтр, сортировка, фасеты, локатор.
// Копия в каждом модуле — модуль может добавить свои поля фильтра, не ломая
// остальные. Общий у всех только СМЫСЛ полей (см. app/README.md, контракты).
import { STATUS_OC } from './dictionaries.js';

const STATUS_ORDER = new Map(STATUS_OC.map((s, i) => [s, i]));

const inList = (list, value) => !list || !list.length || list.includes(value);

function daysBetween(fromIso, toIso) {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

// Проверка одной сводки против фильтра. skip — имя пропускаемого критерия
// (нужно для фасетных счётчиков: фасет не должен ограничивать сам себя).
export function matches(s, f, skip) {
  if (!f) return true;

  if (skip !== 'status' && !inList(f.status, s.status)) return false;
  if (skip !== 'city' && !inList(f.city, s.city)) return false;
  if (skip !== 'institution' && !inList(f.institution, s.institution)) return false;
  if (skip !== 'insp' && !inList(f.insp, s.resp.insp)) return false;

  if (skip !== 'flags' && f.flags && f.flags.length) {
    for (const flag of f.flags) {
      if (!s.flags[flag]) return false;
    }
  }

  if (skip !== 'stale' && f.staleDays) {
    if (daysBetween(s.updatedAt, f.today) < f.staleDays) return false;
  }

  if (skip !== 'mine' && f.mine && f.mine.person) {
    const role = f.mine.role;
    if (role === 'any') {
      const r = s.resp;
      if (r.gov !== f.mine.person && r.cod !== f.mine.person
        && r.appr !== f.mine.person && r.insp !== f.mine.person) return false;
    } else if (s.resp[role] !== f.mine.person) {
      return false;
    }
  }

  if (skip !== 'q' && f.q) {
    if (!s.search.includes(f.q)) return false;
  }

  return true;
}

export function filterRows(all, f) {
  const out = [];
  for (let i = 0; i < all.length; i++) {
    if (matches(all[i], f)) out.push(all[i]);
  }
  return out;
}

const CMP = {
  updatedAt: (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
  title: (a, b) => a.title.localeCompare(b.title, 'ru'),
  eni: (a, b) => String(a.eni).localeCompare(String(b.eni)),
  area: (a, b) => (b.metrics.area || 0) - (a.metrics.area || 0),
  landArea: (a, b) => (b.metrics.landArea || 0) - (a.metrics.landArea || 0),
  oiCount: (a, b) => (b.metrics.oiCount || 0) - (a.metrics.oiCount || 0),
  pendingNotes: (a, b) => (b.metrics.pendingNotes || 0) - (a.metrics.pendingNotes || 0),
  status: (a, b) => (STATUS_ORDER.get(a.status) ?? 99) - (STATUS_ORDER.get(b.status) ?? 99),
};

export function sortRows(rows, sort) {
  const base = CMP[sort && sort.key] || CMP.updatedAt;
  const cmp = (sort && sort.dir === 'asc') ? (a, b) => -base(a, b) : base;
  return rows.sort(cmp);
}

const FACET_KEYS = {
  status: (s) => s.status,
  city: (s) => s.city,
  institution: (s) => s.institution,
  insp: (s) => s.resp.insp,
  typeId: (s) => s.typeId,
};

// Счётчики по каждому фасету: критерий самого фасета исключается,
// иначе после первого выбора остальные варианты исчезают.
// Когда фасетные критерии не выбраны, всё считается одной проходкой.
const FLAG_KEYS = ['pendingNotes', 'mlUnverified', 'defects', 'ml'];

function emptyFacets() {
  return { status: {}, city: {}, institution: {}, insp: {}, typeId: {}, flags: {} };
}

export function computeFacets(all, f) {
  const out = emptyFacets();
  const facetKeys = Object.keys(FACET_KEYS);

  const anySelected = facetKeys.some((k) => f && f[k] && f[k].length)
    || (f && f.flags && f.flags.length);

  if (!anySelected) {
    for (let i = 0; i < all.length; i++) {
      const s = all[i];
      if (!matches(s, f)) continue;

      for (let k = 0; k < facetKeys.length; k++) {
        const key = facetKeys[k];
        const v = FACET_KEYS[key](s) || '—';
        out[key][v] = (out[key][v] || 0) + 1;
      }

      for (let k = 0; k < FLAG_KEYS.length; k++) {
        const flag = FLAG_KEYS[k];
        if (s.flags[flag]) out.flags[flag] = (out.flags[flag] || 0) + 1;
      }
    }

    FLAG_KEYS.forEach((flag) => { out.flags[flag] = out.flags[flag] || 0; });
    return out;
  }

  for (const key of facetKeys) {
    const get = FACET_KEYS[key];
    const bucket = out[key];
    for (let i = 0; i < all.length; i++) {
      const s = all[i];
      if (!matches(s, f, key)) continue;
      const v = get(s) || '—';
      bucket[v] = (bucket[v] || 0) + 1;
    }
  }

  FLAG_KEYS.forEach((flag) => {
    let n = 0;
    for (let i = 0; i < all.length; i++) {
      const s = all[i];
      if (!s.flags[flag]) continue;
      if (!matches(s, f, 'flags')) continue;
      n++;
    }
    out.flags[flag] = n;
  });

  return out;
}

// Локатор: точные и префиксные совпадения для строки поиска.
export function locateIn(all, raw) {
  const q = String(raw || '').trim().toLowerCase();
  if (!q) return { eni: [], address: [], institution: [], letter: [] };

  const digits = /^\d{4,}$/.test(q);
  const letterMatch = /^лит(?:ера)?\s*([а-яa-z])$/.exec(q);

  const res = { eni: [], address: [], institution: [], letter: [] };
  const LIMIT = 8;

  for (let i = 0; i < all.length; i++) {
    const s = all[i];

    if (digits && res.eni.length < LIMIT && String(s.eni).startsWith(q)) {
      res.eni.push(s);
      continue;
    }

    if (letterMatch && res.letter.length < LIMIT) {
      const L = letterMatch[1].toUpperCase();
      if ((s.letters || []).includes(L)) { res.letter.push(s); continue; }
    }

    if (!digits && !letterMatch) {
      if (res.address.length < LIMIT && s.title.toLowerCase().includes(q)) { res.address.push(s); continue; }
      if (res.institution.length < LIMIT && String(s.institution).toLowerCase().includes(q)) { res.institution.push(s); continue; }
    }
  }

  return res;
}
