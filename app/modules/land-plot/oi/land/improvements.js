// Благоустройство участка — ранг и текстовое описание (заметки 04.09.2026).
//
// Было: два мультивыбора — «Сооружения и покрытия» и «Озеленение и насаждения».
// Стало: один ранг из четырёх ступеней плюс свободное описание особенностей.
// Причина в самой задаче оценщика: ему нужна не опись того, что стоит на
// участке, а уровень благоустройства в целом — по нему считается поправка.
// Перечисление же всё равно оказывалось неполным (беседки, мангальные зоны,
// дренаж — список бесконечен), поэтому оно заменено текстом.
//
// Признаки рангов пока не описаны — рядом с полем стоит заметка для
// разработчиков (kernel/devNote.js): без признаков соседние ранги два оценщика
// поставят по-разному.
import { esc } from '../../../../kernel/dom.js';
import { emptyOptionHTML } from '../../../../kernel/emptyOption.js';
import { devNote, noteAfter } from '../../../../kernel/devNote.js';
import { IMPROVEMENT_RANKS } from '../../data/dictionaries.js';
import { opt } from '../../data/opts.js';

const RANK_NOTE = 'Признаки рангов ещё не описаны: по каким свойствам участок '
  + 'относят к «частично благоустроен», «благоустроен» и «дорогое благоустройство». '
  + 'Соседние ранги различаются тяжелее всего — до описания признаков ранг ставится '
  + 'на усмотрение оценщика. Обдумать подсказку ранга по фотографиям (ИИ), '
  + 'которую оценщик подтверждает.';

// Старые значения (oi.improvements = {structures: [...], greenery: [...]})
// переносим в текст описания. Вызывать ДО отрисовки, чтобы перенос не попал в
// лог правок как правка человека — тот же приём, что у migrateUtilities.
export function migrateImprovements(oi) {
  if (!oi || !oi.improvements) return;

  const list = []
    .concat(oi.improvements.structures || [])
    .concat(oi.improvements.greenery || [])
    .filter(Boolean);

  if (list.length) {
    const text = list.join(', ');
    oi.improvementNote = oi.improvementNote
      ? `${oi.improvementNote}. ${text}`
      : text;
  }

  delete oi.improvements;
}

// Отдельный вопрос к методике: сады. Многолетние насаждения дают собственную
// стоимость, а полей под них (число деревьев, возраст, порода) в карточке нет —
// состав зависит от методики, поэтому заводить их наугад нельзя.
const SADY_NOTE = 'Как оценивать сады — открытый вопрос методики. Многолетние '
  + 'насаждения дают отдельную стоимость, но полей под них (число деревьев, '
  + 'возраст, порода) пока нет: состав зависит от того, как считать.';

export function improvementsFields(ctx, oi) {
  const ranks = opt('land', 'improvementRank', IMPROVEMENT_RANKS);

  return `<div class="field">
    <label>${noteAfter('Ранг благоустройства', RANK_NOTE)}</label>
    <select class="select" data-land-improve-rank>
      ${emptyOptionHTML(ranks)}
      ${ranks.map((r) => `<option ${r === oi.improvementRank ? 'selected' : ''}>${esc(r)}</option>`).join('')}
    </select>
  </div>
  <div class="field">
    <label>${noteAfter('Особенности благоустройства', SADY_NOTE, { align: 'left' })}</label>
    <textarea class="textarea ta-wide" data-land-improve-note
      placeholder="Что именно есть на участке: ограждение, покрытие, освещение, насаждения…">${esc(oi.improvementNote || '')}</textarea>
  </div>`;
}
