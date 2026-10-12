// Данные панели осмотров: очередь к назначению, действующие назначения,
// осмотрщики и их загрузка. Записи — через kernel/registry.js (страница не
// импортирует модули типов ОЦ), назначения — kernel/inspections.js.
//
// ТЗ — запись графа panel-osmotrov-tz, разделы 3 и 3.1–3.5.
import { sortedTypes, getType } from '../../kernel/registry.js';
import { eniRegion } from '../../kernel/fmt.js';
import {
  allAssignments, assignmentsOf, isLive, isDefaultDoc, ASSIGN_STATES,
} from '../../kernel/inspections.js';
import { inspectorsInData, oiLabel, READY_STATUS } from '../inspector/tasks.js';

export { READY_STATUS };

const key = (typeId, ocId) => `${typeId}|${ocId}`;
export const stateLabel = (k) => (ASSIGN_STATES.find((s) => s.key === k) || {}).label || k;

// Сводки всех записей — одним проходом на отрисовку данных: панель смотрит
// во все типы ОЦ сразу, а запрос по id у реестра нет.
export function summaries() {
  const map = new Map();
  sortedTypes().forEach((t) => {
    const res = t.records.queryRecords({ filter: {}, offset: 0, limit: Number.MAX_SAFE_INTEGER });
    res.rows.forEach((s) => map.set(key(t.manifest.id, s.id), { ...s, typeId: t.manifest.id }));
  });
  return map;
}

export const regionOf = (s) => eniRegion(s.eni) || '';

// --- очередь «К назначению» -----------------------------------------------------

// Объекты в статусе «Удостоверен по документам» без действующего назначения
// (ТЗ 3.2). Назначенный хотя бы на один ОИ объект в очереди не стоит — его
// остальные ОИ назначаются из вкладки «Назначено».
export function queueRows(all, f) {
  const busy = new Set(allAssignments().filter(isLive).map((a) => key(a.typeId, a.ocId)));
  const q = (f.q || '').trim().toLowerCase();
  const out = [];
  all.forEach((s, k) => {
    if (s.status !== READY_STATUS || busy.has(k)) return;
    if (f.type && s.typeId !== f.type) return;
    if (f.region && regionOf(s) !== f.region) return;
    if (q && !`${s.eniAll || s.eni} ${s.title} ${s.institution} ${s.city}`.toLowerCase().includes(q)) return;
    out.push(s);
  });
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

// Значения фильтров — из самих данных, а не перечнем в коде (правило
// «не подгонять под нынешние данные»).
export function queueFacets(all) {
  const types = new Map();
  const regions = new Map();
  all.forEach((s) => {
    if (s.status !== READY_STATUS) return;
    types.set(s.typeId, s.typeLabel);
    const r = regionOf(s);
    if (r) regions.set(r, (regions.get(r) || 0) + 1);
  });
  return {
    types: [...types.entries()].map(([id, label]) => ({ id, label })),
    regions: [...regions.keys()].sort((a, b) => a.localeCompare(b, 'ru')),
  };
}

// --- «Назначено» -----------------------------------------------------------------

export function assignedRows(all, f) {
  const q = (f.q || '').trim().toLowerCase();
  return allAssignments()
    .filter((a) => isLive(a) && (!f.person || a.person === f.person))
    .map((a) => ({ a, s: all.get(key(a.typeId, a.ocId)) }))
    .filter(({ a, s }) => s && (!q || `${s.eniAll || s.eni} ${s.title} ${a.person}`.toLowerCase().includes(q)))
    .sort((x, y) => String(x.a.plannedAt || '9999').localeCompare(String(y.a.plannedAt || '9999'))
      || String(y.a.at).localeCompare(String(x.a.at)));
}

// Дата — местная, а не по UTC: сутки считаются по местной полуночи
// (практика panel-podval-deystviy-vybor-strokoy-dannye-chestno).
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const isOverdue = (a) => !!a.plannedAt && a.plannedAt < todayIso() && isLive(a);

// --- осмотрщики ---------------------------------------------------------------------

// Все осмотрщики с загрузкой: в работе (действующие назначения), из них
// просрочено, закончено за 30 дней.
export function inspectorRows() {
  const live = new Map();
  const late = new Map();
  const done = new Map();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  allAssignments().forEach((a) => {
    if (isLive(a)) {
      live.set(a.person, (live.get(a.person) || 0) + 1);
      if (isOverdue(a)) late.set(a.person, (late.get(a.person) || 0) + 1);
    } else if (a.state === 'done' && a.doneAt >= since) {
      done.set(a.person, (done.get(a.person) || 0) + 1);
    }
  });
  const names = new Set([...inspectorsInData().map((x) => x.name), ...live.keys()]);
  return [...names].map((name) => ({
    name,
    live: live.get(name) || 0,
    late: late.get(name) || 0,
    done: done.get(name) || 0,
  })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

// --- состав объекта для окна назначения ------------------------------------------

// Описи — документы-перечни оборудования и механизмов (запись графа
// opis-oborudovaniya-i-mehanizmov). В карточке они лежат документами вида
// «Инвентаризационный список» или «Опись».
const isInventory = (d) => /опис|инвентаризац/i.test(`${d.type || ''} ${d.name || ''}`);

// ОИ записи и документы — сгруппированные по владельцу: сначала объект
// оценки, затем каждый ОИ (ТЗ 3.3).
export function objectContents(typeId, ocId) {
  const t = getType(typeId);
  const rec = t && t.records.loadRecord(ocId);
  if (!rec) return null;
  const doc = (d, owner) => ({ id: d.id, type: d.type || '', name: d.name || '', date: d.date || '', owner, def: isDefaultDoc(d.type || d.name) });
  const groups = [{ id: '', label: 'Объект оценки', docs: (rec.docs || []).map((d) => doc(d, '')) }];
  (rec.oi || []).forEach((o) => groups.push({ id: o.id, label: oiLabel(o), docs: (o.docs || []).map((d) => doc(d, o.id)) }));
  const all = groups.flatMap((g) => g.docs);
  return {
    rec,
    oi: (rec.oi || []).map((o) => ({ id: o.id, label: oiLabel(o) })),
    groups: groups.map((g) => ({ ...g, docs: g.docs.filter((d) => !isInventory(d)) })),
    inventories: all.filter(isInventory),
    taken: assignmentsOf(typeId, ocId),
  };
}
