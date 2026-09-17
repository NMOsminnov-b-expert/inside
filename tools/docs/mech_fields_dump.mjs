// Снимает состав полей карточки механизмов прямо со справочника
// app/modules/civil/data/mechFields.js и печатает его JSON-ом в поток вывода.
// Вызывается из tools/docs/build_mech_fields.py — руками запускать не нужно.
import { MECH_CLASSIFIER } from '../../app/modules/civil/data/mechClassifier.js';
import { MECH_FIELDS, MECH_CLASS_FIELDS, MECH_EXTRA_CLASSES }
  from '../../app/modules/civil/data/mechFields.js';

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

process.stdout.write(JSON.stringify({ classes }, null, 1));
