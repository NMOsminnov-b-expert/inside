// Что модуль «Транспортные средства» отдаёт в раздел «Справочники».
//
// С 23.09.2026 карточка устроена по категоризации «база + модуль», и перечни
// берутся из того же справочника, что и её поля (data/tsCatalog.js, собран
// скриптом tools/data/build_ts_catalog.py). Карточка у этого типа ОЦ одна —
// сам объект оценки: объектов имущества внутри ТС нет.
//
// Перечни прежних восьми типов ТС (dictionaries.js) остались у карточки ТС в
// гражданском здании — она пока на прежней схеме.
import {
  TS_CATEGORIES, TS_BASES, TS_SELF_GROUPS, TS_MODULE_GROUPS, TS_SELF_FIELDS, TS_BASE_FIELDS,
} from './tsCatalog.js';

const list = (key, title, values, field, label) => ({
  key,
  title,
  kind: 'list',
  system: false,
  values,
  slots: [{ card: 'oc', field, label }],
});

const optionsOf = (fields, key) => (fields.find((f) => f.key === key) || { options: [] }).options;
const flat = (groups) => groups.flatMap((g) => g.items.map((i) => i.name));

export const DICT_SOURCES = [
  list('TS_CATEGORY', 'Категория ТС по техпаспорту', TS_CATEGORIES.filter((c) => c !== 'По техпаспорту'),
    'category', 'Категория по техпаспорту'),
  list('TS_BASE', 'База транспортного средства', TS_BASES.map((b) => b.name), 'base', 'База'),
  list('TS_SELF_GROUP', 'Группа самоходных машин', TS_SELF_GROUPS.map((g) => g.group), 'selfGroup', 'Группа'),
  list('TS_SELF_KIND', 'Вид самоходной машины', flat(TS_SELF_GROUPS), 'selfKind', 'Вид машины'),
  list('TS_MODULE_GROUP', 'Группа модулей', TS_MODULE_GROUPS.map((g) => g.group), 'modGroup', 'Группа'),
  list('TS_MODULE', 'Модуль (надстройка, навесное, сменное)', flat(TS_MODULE_GROUPS), 'modKind', 'Модуль'),
  list('TS_RUN', 'Ходовая', optionsOf(TS_SELF_FIELDS, 'run'), 'run', 'Ходовая'),
  list('TS_TURN', 'Способ поворота', optionsOf(TS_SELF_FIELDS, 'turn'), 'turn', 'Способ поворота'),
  list('TS_FUEL', 'Тип топлива', optionsOf(TS_BASE_FIELDS, 'fuel'), 'fuel', 'Тип топлива'),
  list('TS_GEARBOX', 'Тип КПП', optionsOf(TS_BASE_FIELDS, 'gearbox'), 'gearbox', 'Тип КПП'),
  list('TS_WHEEL_FORMULA', 'Колёсная формула', optionsOf(TS_BASE_FIELDS, 'wheelFormula'), 'wheelFormula',
    'Колёсная формула'),
  list('TS_STATE', 'Техническое состояние', optionsOf(TS_BASE_FIELDS, 'state'), 'state', 'Техническое состояние'),
];
