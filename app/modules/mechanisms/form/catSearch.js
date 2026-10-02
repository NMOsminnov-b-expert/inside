// Поиск категории механизма по дереву «класс → подгруппа → тип».
//
// Задача пользователя 30.09.2026: «Надо в механизмы добавить поиск категорий.
// Например при поиске «Навес», чтобы предлагало навесное оборудование в
// конечной категории с автоматической подстановкой (поиск по дереву с
// отметкой пути)». Сам поиск — общий, в ядре (kernel/treeSearch.js); здесь —
// что считать конечной категорией и что подставить при выборе. Каскад «Класс /
// Подгруппа / Тип» остаётся рядом и главным: поиск его только заполняет
// («поиск — помощник, а не альтернатива», пользователь 30.09.2026).
import { treeSearchHTML, bindTreeSearch } from '../../../kernel/treeSearch.js';
import { MECH_CLASS_FIELDS } from '../data/mechFields.js';
import { classNames, classOf, setClass, setSub } from './model.js';

// Как категорию называют в обиходе, а в классификаторе её названия нет:
// «UPS» — это «Источники бесперебойного питания (ИБП)». Ищется, но не
// показывается: в выдаче — название из классификатора.
const ALIASES = {
  'Источники бесперебойного питания (ИБП)': ['UPS'],
  'Стабилизаторы напряжения': ['стабилизатор', 'регулятор напряжения', 'AVR'],
  'Персональные компьютеры (настольные, моноблоки)': ['ПК', 'системный блок'],
  'Принтеры, МФУ, сканеры, копировальные аппараты': ['ксерокс', 'копир'],
  'Сетевое оборудование (роутеры, коммутаторы, точки доступа)': ['маршрутизатор', 'свитч', 'Wi-Fi'],
};

// Конечные категории: тип подгруппы; у класса без подгрупп — значения поля
// «Вид» класса, а если его нет — сам класс.
function leaves() {
  const out = [];
  classNames().forEach((cls) => {
    const c = classOf(cls);
    if (c.subgroups.length) {
      c.subgroups.forEach((s) => s.types.forEach((type) => out.push({
        cls, sub: s.name, type, name: type, path: [cls, s.name], aliases: ALIASES[type],
      })));
      return;
    }
    const kind = ((MECH_CLASS_FIELDS[cls] || {}).main || []).find((f) => f.key === 'otherKind');
    if (kind) kind.options.forEach((o) => out.push({ cls, kind: o, name: o, path: [cls] }));
    else out.push({ cls, name: cls, path: [] });
  });
  return out;
}

export function catSearchHTML() {
  return treeSearchHTML({ id: 'mu-cs', label: 'Поиск категории', placeholder: 'Например: навесное, ИБП, мостовой кран' });
}

// onPicked — перерисовать карточку после подстановки.
export function bindCatSearch(scope, unit, onPicked) {
  bindTreeSearch(scope, {
    id: 'mu-cs',
    leaves,
    onPick: (l) => {
      setClass(unit, l.cls);
      if (l.sub) { setSub(unit, l.sub); unit.type = l.type; }
      if (l.kind) {
        unit.params = unit.params || {};
        unit.params.otherKind = l.kind;
      }
      onPicked();
    },
  });
}
