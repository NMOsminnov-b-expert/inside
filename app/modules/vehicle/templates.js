// Шаблоны машин в поиске карточки ТС: база, модули и «Тип ТС, вид кузова»
// одним выбором (решение пользователя 06.10.2026: «вариации по типу эвакуатор,
// самосвал… могли создаваться на основе шаблонов из поиска. И что бы туда
// можно было свои комбинации подключать из база + набор модулей… Человек без
// понимания системы в механиках утонет»).
//
// Готовые шаблоны — каталог (TS_TEMPLATES, tools/data/ts_templates.py), свои —
// сохранённые из карточки, общие для всех сотрудников (часть «templates.vehicle»
// в файлах сотрудников, kernel/persist.js). У шаблона несколько названий: по ним
// ищут, на экране они не показываются. Шаблон — стартовая копия: правка карточки
// его не меняет.
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: кто создаёт и удаляет свои шаблоны — решение за теми,
// кто настраивает роли (пользователь: «верхушка разберётся. Админы например»);
// в макете ограничений нет. На сервере шаблоны — справочник с автором и
// датой; удаление шаблона не трогает карточки, собранные по нему.

import { TS_TEMPLATES } from './data/tsCatalog.js';
import { TS_MODELS } from './data/tsModels.js';
import { registerPersisted, copyTag } from '../../kernel/persist.js';
import { addModule, kindLeaves, MODULE_RENAMED } from './tsModel.js';

const own = [];

registerPersisted('templates.vehicle', {
  snapshot: () => own,
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    own.splice(0, own.length, ...saved.filter((t) => t && t.id && t.name));
    // Модули, переименованные 07.10.2026 (расшифровка аббревиатур), — по-новому.
    own.forEach((t) => (t.modules || []).forEach((m) => { if (MODULE_RENAMED[m.kind]) m.kind = MODULE_RENAMED[m.kind]; }));
  },
});

const composition = (t) => [t.base, ...t.modules.map((m) => m.kind)].join(' + ');

// Варианты поиска: шаблон — название, путь — из чего он собран.
export function templateLeaves() {
  return [
    ...own.map((t) => ({ tpl: t, own: true, removable: true, name: t.name, aliases: t.aliases || [],
      path: [`Свой шаблон: ${composition(t)}`] })),
    ...TS_TEMPLATES.map((t) => ({ tpl: t, name: t.name, aliases: t.aliases, order: t.order,
      path: [`Шаблон: ${composition(t)}`] })),
  ];
}

// Модели машин (задача пользователя 06.10.2026: «чтобы можно было модель
// вбить, и нам уже выбралась база… и модули, если что, подтянуть»): каждая
// модель из записей техпаспортов ведёт на базу, вид спецтехники или шаблон —
// чем она чаще всего записана (tools/data/build_ts_models.py, по книге пар
// docs/pary-poiska-ts.xlsx). Модель, записанная по-разному (ГАЗ 53 — самосвал,
// бортовой, фургон), даёт несколько вариантов по убыванию частоты. Что модель
// соберёт — подпись под названием (note), она не ищется. При равенстве модели
// идут после видов и шаблонов (order от 100).
//
// ДЛЯ СЕРВЕРНОЙ ВЕРСИИ: справочник моделей пополняется из заведённых карточек;
// тогда «чем модель бывает» считается по базе, а не по разовой выгрузке.
let models = null;
export function modelLeaves() {
  if (models) return models;
  const to = new Map();
  TS_TEMPLATES.forEach((t) => to.set('шаблон: ' + t.name, { tpl: t, note: `Шаблон «${t.name}»: ${composition(t)}` }));
  kindLeaves().forEach((l) => to.set((l.kind === 'self' ? 'спецтехника: ' : 'база: ') + l.name,
    { kindLeaf: l, note: [...l.path, l.name].join(' › ') }));
  models = [];
  TS_MODELS.forEach(([make, model, targets]) => targets.forEach((label, i) => {
    const t = to.get(label);
    const name = [make, model].filter(Boolean).join(' ');
    if (t) models.push({ ...t, model: name, name, path: [], order: 100 + i });
  }));
  return models;
}

// Собрать карточку по шаблону. «Тип ТС» — запись шаблона (решение 07.10.2026).
// Модули добавляются недостающие, уже заведённые остаются.
export function applyTemplate(v, t) {
  v.kind = t.kind || 'base';
  if (v.kind === 'self') {
    v.selfGroup = t.selfGroup;
    v.selfKind = t.selfKind;
  } else {
    v.category = t.category;
    v.base = t.base;
  }
  // Шаблон выбран — в «Тип ТС» его запись (решения пользователя 07.10.2026:
  // «Шаблон выбран — запись шаблона, не выбран — текст»; «Если мы выбираем
  // пункт, из него обязательно подтягиваем данные» — запись есть у каждого
  // готового шаблона). У своего шаблона без записи остаётся вписанное.
  if (t.vtype) v.f.vtype = t.vtype;
  t.modules.forEach(({ group, kind }) => {
    if (v.modules.some((m) => m.group === group && m.kind === kind)) return;
    const m = addModule(v);
    m.group = group;
    m.kind = kind;
  });
}

// Сохранить нынешний набор карточки своим шаблоном.
export const canSaveTemplate = (v) => ((v.kind === 'base' && !!v.base) || (v.kind === 'self' && !!v.selfKind))
  && v.modules.some((m) => m.kind);

export function saveTemplate(v, name, aliases) {
  const tag = copyTag();
  const t = {
    id: `tplu-${tag ? tag + '-' : ''}${Date.now().toString(36)}`,
    name: String(name).trim(),
    aliases: String(aliases || '').split(',').map((a) => a.trim().toLowerCase()).filter(Boolean),
    kind: v.kind, category: v.category, base: v.kind === 'self' ? v.selfKind : v.base,
    selfGroup: v.selfGroup, selfKind: v.selfKind, vtype: String(v.f.vtype || '').trim(),
    modules: v.modules.filter((m) => m.kind).map((m) => ({ group: m.group, kind: m.kind })),
  };
  own.push(t);
  return t;
}

export function removeTemplate(id) {
  const at = own.findIndex((t) => t.id === id);
  if (at >= 0) own.splice(at, 1);
}
