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

// Раскрыть во всю высоту: документ слева от верха до низа окна, карточка
// справа. Стрелки вверх и вниз — растягивается по высоте.
export const ICON_DOCK = svg('<path d="M8 1.5v13M5.5 4 8 1.5 10.5 4M5.5 12 8 14.5 10.5 12M2 8h3M11 8h3"/>');
export const ICON_DOCK_EXIT = svg('<path d="M8 6V1.5M8 10v4.5M5.5 3.5 8 6l2.5-2.5M5.5 12.5 8 10l2.5 2.5M2 8h12"/>');

// Развернуть на весь экран и свернуть обратно.
export const ICON_FULL = svg('<path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/>');
export const ICON_FULL_EXIT = svg('<path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4"/>');

// Открыть в отдельном окне (на второй монитор) и вернуть в карточку.
export const ICON_POPOUT = svg('<path d="M9 2h5v5M14 2 7.5 8.5M12 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5"/>');
export const ICON_POPIN = svg('<path d="M7 9 14 2M7 9V4.5M7 9h4.5M12 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5"/>');

// Загрузка файлов: лист со стрелкой вверх — для пустой зоны прикрепления.
export const ICON_UPLOAD = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none"
  stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 17v-6M9.5 13.5 12 11l2.5 2.5"/></svg>`;

export const ICON_ROTATE = svg('<path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13.5 2v3h-3"/>');

// Убрать документ в архив: коробка с крышкой.
export const ICON_ARCHIVE = svg('<path d="M2 3.5h12v2.5H2zM3 6h10v7H3zM6.5 8.5h3"/>');
