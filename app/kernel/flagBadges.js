// Флажки состояния записи — те же значки, что в реестре, но для шапки карточки
// и плашки (решение пользователя 28.08.2026: «Эти же флажки пусть будут в
// хлебушках ОЦ и ОИ»).
//
// Почему в kernel: набор флажков один на всю систему, а рисуют их и страница
// реестра, и карточки пяти модулей. Держать пять копий значит получить пять
// разных наборов при первом же изменении.
//
// Смысл флажков сюда НЕ переезжает: что считать расхождением или невыполненной
// заметкой, решает модуль — сюда приходит готовый набор булевых признаков.
import { esc } from './dom.js';

export const FLAGS = [
  { key: 'specials', icon: '✦', cls: 'spec', title: 'отмечены особенности' },
  { key: 'pendingNotes', icon: '⚑', cls: 'notes', title: 'есть невыполненные заметки' },
  { key: 'defects', icon: '⚠', cls: 'warn', title: 'расхождение ТП и фото' },
  { key: 'mlUnverified', icon: 'ML', cls: 'ml warn', title: 'импорт ML без проверки' },
  { key: 'ml', icon: 'ML', cls: 'ml', title: 'импорт ML' },
];

// flags — объект признаков. Показываем только поднятые: ряд из серых
// «выключенных» значков читался бы как набор кнопок, а это индикаторы.
export function flagBadgesHTML(flags) {
  const on = FLAGS.filter((f) => (flags || {})[f.key]);
  if (!on.length) return '';

  return `<span class="flag-badges" title="${esc(on.map((f) => f.title).join(', '))}">${on
    .map((f) => `<span class="reg-badge ${f.cls}" title="${esc(f.title)}">${f.icon}</span>`)
    .join('')}</span>`;
}
