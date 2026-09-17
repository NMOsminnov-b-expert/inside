// Сверка справочника полей (app/modules/civil/data/mechFields.js) с
// классификатором движимого имущества. Ловит то, что молча ломает карточку:
// подгруппу без полей, уточнение по типу, которого в классификаторе нет,
// повтор ключа внутри категории и один ключ под разными подписями (одна
// величина должна называться одинаково во всей карточке).
//
//     node tools/data/audit_mech_fields.mjs
import { MECH_CLASSIFIER } from '../../app/modules/civil/data/mechClassifier.js';
import { MECH_FIELDS, MECH_CLASS_FIELDS, MECH_EXTRA_CLASSES, fieldsFor }
  from '../../app/modules/civil/data/mechFields.js';

const problems = [];
const stat = { classes: 0, subs: 0, types: 0, fields: 0 };
const keys = new Map(); // ключ → подписи, которыми он назван

function note(f) {
  stat.fields += 1;
  const set = keys.get(f.key) || new Set();
  set.add(f.label);
  keys.set(f.key, set);
}

const all = [...MECH_CLASSIFIER.classes, ...MECH_EXTRA_CLASSES];

for (const c of all) {
  stat.classes += 1;
  const subs = c.subgroups || [];
  if (!subs.length) {
    if (!MECH_CLASS_FIELDS[c.name]) problems.push('класс без полей: ' + c.name);
    continue;
  }
  const byName = MECH_FIELDS[c.name];
  if (!byName) { problems.push('класс не описан в справочнике: ' + c.name); continue; }

  for (const s of subs) {
    stat.subs += 1;
    const d = byName[s.name];
    if (!d) { problems.push('подгруппа без полей: ' + c.name + ' / ' + s.name); continue; }
    if (!(d.main || []).length) problems.push('у подгруппы нет основных полей: ' + c.name + ' / ' + s.name);

    const types = s.types || [];
    stat.types += types.length;
    for (const t of Object.keys(d.byType || {})) {
      if (!types.includes(t)) problems.push('уточнение по несуществующему типу: ' + c.name + ' / ' + s.name + ' / ' + t);
    }
    for (const t of (types.length ? types : [''])) {
      const r = fieldsFor(c.name, s.name, t);
      if (!r) { problems.push('fieldsFor не дал полей: ' + [c.name, s.name, t].join(' / ')); continue; }
      const seen = new Set();
      for (const f of [...r.main, ...r.extra]) {
        if (seen.has(f.key)) problems.push('повтор ключа ' + f.key + ' в ' + [c.name, s.name, t].join(' / '));
        seen.add(f.key);
        note(f);
      }
    }
  }
}

for (const name of Object.keys(MECH_CLASS_FIELDS)) {
  if (!all.some((c) => c.name === name)) problems.push('поля для класса, которого нет в классификаторе: ' + name);
}
for (const name of Object.keys(MECH_FIELDS)) {
  if (!all.some((c) => c.name === name)) problems.push('поля для класса, которого нет в классификаторе: ' + name);
}

for (const [key, set] of keys) {
  if (set.size > 1) problems.push('ключ ' + key + ' назван по-разному: ' + [...set].join(' | '));
}

console.log('классов %d, подгрупп %d, типов %d, полей (с повторами) %d, ключей %d',
  stat.classes, stat.subs, stat.types, stat.fields, keys.size);
if (!problems.length) console.log('расхождений нет');
else problems.forEach((p) => console.log('  · ' + p));
