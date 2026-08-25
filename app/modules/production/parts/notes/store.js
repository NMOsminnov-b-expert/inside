// Фабрика заметок этого модуля (её использует и сид).
let noteSeq = 1;

export const NOTE_DEFAULT = 'Новая заметка';

export function mkNote(text, done) {
  return { id: 'n' + (noteSeq++), text: text, done: !!done };
}
