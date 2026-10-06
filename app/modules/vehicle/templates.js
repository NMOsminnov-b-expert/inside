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
import { registerPersisted, copyTag } from '../../kernel/persist.js';
import { addModule } from './tsModel.js';

const own = [];

registerPersisted('templates.vehicle', {
  snapshot: () => own,
  restore: (saved) => {
    if (!Array.isArray(saved)) return;
    own.splice(0, own.length, ...saved.filter((t) => t && t.id && t.name));
  },
});

const composition = (t) => [t.base, ...t.modules.map((m) => m.kind)].join(' + ');

// Варианты поиска: шаблон — название, путь — из чего он собран.
export function templateLeaves() {
  return [
    ...own.map((t) => ({ tpl: t, own: true, removable: true, name: t.name, aliases: t.aliases || [],
      path: [`Свой шаблон: ${composition(t)}`] })),
    ...TS_TEMPLATES.map((t) => ({ tpl: t, name: t.name, aliases: t.aliases, path: [`Шаблон: ${composition(t)}`] })),
  ];
}

// Собрать карточку по шаблону. «Тип ТС» — только в пустое поле: запись из
// техпаспорта важнее. Модули добавляются недостающие, уже заведённые остаются.
export function applyTemplate(v, t) {
  v.kind = t.kind || 'base';
  if (v.kind === 'self') {
    v.selfGroup = t.selfGroup;
    v.selfKind = t.selfKind;
  } else {
    v.category = t.category;
    v.base = t.base;
  }
  if (t.vtype && !String(v.f.vtype || '').trim()) v.f.vtype = t.vtype;
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
