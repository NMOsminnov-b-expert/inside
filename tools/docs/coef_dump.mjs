// Коэффициенты и шкалы, зашитые в код карточек недвижимости, — для отчёта
// tools/docs/build_otchet_nedvizhimost.py (печатает JSON). Руками не
// запускается. «Сравнительный подход» не берётся: вкладка спрятана и под
// вопросом (правило claude-project-comparative-hidden).
import { KINDS, SIGNS, POCKET_BANDS, PURPOSES } from '../../app/modules/civil/oi/building/capClass.js';
import { CONDITION_SCALE } from '../../app/modules/civil/data/conditionScale.js';

process.stdout.write(JSON.stringify({ kinds: KINDS, signs: SIGNS, pockets: POCKET_BANDS, purposes: PURPOSES, condition: CONDITION_SCALE },
  (k, v) => (v === Infinity ? 'inf' : v)));
