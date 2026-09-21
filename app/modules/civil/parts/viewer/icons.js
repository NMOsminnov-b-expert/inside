// Значки панели просмотрщика. Панель одна на весь просмотрщик и узкая (он
// делит экран с карточкой), поэтому редкие и очевидные действия — значками с
// подписью во всплывающей подсказке, а не словами.

const svg = (body) => `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none"
  stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

// Лист по ширине: стрелки в стороны до краёв.
export const ICON_FIT_WIDTH = svg('<path d="M1.5 3v10M14.5 3v10M4 8h8M6 6 4 8l2 2M10 6l2 2-2 2"/>');

// Лист целиком: рамка листа с углами.
export const ICON_FIT_PAGE = svg('<rect x="4" y="1.5" width="8" height="13" rx="1"/><path d="M6 5h4M6 7.5h4M6 10h2.5"/>');

// Миниатюры: панель слева.
export const ICON_RAIL = svg('<rect x="1.5" y="2" width="13" height="12" rx="1.5"/><path d="M5.5 2v12"/>');

// Развернуть на весь экран и свернуть обратно.
export const ICON_FULL = svg('<path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/>');
export const ICON_FULL_EXIT = svg('<path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4"/>');

export const ICON_ROTATE = svg('<path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13.5 2v3h-3"/>');

// Убрать документ в архив: коробка с крышкой.
export const ICON_ARCHIVE = svg('<path d="M2 3.5h12v2.5H2zM3 6h10v7H3zM6.5 8.5h3"/>');
