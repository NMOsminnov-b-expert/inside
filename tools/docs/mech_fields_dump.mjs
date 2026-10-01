// Снимает состав полей карточки механизмов прямо со справочника
// app/modules/mechanisms/data/mechFields.js и печатает его JSON-ом в поток вывода.
// Вызывается из tools/docs/build_mech_fields.py — руками запускать не нужно.
import { MECH_CLASSIFIER } from '../../app/modules/mechanisms/data/mechClassifier.js';
import { MECH_FIELDS, MECH_CLASS_FIELDS, MECH_EXTRA_CLASSES, MASS, MECH_STATES }
  from '../../app/modules/mechanisms/data/mechFields.js';

const field = (f) => ({
  key: f.key,
  label: f.label,
  type: f.type,
  units: f.units || [],
  options: f.options || [],
  hint: f.hint || '',
});

const classes = [...MECH_CLASSIFIER.classes, ...MECH_EXTRA_CLASSES].map((c) => {
  const own = MECH_CLASS_FIELDS[c.name];
  if (own) {
    return {
      name: c.name,
      fromSchema: !!c.fromSchema,
      country: !!own.country,
      subgroups: [],
      main: own.main.map(field),
      extra: own.extra.map(field),
    };
  }

  const byName = MECH_FIELDS[c.name] || {};
  return {
    name: c.name,
    fromSchema: !!c.fromSchema,
    subgroups: (c.subgroups || []).map((s) => {
      const d = byName[s.name] || {};
      const byType = d.byType || {};
      return {
        name: s.name,
        country: !!d.country,
        types: s.types || [],
        main: (d.main || []).map(field),
        extra: (d.extra || []).map(field),
        byType: Object.keys(byType).map((t) => ({
          type: t,
          main: (byType[t].main || []).map(field),
          extra: (byType[t].extra || []).map(field),
          omit: byType[t].omit || [],
        })),
      };
    }),
  };
});

// Общие поля любой единицы (форма — form/view.js: nameHTML, commonHTML,
// accountingHTML). Масса и варианты состояния — из справочника.
const common = [
  { section: 'наименование', label: 'Наименование', type: 'text', units: [], options: [], key: 'name' },
  { section: 'наименование', label: 'Инвентарный номер', type: 'text', units: [], options: [], key: 'inv' },
  { section: 'основные', label: 'Страна происхождения', type: 'text', units: [], options: [], key: 'country' },
  { section: 'основные', ...field(MASS) },
  { section: 'основные', label: 'Год выпуска', type: 'int', units: [], options: [], key: 'madeYear' },
  { section: 'основные', label: 'Год ввода в эксплуатацию', type: 'int', units: [], options: [], key: 'year' },
  { section: 'основные', label: 'Состояние', type: 'select', units: [], options: MECH_STATES, key: 'state' },
  { section: 'учётные', label: 'Количество', type: 'int', units: ['шт.'], options: [], key: 'qty' },
  { section: 'учётные', label: 'Балансовая стоимость', type: 'num', units: ['сом'], options: [], key: 'cost' },
];

process.stdout.write(JSON.stringify({ classes, common }, null, 1));
