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
import { addModule, kindLeaves, kindVtype, vtypeLeaves, applyKindLeaf, recordFor, setCategoryOf, MODULE_RENAMED } from './tsModel.js';

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
    if (t) models.push({ ...t, model: name, make, name, path: [], order: 100 + i });
  }));
  return models;
}

// Выдача единого поля «Тип ТС, вид кузова»: записи техпаспорта, шаблоны, базы
// и виды, модели. Одна функция для карточки и для проверки поиска
// (tools/checks/check_vehicle_search_all.py): проверка видит ровно то же.
// У каждого пункта, кроме самой записи техпаспорта, — подпись, что встанет в
// «Тип ТС» (замечание пользователя 07.10.2026: «если кабриолет выдаёт такое
// поле, то пусть хотя бы говорит, какой тип вставит. А не просто „легковой и
// внедорожник“»). У базы запись зависит от набранного: «кабриолет» → «легковой,
// кабриолет».
const willSet = (vt) => (vt ? `В «Тип ТС»: ${vt}` : '');
let modelsNoted = null;
export function searchLeaves(v, typed = '') {
  const kinds = kindLeaves().map((l) => ({ ...l,
    note: willSet((l.kind === 'base' && recordFor(l.category, typed)) || kindVtype(l)) }));
  const tpls = templateLeaves().map((l) => ({ ...l, note: willSet(l.tpl.vtype) }));
  // Модели — тысячи пунктов, подпись от набранного не зависит: собраны один
  // раз (поиск кэширует подготовленный текст по объекту пункта).
  modelsNoted = modelsNoted || modelLeaves().map((l) => ({ ...l,
    note: [l.note, willSet(l.tpl ? l.tpl.vtype : kindVtype(l.kindLeaf))].filter(Boolean).join(' · ') }));
  return [...(v.kind === 'module' ? [] : vtypeLeaves(v)), ...tpls, ...kinds, ...modelsNoted];
}

// Выбор пункта выдачи: что встаёт в карточку (решения пользователя 07.10.2026:
// «Если мы выбираем пункт, из него обязательно подтягиваем данные»; «вбил седан,
// а мне заместо „легковой, седан“ выдало „легковой“ — не дело»). typed —
// набранное до выбора. Возвращает текст уведомления или ''.
export function pickLeaf(v, l, typed) {
  if (l.vt) {
    // Запись техпаспорта — текст поля; категория не выбрана — категория записи.
    v.f.vtype = l.name;
    if (l.cat && (v.kind !== 'base' || !v.category)) {
      v.kind = 'base';
      setCategoryOf(v, l.cat);
    }
    return '';
  }
  if (l.model) {
    // Модель: вид или шаблон — как при их выборе; «Марка, модель» — только в
    // пустое поле, запись из техпаспорта важнее.
    if (l.tpl) applyTemplate(v, l.tpl);
    else applyKindLeaf(v, l.kindLeaf);
    if (!String(v.f.make || '').trim()) v.f.make = l.model;
    return `${l.model}: ${l.note}`;
  }
  if (l.tpl) {
    applyTemplate(v, l.tpl);
    return `Собрано по шаблону «${l.tpl.name}»: ${[l.tpl.base, ...l.tpl.modules.map((m) => m.kind)].join(' + ')}`;
  }
  applyKindLeaf(v, l);
  // База выбрана по слову кузова («седан») — запись категории с ним, а не голая
  // запись базы.
  const rec = l.kind === 'base' ? recordFor(l.category, typed) : '';
  if (rec) v.f.vtype = rec;
  return '';
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

// «Показать все» у «Тип ТС» (указание пользователя 07.10.2026: «Нужен способ
// просмотра всех списков модулей и видов ТС. В том числе марок… По
// категориям»): виды ТС — по категориям (спецтехника — по группам), записи
// техпаспорта — по категориям, шаблоны, марки — категория › марка › модели.
// Пункты — те же, что в выдаче поиска: выбор идёт через pickLeaf.
export function browseGroups(v) {
  const leaves = searchLeaves(v, '');
  const item = (l) => ({ name: l.name, note: l.note || '', leaf: l });
  const by = (list, keyOf) => {
    const m = new Map();
    list.forEach((x) => { const k = keyOf(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
    return m;
  };
  const kinds = leaves.filter((l) => l.kind);
  const kindGroups = [...by(kinds, (l) => l.path[0])].map(([cat, list]) => {
    const sub = by(list, (l) => l.path[1] || '');
    return sub.size > 1 || !sub.has('')
      ? { title: cat, groups: [...sub].map(([g, xs]) => ({ title: g, items: xs.map(item) })) }
      : { title: cat, items: list.map(item) };
  });
  const recs = leaves.filter((l) => l.vt);
  const recGroups = [...by(recs, (l) => l.cat || l.path[0].replace(/^Запись техпаспорта · /, ''))]
    .map(([cat, list]) => ({ title: cat, items: list.map((l) => ({ name: l.name, note: '', leaf: l })) }));
  const tpls = leaves.filter((l) => l.tpl && !l.model);
  // Категория модели — по тому, куда она ведёт: база или вид — их категория,
  // шаблон — категория его базы.
  const catOf = new Map(kindLeaves().map((l) => [l.name, l.path[0]]));
  const models = leaves.filter((l) => l.model);
  const modelCat = (l) => (l.kindLeaf ? l.kindLeaf.path[0] : catOf.get(l.tpl.base) || 'Прочее');
  const makeOf = (l) => l.make || 'Без марки';
  const modelGroups = [...by(models, modelCat)].map(([cat, list]) => ({ title: cat,
    groups: [...by(list, makeOf)].sort((a, b) => a[0].localeCompare(b[0], 'ru'))
      .map(([mk, xs]) => ({ title: mk, items: xs.sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(item) })) }));
  return [
    { title: 'Виды ТС', open: true, groups: kindGroups },
    ...(recGroups.length ? [{ title: 'Записи техпаспорта', groups: recGroups }] : []),
    { title: 'Шаблоны', items: tpls.map(item) },
    { title: 'Марки и модели', groups: modelGroups },
  ];
}
