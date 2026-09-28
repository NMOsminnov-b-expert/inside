// Что модуль «Механизмы и оборудование» отдаёт в раздел «Справочники».
//
// Классификатор механизмов (mechClassifier.js, mechFields.js) — трёхуровневый
// справочник с параметрами по подгруппам; собирается скриптом
// tools/data/build_mech_classifier.py из таблицы «Группы движимого имущества» и
// правится там же. В разделе «Справочники» его уровни видны перечнями только
// для чтения (system): форма берёт классификатор из файла, и правка здесь на
// неё не повлияла бы.
import { MECH_CLASSIFIER } from './mechClassifier.js';
import { MECH_EXTRA_CLASSES } from './mechFields.js';

const CLASSES = MECH_CLASSIFIER.classes.concat(MECH_EXTRA_CLASSES);
const uniq = (list) => [...new Set(list.filter(Boolean))];

const list = (key, title, values, field, label) => ({
  key,
  title,
  kind: 'list',
  system: true,
  values,
  slots: [{ card: 'oc', field, label }],
});

export const DICT_SOURCES = [
  list('MECH_CLASS', 'Класс движимого имущества', uniq(CLASSES.map((c) => c.name)), 'cls', 'Класс'),
  list('MECH_SUBGROUP', 'Подгруппа движимого имущества',
    uniq(CLASSES.flatMap((c) => c.subgroups.map((s) => s.name))), 'sub', 'Подгруппа'),
  list('MECH_TYPE', 'Тип движимого имущества',
    uniq(CLASSES.flatMap((c) => c.subgroups.flatMap((s) => s.types))), 'type', 'Тип'),
];
