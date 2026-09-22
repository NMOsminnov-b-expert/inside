// Снимает справочники макета (механизмы, ТС, литера) и печатает JSON в поток
// вывода. Вызывается из tools/docs/build_sverka_s_tablicami.py — руками
// запускать не нужно.
import { MECH_CLASSIFIER } from '../../app/modules/civil/data/mechClassifier.js';
import { MECH_FIELDS, MECH_CLASS_FIELDS, MECH_EXTRA_CLASSES }
  from '../../app/modules/civil/data/mechFields.js';
import { VEHICLE_FIELDS, VEHICLE_TYPES } from '../../app/modules/vehicle/data/vehicleFields.js';
import * as CD from '../../app/modules/civil/data/dictionaries.js';

const field = (x) => ({
  key: x.key, label: x.label, type: x.type, units: x.units || [], options: x.options || [],
});

const mech = [...MECH_CLASSIFIER.classes, ...MECH_EXTRA_CLASSES].map((c) => {
  const own = MECH_CLASS_FIELDS[c.name];
  const byName = MECH_FIELDS[c.name] || {};
  return {
    name: c.name,
    fromSchema: !!c.fromSchema,
    classFields: own ? [...own.main, ...own.extra].map(field) : [],
    subgroups: (c.subgroups || []).map((s) => {
      const d = byName[s.name] || {};
      return {
        name: s.name,
        types: s.types || [],
        fields: [...(d.main || []), ...(d.extra || [])].map(field),
        byType: Object.entries(d.byType || {}).map(([t, o]) => ({
          type: t,
          add: [...(o.main || []), ...(o.extra || [])].map(field),
          omit: o.omit || [],
        })),
      };
    }),
  };
});

const vehicle = VEHICLE_TYPES.map((t) => {
  const d = VEHICLE_FIELDS[t] || {};
  return { type: t, passport: (d.passport || []).map(field), inspect: (d.inspect || []).map(field) };
});

const civil = {
  PROD_FRAME: CD.PROD_FRAME,
  PROD_FLOORS: CD.PROD_FLOORS,
  CRANE_BEAM: CD.CRANE_BEAM,
  OI_CATEGORY_GROUPS: CD.OI_CATEGORY_GROUPS,
  OI_CATEGORY_OTHER: CD.OI_CATEGORY_OTHER,
  BUILD_CONDITION: CD.BUILD_CONDITION,
  WEAR_LEVEL: CD.WEAR_LEVEL,
  STRUCT_STRENGTH: CD.STRUCT_STRENGTH,
  BUILD_TYPE: CD.BUILD_TYPE,
  ENTRANCE_GROUP: CD.ENTRANCE_GROUP,
};

process.stdout.write(JSON.stringify({ mech, vehicle, civil }));
